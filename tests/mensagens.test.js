/*
 * Evento 'message_create': gravação, roteamento dos comandos e permissões.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { DONO, GRUPO, OUTRO } = bot;

beforeEach(bot.reiniciar);

describe('gravação', () => {
    test('grava a mensagem com remetente, chat e nome do grupo', async () => {
        await bot.entregar(bot.criarMensagem({ texto: 'oi grupo', de: OUTRO.jid, id: 'M1' }));
        const row = await bot.dbGet("SELECT * FROM messages WHERE id = 'M1'");

        assert.equal(row.body, 'oi grupo');
        assert.equal(row.chat_id, GRUPO);
        assert.equal(row.chat_name, 'Família');
        assert.equal(row.is_group, 1);
        assert.equal(row.sender_number, OUTRO.user);
        assert.equal(row.sender_name, OUTRO.nome);
    });

    test('grava a mídia em cache/media e a localização', async () => {
        await bot.entregar(bot.criarMensagem({ de: OUTRO.jid, id: 'FOTO', tipo: 'image', midia: { mimetype: 'image/jpeg', data: Buffer.from('jpg').toString('base64') } }));
        const foto = await bot.dbGet("SELECT * FROM messages WHERE id = 'FOTO'");
        assert.equal(foto.has_media, 1);
        assert.match(foto.media_path, /media.*FOTO\.jpeg$/);
        assert.equal(require('fs').readFileSync(foto.media_path, 'utf8'), 'jpg');

        await bot.entregar(bot.criarMensagem({ de: OUTRO.jid, id: 'LOC', tipo: 'location', extras: { location: { latitude: -22.9, longitude: -43.1 } } }));
        const loc = await bot.dbGet("SELECT * FROM messages WHERE id = 'LOC'");
        assert.deepEqual([loc.location_lat, loc.location_lng], [-22.9, -43.1]);
    });

    test('mídia que falha ao baixar é gravada sem mídia', async () => {
        const msg = bot.criarMensagem({ de: OUTRO.jid, id: 'RUIM', midia: {} });
        msg.downloadMedia = async () => { throw new Error('falhou'); };
        await bot.entregar(msg, { erroEsperado: true });
        assert.equal((await bot.dbGet("SELECT has_media FROM messages WHERE id = 'RUIM'")).has_media, 0);
    });

    test('from_me marca as suas mensagens (no privado o remetente gravado é o outro participante)', async () => {
        await bot.entregar(bot.criarMensagem({ texto: 'minha', chat: bot.OUTRO.jid, id: 'MINHA' }));
        await bot.entregar(bot.criarMensagem({ texto: 'dele', chat: bot.OUTRO.jid, de: bot.OUTRO.jid, id: 'DELE' }));

        const rows = await bot.dbAll("SELECT id, sender_jid, from_me FROM messages WHERE id IN ('MINHA', 'DELE') ORDER BY id");
        assert.deepEqual(rows, [
            { id: 'DELE', sender_jid: bot.OUTRO.jid, from_me: 0 },
            { id: 'MINHA', sender_jid: bot.OUTRO.jid, from_me: 1 }
        ]);
    });

    test('@lid do remetente vira o telefone real', async () => {
        bot.client.lids.set('999@lid', OUTRO.jid);
        await bot.entregar(bot.criarMensagem({ de: '999:12@lid', id: 'LID' }));
        assert.equal((await bot.dbGet("SELECT sender_number FROM messages WHERE id = 'LID'")).sender_number, OUTRO.user);
    });
});

describe('comandos', () => {
    test('comando por nome e por alias', async () => {
        assert.deepEqual(await bot.responder('/ping'), ['pong']);
        assert.deepEqual(await bot.responder('/p'), ['pong']);
    });

    test('resposta do bot é um reply da mensagem do comando', async () => {
        const [r] = await bot.executar('/ping', { id: 'CMD1' });
        assert.equal(r.chatId, GRUPO);
        assert.match(r.options.quotedMessageId, /CMD1$/);
    });

    test('comando desconhecido ou texto comum: nenhuma resposta', async () => {
        assert.deepEqual(await bot.responder('/naoexiste'), []);
        assert.deepEqual(await bot.responder('ping'), []);
    });

    test('o log diz quem executou o comando e onde (no privado de outra pessoa, é você)', async () => {
        const executou = () => bot.logs.filter(l => / executed '/.test(l)).at(-1);

        bot.client.contatos.set(OUTRO.jid, { id: { _serialized: OUTRO.jid, user: OUTRO.user }, number: OUTRO.user, name: OUTRO.nome });
        await bot.responder('/ping', { chat: OUTRO.jid });
        assert.match(executou(), /\[\+\] 'Dono' executed '\/ping' in 'Fulano'$/);

        await bot.responder('/help', { de: OUTRO.jid });
        assert.match(executou(), /\[\+\] 'Fulano' executed '\/help' in 'Família'$/);
    });

    test('no privado, o nome do chat é o do outro participante, também nas suas mensagens', async () => {
        await bot.entregar(bot.criarMensagem({ texto: 'oi, Fulano', chat: OUTRO.jid, extras: { _data: { notifyName: 'Dono' } } }));
        await bot.entregar(bot.criarMensagem({ texto: 'oi, Dono', chat: OUTRO.jid, de: OUTRO.jid }));

        const nomes = await bot.dbAll('SELECT body, chat_name, from_me FROM messages ORDER BY timestamp, rowid');
        assert.deepEqual(nomes, [
            { body: 'oi, Fulano', chat_name: 'Fulano', from_me: 1 },
            { body: 'oi, Dono', chat_name: 'Fulano', from_me: 0 }
        ]);
    });

    test('-h mostra a sintaxe do comando', async () => {
        const [r] = await bot.responder('/ping -h');
        assert.match(r, /Usage: \/ping/);
    });

    test('comando desativado por setting é ignorado', async () => {
        await bot.setSetting('commands.disabled', 'ping');
        assert.deepEqual(await bot.responder('/ping'), []);
    });

    test('a marca de "enviada pelo bot" expira em 1 minuto', async (t) => {
        t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: Date.now() });
        const { iniciarLimpezaDasMarcas } = bot.src('cliente');
        iniciarLimpezaDasMarcas();

        // Envio que nunca voltou pelo message_create (falhou no WhatsApp)
        await bot.client.sendMessage(GRUPO, '/ping');
        t.mock.timers.tick(61 * 1000);

        assert.deepEqual(await bot.responder('/ping'), ['pong'], 'marca vencida não bloqueia o dono');
    });

    test('resposta do próprio bot começando com "/" não vira comando', async () => {
        // O /noffa ecoa o texto: sem a marca, "/ping" voltaria como comando do dono
        await bot.client.sendMessage(GRUPO, '/ping');
        const msg = bot.criarMensagem({ texto: '/ping' });
        assert.deepEqual((await bot.entregar(msg)).map(e => e.texto), []);

        // A marca é consumida: o dono digitando /ping depois funciona
        assert.deepEqual(await bot.responder('/ping'), ['pong']);
    });
});

describe('comando desconhecido', () => {
    const desconhecidos = (desde) => bot.logs.slice(desde).filter(l => l.includes('executed unknown command'));

    test('do dono: sempre no log, com o comando inteiro; dos outros: só no modo debug', async () => {
        let antes = bot.logs.length;
        assert.deepEqual(await bot.responder('/tapioca de frango'), []);
        assert.deepEqual(await bot.responder('/monitor'), [], 'desativado no config: também é desconhecido');
        const doDono = desconhecidos(antes);
        assert.equal(doDono.length, 2);
        assert.match(doDono[0], /\[!\] ⚠️ 'Dono' executed unknown command: '\/tapioca de frango'$/);

        antes = bot.logs.length;
        await bot.responder('/tapioca', { de: OUTRO.jid });
        assert.deepEqual(desconhecidos(antes), [], 'sem debug, o dos outros não aparece');

        await bot.setSetting('debug.enabled', true);
        antes = bot.logs.length;
        await bot.responder('/tapioca', { de: OUTRO.jid });
        assert.match(desconhecidos(antes)[0], /\[DEBUG\] ⚠️ 'Fulano' executed unknown command: '\/tapioca'$/);
    });
});

describe('permissões', () => {
    test('onlyAdmin: ignorado para os outros, sem resposta no chat', async () => {
        assert.deepEqual(await bot.responder('/ping', { de: OUTRO.jid }), []);
        assert.deepEqual(await bot.responder('/ping'), ['pong']);
    });

    test('onlyAdmin com debug ligado avisa no seu privado', async () => {
        await bot.setSetting('debug.enabled', true);
        const r = await bot.executar('/ping', { de: OUTRO.jid });
        assert.equal(r.length, 1);
        assert.equal(r[0].chatId, process.env.PHONE_NUMBER);
        assert.match(r[0].texto, /Fulano tentou executar \/ping dentro de Família, mas sem permissão/);
    });

    test('bot.admins: o admin extra usa os comandos admin, também no modo admin e nas checagens do dono', async () => {
        assert.deepEqual(await bot.responder('/ping', { de: OUTRO.jid }), []);
        assert.deepEqual(await bot.responder('/set -a bot.admins +5521911111111'), ['✅ *bot.admins* + 5521911111111 (Fulano)\n= 5521911111111 (Fulano)']);

        assert.deepEqual(await bot.responder('/ping', { de: OUTRO.jid }), ['pong']);
        await bot.setSetting('bot.adminMode', true);
        assert.deepEqual(await bot.responder('/ping', { de: OUTRO.jid }), ['pong'], 'modo admin');
        assert.match((await bot.responder('/bot'))[0], /🔒 \*Modo admin:\* ligado \(só o dono e os admins do bot\.admins usam comandos\)/);
        assert.deepEqual(await bot.responder('/cotacao -a gbp', { de: OUTRO.jid }), ['✅ 🇬🇧 GBP habilitada.']);

        // Outra pessoa continua de fora
        const CICLANO = '5521922222222@c.us';
        bot.criarContato(CICLANO, 'Ciclano');
        assert.deepEqual(await bot.responder('/ping', { de: CICLANO }), []);
    });

    test('bot.admins pelo nome do contato: guarda o telefone, mostra o nome; vários: a lista', async () => {
        const JORGE = '5521933333333@c.us';
        bot.criarContato(JORGE, 'Jorge Pereira');
        bot.criarContato('5511944444444@c.us', 'Jorge Silva');

        assert.deepEqual(await bot.responder('/set -a bot.admins /Jorge Pereira/ "Fulano"'),
            ['✅ *bot.admins* + 5521933333333 (Jorge Pereira), 5521911111111 (Fulano)\n= 5521933333333 (Jorge Pereira), 5521911111111 (Fulano)']);
        assert.deepEqual(bot.getSetting('bot.admins'), ['5521933333333', '5521911111111']);
        assert.match((await bot.responder('/set bot.admins'))[0], /\*Valor:\* \n1\. 5521933333333 \(Jorge Pereira\)\n2\. 5521911111111 \(Fulano\)\n/);

        assert.deepEqual(await bot.responder('/set -rem bot.admins /Jorge Pereira/'), ['✅ *bot.admins* − 5521933333333 (Jorge Pereira)\n= 5521911111111 (Fulano)']);

        // Vários com o nome: a lista; e o "<chave> <valor>" também aceita nomes
        const r = await bot.responderEscolhendo('/set bot.admins jorge', 2);
        assert.match(r[0], /^🔎 "jorge" corresponde a 2 contatos:/);
        assert.equal(r.at(-1), '✅ *bot.admins* = 5511944444444 (Jorge Silva)');

        assert.deepEqual(await bot.responder('/set bot.admins ""'), ['✅ *bot.admins* = (vazio)']);
    });

    test('bot.admins por menção (@ no WhatsApp): o LID da menção vira o telefone', async () => {
        const LID = '66147630248178@lid';
        bot.criarContato('5521966666666@c.us', 'Fulano Da Silva');
        bot.client.lids.set(LID, '5521966666666@c.us');

        assert.deepEqual(await bot.responder('/set -a bot.admins @66147630248178', { mencoes: [LID] }),
            ['✅ *bot.admins* + 5521966666666 (Fulano Da Silva)\n= 5521966666666 (Fulano Da Silva)']);

        // "@número" digitado, sem ser menção: recusado
        assert.match((await bot.responder('/set -a bot.admins @5521977777777'))[0], /❌ "@5521977777777" não é uma menção: mencione a pessoa escolhendo na lista do @/);
    });

    test('bot.admins pelo nome: grupo, e-mail e contato sem telefone são recusados', async () => {
        assert.match((await bot.responder('/set -a bot.admins /Família/'))[0], /❌ Família é um grupo: o \*bot\.admins\* é de pessoas/);
        assert.match((await bot.responder('/set -a bot.admins email'))[0], /❌ O \*bot\.admins\* é de pessoas: informe um contato ou um número, não um e-mail/);
        bot.criarContato('267550843736089@lid', 'Sem Telefone');
        assert.match((await bot.responder('/set -a bot.admins /Sem Telefone/'))[0], /❌ Não sei o telefone de Sem Telefone .*use o número/);
        assert.match((await bot.responder('/set -a bot.admins xyz'))[0], /❌ Nenhum contato ou grupo com "xyz"/);
        assert.deepEqual(bot.getSetting('bot.admins'), []);
    });

    test('bot.admins: só o dono altera (nem o próprio admin extra)', async () => {
        await bot.setSetting('bot.admins', ['5521911111111']);
        for (const linha of ['/set -a bot.admins 5521922222222', '/set -rem bot.admins 5521911111111', '/set -r bot.admins', '/set bot.admins 5521922222222']) {
            assert.deepEqual(await bot.responder(linha, { de: OUTRO.jid }), ['⛔ Só o dono do bot altera o *bot.admins*.'], linha);
        }
        assert.deepEqual(bot.getSetting('bot.admins'), ['5521911111111']);
        assert.match((await bot.responder('/set bot.admins', { de: OUTRO.jid }))[0], /⚙️ \*bot\.admins\*/, 'ver pode');
    });

    test('comando liberado (onlyAdmin false) funciona para os outros', async () => {
        const [r] = await bot.responder('/noffa oi gente', { de: OUTRO.jid });
        assert.match(r, /oi .* gente/);
    });

    test('modo admin: comandos dos outros ignorados, os seus funcionam', async () => {
        await bot.setSetting('bot.adminMode', true);
        assert.deepEqual(await bot.responder('/noffa oi gente', { de: OUTRO.jid }), []);
        assert.equal((await bot.responder('/noffa oi gente')).length, 1);
    });

    test('bot desligado: tudo ignorado, inclusive os seus, exceto o /bot', async () => {
        await bot.setSetting('bot.paused', true);
        assert.deepEqual(await bot.responder('/ping'), []);
        assert.match((await bot.responder('/bot'))[0], /desligado/);
    });
});

