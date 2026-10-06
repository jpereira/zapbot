/*
 * Evento 'message_create': gravação, roteamento dos comandos e permissões.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { DONO, GRUPO, OUTRO } = bot;

// A seção Permissões do fim da lista do /bot e do /whois (a do dono, só com você na lista)
const LEGENDA = '\n\n*Permissões*\n👑 +o: admin, usa tudo\n🗣️ +v: usuário, usa os comandos comuns';
const LEGENDA_DONO = '\n\n*Permissões*\n🤖 dono: você, que já usa tudo\n👑 +o: admin, usa tudo\n' +
    '🗣️ +v: usuário, usa os comandos comuns';
// O rodapé de quando alguém fica de fora: no -users, como ver todos; na resposta do +v, como listar
const DICA = (onde, fora) => `\n\n💡 _Só quem é ${onde}; mais ${fora} fora daqui._\n` +
    `⚠️ _Para listar todos: /bot -all-users ou /bot -au. Cuidado: mostra também quem não é ${onde}._`;
const DICA_USUARIOS = (onde, fora) => `\n\n💡 _Só quem é ${onde}; mais ${fora} fora daqui._\n_Listar usuários: /bot -users ou /bot -u_`;

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

    test('comando desconhecido sugere ajuda; texto comum não responde', async () => {
        assert.deepEqual(await bot.responder('/naoexiste'),
            ["⚠️ Comando '/naoexiste' desconhecido, tente: /help"]);
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

    test('comando desativado por setting é desconhecido', async () => {
        await bot.setSetting('commands.disabled', 'ping');
        assert.deepEqual(await bot.responder('/ping'),
            ["⚠️ Comando '/ping' desconhecido, tente: /help"]);
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
    const desconhecidos = (desde) => bot.logs.slice(desde)
        .filter(l => l.includes('executed unknown command'));

    test('do dono em qualquer chat: responde citando a mensagem e sugerindo /help', async () => {
        for (const chat of [DONO.jid, OUTRO.jid, GRUPO]) {
            const antes = bot.logs.length;
            const [r] = await bot.executar('/orca prjx', { chat, id: 'INVALIDO' });
            assert.equal(r.texto, "⚠️ Comando '/orca prjx' desconhecido, tente: /help");
            assert.equal(r.chatId, chat);
            assert.match(r.options.quotedMessageId, /INVALIDO$/);
            assert.equal(desconhecidos(antes).length, 1);
        }
    });

    test('sem permissão: não responde, mesmo com debug ligado', async () => {
        await bot.setSetting('bot.users', false);
        await bot.setSetting('debug.enabled', true);
        assert.deepEqual(await bot.responder('/orca prjx', { chat: OUTRO.jid, de: OUTRO.jid }), []);
        assert.deepEqual(await bot.responder('/orca prjx', { de: OUTRO.jid }), []);
        assert.deepEqual(await bot.responder('texto comum', { chat: DONO.jid }), []);
    });

    test('+o e +v: responde no grupo e no privado', async () => {
        for (const chave of ['bot.admins', 'bot.users']) {
            await bot.setSetting(chave, [OUTRO.user]);
            for (const chat of [GRUPO, OUTRO.jid]) {
                const [r] = await bot.executar('/orca prjx', {
                    chat, de: OUTRO.jid, id: 'PERMITIDO'
                });
                assert.equal(r.texto, "⚠️ Comando '/orca prjx' desconhecido, tente: /help");
                assert.equal(r.chatId, chat);
                assert.match(r.options.quotedMessageId, /PERMITIDO$/);
            }
            await bot.setSetting(chave, []);
        }
    });

    test('+v só no grupo: respeita o escopo; bot.users true libera todos', async () => {
        await bot.setSetting('bot.users', [`${OUTRO.user}:${GRUPO}`]);
        assert.equal((await bot.responder('/orca prjx', { de: OUTRO.jid })).length, 1);
        assert.deepEqual(await bot.responder('/orca prjx', { chat: OUTRO.jid, de: OUTRO.jid }), []);
        await bot.setSetting('bot.users', [GRUPO]);
        assert.equal((await bot.responder('/orca prjx', { de: OUTRO.jid })).length, 1);
        assert.deepEqual(await bot.responder('/orca prjx', { chat: OUTRO.jid, de: OUTRO.jid }), []);
        await bot.setSetting('bot.users', true);
        assert.equal((await bot.responder('/orca prjx', { chat: OUTRO.jid, de: OUTRO.jid })).length, 1);
    });

    test('do dono: sempre no log, com o comando inteiro; dos outros: só no modo debug', async () => {
        let antes = bot.logs.length;
        assert.deepEqual(await bot.responder('/tapioca de frango'),
            ["⚠️ Comando '/tapioca de frango' desconhecido, tente: /help"]);
        assert.deepEqual(await bot.responder('/monitor'),
            ["⚠️ Comando '/monitor' desconhecido, tente: /help"], 'desativado no config: também é desconhecido');
        const doDono = desconhecidos(antes);
        assert.equal(doDono.length, 2);
        assert.match(doDono[0], /\[!\] ⚠️ 'Dono' executed unknown command: '\/tapioca de frango'$/);

        antes = bot.logs.length;
        await bot.responder('/tapioca', { de: OUTRO.jid });
        assert.deepEqual(desconhecidos(antes), [], 'sem debug, o dos outros não aparece');

        await bot.setSetting('debug.enabled', true);
        antes = bot.logs.length;
        await bot.responder('/tapioca', { de: OUTRO.jid });
        assert.match(desconhecidos(antes)[0], /\[DEBUG0\] ⚠️ 'Fulano' executed unknown command: '\/tapioca'$/);
    });
});

describe('permissões', () => {
    test('comandos comuns: exigem liberação e oferecem ajuda aos usuários +v', async () => {
        const comuns = [
            'boletos', 'cotacao', 'crypto', 'cve', 'get', 'giphy', 'help', 'joke', 'kernel',
            'meme', 'news', 'noffa', 'ping', 'pixelart', 'sticker', 'tempo', 'traduzir',
            'uptime', 'version', 'whois'
        ];
        await bot.setSetting('bot.users', false);
        for (const nome of comuns) {
            assert.deepEqual(await bot.responder(`/${nome} -h`, { de: OUTRO.jid }), []);
        }
        await bot.setSetting('bot.users', [OUTRO.user]);
        for (const nome of comuns) {
            const [ajuda] = await bot.responder(`/${nome} -h`, { de: OUTRO.jid });
            assert.ok(ajuda.includes(`Usage: /${nome}`), nome);
        }
        assert.deepEqual(await bot.responder('/p', { de: OUTRO.jid }), ['pong']);
        assert.match((await bot.responder('/u', { de: OUTRO.jid }))[0], /Conectado:/);
        assert.match((await bot.responder('/ver', { de: OUTRO.jid }))[0], /ZapBot/);
    });

    test('comandos comuns aceitam limites por usuário; comandos admin continuam restritos', async () => {
        await bot.setSetting('bot.users', [OUTRO.user]);
        await bot.setSetting('bot.users.cmds', [
            `${OUTRO.user}=/boletos,/news,/ping,/uptime,/version`
        ]);
        assert.deepEqual(await bot.responder('/ping', { de: OUTRO.jid }), ['pong']);
        assert.match((await bot.responder('/noffa oi', { de: OUTRO.jid }))[0], /Limitado aos comandos:/);
        assert.deepEqual(await bot.responder('/debug', { de: OUTRO.jid }), []);
    });

    test('onlyAdmin: ignorado para os outros, sem resposta no chat', async () => {
        assert.deepEqual(await bot.responder('/debug', { de: OUTRO.jid }), []);
        assert.deepEqual(await bot.responder('/debug'), ['🪲 Debug Desativado.']);
    });

    test('onlyAdmin com debug ligado avisa no seu privado', async () => {
        await bot.setSetting('debug.enabled', true);
        const r = await bot.executar('/debug', { de: OUTRO.jid });
        assert.equal(r.length, 1);
        assert.equal(r[0].chatId, process.env.PHONE_NUMBER);
        assert.match(r[0].texto, /Fulano tentou executar \/debug dentro de Família, mas sem permissão/);
    });

    test('bot.admins: o admin extra usa os comandos admin, também com o bot.users false e nas checagens do dono', async () => {
        assert.deepEqual(await bot.responder('/debug', { de: OUTRO.jid }), []);
        assert.deepEqual(await bot.responder('/set -a bot.admins +5521911111111'), ['✅ *bot.admins* + 5521911111111 (Fulano)\n= 5521911111111 (Fulano)']);

        assert.deepEqual(await bot.responder('/debug', { de: OUTRO.jid }), ['🪲 Debug Desativado.']);
        await bot.setSetting('bot.users', []);
        assert.deepEqual(await bot.responder('/debug', { de: OUTRO.jid }), ['🪲 Debug Desativado.'], 'bot.users false');
        assert.match((await bot.responder('/bot'))[0], /\n🔒 \*Comandos:\* só o dono e os admins\n/);
        assert.deepEqual(await bot.responder('/bot -users'), ['*Usuários* (1) neste grupo\n• 👑 +o · 👤 Fulano · +5521911111111' + LEGENDA]);
        assert.deepEqual(await bot.responder('/cotacao -a gbp', { de: OUTRO.jid }), ['✅ 🇬🇧 GBP habilitada.']);

        // Outra pessoa continua de fora
        const CICLANO = '5521922222222@c.us';
        bot.criarContato(CICLANO, 'Ciclano');
        assert.deepEqual(await bot.responder('/debug', { de: CICLANO }), []);
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
        assert.deepEqual(await bot.responder('/debug', { de: OUTRO.jid }), [], 'comando admin continua só dos admins');

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
        assert.match((await bot.responder('/set -a bot.users /Fulano/'))[0], /não se mistura com pessoas e grupos: para liberar só alguns, \/set bot\.users false antes/);
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

    test('/bot +o|-o|+v|-v: a lista deste chat, com ✅ em quem entrou e 🗑️ em quem saiu; grupo não vira admin', async () => {
        await bot.setSetting('bot.users', []);
        assert.deepEqual(await bot.responder('/bot +o /Fulano/'),
            ['*Usuários* (1) neste grupo\n• 👑 +o · 👤 Fulano · +5521911111111 ✅' + LEGENDA]);
        assert.deepEqual(bot.getSetting('bot.admins'), ['5521911111111']);
        assert.match((await bot.responder('/bot +o /Família/'))[0],
            /^❌ Família é um grupo: .*\n💡 _Um grupo não pode ser admin \(todos ali mandariam no bot\)\. Para liberar os comandos comuns dentro dele: \/bot \+v \/Família\/_$/);

        // Sem ninguém na lista: a linha de quem usa os comandos
        assert.deepEqual(await bot.responder('/bot -o +5521911111111'), ['🗑️ 👤 Fulano · +5521911111111\n\n🔒 *Comandos:* só o dono']);

        // Num grupo: o grupo vale para todos de lá; a pessoa, só nesse grupo
        assert.deepEqual(await bot.responder('/bot +v /Família/ /Fulano/'), ['*Usuários* (2) neste grupo\n' +
            '• 🗣️ +v · 👥 Família ✅\n• 🗣️ +v · 👤 Fulano · +5521911111111 · só neste grupo ✅' + LEGENDA]);
        assert.deepEqual(bot.getSetting('bot.users'), [GRUPO, `5521911111111:${GRUPO}`]);
        assert.deepEqual(await bot.responder('/bot -v /Família/'), ['🗑️ 👥 Família\n\n' +
            '*Usuários* (1) neste grupo\n• 🗣️ +v · 👤 Fulano · +5521911111111 · só neste grupo' + LEGENDA]);

        // No seu privado: vale em qualquer chat; você aparece como 🤖 dono
        const [r] = await bot.responder('/bot +v +5521900000000', { chat: DONO.jid });
        assert.match(r, /^\*Usuários\* \(2\)\n• 🗣️ \+v · 👤 Fulano · \+5521911111111 · só em 👥 Família\n• 🤖 dono 🗣️ \+v · 👤 Dono · \+5521900000000 ✅/);
        assert.ok(r.endsWith(LEGENDA_DONO));

        // Só o dono (nem um admin extra)
        await bot.setSetting('bot.admins', ['5521911111111']);
        assert.deepEqual(await bot.responder('/bot +o /Fulano/', { de: OUTRO.jid }), ['⛔ Só o dono do bot põe e tira admins.']);
        assert.deepEqual(await bot.responder('/bot -v /Fulano/', { de: OUTRO.jid }), ['⛔ Só o dono do bot põe e tira usuários.']);
    });

    test('/bot +v de uma pessoa num grupo: vale só nele; no privado, ela fica sabendo onde pode', async () => {
        const CICLANO = '5521922222222@c.us';
        const TRABALHO = '120363000000000300@g.us';
        bot.criarContato(CICLANO, 'Ciclano');
        bot.criarGrupo(TRABALHO, 'Trabalho', [DONO.jid, CICLANO]);
        await bot.setSetting('bot.users', []);

        // O Ciclano não está no Família: entra só nele, com o telefone escondido ali
        assert.deepEqual(await bot.responder('/bot +v /Ciclano/'),
            ['*Usuários* (1) neste grupo\n• 🗣️ +v · 👤 Ciclano · +5521•••••2222 · só neste grupo ✅' + LEGENDA]);
        assert.equal((await bot.responder('/noffa oi', { de: CICLANO })).length, 1, 'no Família, usa');
        assert.deepEqual(await bot.responder('/noffa oi', { de: CICLANO, chat: TRABALHO }), [], 'noutro grupo, não');
        assert.deepEqual(await bot.responder('/noffa oi', { de: CICLANO, chat: CICLANO }),
            ['🚫 Sem permissão para comandos no privado. Permitido apenas em: 👥 Família.'], 'no privado, fica sabendo onde pode');
        assert.match((await bot.responder('/whois /Ciclano/', { chat: DONO.jid }))[0], /• 🚫 sem permissão aqui \(só em 👥 Família\) · 👤 Ciclano/);

        // Já é usuário em qualquer chat: o +v no grupo não muda nada
        await bot.responder('/bot -v /Ciclano/');
        await bot.responder('/bot +v /Ciclano/', { chat: DONO.jid });
        assert.deepEqual(await bot.responder('/bot +v /Ciclano/'), ['ℹ️ Já é usuário: 👤 Ciclano · +5521•••••2222 · só neste grupo.']);

        // No grupo, o -v tira a de lá; no seu privado, todas
        await bot.setSetting('bot.users', ['5521922222222', `5521922222222:${GRUPO}`, `5521922222222:${TRABALHO}`]);
        await bot.responder('/bot -v /Ciclano/');
        assert.deepEqual(bot.getSetting('bot.users'), ['5521922222222', `5521922222222:${TRABALHO}`]);
        await bot.responder('/bot -v /Ciclano/', { chat: DONO.jid });
        assert.deepEqual(bot.getSetting('bot.users'), []);
    });

    test('/bot +v|-v|+o|-o sem ninguém: o chat atual (o grupo ou a pessoa do privado)', async () => {
        await bot.setSetting('bot.users', []);

        // No grupo: o grupo; +o recusa (grupo não vira admin)
        assert.deepEqual(await bot.responder('/bot +v'), ['*Usuários* (1) neste grupo\n• 🗣️ +v · 👥 Família ✅' + LEGENDA]);
        assert.deepEqual(bot.getSetting('bot.users'), [GRUPO]);
        assert.deepEqual(await bot.responder('/bot +v'), ['ℹ️ Já é usuário: 👥 Família.']);
        assert.match((await bot.responder('/bot +o'))[0], /^❌ Um grupo não pode ser admin .*\n💡 _Para liberar os comandos comuns neste grupo: \/bot \+v_$/);
        assert.deepEqual(await bot.responder('/bot -v'), ['🗑️ 👥 Família\n\n🔒 *Comandos:* só o dono']);
        assert.deepEqual(await bot.responder('/bot -v'), ['❌ Não é usuário: 👥 Família.\n💡 _Veja com /bot -users_']);

        // No privado de alguém: a pessoa, pelo telefone (também quando o chat é o LID)
        assert.match((await bot.responder('/bot +o', { chat: OUTRO.jid }))[0], /^\*Usuários\* \(1\) neste chat\n• 👑 \+o · 👤 Fulano · \+5521911111111 ✅/);
        const LID = '100000000000002@lid';
        bot.criarContato('5521966666666@c.us', 'Ciclano');
        bot.client.lids.set(LID, '5521966666666@c.us');
        assert.match((await bot.responder('/bot +v', { chat: LID }))[0], /• 🗣️ \+v · 👤 Ciclano · \+5521966666666 ✅/);

        // No seu privado, não há quem; LID sem telefone, use o número
        assert.match((await bot.responder('/bot +v', { chat: DONO.jid }))[0], /^❌ Este é o seu privado: você \(o dono\) já usa tudo\./);
        assert.match((await bot.responder('/bot +v', { chat: '999999999999999@lid' }))[0], /❌ Não sei o telefone desta pessoa/);
    });

    test('/bot -reset (-r): pergunta e espera o sim por 10 s; com force, volta direto; só o dono', async (t) => {
        const PADRAO = '♻️ *Padrão restaurado:* bot ligado, sem admins extras e sem usuários.\n\n▶️ *Bot:* ativo\n🔒 *Comandos:* só o dono';
        const PERGUNTA = '⚠️ *Voltar ao padrão?* O bot fica ligado, sem admins extras e sem usuários.\n' +
            '💡 _Responda *sim* em 10 s para confirmar (ou /bot -r force, sem perguntar)._';
        const mexer = async () => {
            await bot.setSetting('bot.admins', ['5521911111111']);
            await bot.setSetting('bot.users', [GRUPO]);
            await bot.setSetting('bot.paused', true);
        };
        const lerTudo = () => [bot.getSetting('bot.paused'), bot.getSetting('bot.admins'), bot.getSetting('bot.users')];
        // Espera (com limite) a pergunta sair, depois de `desde` mensagens enviadas
        const saiu = (desde) => bot.client.enviadas.slice(desde).some(e => e.content === PERGUNTA);
        const esperarPergunta = async (desde) => {
            for (let i = 0; i < 1000 && !saiu(desde); i++) await new Promise(setImmediate);
            assert.ok(saiu(desde), 'a pergunta saiu');
        };

        // O -r pergunta; o "sim" (de quem deu o comando, no mesmo chat) confirma
        await mexer();
        const reset = bot.executar('/bot -r');
        await esperarPergunta(bot.client.enviadas.length);
        assert.deepEqual(lerTudo(), [true, ['5521911111111'], [GRUPO]], 'antes do sim, nada muda');
        await bot.executar('sim');
        await reset;
        assert.equal(bot.client.enviadas.at(-1).content, PADRAO);
        assert.deepEqual(lerTudo(), [false, [], []]);

        // "não" cancela
        await mexer();
        const desde = bot.client.enviadas.length;
        const cancela = bot.executar('/bot -reset');
        await esperarPergunta(desde);
        await bot.executar('não');
        await cancela;
        assert.equal(bot.client.enviadas.at(-1).content, '👍 Nada mudou.');
        assert.deepEqual(lerTudo(), [true, ['5521911111111'], [GRUPO]]);

        // Sem resposta em 10 s: nada muda
        t.mock.timers.enable({ apis: ['setTimeout'] });
        const expira = bot.executar('/bot -r');
        await bot.esperarComRelogio(t, expira);
        assert.equal(bot.client.enviadas.at(-1).content, '⌛ Nada mudou: sem *sim* em 10 s.');
        assert.deepEqual(lerTudo(), [true, ['5521911111111'], [GRUPO]]);
        t.mock.timers.reset();

        // force: direto, sem perguntar
        assert.deepEqual(await bot.responder('/bot -r force'), [PADRAO]);
        assert.deepEqual(lerTudo(), [false, [], []]);

        // Um admin extra não volta ao padrão (nem com force)
        await bot.setSetting('bot.admins', ['5521911111111']);
        assert.deepEqual(await bot.responder('/bot -r', { de: OUTRO.jid }), ['⛔ Só o dono do bot volta o /bot ao padrão.']);
        assert.deepEqual(await bot.responder('/bot -r force', { de: OUTRO.jid }), ['⛔ Só o dono do bot volta o /bot ao padrão.']);
        assert.match((await bot.responder('/bot -r -on'))[0], /❌ O -reset não combina com as outras opções/);
        assert.match((await bot.responder('/bot -r xyz'))[0], /❌ O -reset não combina com as outras opções/);
    });

    test('/bot -users: os deste chat; -all-users (-au): todos, com o telefone de quem é de fora escondido', async () => {
        bot.criarContato('5521933333333@c.us', 'Jorge Pereira');
        await bot.setSetting('bot.admins', ['5521933333333', '5521911111111']);
        await bot.setSetting('bot.users', ['5521911111111', GRUPO, '5521977777777']);

        // No grupo Família (o dono e o Fulano): só o Fulano e o próprio grupo
        for (const linha of ['/bot -users', '/b -u']) {
            assert.deepEqual(await bot.responder(linha), ['*Usuários* (2) neste grupo\n' +
                '• 👑 +o 🗣️ +v · 👤 Fulano · +5521911111111\n• 🗣️ +v · 👥 Família' + LEGENDA + DICA('deste grupo', 2)], linha);
        }

        // -all-users: todos; o telefone de quem não está no grupo sai escondido
        const todos = '*Usuários* (4)\n' +
            '• 👑 +o · 👤 Jorge Pereira · +5521•••••3333\n' +
            '• 👑 +o 🗣️ +v · 👤 Fulano · +5521911111111\n' +
            '• 🗣️ +v · 👥 Família\n' +
            '• 🗣️ +v · 👤 +5521•••••7777' + LEGENDA;
        assert.deepEqual(await bot.responder('/bot -all-users'), [todos]);
        assert.deepEqual(await bot.responder('/bot -au'), [todos]);

        // No seu privado: todos, inteiros; no de alguém, só ele
        assert.match((await bot.responder('/bot -users', { chat: DONO.jid }))[0], /^\*Usuários\* \(4\)\n• 👑 \+o · 👤 Jorge Pereira · \+5521933333333\n/);
        assert.deepEqual(await bot.responder('/bot -users', { chat: OUTRO.jid }),
            ['*Usuários* (1) neste chat\n• 👑 +o 🗣️ +v · 👤 Fulano · +5521911111111' + LEGENDA + DICA('deste chat', 3)]);

        // O status (/bot) traz a mesma lista
        assert.match((await bot.responder('/bot'))[0], /\n\n\*Usuários\* \(2\) neste grupo\n• 👑 \+o 🗣️ \+v · 👤 Fulano/);

        // Num grupo em que a pessoa está pelo LID (o id interno), ela conta como do grupo
        const LID = '100000000000003@lid';
        bot.client.lids.set(LID, '5521977777777@c.us');
        bot.criarGrupo('120363000000000400@g.us', 'Trabalho', [DONO.jid, LID]);
        assert.match((await bot.responder('/bot -u', { chat: '120363000000000400@g.us' }))[0], /^\*Usuários\* \(1\) neste grupo\n• 🗣️ \+v · 👤 \+5521977777777\n/);

        // Ninguém deste chat: diz, e como ver todos
        bot.criarGrupo('120363000000000500@g.us', 'Vazio', [DONO.jid]);
        assert.deepEqual(await bot.responder('/bot -u', { chat: '120363000000000500@g.us' }),
            ['*Usuários* (0) neste grupo\n_Ninguém deste grupo._' + DICA('deste grupo', 4)]);

        // Ninguém nas listas: a linha de quem usa; com o true, o aviso
        await bot.setSetting('bot.admins', []);
        await bot.setSetting('bot.users', ['all']);
        assert.equal((await bot.responder('/bot -users'))[0], '🔓 *Comandos:* todos usam os comuns\n' +
            '⚠️ _Atenção: qualquer pessoa pode executar os comandos comuns do bot, em qualquer chat. ' +
            'Para restringir: /set bot.users false (e depois /bot +v para liberar alguns)._');
        assert.doesNotMatch((await bot.responder('/bot'))[0], /Usuários/, 'no status, sem ninguém nas listas, sem a lista');
    });

    test('/bot +v no privado de alguém: vale em qualquer chat; a resposta, a lista de lá', async () => {
        await bot.setSetting('bot.users', ['5521977777777']);

        assert.deepEqual(await bot.responder('/bot +v', { chat: OUTRO.jid }), ['*Usuários* (1) neste chat\n' +
            '• 🗣️ +v · 👤 Fulano · +5521911111111 ✅' + LEGENDA + DICA_USUARIOS('deste chat', 1)]);
        assert.deepEqual(bot.getSetting('bot.users'), ['5521977777777', '5521911111111']);

        // Com -all-users, a resposta traz todos
        bot.criarContato('5521944444444@c.us', 'Sofia Izabel');
        const [r] = await bot.responder('/bot -v /Fulano/ -au');
        assert.match(r, /^🗑️ 👤 Fulano · \+5521911111111\n\n\*Usuários\* \(1\)\n• 🗣️ \+v · 👤 \+5521•••••7777/);
    });

    test('/bot +cmd|-cmd: os comandos de cada usuário (Apenas e Todos, menos); /help e /whois sempre passam', async () => {
        const CICLANO = '5521922222222@c.us';
        bot.criarContato(CICLANO, 'Ciclano');
        await bot.setSetting('bot.users', []);
        const NO_PRIVADO = { chat: DONO.jid };
        const DELE = { de: CICLANO, chat: CICLANO };
        const regras = () => bot.getSetting('bot.users.cmds');

        // +v +cmd: entra só com esses (o alias vira o nome principal)
        assert.deepEqual(await bot.responder('/bot +cmd /noffa,/piada +v /Ciclano/', NO_PRIVADO), ['*Usuários* (1)\n' +
            '• 🗣️ +v · 👤 Ciclano · +5521922222222 ✅\n → Apenas: /noffa, /joke' + LEGENDA]);
        assert.deepEqual(regras(), ['5521922222222=/noffa,/joke']);

        // Usa os da lista; outro, o aviso; o /help (só com os dele) e o /whois passam
        assert.equal((await bot.responder('/noffa oi', DELE)).length, 1);
        assert.deepEqual(await bot.responder('/tempo', DELE), ['🚫 Limitado aos comandos: /noffa, /joke.']);
        const [ajuda] = await bot.responder('/help', DELE);
        assert.match(ajuda, /Usage: \/joke/);
        assert.doesNotMatch(ajuda, /Usage: \/tempo/);
        assert.match((await bot.responder('/help tempo', DELE))[0], /^⛔ O \/tempo não está liberado para você\./);
        assert.match((await bot.responder('/whois', DELE))[0], /• 🗣️ \+v · 👤 Ciclano · \+5521922222222\n → Apenas: \/noffa, \/joke\n/);

        // +cmd acrescenta; -cmd tira; o último, não
        await bot.responder('/bot +cmd /sticker /Ciclano/', NO_PRIVADO);
        assert.deepEqual(regras(), ['5521922222222=/noffa,/joke,/sticker']);
        await bot.responder('/bot -cmd /noffa, /sticker /Ciclano/', NO_PRIVADO);
        assert.deepEqual(regras(), ['5521922222222=/joke']);
        assert.deepEqual(await bot.responder('/bot -cmd /joke /Ciclano/', NO_PRIVADO), ['❌ Não sobraria comando para ' +
            '👤 Ciclano · +5521922222222: para tirar a pessoa, /bot -v; para liberar todos, /bot +cmd all.']);

        // +cmd all: todos os comuns de novo; aí, +cmd não muda nada, e -cmd vira "Todos, menos"
        await bot.responder('/bot +cmd all /Ciclano/', NO_PRIVADO);
        assert.deepEqual(regras(), []);
        assert.deepEqual(await bot.responder('/bot +cmd /noffa /Ciclano/', NO_PRIVADO),
            ['ℹ️ 👤 Ciclano · +5521922222222 já usa todos os comandos comuns.']);
        assert.match((await bot.responder('/bot -cmd /tempo /Ciclano/', NO_PRIVADO))[0], /✅\n → Todos, menos: \/tempo\n/);
        assert.equal((await bot.responder('/noffa oi', DELE)).length, 1);
        assert.deepEqual(await bot.responder('/tempo', DELE), ['🚫 O /tempo não está liberado para você.']);
        await bot.responder('/bot +cmd /tempo /Ciclano/', NO_PRIVADO);
        assert.deepEqual(regras(), [], 'liberar o único de fora: sem regra');

        // -v tira a regra junto
        await bot.responder('/bot -cmd /tempo /Ciclano/', NO_PRIVADO);
        await bot.responder('/bot -v /Ciclano/', NO_PRIVADO);
        assert.deepEqual([bot.getSetting('bot.users'), regras()], [[], []]);

        // Erros
        assert.match((await bot.responder('/bot +cmd /xyz /Ciclano/', NO_PRIVADO))[0], /^❌ comando desconhecido: \/xyz/);
        assert.match((await bot.responder('/bot +cmd /set /Ciclano/', NO_PRIVADO))[0], /^❌ o \/set é só do dono e dos admins/);
        assert.match((await bot.responder('/bot +o +cmd /noffa /Ciclano/', NO_PRIVADO))[0], /^❌ O \+cmd\|-cmd vale só para usuários/);
        assert.match((await bot.responder('/bot -cmd all /Ciclano/', NO_PRIVADO))[0], /^❌ Para tirar todos os comandos, tire a pessoa/);
        assert.deepEqual(await bot.responder('/bot -cmd /noffa /Ciclano/', NO_PRIVADO), ['❌ Não é usuário: 👤 Ciclano · +5521922222222.']);
    });

    test('/bot +v +cmd num grupo: o grupo inteiro só com esses; vale a permissão mais ampla', async () => {
        await bot.setSetting('bot.users', []);

        // No grupo, sem ninguém: o grupo
        assert.deepEqual(await bot.responder('/bot +v +cmd /noffa'),
            ['*Usuários* (1) neste grupo\n• 🗣️ +v · 👥 Família ✅\n → Apenas: /noffa' + LEGENDA]);
        assert.equal((await bot.responder('/noffa oi', { de: OUTRO.jid })).length, 1);
        assert.deepEqual(await bot.responder('/joke', { de: OUTRO.jid }), ['🚫 Limitado aos comandos: /noffa.']);
        await bot.responder('/bot +cmd /joke');
        assert.deepEqual(bot.getSetting('bot.users.cmds'), [`${GRUPO}=/noffa,/joke`]);

        // O Fulano também é usuário em qualquer chat, sem regra: no grupo, usa tudo
        await bot.responder('/bot +v /Fulano/', { chat: DONO.jid });
        const [semRegra] = await bot.responder('/sticker', { de: OUTRO.jid });
        assert.ok(semRegra && !semRegra.startsWith('🚫'), `o /sticker respondeu: ${semRegra}`);

        // -reset tira as regras junto
        await bot.responder('/bot -r force');
        assert.deepEqual(bot.getSetting('bot.users.cmds'), []);
    });

    test('/whois (/who, /id): o seu nível neste chat; o dos outros, só para o dono e os admins', async () => {
        const RODAPE = '\n\nDigite /help para saber quais comandos estão disponíveis.';
        const CICLANO = '5521922222222@c.us';
        const TRABALHO = '120363000000000300@g.us';
        bot.criarContato(CICLANO, 'Ciclano');
        bot.criarGrupo(TRABALHO, 'Trabalho', [DONO.jid, CICLANO]);

        // Você: usuário pela lista, por todos (true) ou pelo grupo
        await bot.setSetting('bot.users', ['5521911111111', TRABALHO]);
        for (const linha of ['/whois', '/who', '/id']) {
            assert.deepEqual(await bot.responder(linha, { de: OUTRO.jid }),
                ['*Quem é?* (1)\n• 🗣️ +v · 👤 Fulano · +5521911111111' + LEGENDA + RODAPE], linha);
        }
        assert.match((await bot.responder('/whois', { de: CICLANO, chat: TRABALHO }))[0], /^\*Quem é\?\* \(1\)\n• 🗣️ \+v pelo grupo · 👤 Ciclano · \+5521922222222\n/);
        await bot.setSetting('bot.users', ['all']);
        assert.match((await bot.responder('/whois', { de: CICLANO }))[0], /• 🗣️ todos · 👤 Ciclano · \+5521•••••2222\n/);

        // Os outros: só o dono e os admins
        assert.deepEqual(await bot.responder('/whois /Ciclano/', { de: OUTRO.jid }),
            ['⛔ Só o dono do bot (e os admins) vê o nível dos outros.\n💡 _/whois sozinho mostra o seu._']);

        // O dono: ele mesmo, várias pessoas (o sem permissão com a legenda), e quem escreveu a mensagem respondida
        await bot.setSetting('bot.users', []);
        await bot.setSetting('bot.admins', ['5521911111111']);
        assert.deepEqual(await bot.responder('/whois'),
            ['*Quem é?* (1)\n• 🤖 dono · 👤 Dono · +5521900000000' + LEGENDA_DONO + RODAPE]);
        assert.deepEqual(await bot.responder('/whois /Fulano/ +5521977777777'), ['*Quem é?* (2)\n' +
            '• 👑 +o · 👤 Fulano · +5521911111111\n' +
            '• 🚫 sem permissão · 👤 +5521•••••7777' + LEGENDA +
            '\n🚫 sem permissão: o bot ignora os comandos dela' + RODAPE]);
        const citada = bot.criarMensagem({ texto: 'oi', de: OUTRO.jid });
        assert.match((await bot.responder('/whois', { citada }))[0], /^\*Quem é\?\* \(1\)\n• 👑 \+o · 👤 Fulano · \+5521911111111\n/);

        // O admin extra também vê os outros; grupo e e-mail não são pessoas
        assert.match((await bot.responder('/whois /Ciclano/', { de: OUTRO.jid }))[0], /• 🚫 sem permissão · 👤 Ciclano · \+5521•••••2222\n/);
        assert.match((await bot.responder('/whois /Trabalho/'))[0], /❌ Trabalho é um grupo: o \/whois é de pessoas/);
        assert.match((await bot.responder('/whois email'))[0], /❌ O \/whois é de pessoas/);
    });

    test('flood: o mesmo comando além do limite no intervalo, um aviso e depois silêncio; admins de fora', async (t) => {
        t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
        await bot.setSetting('flood.maxCommandRepeated', 3);
        await bot.setSetting('flood.intervalCommand', 10);
        const CICLANO = '5521922222222@c.us';
        bot.criarContato(CICLANO, 'Ciclano');

        // 3 vezes passam (os aliases contam como o mesmo comando); a 4ª avisa; depois, nada
        for (const linha of ['/noffa oi', '/🌈 oi', '/noffa oi']) {
            assert.equal((await bot.responder(linha, { de: OUTRO.jid })).length, 1, linha);
        }
        assert.deepEqual(await bot.responder('/🌈 oi', { de: OUTRO.jid }),
            ['⚠️ Não é permitido executar o mesmo comando mais de 3 vezes seguidas. Aguarde 10 segundos.']);
        assert.deepEqual(await bot.responder('/noffa oi', { de: OUTRO.jid }), [], 'no intervalo, silêncio');
        assert.deepEqual(await bot.responder('/joke', { de: OUTRO.jid }), [], 'qualquer comando');

        // Os outros não são afetados; outro comando conta à parte
        assert.equal((await bot.responder('/noffa oi', { de: CICLANO })).length, 1);

        // Passado o intervalo, volta a usar
        t.mock.timers.tick(10_000);
        assert.equal((await bot.responder('/noffa oi', { de: OUTRO.jid })).length, 1);

        // Fora da janela não conta: 3, espera, mais 3
        t.mock.timers.tick(10_000);
        for (let i = 0; i < 3; i++) await bot.responder('/noffa oi', { de: CICLANO });
        t.mock.timers.tick(10_000);
        assert.equal((await bot.responder('/noffa oi', { de: CICLANO })).length, 1);

        // Você (e os admins) não tem limite; 0 desliga
        for (let i = 0; i < 5; i++) assert.equal((await bot.responder('/noffa oi')).length, 1);
        await bot.setSetting('flood.maxCommandRepeated', 0);
        for (let i = 0; i < 5; i++) {
            assert.equal((await bot.responder('/noffa oi', { de: CICLANO })).length, 1);
        }
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
