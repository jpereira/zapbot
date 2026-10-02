/*
 * Evento 'message_create': gravação, roteamento dos comandos e permissões.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { DONO, GRUPO, OUTRO } = bot;

// A legenda do fim das respostas do /bot +o|-o|+v|-v
const LEGENDA = '\n💡 _🤖 dono · 👑 admin (+o) · 🗣️ usuário (+v)_';

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

    test('bot.admins: o admin extra usa os comandos admin, também com o bot.users false e nas checagens do dono', async () => {
        assert.deepEqual(await bot.responder('/ping', { de: OUTRO.jid }), []);
        assert.deepEqual(await bot.responder('/set -a bot.admins +5521911111111'), ['✅ *bot.admins* + 5521911111111 (Fulano)\n= 5521911111111 (Fulano)']);

        assert.deepEqual(await bot.responder('/ping', { de: OUTRO.jid }), ['pong']);
        await bot.setSetting('bot.users', []);
        assert.deepEqual(await bot.responder('/ping', { de: OUTRO.jid }), ['pong'], 'bot.users false');
        assert.match((await bot.responder('/bot'))[0], /🔒 \*Comandos:\* só o dono e os admins\n\n\*Quem usa\* \(1\)\n• 👑 \+o · 👤 Fulano · \+5521911111111\n💡/);
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
        const LID = '100000000000002@lid';
        bot.criarContato('5521966666666@c.us', 'Fulano Da Silva');
        bot.client.lids.set(LID, '5521966666666@c.us');

        assert.deepEqual(await bot.responder('/set -a bot.admins @100000000000002', { mencoes: [LID] }),
            ['✅ *bot.admins* + 5521966666666 (Fulano Da Silva)\n= 5521966666666 (Fulano Da Silva)']);

        // "@número" digitado, sem ser menção: recusado
        assert.match((await bot.responder('/set -a bot.admins @5521977777777'))[0], /❌ "@5521977777777" não é uma menção: mencione a pessoa escolhendo na lista do @/);
    });

    test('bot.admins pelo nome: grupo, e-mail e contato sem telefone são recusados', async () => {
        assert.match((await bot.responder('/set -a bot.admins /Família/'))[0], /❌ Família é um grupo: o \*bot\.admins\* é de pessoas/);
        assert.match((await bot.responder('/set -a bot.admins email'))[0], /❌ O \*bot\.admins\* é de pessoas: informe um contato ou um número, não um e-mail/);
        bot.criarContato('100000000000004@lid', 'Sem Telefone');
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

    test('bot.users false (o padrão): comandos dos outros ignorados, os seus funcionam', async () => {
        await bot.setSetting('bot.users', []);
        assert.deepEqual(await bot.responder('/noffa oi gente', { de: OUTRO.jid }), []);
        assert.equal((await bot.responder('/noffa oi gente')).length, 1);
    });

    test('bot.users com pessoas e grupos: a pessoa em qualquer chat; o grupo, só dentro dele', async () => {
        const CICLANO = '5521922222222@c.us';
        const TRABALHO = '120363000000000300@g.us';
        bot.criarContato(CICLANO, 'Ciclano');
        bot.criarGrupo(TRABALHO, 'Trabalho', [DONO.jid, CICLANO]);

        assert.deepEqual(await bot.responder('/set bot.users /Fulano/'), ['✅ *bot.users* = 5521911111111 (Fulano)']);
        assert.equal((await bot.responder('/noffa oi', { de: OUTRO.jid, chat: OUTRO.jid })).length, 1, 'Fulano no privado');
        assert.deepEqual(await bot.responder('/noffa oi', { de: CICLANO }), [], 'Ciclano, de fora');
        assert.deepEqual(await bot.responder('/ping', { de: OUTRO.jid }), [], 'comando admin continua só dos admins');

        // Grupo: qualquer um, mas só dentro dele
        assert.deepEqual(await bot.responder('/set -a bot.users /Trabalho/'),
            ['✅ *bot.users* + 👥 Trabalho\n= 5521911111111 (Fulano), 👥 Trabalho']);
        assert.deepEqual(bot.getSetting('bot.users'), ['5521911111111', TRABALHO]);
        assert.equal((await bot.responder('/noffa oi', { de: CICLANO, chat: TRABALHO })).length, 1);
        assert.deepEqual(await bot.responder('/noffa oi', { de: CICLANO }), [], 'no Família, não');
        assert.deepEqual(await bot.responder('/noffa oi', { de: CICLANO, chat: CICLANO }), [], 'nem no privado');

        // true e false; o true não se mistura com nomes
        assert.match((await bot.responder('/set -a bot.users true'))[0], /❌ Valor inválido para \*bot\.users\*: o true \(todos\) não se mistura/);
        assert.deepEqual(await bot.responder('/set bot.users true'), ['✅ *bot.users* = true (todos)']);
        assert.equal((await bot.responder('/noffa oi', { de: CICLANO })).length, 1);
        assert.match((await bot.responder('/set -a bot.users /Fulano/'))[0], /não se mistura com pessoas e grupos: para liberar só alguns, \/bot \+admin antes/);
        assert.deepEqual(await bot.responder('/set bot.users false'), ['✅ *bot.users* = (vazio)']);
        assert.deepEqual(bot.getSetting('bot.users'), []);
        assert.match((await bot.responder('/set -a bot.users email'))[0], /❌ O \*bot\.users\* é de pessoas e grupos: .*não um e-mail/);
    });

    test('bot.users: só o dono altera; o bot.adminMode antigo vira o bot.users', async () => {
        await bot.setSetting('bot.admins', ['5521911111111']);
        assert.deepEqual(await bot.responder('/set bot.users true', { de: OUTRO.jid }), ['⛔ Só o dono do bot altera o *bot.users*.']);

        // Migração: desligado (todos usavam) → true; ligado → fica o padrão (false)
        const { carregarSettings } = bot.src('settings');
        for (const [modo, esperado] of [[false, ['all']], [true, []]]) {
            await bot.dbRun("DELETE FROM settings WHERE key = 'bot.users'");
            await bot.dbRun("INSERT INTO settings (key, value) VALUES ('bot.adminMode', ?)", [JSON.stringify(modo)]);
            await carregarSettings();
            assert.deepEqual(bot.getSetting('bot.users'), esperado, `adminMode ${modo}`);
            assert.equal(await bot.dbGet("SELECT value FROM settings WHERE key = 'bot.adminMode'"), undefined);
        }
    });

    test('/bot +o|-o|+v|-v: os atalhos do bot.admins e do bot.users; grupo não vira admin', async () => {
        assert.deepEqual(await bot.responder('/bot +o /Fulano/'),
            ['✅ *bot.admins* + 5521911111111 (Fulano) 👑\n\n*bot.admins* (1)\n- 5521911111111 (Fulano) 👑' + LEGENDA]);
        assert.deepEqual(bot.getSetting('bot.admins'), ['5521911111111']);
        assert.match((await bot.responder('/bot +o /Família/'))[0],
            /^❌ Família é um grupo: .*\n💡 _Um grupo não pode ser admin \(todos ali mandariam no bot\)\. Para liberar os comandos comuns dentro dele: \/bot \+v \/Família\/_$/);
        assert.deepEqual(await bot.responder('/bot -o +5521911111111'),
            ['🗑️ *bot.admins* − 5521911111111 (Fulano)\n\n*bot.admins* (0)\n_(vazio)_' + LEGENDA]);

        await bot.responder('/set bot.users false');
        assert.deepEqual(await bot.responder('/bot +v /Família/ /Fulano/'),
            ['✅ *bot.users* + 👥 Família 🗣️\n✅ *bot.users* + 5521911111111 (Fulano) 🗣️\n\n' +
                '*bot.users* (2)\n- 👥 Família 🗣️\n- 5521911111111 (Fulano) 🗣️' + LEGENDA]);
        assert.match((await bot.responder('/bot'))[0], /👥 \*Comandos:\* o dono e quem está na lista abaixo\n\n\*Quem usa\* \(2\)\n• 🗣️ \+v · 👥 Família\n• 🗣️ \+v · 👤 Fulano · \+5521911111111\n/);
        assert.deepEqual(await bot.responder('/bot -v /Família/'),
            ['🗑️ *bot.users* − 👥 Família\n\n*bot.users* (1)\n- 5521911111111 (Fulano) 🗣️' + LEGENDA]);

        // Cada um com o papel mais alto: o dono (você) 🤖, o admin 👑
        await bot.setSetting('bot.admins', ['5521911111111']);
        assert.deepEqual(await bot.responder('/bot +v +5521900000000'),
            ['✅ *bot.users* + 5521900000000 (Dono) 🤖\n\n*bot.users* (2)\n- 5521911111111 (Fulano) 👑\n- 5521900000000 (Dono) 🤖' + LEGENDA]);
        assert.match((await bot.responder('/bot'))[0], /• 👑 \+o 🗣️ \+v · 👤 Fulano · \+5521911111111\n• 🤖 dono 🗣️ \+v · 👤 Dono · \+5521900000000\n💡 _🤖 dono: você, que já usa tudo_\n/);
        await bot.setSetting('bot.admins', []);

        // Só o dono (nem um admin extra); sem ninguém, o uso
        await bot.setSetting('bot.admins', ['5521911111111']);
        assert.deepEqual(await bot.responder('/bot +o /Fulano/', { de: OUTRO.jid }), ['⛔ Só o dono do bot altera o *bot.admins*.']);
        assert.deepEqual(await bot.responder('/bot -v /Fulano/', { de: OUTRO.jid }), ['⛔ Só o dono do bot altera o *bot.users*.']);
    });

    test('/bot +v|-v|+o|-o sem ninguém: o chat atual (o grupo ou a pessoa do privado)', async () => {
        await bot.setSetting('bot.users', []);

        // No grupo: o grupo; +o recusa (grupo não vira admin)
        assert.deepEqual(await bot.responder('/bot +v'), ['✅ *bot.users* + 👥 Família 🗣️\n\n*bot.users* (1)\n- 👥 Família 🗣️' + LEGENDA]);
        assert.deepEqual(bot.getSetting('bot.users'), [GRUPO]);
        assert.deepEqual(await bot.responder('/bot +v'), ['ℹ️ *bot.users* já tem 👥 Família.']);
        assert.match((await bot.responder('/bot +o'))[0], /^❌ Um grupo não pode ser admin .*\n💡 _Para liberar os comandos comuns neste grupo: \/bot \+v_$/);
        assert.deepEqual(await bot.responder('/bot -v'), ['🗑️ *bot.users* − 👥 Família\n\n*bot.users* (0)\n_(vazio)_' + LEGENDA]);
        assert.deepEqual(await bot.responder('/bot -v'), ['❌ *bot.users* não tem 👥 Família.\n💡 _Veja os itens com /bot_']);

        // No privado de alguém: a pessoa, pelo telefone (também quando o chat é o LID)
        assert.match((await bot.responder('/bot +o', { chat: OUTRO.jid }))[0], /^✅ \*bot\.admins\* \+ 5521911111111 \(Fulano\) 👑\n/);
        const LID = '100000000000002@lid';
        bot.criarContato('5521966666666@c.us', 'Ciclano');
        bot.client.lids.set(LID, '5521966666666@c.us');
        assert.match((await bot.responder('/bot +v', { chat: LID }))[0], /^✅ \*bot\.users\* \+ 5521966666666 \(Ciclano\) 🗣️\n/);

        // No seu privado, não há quem; LID sem telefone, use o número
        assert.match((await bot.responder('/bot +v', { chat: DONO.jid }))[0], /^❌ Este é o seu privado: você \(o dono\) já usa tudo\./);
        assert.match((await bot.responder('/bot +v', { chat: '999999999999999@lid' }))[0], /❌ Não sei o telefone desta pessoa/);
    });

    test('/bot -reset (-r): ligado, sem admins e sem usuários; só o dono', async () => {
        await bot.setSetting('bot.admins', ['5521911111111']);
        await bot.setSetting('bot.users', [GRUPO]);
        await bot.setSetting('bot.paused', true);

        assert.deepEqual(await bot.responder('/bot -r', { de: OUTRO.jid }), ['⛔ Só o dono do bot volta o /bot ao padrão.'], 'admin extra');
        assert.deepEqual(await bot.responder('/bot -reset'),
            ['♻️ *Padrão restaurado:* bot ligado, sem admins extras e sem usuários.\n\n▶️ *Bot:* ativo\n🔒 *Comandos:* só o dono']);
        assert.deepEqual([bot.getSetting('bot.paused'), bot.getSetting('bot.admins'), bot.getSetting('bot.users')], [false, [], []]);
        assert.match((await bot.responder('/bot -r -on'))[0], /❌ O -reset não combina com as outras opções/);
    });

    test('/bot: admins (+o) e usuários (+v) numa lista só, com o tipo, o nome e o número', async () => {
        bot.criarContato('5521933333333@c.us', 'Jorge Pereira');
        await bot.setSetting('bot.admins', ['5521933333333', '5521911111111']);
        await bot.setSetting('bot.users', ['5521911111111', GRUPO, '5521977777777']);

        const [r] = await bot.responder('/bot');
        assert.equal(r.slice(r.indexOf('*Quem usa*')), '*Quem usa* (4)\n' +
            '• 👑 +o · 👤 Jorge Pereira · +5521933333333\n' +
            '• 👑 +o 🗣️ +v · 👤 Fulano · +5521911111111\n' +
            '• 🗣️ +v · 👥 Família\n' +
            '• 🗣️ +v · 👤 +5521977777777\n' +
            '💡 _👑 +o: admin, usa tudo (bot.admins) · 🗣️ +v: usuário, usa os comandos comuns (bot.users)_');

        // Ninguém nas listas: sem a lista; com o true, o aviso
        await bot.setSetting('bot.admins', []);
        await bot.setSetting('bot.users', ['all']);
        assert.equal((await bot.responder('/bot'))[0], '▶️ *Bot:* ativo\n🔓 *Comandos:* todos usam os comuns\n' +
            '⚠️ _Atenção: qualquer pessoa pode executar os comandos comuns do bot, em qualquer chat. ' +
            'Para restringir: /bot +admin (e depois /bot +v para liberar alguns)._');
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

    test('avisos do sistema e mensagens sem autor não contam (não viram um participante "Desconhecido")', async () => {
        await bot.entregar(bot.criarMensagem({ tipo: 'notification_template', de: OUTRO.jid }));
        await bot.entregar(bot.criarMensagem({ tipo: 'gp2', de: OUTRO.jid }));
        await bot.entregar(bot.criarMensagem({ texto: 'sem autor', de: OUTRO.jid, extras: { author: undefined } }), { erroEsperado: true });
        await bot.entregar(bot.criarMensagem({ texto: 'oi', de: OUTRO.jid }));
        assert.deepEqual(await contagem(), [{ sender_id: OUTRO.user, msgs: 1, media: 0 }]);
    });

    test('no boot, as linhas antigas do "Desconhecido" saem', async () => {
        await bot.dbRun(`INSERT INTO stats (chat_id, day, hour, sender_id, sender_name, msgs)
                         VALUES (?, '2026-10-01', 10, 'UNKNOWN', 'Desconhecido', 5)`, [GRUPO]);
        await bot.src('inicializacao').inicializarBanco();
        assert.deepEqual(await bot.dbAll("SELECT * FROM stats WHERE sender_id = 'UNKNOWN'"), []);
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