describe('contagem do /stats', () => {
    const contagem = () => bot.dbAll('SELECT sender_id, SUM(msgs) AS msgs, SUM(media) AS media FROM stats GROUP BY sender_id ORDER BY sender_id');

    test('conta mensagens novas por remetente, uma vez por id', async () => {
        const msg = bot.criarMensagem({ texto: 'oi', de: OUTRO.jid, id: 'S1' });
        await bot.entregar(msg);
        await bot.entregar(msg); // reenviada numa reconexão
        await bot.entregar(bot.criarMensagem({ texto: 'foto', de: OUTRO.jid, midia: { mimetype: 'image/png', data: 'AA==' } }));

        assert.deepEqual(await contagem(), [{ sender_id: OUTRO.user, msgs: 2, media: 1 }]);
    });

    test('as respostas do bot não contam; as suas contam para o seu número', async () => {
        await bot.executar('/ping'); // o "pong" sai pela sua conta...
        await bot.entregar(bot.criarMensagem({ texto: 'pong' })); // ...e volta pelo message_create

        assert.deepEqual(await contagem(), [{ sender_id: DONO.user, msgs: 1, media: 0 }]);
    });

    test('no privado, as suas mensagens contam para você (não para o outro)', async () => {
        await bot.entregar(bot.criarMensagem({ texto: 'oi', chat: OUTRO.jid, de: DONO.jid }));
        await bot.entregar(bot.criarMensagem({ texto: 'oi', chat: OUTRO.jid, de: OUTRO.jid }));

        const porPessoa = await contagem();
        assert.deepEqual(porPessoa.map(p => [p.sender_id, p.msgs]), [[DONO.user, 1], [OUTRO.user, 1]]);
    });

    test('status e o seu privado não contam; stats.enable off para de contar', async () => {
        await bot.entregar(bot.criarMensagem({ texto: 'status', chat: 'status@broadcast', de: OUTRO.jid }));
        await bot.entregar(bot.criarMensagem({ texto: 'nota', chat: DONO.jid }));
        await bot.setSetting('stats.enable', false);
        await bot.entregar(bot.criarMensagem({ texto: 'oi', de: OUTRO.jid }));

        assert.deepEqual(await contagem(), []);
    });
});
