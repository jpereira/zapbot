/*
 * 'message_create' event: saving, command routing and permissions.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, GROUP, OTHERAlt } = bot;

// The Permissions section at the end of the /bot and /whois list (the owner's, with only you in the list)
const CAPTION = '\n\n*Permissões*\n👑 +o: admin, usa tudo\n🗣️ +v: usuário, usa os comandos comuns';
const CAPTION_OWNER = '\n\n*Permissões*\n🤖 dono: você, que já usa tudo\n👑 +o: admin, usa tudo\n' +
    '🗣️ +v: usuário, usa os comandos comuns';
// The footer for when someone is left out: in -users, how to see everyone; in the +v reply, how to list
const TIP = (whereAlt, outside) => `\n\n💡 _Só quem é ${whereAlt}; mais ${outside} fora daqui._\n` +
    `⚠️ _Para listar todos: /bot -all-users ou /bot -au. Cuidado: mostra também quem não é ${whereAlt}._`;
const TIP_USERS = (whereAlt, outside) => `\n\n💡 _Só quem é ${whereAlt}; mais ${outside} fora daqui._\n_Listar usuários: /bot -users ou /bot -u_`;

beforeEach(bot.restart);

describe('gravação', () => {
    test('grava a mensagem com remetente, chat e nome do grupo', async () => {
        await bot.deliver(bot.createMessage({ texto: 'oi grupo', de: OTHERAlt.jid, id: 'M1' }));
        const row = await bot.dbGet("SELECT * FROM messages WHERE id = 'M1'");

        assert.equal(row.body, 'oi grupo');
        assert.equal(row.chat_id, GROUP);
        assert.equal(row.chat_name, 'Família');
        assert.equal(row.is_group, 1);
        assert.equal(row.sender_number, OTHERAlt.user);
        assert.equal(row.sender_name, OTHERAlt.nome);
    });

    test('grava a mídia em cache/media e a localização', async () => {
        await bot.deliver(bot.createMessage({ de: OTHERAlt.jid, id: 'FOTO', tipo: 'image', midia: { mimetype: 'image/jpeg', data: Buffer.from('jpg').toString('base64') } }));
        const photo = await bot.dbGet("SELECT * FROM messages WHERE id = 'FOTO'");
        assert.equal(photo.has_media, 1);
        assert.match(photo.media_path, /media.*FOTO\.jpeg$/);
        assert.equal(require('fs').readFileSync(photo.media_path, 'utf8'), 'jpg');

        await bot.deliver(bot.createMessage({ de: OTHERAlt.jid, id: 'LOC', tipo: 'location', extras: { location: { latitude: -22.9, longitude: -43.1 } } }));
        const loc = await bot.dbGet("SELECT * FROM messages WHERE id = 'LOC'");
        assert.deepEqual([loc.location_lat, loc.location_lng], [-22.9, -43.1]);
    });

    test('mídia que falha ao baixar é gravada sem mídia', async () => {
        const msg = bot.createMessage({ de: OTHERAlt.jid, id: 'RUIM', midia: {} });
        msg.downloadMedia = async () => { throw new Error('falhou'); };
        await bot.deliver(msg, { erroEsperado: true });
        assert.equal((await bot.dbGet("SELECT has_media FROM messages WHERE id = 'RUIM'")).has_media, 0);
    });

    test('from_me marca as suas mensagens (no privado o remetente gravado é o outro participante)', async () => {
        await bot.deliver(bot.createMessage({ texto: 'minha', chat: bot.OTHERAlt.jid, id: 'MINHA' }));
        await bot.deliver(bot.createMessage({ texto: 'dele', chat: bot.OTHERAlt.jid, de: bot.OTHERAlt.jid, id: 'DELE' }));

        const rows = await bot.dbAll("SELECT id, sender_jid, from_me FROM messages WHERE id IN ('MINHA', 'DELE') ORDER BY id");
        assert.deepEqual(rows, [
            { id: 'DELE', sender_jid: bot.OTHERAlt.jid, from_me: 0 },
            { id: 'MINHA', sender_jid: bot.OTHERAlt.jid, from_me: 1 }
        ]);
    });

    test('@lid do remetente vira o telefone real', async () => {
        bot.client.lids.set('999@lid', OTHERAlt.jid);
        await bot.deliver(bot.createMessage({ de: '999:12@lid', id: 'LID' }));
        assert.equal((await bot.dbGet("SELECT sender_number FROM messages WHERE id = 'LID'")).sender_number, OTHERAlt.user);
    });
});

describe('comandos', () => {
    test('comando por nome e por alias', async () => {
        assert.deepEqual(await bot.replyAlt('/ping'), ['pong']);
        assert.deepEqual(await bot.replyAlt('/p'), ['pong']);
    });

    test('resposta do bot é um reply da mensagem do comando', async () => {
        const [r] = await bot.executar('/ping', { id: 'CMD1' });
        assert.equal(r.chatId, GROUP);
        assert.match(r.options.quotedMessageId, /CMD1$/);
    });

    test('comando desconhecido sugere ajuda; texto comum não responde', async () => {
        assert.deepEqual(await bot.replyAlt('/naoexiste'),
            ["⚠️ Comando '/naoexiste' desconhecido, tente: /help"]);
        assert.deepEqual(await bot.replyAlt('ping'), []);
    });

    test('o log diz quem executou o comando e onde (no privado de outra pessoa, é você)', async () => {
        const ran = () => bot.logs.filter(l => / executed '/.test(l)).at(-1);

        bot.client.contatos.set(OTHERAlt.jid, { id: { _serialized: OTHERAlt.jid, user: OTHERAlt.user }, number: OTHERAlt.user, name: OTHERAlt.nome });
        await bot.replyAlt('/ping', { chat: OTHERAlt.jid });
        assert.match(ran(), /\[\+\] 'Dono' executed '\/ping' in 'Fulano'$/);

        await bot.replyAlt('/help', { de: OTHERAlt.jid });
        assert.match(ran(), /\[\+\] 'Fulano' executed '\/help' in 'Família'$/);
    });

    test('no privado, o nome do chat é o do outro participante, também nas suas mensagens', async () => {
        await bot.deliver(bot.createMessage({ texto: 'oi, Fulano', chat: OTHERAlt.jid, extras: { _data: { notifyName: 'Dono' } } }));
        await bot.deliver(bot.createMessage({ texto: 'oi, Dono', chat: OTHERAlt.jid, de: OTHERAlt.jid }));

        const names = await bot.dbAll('SELECT body, chat_name, from_me FROM messages ORDER BY timestamp, rowid');
        assert.deepEqual(names, [
            { body: 'oi, Fulano', chat_name: 'Fulano', from_me: 1 },
            { body: 'oi, Dono', chat_name: 'Fulano', from_me: 0 }
        ]);
    });

    test('-h mostra a sintaxe do comando', async () => {
        const [r] = await bot.replyAlt('/ping -h');
        assert.match(r, /Uso: \/ping/);
    });

    test('comando desativado por setting é desconhecido', async () => {
        await bot.setSetting('commands.disabled', 'ping');
        assert.deepEqual(await bot.replyAlt('/ping'),
            ["⚠️ Comando '/ping' desconhecido, tente: /help"]);
    });

    test('a marca de "enviada pelo bot" expira em 1 minuto', async (t) => {
        t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: Date.now() });
        const { marksStartCleanup } = bot.src('client');
        marksStartCleanup();

        // Send that never came back through message_create (failed on WhatsApp)
        await bot.client.sendMessage(GROUP, '/ping');
        t.mock.timers.tick(61 * 1000);

        assert.deepEqual(await bot.replyAlt('/ping'), ['pong'], 'marca vencida não bloqueia o dono');
    });

    test('resposta do próprio bot começando com "/" não vira comando', async () => {
        // /noffa echoes the text: without the mark, "/ping" would come back as an owner command
        await bot.client.sendMessage(GROUP, '/ping');
        const msg = bot.createMessage({ texto: '/ping' });
        assert.deepEqual((await bot.deliver(msg)).map(e => e.texto), []);

        // The mark is consumed: the owner typing /ping afterward works
        assert.deepEqual(await bot.replyAlt('/ping'), ['pong']);
    });
});

describe('comando desconhecido', () => {
    const unknown = (since) => bot.logs.slice(since)
        .filter(l => l.includes('executed unknown command'));

    test('do dono em qualquer chat: responde citando a mensagem e sugerindo /help', async () => {
        for (const chat of [OWNER.jid, OTHERAlt.jid, GROUP]) {
            const beforeAlt = bot.logs.length;
            const [r] = await bot.executar('/orca prjx', { chat, id: 'INVALIDO' });
            assert.equal(r.texto, "⚠️ Comando '/orca prjx' desconhecido, tente: /help");
            assert.equal(r.chatId, chat);
            assert.match(r.options.quotedMessageId, /INVALIDO$/);
            assert.equal(unknown(beforeAlt).length, 1);
        }
    });

    test('sem permissão: não responde, mesmo com debug ligado', async () => {
        await bot.setSetting('bot.users', false);
        await bot.setSetting('debug.enabled', true);
        assert.deepEqual(await bot.replyAlt('/orca prjx', { chat: OTHERAlt.jid, de: OTHERAlt.jid }), []);
        assert.deepEqual(await bot.replyAlt('/orca prjx', { de: OTHERAlt.jid }), []);
        assert.deepEqual(await bot.replyAlt('texto comum', { chat: OWNER.jid }), []);
    });

    test('+o e +v: responde no grupo e no privado', async () => {
        for (const keyAlt of ['bot.admins', 'bot.users']) {
            await bot.setSetting(keyAlt, [OTHERAlt.user]);
            for (const chat of [GROUP, OTHERAlt.jid]) {
                const [r] = await bot.executar('/orca prjx', {
                    chat, de: OTHERAlt.jid, id: 'PERMITIDO'
                });
                assert.equal(r.texto, "⚠️ Comando '/orca prjx' desconhecido, tente: /help");
                assert.equal(r.chatId, chat);
                assert.match(r.options.quotedMessageId, /PERMITIDO$/);
            }
            await bot.setSetting(keyAlt, []);
        }
    });

    test('+v só no grupo: respeita o escopo; bot.users true libera todos', async () => {
        await bot.setSetting('bot.users', [`${OTHERAlt.user}:${GROUP}`]);
        assert.equal((await bot.replyAlt('/orca prjx', { de: OTHERAlt.jid })).length, 1);
        assert.deepEqual(await bot.replyAlt('/orca prjx', { chat: OTHERAlt.jid, de: OTHERAlt.jid }), []);
        await bot.setSetting('bot.users', [GROUP]);
        assert.equal((await bot.replyAlt('/orca prjx', { de: OTHERAlt.jid })).length, 1);
        assert.deepEqual(await bot.replyAlt('/orca prjx', { chat: OTHERAlt.jid, de: OTHERAlt.jid }), []);
        await bot.setSetting('bot.users', true);
        assert.equal((await bot.replyAlt('/orca prjx', { chat: OTHERAlt.jid, de: OTHERAlt.jid })).length, 1);
    });

    test('do dono: sempre no log, com o comando inteiro; dos outros: só no modo debug', async () => {
        let beforeAlt = bot.logs.length;
        assert.deepEqual(await bot.replyAlt('/tapioca de frango'),
            ["⚠️ Comando '/tapioca de frango' desconhecido, tente: /help"]);
        assert.deepEqual(await bot.replyAlt('/monitor'),
            ["⚠️ Comando '/monitor' desconhecido, tente: /help"], 'desativado no config: também é desconhecido');
        const owner = unknown(beforeAlt);
        assert.equal(owner.length, 2);
        assert.match(owner[0], /\[!\] ⚠️ 'Dono' executed unknown command: '\/tapioca de frango'$/);

        beforeAlt = bot.logs.length;
        await bot.replyAlt('/tapioca', { de: OTHERAlt.jid });
        assert.deepEqual(unknown(beforeAlt), [], 'sem debug, o dos outros não aparece');

        await bot.setSetting('debug.enabled', true);
        beforeAlt = bot.logs.length;
        await bot.replyAlt('/tapioca', { de: OTHERAlt.jid });
        assert.match(unknown(beforeAlt)[0], /\[DEBUG0\] ⚠️ 'Fulano' executed unknown command: '\/tapioca'$/);
    });
});

describe('permissões', () => {
    test('comandos comuns: exigem liberação e oferecem ajuda aos usuários +v', async () => {
        const common = [
            'boletos', 'cotacao', 'crypto', 'cve', 'get', 'giphy', 'help', 'joke', 'kernel',
            'meme', 'news', 'noffa', 'ping', 'pixelart', 'sticker', 'tempo', 'traduzir',
            'uptime', 'version', 'whois'
        ];
        await bot.setSetting('bot.users', false);
        for (const nameAlt of common) {
            assert.deepEqual(await bot.replyAlt(`/${nameAlt} -h`, { de: OTHERAlt.jid }), []);
        }
        await bot.setSetting('bot.users', [OTHERAlt.user]);
        for (const nameAlt of common) {
            const [help] = await bot.replyAlt(`/${nameAlt} -h`, { de: OTHERAlt.jid });
            assert.ok(help.includes(`Uso: /${nameAlt}`), nameAlt);
        }
        assert.deepEqual(await bot.replyAlt('/p', { de: OTHERAlt.jid }), ['pong']);
        assert.match((await bot.replyAlt('/u', { de: OTHERAlt.jid }))[0], /Conectado:/);
        assert.match((await bot.replyAlt('/ver', { de: OTHERAlt.jid }))[0], /ZapBot/);
    });

    test('comandos comuns aceitam limites por usuário; comandos admin continuam restritos', async () => {
        await bot.setSetting('bot.users', [OTHERAlt.user]);
        await bot.setSetting('bot.users.cmds', [
            `${OTHERAlt.user}=/boletos,/news,/ping,/uptime,/version`
        ]);
        assert.deepEqual(await bot.replyAlt('/ping', { de: OTHERAlt.jid }), ['pong']);
        assert.match((await bot.replyAlt('/noffa oi', { de: OTHERAlt.jid }))[0], /Limitado aos comandos:/);
        assert.deepEqual(await bot.replyAlt('/debug', { de: OTHERAlt.jid }), []);
    });

    test('onlyAdmin: ignorado para os outros, sem resposta no chat', async () => {
        assert.deepEqual(await bot.replyAlt('/debug', { de: OTHERAlt.jid }), []);
        assert.deepEqual(await bot.replyAlt('/debug'), ['🪲 Debug Desativado.']);
    });

    test('onlyAdmin com debug ligado avisa no seu privado', async () => {
        await bot.setSetting('debug.enabled', true);
        const r = await bot.executar('/debug', { de: OTHERAlt.jid });
        assert.equal(r.length, 1);
        assert.equal(r[0].chatId, process.env.PHONE_NUMBER);
        assert.match(r[0].texto, /Fulano tentou executar \/debug dentro de Família, mas sem permissão/);
    });

    test('bot.admins: o admin extra usa os comandos admin, também com o bot.users false e nas checagens do dono', async () => {
        assert.deepEqual(await bot.replyAlt('/debug', { de: OTHERAlt.jid }), []);
        assert.deepEqual(await bot.replyAlt('/set -a bot.admins +5521911111111'), ['✅ *bot.admins* + 5521911111111 (Fulano)\n= 5521911111111 (Fulano)']);

        assert.deepEqual(await bot.replyAlt('/debug', { de: OTHERAlt.jid }), ['🪲 Debug Desativado.']);
        await bot.setSetting('bot.users', []);
        assert.deepEqual(await bot.replyAlt('/debug', { de: OTHERAlt.jid }), ['🪲 Debug Desativado.'], 'bot.users false');
        assert.match((await bot.replyAlt('/bot'))[0], /\n🔒 \*Comandos:\* só o dono e os admins\n/);
        assert.deepEqual(await bot.replyAlt('/bot -users'), ['*Usuários* (1) neste grupo\n• 👑 +o · 👤 Fulano · +5521911111111' + CAPTION]);
        assert.deepEqual(await bot.replyAlt('/cotacao -a gbp', { de: OTHERAlt.jid }), ['✅ 🇬🇧 GBP habilitada.']);

        // Another person stays out
        const CICLANO = '5521922222222@c.us';
        bot.createContact(CICLANO, 'Ciclano');
        assert.deepEqual(await bot.replyAlt('/debug', { de: CICLANO }), []);
    });

    test('bot.admins pelo nome do contato: guarda o telefone, mostra o nome; vários: a lista', async () => {
        const JORGE = '5521933333333@c.us';
        bot.createContact(JORGE, 'Jorge Pereira');
        bot.createContact('5511944444444@c.us', 'Jorge Silva');

        assert.deepEqual(await bot.replyAlt('/set -a bot.admins /Jorge Pereira/ "Fulano"'),
            ['✅ *bot.admins* + 5521933333333 (Jorge Pereira), 5521911111111 (Fulano)\n= 5521933333333 (Jorge Pereira), 5521911111111 (Fulano)']);
        assert.deepEqual(bot.getSetting('bot.admins'), ['5521933333333', '5521911111111']);
        assert.match((await bot.replyAlt('/set bot.admins'))[0], /\*Valor:\* \n1\. 5521933333333 \(Jorge Pereira\)\n2\. 5521911111111 \(Fulano\)\n/);

        assert.deepEqual(await bot.replyAlt('/set -rem bot.admins /Jorge Pereira/'), ['✅ *bot.admins* − 5521933333333 (Jorge Pereira)\n= 5521911111111 (Fulano)']);

        // Several with the name: the list; and "<key> <value>" also accepts names
        const r = await bot.replyChoosing('/set bot.admins jorge', 2);
        assert.match(r[0], /^🔎 "jorge" corresponde a 2 contatos:/);
        assert.equal(r.at(-1), '✅ *bot.admins* = 5511944444444 (Jorge Silva)');

        assert.deepEqual(await bot.replyAlt('/set bot.admins ""'), ['✅ *bot.admins* = (vazio)']);
    });

    test('bot.admins por menção (@ no WhatsApp): o LID da menção vira o telefone', async () => {
        const LID = '100000000000002@lid';
        bot.createContact('5521966666666@c.us', 'Fulano Da Silva');
        bot.client.lids.set(LID, '5521966666666@c.us');

        assert.deepEqual(await bot.replyAlt('/set -a bot.admins @100000000000002', { mencoes: [LID] }),
            ['✅ *bot.admins* + 5521966666666 (Fulano Da Silva)\n= 5521966666666 (Fulano Da Silva)']);

        // "@número" typed, not as a mention: refused
        assert.match((await bot.replyAlt('/set -a bot.admins @5521977777777'))[0], /❌ "@5521977777777" não é uma menção: mencione a pessoa escolhendo na lista do @/);
    });

    test('bot.admins pelo nome: grupo, e-mail e contato sem telefone são recusados', async () => {
        assert.match((await bot.replyAlt('/set -a bot.admins /Família/'))[0], /❌ Família é um grupo: o \*bot\.admins\* é de pessoas/);
        assert.match((await bot.replyAlt('/set -a bot.admins email'))[0], /❌ O \*bot\.admins\* é de pessoas: informe um contato ou um número, não um e-mail/);
        bot.createContact('100000000000004@lid', 'Sem Telefone');
        assert.match((await bot.replyAlt('/set -a bot.admins /Sem Telefone/'))[0], /❌ Não sei o telefone de Sem Telefone .*use o número/);
        assert.match((await bot.replyAlt('/set -a bot.admins xyz'))[0], /❌ Nenhum contato ou grupo com "xyz"/);
        assert.deepEqual(bot.getSetting('bot.admins'), []);
    });

    test('bot.admins: só o dono altera (nem o próprio admin extra)', async () => {
        await bot.setSetting('bot.admins', ['5521911111111']);
        for (const line of ['/set -a bot.admins 5521922222222', '/set -rem bot.admins 5521911111111', '/set -r bot.admins', '/set bot.admins 5521922222222']) {
            assert.deepEqual(await bot.replyAlt(line, { de: OTHERAlt.jid }), ['⛔ Só o dono do bot altera o *bot.admins*.'], line);
        }
        assert.deepEqual(bot.getSetting('bot.admins'), ['5521911111111']);
        assert.match((await bot.replyAlt('/set bot.admins', { de: OTHERAlt.jid }))[0], /⚙️ \*bot\.admins\*/, 'ver pode');
    });

    test('comando liberado (onlyAdmin false) funciona para os outros', async () => {
        const [r] = await bot.replyAlt('/noffa oi gente', { de: OTHERAlt.jid });
        assert.match(r, /oi .* gente/);
    });

    test('bot.users false (o padrão): comandos dos outros ignorados, os seus funcionam', async () => {
        await bot.setSetting('bot.users', []);
        assert.deepEqual(await bot.replyAlt('/noffa oi gente', { de: OTHERAlt.jid }), []);
        assert.equal((await bot.replyAlt('/noffa oi gente')).length, 1);
    });

    test('bot.users com pessoas e grupos: a pessoa em qualquer chat; o grupo, só dentro dele', async () => {
        const CICLANO = '5521922222222@c.us';
        const WORK = '120363000000000300@g.us';
        bot.createContact(CICLANO, 'Ciclano');
        bot.createGroup(WORK, 'Trabalho', [OWNER.jid, CICLANO]);

        assert.deepEqual(await bot.replyAlt('/set bot.users /Fulano/'), ['✅ *bot.users* = 5521911111111 (Fulano)']);
        assert.equal((await bot.replyAlt('/noffa oi', { de: OTHERAlt.jid, chat: OTHERAlt.jid })).length, 1, 'Fulano no privado');
        assert.deepEqual(await bot.replyAlt('/noffa oi', { de: CICLANO }), [], 'Ciclano, de fora');
        assert.deepEqual(await bot.replyAlt('/debug', { de: OTHERAlt.jid }), [], 'comando admin continua só dos admins');

        // Group: anyone, but only inside it
        assert.deepEqual(await bot.replyAlt('/set -a bot.users /Trabalho/'),
            ['✅ *bot.users* + 👥 Trabalho\n= 5521911111111 (Fulano), 👥 Trabalho']);
        assert.deepEqual(bot.getSetting('bot.users'), ['5521911111111', WORK]);
        assert.equal((await bot.replyAlt('/noffa oi', { de: CICLANO, chat: WORK })).length, 1);
        assert.deepEqual(await bot.replyAlt('/noffa oi', { de: CICLANO }), [], 'no Família, não');
        assert.deepEqual(await bot.replyAlt('/noffa oi', { de: CICLANO, chat: CICLANO }), [], 'nem no privado');

        // true and false; true does not mix with names
        assert.match((await bot.replyAlt('/set -a bot.users true'))[0], /❌ Valor inválido para \*bot\.users\*: o true \(todos\) não se mistura/);
        assert.deepEqual(await bot.replyAlt('/set bot.users true'), ['✅ *bot.users* = true (todos)']);
        assert.equal((await bot.replyAlt('/noffa oi', { de: CICLANO })).length, 1);
        assert.match((await bot.replyAlt('/set -a bot.users /Fulano/'))[0], /não se mistura com pessoas e grupos: para liberar só alguns, \/set bot\.users false antes/);
        assert.deepEqual(await bot.replyAlt('/set bot.users false'), ['✅ *bot.users* = (vazio)']);
        assert.deepEqual(bot.getSetting('bot.users'), []);
        assert.match((await bot.replyAlt('/set -a bot.users email'))[0], /❌ O \*bot\.users\* é de pessoas e grupos: .*não um e-mail/);
    });

    test('bot.users: só o dono altera; o bot.adminMode antigo vira o bot.users', async () => {
        await bot.setSetting('bot.admins', ['5521911111111']);
        assert.deepEqual(await bot.replyAlt('/set bot.users true', { de: OTHERAlt.jid }), ['⛔ Só o dono do bot altera o *bot.users*.']);

        // Migration: off (everyone used it) → true; on → keeps the default (false)
        const { loadSettings } = bot.src('settings');
        for (const [mode, expected] of [[false, ['all']], [true, []]]) {
            await bot.dbRun("DELETE FROM settings WHERE key = 'bot.users'");
            await bot.dbRun("INSERT INTO settings (key, value) VALUES ('bot.adminMode', ?)", [JSON.stringify(mode)]);
            await loadSettings();
            assert.deepEqual(bot.getSetting('bot.users'), expected, `adminMode ${mode}`);
            assert.equal(await bot.dbGet("SELECT value FROM settings WHERE key = 'bot.adminMode'"), undefined);
        }
    });

    test('/bot +o|-o|+v|-v: a lista deste chat, com ✅ em quem entrou e 🗑️ em quem saiu; grupo não vira admin', async () => {
        await bot.setSetting('bot.users', []);
        assert.deepEqual(await bot.replyAlt('/bot +o /Fulano/'),
            ['*Usuários* (1) neste grupo\n• 👑 +o · 👤 Fulano · +5521911111111 ✅' + CAPTION]);
        assert.deepEqual(bot.getSetting('bot.admins'), ['5521911111111']);
        assert.match((await bot.replyAlt('/bot +o /Família/'))[0],
            /^❌ Família é um grupo: .*\n💡 _Um grupo não pode ser admin \(todos ali mandariam no bot\)\. Para liberar os comandos comuns dentro dele: \/bot \+v \/Família\/_$/);

        // Nobody on the list: the line of who uses the commands
        assert.deepEqual(await bot.replyAlt('/bot -o +5521911111111'), ['🗑️ 👤 Fulano · +5521911111111\n\n🔒 *Comandos:* só o dono']);

        // In a group: the group applies to everyone there; the person, only in that group
        assert.deepEqual(await bot.replyAlt('/bot +v /Família/ /Fulano/'), ['*Usuários* (2) neste grupo\n' +
            '• 🗣️ +v · 👥 Família ✅\n• 🗣️ +v · 👤 Fulano · +5521911111111 · só neste grupo ✅' + CAPTION]);
        assert.deepEqual(bot.getSetting('bot.users'), [GROUP, `5521911111111:${GROUP}`]);
        assert.deepEqual(await bot.replyAlt('/bot -v /Família/'), ['🗑️ 👥 Família\n\n' +
            '*Usuários* (1) neste grupo\n• 🗣️ +v · 👤 Fulano · +5521911111111 · só neste grupo' + CAPTION]);

        // In your private chat: it works in any chat; you appear as 🤖 owner
        const [r] = await bot.replyAlt('/bot +v +5521900000000', { chat: OWNER.jid });
        assert.match(r, /^\*Usuários\* \(2\)\n• 🗣️ \+v · 👤 Fulano · \+5521911111111 · só em 👥 Família\n• 🤖 dono 🗣️ \+v · 👤 Dono · \+5521900000000 ✅/);
        assert.ok(r.endsWith(CAPTION_OWNER));

        // Owner only (not even an extra admin)
        await bot.setSetting('bot.admins', ['5521911111111']);
        assert.deepEqual(await bot.replyAlt('/bot +o /Fulano/', { de: OTHERAlt.jid }), ['⛔ Só o dono do bot põe e tira admins.']);
        assert.deepEqual(await bot.replyAlt('/bot -v /Fulano/', { de: OTHERAlt.jid }), ['⛔ Só o dono do bot põe e tira usuários.']);
    });

    test('/bot +v de uma pessoa num grupo: vale só nele; no privado, ela fica sabendo onde pode', async () => {
        const CICLANO = '5521922222222@c.us';
        const WORK = '120363000000000300@g.us';
        bot.createContact(CICLANO, 'Ciclano');
        bot.createGroup(WORK, 'Trabalho', [OWNER.jid, CICLANO]);
        await bot.setSetting('bot.users', []);

        // Ciclano is not in Família: enters only there, with the phone hidden there
        assert.deepEqual(await bot.replyAlt('/bot +v /Ciclano/'),
            ['*Usuários* (1) neste grupo\n• 🗣️ +v · 👤 Ciclano · +5521•••••2222 · só neste grupo ✅' + CAPTION]);
        assert.equal((await bot.replyAlt('/noffa oi', { de: CICLANO })).length, 1, 'no Família, usa');
        assert.deepEqual(await bot.replyAlt('/noffa oi', { de: CICLANO, chat: WORK }), [], 'noutro grupo, não');
        assert.deepEqual(await bot.replyAlt('/noffa oi', { de: CICLANO, chat: CICLANO }),
            ['🚫 Sem permissão para comandos no privado. Permitido apenas em: 👥 Família.'], 'no privado, fica sabendo onde pode');
        assert.match((await bot.replyAlt('/whois /Ciclano/', { chat: OWNER.jid }))[0], /• 🚫 sem permissão aqui \(só em 👥 Família\) · 👤 Ciclano/);

        // Already a user in any chat: +v in the group changes nothing
        await bot.replyAlt('/bot -v /Ciclano/');
        await bot.replyAlt('/bot +v /Ciclano/', { chat: OWNER.jid });
        assert.deepEqual(await bot.replyAlt('/bot +v /Ciclano/'), ['ℹ️ Já é usuário: 👤 Ciclano · +5521•••••2222 · só neste grupo.']);

        // In the group, -v removes the one there; in your private chat, all
        await bot.setSetting('bot.users', ['5521922222222', `5521922222222:${GROUP}`, `5521922222222:${WORK}`]);
        await bot.replyAlt('/bot -v /Ciclano/');
        assert.deepEqual(bot.getSetting('bot.users'), ['5521922222222', `5521922222222:${WORK}`]);
        await bot.replyAlt('/bot -v /Ciclano/', { chat: OWNER.jid });
        assert.deepEqual(bot.getSetting('bot.users'), []);
    });

    test('/bot +v|-v|+o|-o sem ninguém: o chat atual (o grupo ou a pessoa do privado)', async () => {
        await bot.setSetting('bot.users', []);

        // In the group: the group; +o refuses (a group does not become admin)
        assert.deepEqual(await bot.replyAlt('/bot +v'), ['*Usuários* (1) neste grupo\n• 🗣️ +v · 👥 Família ✅' + CAPTION]);
        assert.deepEqual(bot.getSetting('bot.users'), [GROUP]);
        assert.deepEqual(await bot.replyAlt('/bot +v'), ['ℹ️ Já é usuário: 👥 Família.']);
        assert.match((await bot.replyAlt('/bot +o'))[0], /^❌ Um grupo não pode ser admin .*\n💡 _Para liberar os comandos comuns neste grupo: \/bot \+v_$/);
        assert.deepEqual(await bot.replyAlt('/bot -v'), ['🗑️ 👥 Família\n\n🔒 *Comandos:* só o dono']);
        assert.deepEqual(await bot.replyAlt('/bot -v'), ['❌ Não é usuário: 👥 Família.\n💡 _Veja com /bot -users_']);

        // In someone's private chat: the person, by phone (also when the chat is the LID)
        assert.match((await bot.replyAlt('/bot +o', { chat: OTHERAlt.jid }))[0], /^\*Usuários\* \(1\) neste chat\n• 👑 \+o · 👤 Fulano · \+5521911111111 ✅/);
        const LID = '100000000000002@lid';
        bot.createContact('5521966666666@c.us', 'Ciclano');
        bot.client.lids.set(LID, '5521966666666@c.us');
        assert.match((await bot.replyAlt('/bot +v', { chat: LID }))[0], /• 🗣️ \+v · 👤 Ciclano · \+5521966666666 ✅/);

        // In your private chat, there is no one; LID without a phone, use the number
        assert.match((await bot.replyAlt('/bot +v', { chat: OWNER.jid }))[0], /^❌ Este é o seu privado: você \(o dono\) já usa tudo\./);
        assert.match((await bot.replyAlt('/bot +v', { chat: '999999999999999@lid' }))[0], /❌ Não sei o telefone desta pessoa/);
    });

    test('/bot -reset (-r): pergunta e espera o sim por 10 s; com force, volta direto; só o dono', async (t) => {
        const DEFAULT = '♻️ *Padrão restaurado:* bot ligado, sem admins extras e sem usuários.\n\n▶️ *Bot:* ativo\n🔒 *Comandos:* só o dono';
        const QUESTION = '⚠️ *Voltar ao padrão?* O bot fica ligado, sem admins extras e sem usuários.\n' +
            '💡 _Responda *sim* em 10 s para confirmar (ou /bot -r force, sem perguntar)._';
        const touch = async () => {
            await bot.setSetting('bot.admins', ['5521911111111']);
            await bot.setSetting('bot.users', [GROUP]);
            await bot.setSetting('bot.paused', true);
        };
        const readAll = () => [bot.getSetting('bot.paused'), bot.getSetting('bot.admins'), bot.getSetting('bot.users')];
        // Waits (with a limit) for the question to go out, after `desde` sent messages
        const left = (since) => bot.client.enviadas.slice(since).some(e => e.content === QUESTION);
        const waitQuestion = async (since) => {
            for (let i = 0; i < 1000 && !left(since); i++) await new Promise(setImmediate);
            assert.ok(left(since), 'a pergunta saiu');
        };

        // -r asks; the "sim" (from whoever gave the command, in the same chat) confirms
        await touch();
        const reset = bot.executar('/bot -r');
        await waitQuestion(bot.client.enviadas.length);
        assert.deepEqual(readAll(), [true, ['5521911111111'], [GROUP]], 'antes do sim, nada muda');
        await bot.executar('sim');
        await reset;
        assert.equal(bot.client.enviadas.at(-1).content, DEFAULT);
        assert.deepEqual(readAll(), [false, [], []]);

        // "no" cancels
        await touch();
        const since = bot.client.enviadas.length;
        const cancel = bot.executar('/bot -reset');
        await waitQuestion(since);
        await bot.executar('não');
        await cancel;
        assert.equal(bot.client.enviadas.at(-1).content, '👍 Nada mudou.');
        assert.deepEqual(readAll(), [true, ['5521911111111'], [GROUP]]);

        // Without a reply within 10 s: nothing changes
        t.mock.timers.enable({ apis: ['setTimeout'] });
        const expires = bot.executar('/bot -r');
        await bot.waitWithClock(t, expires);
        assert.equal(bot.client.enviadas.at(-1).content, '⌛ Nada mudou: sem *sim* em 10 s.');
        assert.deepEqual(readAll(), [true, ['5521911111111'], [GROUP]]);
        t.mock.timers.reset();

        // force: straight, without asking
        assert.deepEqual(await bot.replyAlt('/bot -r force'), [DEFAULT]);
        assert.deepEqual(readAll(), [false, [], []]);

        // An extra admin does not go back to default (not even with force)
        await bot.setSetting('bot.admins', ['5521911111111']);
        assert.deepEqual(await bot.replyAlt('/bot -r', { de: OTHERAlt.jid }), ['⛔ Só o dono do bot volta o /bot ao padrão.']);
        assert.deepEqual(await bot.replyAlt('/bot -r force', { de: OTHERAlt.jid }), ['⛔ Só o dono do bot volta o /bot ao padrão.']);
        assert.match((await bot.replyAlt('/bot -r -on'))[0], /❌ O -reset não combina com as outras opções/);
        assert.match((await bot.replyAlt('/bot -r xyz'))[0], /❌ O -reset não combina com as outras opções/);
    });

    test('/bot -users: os deste chat; -all-users (-au): todos, com o telefone de quem é de fora escondido', async () => {
        bot.createContact('5521933333333@c.us', 'Jorge Pereira');
        await bot.setSetting('bot.admins', ['5521933333333', '5521911111111']);
        await bot.setSetting('bot.users', ['5521911111111', GROUP, '5521977777777']);

        // In the Família group (the owner and Fulano): only Fulano and the group itself
        for (const line of ['/bot -users', '/b -u']) {
            assert.deepEqual(await bot.replyAlt(line), ['*Usuários* (2) neste grupo\n' +
                '• 👑 +o 🗣️ +v · 👤 Fulano · +5521911111111\n• 🗣️ +v · 👥 Família' + CAPTION + TIP('deste grupo', 2)], line);
        }

        // -all-users: everyone; the phone of whoever is not in the group is hidden
        const allAlt2 = '*Usuários* (4)\n' +
            '• 👑 +o · 👤 Jorge Pereira · +5521•••••3333\n' +
            '• 👑 +o 🗣️ +v · 👤 Fulano · +5521911111111\n' +
            '• 🗣️ +v · 👥 Família\n' +
            '• 🗣️ +v · 👤 +5521•••••7777' + CAPTION;
        assert.deepEqual(await bot.replyAlt('/bot -all-users'), [allAlt2]);
        assert.deepEqual(await bot.replyAlt('/bot -au'), [allAlt2]);

        // In your private chat: all of them, in full; in someone's, only them
        assert.match((await bot.replyAlt('/bot -users', { chat: OWNER.jid }))[0], /^\*Usuários\* \(4\)\n• 👑 \+o · 👤 Jorge Pereira · \+5521933333333\n/);
        assert.deepEqual(await bot.replyAlt('/bot -users', { chat: OTHERAlt.jid }),
            ['*Usuários* (1) neste chat\n• 👑 +o 🗣️ +v · 👤 Fulano · +5521911111111' + CAPTION + TIP('deste chat', 3)]);

        // O status (/bot) traz a mesma lista
        assert.match((await bot.replyAlt('/bot'))[0], /\n\n\*Usuários\* \(2\) neste grupo\n• 👑 \+o 🗣️ \+v · 👤 Fulano/);

        // In a group where the person is there by LID (the internal id), they count as from the group
        const LID = '100000000000003@lid';
        bot.client.lids.set(LID, '5521977777777@c.us');
        bot.createGroup('120363000000000400@g.us', 'Trabalho', [OWNER.jid, LID]);
        assert.match((await bot.replyAlt('/bot -u', { chat: '120363000000000400@g.us' }))[0], /^\*Usuários\* \(1\) neste grupo\n• 🗣️ \+v · 👤 \+5521977777777\n/);

        // Nobody in this chat: says so, and how to see everyone
        bot.createGroup('120363000000000500@g.us', 'Vazio', [OWNER.jid]);
        assert.deepEqual(await bot.replyAlt('/bot -u', { chat: '120363000000000500@g.us' }),
            ['*Usuários* (0) neste grupo\n_Ninguém deste grupo._' + TIP('deste grupo', 4)]);

        // Nobody in the lists: the line of who uses it; with true, the warning
        await bot.setSetting('bot.admins', []);
        await bot.setSetting('bot.users', ['all']);
        assert.equal((await bot.replyAlt('/bot -users'))[0], '🔓 *Comandos:* todos usam os comuns\n' +
            '⚠️ _Atenção: qualquer pessoa pode executar os comandos comuns do bot, em qualquer chat. ' +
            'Para restringir: /set bot.users false (e depois /bot +v para liberar alguns)._');
        assert.doesNotMatch((await bot.replyAlt('/bot'))[0], /Usuários/, 'no status, sem ninguém nas listas, sem a lista');
    });

    test('/bot +v no privado de alguém: vale em qualquer chat; a resposta, a lista de lá', async () => {
        await bot.setSetting('bot.users', ['5521977777777']);

        assert.deepEqual(await bot.replyAlt('/bot +v', { chat: OTHERAlt.jid }), ['*Usuários* (1) neste chat\n' +
            '• 🗣️ +v · 👤 Fulano · +5521911111111 ✅' + CAPTION + TIP_USERS('deste chat', 1)]);
        assert.deepEqual(bot.getSetting('bot.users'), ['5521977777777', '5521911111111']);

        // With -all-users, the reply brings everyone
        bot.createContact('5521944444444@c.us', 'Sofia Izabel');
        const [r] = await bot.replyAlt('/bot -v /Fulano/ -au');
        assert.match(r, /^🗑️ 👤 Fulano · \+5521911111111\n\n\*Usuários\* \(1\)\n• 🗣️ \+v · 👤 \+5521•••••7777/);
    });

    test('/bot +cmd|-cmd: os comandos de cada usuário (Apenas e Todos, menos); /help e /whois sempre passam', async () => {
        const CICLANO = '5521922222222@c.us';
        bot.createContact(CICLANO, 'Ciclano');
        await bot.setSetting('bot.users', []);
        const IN_PRIVATE = { chat: OWNER.jid };
        const DELE = { de: CICLANO, chat: CICLANO };
        const rules = () => bot.getSetting('bot.users.cmds');

        // +v +cmd: enters only with these (the alias becomes the main name)
        assert.deepEqual(await bot.replyAlt('/bot +cmd /noffa,/piada +v /Ciclano/', IN_PRIVATE), ['*Usuários* (1)\n' +
            '• 🗣️ +v · 👤 Ciclano · +5521922222222 ✅\n → Apenas: /noffa, /joke' + CAPTION]);
        assert.deepEqual(rules(), ['5521922222222=/noffa,/joke']);

        // Uses those on the list; another, the notice; /help (only with theirs) and /whois pass
        assert.equal((await bot.replyAlt('/noffa oi', DELE)).length, 1);
        assert.deepEqual(await bot.replyAlt('/tempo', DELE), ['🚫 Limitado aos comandos: /noffa, /joke.']);
        const [help] = await bot.replyAlt('/help', DELE);
        assert.match(help, /Uso: \/joke/);
        assert.doesNotMatch(help, /Uso: \/tempo/);
        assert.match((await bot.replyAlt('/help tempo', DELE))[0], /^⛔ O \/tempo não está liberado para você\./);
        assert.match((await bot.replyAlt('/whois', DELE))[0], /• 🗣️ \+v · 👤 Ciclano · \+5521922222222\n → Apenas: \/noffa, \/joke\n/);

        // +cmd adds; -cmd removes; the last one, no
        await bot.replyAlt('/bot +cmd /sticker /Ciclano/', IN_PRIVATE);
        assert.deepEqual(rules(), ['5521922222222=/noffa,/joke,/sticker']);
        await bot.replyAlt('/bot -cmd /noffa, /sticker /Ciclano/', IN_PRIVATE);
        assert.deepEqual(rules(), ['5521922222222=/joke']);
        assert.deepEqual(await bot.replyAlt('/bot -cmd /joke /Ciclano/', IN_PRIVATE), ['❌ Não sobraria comando para ' +
            '👤 Ciclano · +5521922222222: para tirar a pessoa, /bot -v; para liberar todos, /bot +cmd all.']);

        // +cmd all: all the common ones again; then, +cmd changes nothing, and -cmd becomes "All, except"
        await bot.replyAlt('/bot +cmd all /Ciclano/', IN_PRIVATE);
        assert.deepEqual(rules(), []);
        assert.deepEqual(await bot.replyAlt('/bot +cmd /noffa /Ciclano/', IN_PRIVATE),
            ['ℹ️ 👤 Ciclano · +5521922222222 já usa todos os comandos comuns.']);
        assert.match((await bot.replyAlt('/bot -cmd /tempo /Ciclano/', IN_PRIVATE))[0], /✅\n → Todos, menos: \/tempo\n/);
        assert.equal((await bot.replyAlt('/noffa oi', DELE)).length, 1);
        assert.deepEqual(await bot.replyAlt('/tempo', DELE), ['🚫 O /tempo não está liberado para você.']);
        await bot.replyAlt('/bot +cmd /tempo /Ciclano/', IN_PRIVATE);
        assert.deepEqual(rules(), [], 'liberar o único de fora: sem regra');

        // -v tira a regra junto
        await bot.replyAlt('/bot -cmd /tempo /Ciclano/', IN_PRIVATE);
        await bot.replyAlt('/bot -v /Ciclano/', IN_PRIVATE);
        assert.deepEqual([bot.getSetting('bot.users'), rules()], [[], []]);

        // Erros
        assert.match((await bot.replyAlt('/bot +cmd /xyz /Ciclano/', IN_PRIVATE))[0], /^❌ comando desconhecido: \/xyz/);
        assert.match((await bot.replyAlt('/bot +cmd /set /Ciclano/', IN_PRIVATE))[0], /^❌ o \/set é só do dono e dos admins/);
        assert.match((await bot.replyAlt('/bot +o +cmd /noffa /Ciclano/', IN_PRIVATE))[0], /^❌ O \+cmd\|-cmd vale só para usuários/);
        assert.match((await bot.replyAlt('/bot -cmd all /Ciclano/', IN_PRIVATE))[0], /^❌ Para tirar todos os comandos, tire a pessoa/);
        assert.deepEqual(await bot.replyAlt('/bot -cmd /noffa /Ciclano/', IN_PRIVATE), ['❌ Não é usuário: 👤 Ciclano · +5521922222222.']);
    });

    test('/bot +v +cmd num grupo: o grupo inteiro só com esses; vale a permissão mais ampla', async () => {
        await bot.setSetting('bot.users', []);

        // In the group, with nobody: the group
        assert.deepEqual(await bot.replyAlt('/bot +v +cmd /noffa'),
            ['*Usuários* (1) neste grupo\n• 🗣️ +v · 👥 Família ✅\n → Apenas: /noffa' + CAPTION]);
        assert.equal((await bot.replyAlt('/noffa oi', { de: OTHERAlt.jid })).length, 1);
        assert.deepEqual(await bot.replyAlt('/joke', { de: OTHERAlt.jid }), ['🚫 Limitado aos comandos: /noffa.']);
        await bot.replyAlt('/bot +cmd /joke');
        assert.deepEqual(bot.getSetting('bot.users.cmds'), [`${GROUP}=/noffa,/joke`]);

        // Fulano is also a user in any chat, with no rule: in the group, uses everything
        await bot.replyAlt('/bot +v /Fulano/', { chat: OWNER.jid });
        const [withoutRule] = await bot.replyAlt('/sticker', { de: OTHERAlt.jid });
        assert.ok(withoutRule && !withoutRule.startsWith('🚫'), `o /sticker respondeu: ${withoutRule}`);

        // -reset removes the rules too
        await bot.replyAlt('/bot -r force');
        assert.deepEqual(bot.getSetting('bot.users.cmds'), []);
    });

    test('/whois (/who, /id): o seu nível neste chat; o dos outros, só para o dono e os admins', async () => {
        const FOOTER = '\n\nDigite /help para saber quais comandos estão disponíveis.';
        const CICLANO = '5521922222222@c.us';
        const WORK = '120363000000000300@g.us';
        bot.createContact(CICLANO, 'Ciclano');
        bot.createGroup(WORK, 'Trabalho', [OWNER.jid, CICLANO]);

        // You: a user by the list, by everyone (true) or by the group
        await bot.setSetting('bot.users', ['5521911111111', WORK]);
        for (const line of ['/whois', '/who', '/id']) {
            assert.deepEqual(await bot.replyAlt(line, { de: OTHERAlt.jid }),
                ['*Quem é?* (1)\n• 🗣️ +v · 👤 Fulano · +5521911111111' + CAPTION + FOOTER], line);
        }
        assert.match((await bot.replyAlt('/whois', { de: CICLANO, chat: WORK }))[0], /^\*Quem é\?\* \(1\)\n• 🗣️ \+v pelo grupo · 👤 Ciclano · \+5521922222222\n/);
        await bot.setSetting('bot.users', ['all']);
        assert.match((await bot.replyAlt('/whois', { de: CICLANO }))[0], /• 🗣️ todos · 👤 Ciclano · \+5521•••••2222\n/);

        // The others: only the owner and the admins
        assert.deepEqual(await bot.replyAlt('/whois /Ciclano/', { de: OTHERAlt.jid }),
            ['⛔ Só o dono do bot (e os admins) vê o nível dos outros.\n💡 _/whois sozinho mostra o seu._']);

        // The owner: themselves, several people (the no-permission one with the caption), and whoever wrote the replied message
        await bot.setSetting('bot.users', []);
        await bot.setSetting('bot.admins', ['5521911111111']);
        assert.deepEqual(await bot.replyAlt('/whois'),
            ['*Quem é?* (1)\n• 🤖 dono · 👤 Dono · +5521900000000' + CAPTION_OWNER + FOOTER]);
        assert.deepEqual(await bot.replyAlt('/whois /Fulano/ +5521977777777'), ['*Quem é?* (2)\n' +
            '• 👑 +o · 👤 Fulano · +5521911111111\n' +
            '• 🚫 sem permissão · 👤 +5521•••••7777' + CAPTION +
            '\n🚫 sem permissão: o bot ignora os comandos dela' + FOOTER]);
        const quoted = bot.createMessage({ texto: 'oi', de: OTHERAlt.jid });
        assert.match((await bot.replyAlt('/whois', { citada: quoted }))[0], /^\*Quem é\?\* \(1\)\n• 👑 \+o · 👤 Fulano · \+5521911111111\n/);

        // The extra admin sees the others too; a group and an email are not people
        assert.match((await bot.replyAlt('/whois /Ciclano/', { de: OTHERAlt.jid }))[0], /• 🚫 sem permissão · 👤 Ciclano · \+5521•••••2222\n/);
        assert.match((await bot.replyAlt('/whois /Trabalho/'))[0], /❌ Trabalho é um grupo: o \/whois é de pessoas/);
        assert.match((await bot.replyAlt('/whois email'))[0], /❌ O \/whois é de pessoas/);
    });

    test('flood: o mesmo comando além do limite no intervalo, um aviso e depois silêncio; admins de fora', async (t) => {
        t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
        await bot.setSetting('flood.maxCommandRepeated', 3);
        await bot.setSetting('flood.intervalCommand', 10);
        const CICLANO = '5521922222222@c.us';
        bot.createContact(CICLANO, 'Ciclano');

        // 3 times go through (aliases count as the same command); the 4th warns; after that, nothing
        for (const line of ['/noffa oi', '/🌈 oi', '/noffa oi']) {
            assert.equal((await bot.replyAlt(line, { de: OTHERAlt.jid })).length, 1, line);
        }
        assert.deepEqual(await bot.replyAlt('/🌈 oi', { de: OTHERAlt.jid }),
            ['⚠️ Não é permitido executar o mesmo comando mais de 3 vezes seguidas. Aguarde 10 segundos.']);
        assert.deepEqual(await bot.replyAlt('/noffa oi', { de: OTHERAlt.jid }), [], 'no intervalo, silêncio');
        assert.deepEqual(await bot.replyAlt('/joke', { de: OTHERAlt.jid }), [], 'qualquer comando');

        // The others are not affected; another command counts separately
        assert.equal((await bot.replyAlt('/noffa oi', { de: CICLANO })).length, 1);

        // Passado o intervalo, volta a usar
        t.mock.timers.tick(10_000);
        assert.equal((await bot.replyAlt('/noffa oi', { de: OTHERAlt.jid })).length, 1);

        // Outside the window does not count: 3, wait, 3 more
        t.mock.timers.tick(10_000);
        for (let i = 0; i < 3; i++) await bot.replyAlt('/noffa oi', { de: CICLANO });
        t.mock.timers.tick(10_000);
        assert.equal((await bot.replyAlt('/noffa oi', { de: CICLANO })).length, 1);

        // You (and the admins) have no limit; 0 turns it off
        for (let i = 0; i < 5; i++) assert.equal((await bot.replyAlt('/noffa oi')).length, 1);
        await bot.setSetting('flood.maxCommandRepeated', 0);
        for (let i = 0; i < 5; i++) {
            assert.equal((await bot.replyAlt('/noffa oi', { de: CICLANO })).length, 1);
        }
    });

    test('bot desligado: tudo ignorado, inclusive os seus, exceto o /bot', async () => {
        await bot.setSetting('bot.paused', true);
        assert.deepEqual(await bot.replyAlt('/ping'), []);
        assert.match((await bot.replyAlt('/bot'))[0], /desligado/);
    });
});

describe('contagem do /stats', () => {
    const count = () => bot.dbAll('SELECT sender_id, SUM(msgs) AS msgs, SUM(media) AS media FROM stats GROUP BY sender_id ORDER BY sender_id');

    test('conta mensagens novas por remetente, uma vez por id', async () => {
        const msg = bot.createMessage({ texto: 'oi', de: OTHERAlt.jid, id: 'S1' });
        await bot.deliver(msg);
        await bot.deliver(msg); // resent on a reconnection
        await bot.deliver(bot.createMessage({ texto: 'foto', de: OTHERAlt.jid, midia: { mimetype: 'image/png', data: 'AA==' } }));

        assert.deepEqual(await count(), [{ sender_id: OTHERAlt.user, msgs: 2, media: 1 }]);
    });

    test('avisos do sistema e mensagens sem autor não contam (não viram um participante "Desconhecido")', async () => {
        await bot.deliver(bot.createMessage({ tipo: 'notification_template', de: OTHERAlt.jid }));
        await bot.deliver(bot.createMessage({ tipo: 'gp2', de: OTHERAlt.jid }));
        await bot.deliver(bot.createMessage({ texto: 'sem autor', de: OTHERAlt.jid, extras: { author: undefined } }), { erroEsperado: true });
        await bot.deliver(bot.createMessage({ texto: 'oi', de: OTHERAlt.jid }));
        assert.deepEqual(await count(), [{ sender_id: OTHERAlt.user, msgs: 1, media: 0 }]);
    });

    test('no boot, as linhas antigas do "Desconhecido" saem', async () => {
        await bot.dbRun(`INSERT INTO stats (chat_id, day, hour, sender_id, sender_name, msgs)
                         VALUES (?, '2026-10-01', 10, 'UNKNOWN', 'Desconhecido', 5)`, [GROUP]);
        await bot.src('initialization').initializeDb();
        assert.deepEqual(await bot.dbAll("SELECT * FROM stats WHERE sender_id = 'UNKNOWN'"), []);
    });

    test('as respostas do bot não contam; as suas contam para o seu número', async () => {
        await bot.executar('/ping'); // the "pong" goes out through your account...
        await bot.deliver(bot.createMessage({ texto: 'pong' })); // ...and comes back through message_create

        assert.deepEqual(await count(), [{ sender_id: OWNER.user, msgs: 1, media: 0 }]);
    });

    test('no privado, as suas mensagens contam para você (não para o outro)', async () => {
        await bot.deliver(bot.createMessage({ texto: 'oi', chat: OTHERAlt.jid, de: OWNER.jid }));
        await bot.deliver(bot.createMessage({ texto: 'oi', chat: OTHERAlt.jid, de: OTHERAlt.jid }));

        const byPerson = await count();
        assert.deepEqual(byPerson.map(p => [p.sender_id, p.msgs]), [[OWNER.user, 1], [OTHERAlt.user, 1]]);
    });

    test('status e o seu privado não contam; stats.enable off para de contar', async () => {
        await bot.deliver(bot.createMessage({ texto: 'status', chat: 'status@broadcast', de: OTHERAlt.jid }));
        await bot.deliver(bot.createMessage({ texto: 'nota', chat: OWNER.jid }));
        await bot.setSetting('stats.enable', false);
        await bot.deliver(bot.createMessage({ texto: 'oi', de: OTHERAlt.jid }));

        assert.deepEqual(await count(), []);
    });
});
