/*
 * 'message_create' event: saving, command routing and permissions.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, GROUP, OTHERAlt } = bot;

// The caption at the end of the /bot +o|-o|+v|-v replies
const CAPTION = '\n💡 _🤖 dono · 👑 admin (+o) · 🗣️ usuário (+v)_';

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

    test('comando desconhecido ou texto comum: nenhuma resposta', async () => {
        assert.deepEqual(await bot.replyAlt('/naoexiste'), []);
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
        assert.match(r, /Usage: \/ping/);
    });

    test('comando desativado por setting é ignorado', async () => {
        await bot.setSetting('commands.disabled', 'ping');
        assert.deepEqual(await bot.replyAlt('/ping'), []);
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
    const unknown = (since) => bot.logs.slice(since).filter(l => l.includes('executed unknown command'));

    test('do dono: sempre no log, com o comando inteiro; dos outros: só no modo debug', async () => {
        let beforeAlt = bot.logs.length;
        assert.deepEqual(await bot.replyAlt('/tapioca de frango'), []);
        assert.deepEqual(await bot.replyAlt('/monitor'), [], 'desativado no config: também é desconhecido');
        const owner = unknown(beforeAlt);
        assert.equal(owner.length, 2);
        assert.match(owner[0], /\[!\] ⚠️ 'Dono' executed unknown command: '\/tapioca de frango'$/);

        beforeAlt = bot.logs.length;
        await bot.replyAlt('/tapioca', { de: OTHERAlt.jid });
        assert.deepEqual(unknown(beforeAlt), [], 'sem debug, o dos outros não aparece');

        await bot.setSetting('debug.enabled', true);
        beforeAlt = bot.logs.length;
        await bot.replyAlt('/tapioca', { de: OTHERAlt.jid });
        assert.match(unknown(beforeAlt)[0], /\[DEBUG\] ⚠️ 'Fulano' executed unknown command: '\/tapioca'$/);
    });
});

describe('permissões', () => {
    test('onlyAdmin: ignorado para os outros, sem resposta no chat', async () => {
        assert.deepEqual(await bot.replyAlt('/ping', { de: OTHERAlt.jid }), []);
        assert.deepEqual(await bot.replyAlt('/ping'), ['pong']);
    });

    test('onlyAdmin com debug ligado avisa no seu privado', async () => {
        await bot.setSetting('debug.enabled', true);
        const r = await bot.executar('/ping', { de: OTHERAlt.jid });
        assert.equal(r.length, 1);
        assert.equal(r[0].chatId, process.env.PHONE_NUMBER);
        assert.match(r[0].texto, /Fulano tentou executar \/ping dentro de Família, mas sem permissão/);
    });

    test('bot.admins: o admin extra usa os comandos admin, também com o bot.users false e nas checagens do dono', async () => {
        assert.deepEqual(await bot.replyAlt('/ping', { de: OTHERAlt.jid }), []);
        assert.deepEqual(await bot.replyAlt('/set -a bot.admins +5521911111111'), ['✅ *bot.admins* + 5521911111111 (Fulano)\n= 5521911111111 (Fulano)']);

        assert.deepEqual(await bot.replyAlt('/ping', { de: OTHERAlt.jid }), ['pong']);
        await bot.setSetting('bot.users', []);
        assert.deepEqual(await bot.replyAlt('/ping', { de: OTHERAlt.jid }), ['pong'], 'bot.users false');
        assert.match((await bot.replyAlt('/bot'))[0], /🔒 \*Comandos:\* só o dono e os admins\n\n\*Quem usa\* \(1\)\n• 👑 \+o · 👤 Fulano · \+5521911111111\n💡/);
        assert.deepEqual(await bot.replyAlt('/cotacao -a gbp', { de: OTHERAlt.jid }), ['✅ 🇬🇧 GBP habilitada.']);

        // Another person stays out
        const CICLANO = '5521922222222@c.us';
        bot.createContact(CICLANO, 'Ciclano');
        assert.deepEqual(await bot.replyAlt('/ping', { de: CICLANO }), []);
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
        assert.deepEqual(await bot.replyAlt('/ping', { de: OTHERAlt.jid }), [], 'comando admin continua só dos admins');

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
        assert.match((await bot.replyAlt('/set -a bot.users /Fulano/'))[0], /não se mistura com pessoas e grupos: para liberar só alguns, \/bot \+admin antes/);
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

    test('/bot +o|-o|+v|-v: os atalhos do bot.admins e do bot.users; grupo não vira admin', async () => {
        assert.deepEqual(await bot.replyAlt('/bot +o /Fulano/'),
            ['✅ *bot.admins* + 5521911111111 (Fulano) 👑\n\n*bot.admins* (1)\n- 5521911111111 (Fulano) 👑' + CAPTION]);
        assert.deepEqual(bot.getSetting('bot.admins'), ['5521911111111']);
        assert.match((await bot.replyAlt('/bot +o /Família/'))[0],
            /^❌ Família é um grupo: .*\n💡 _Um grupo não pode ser admin \(todos ali mandariam no bot\)\. Para liberar os comandos comuns dentro dele: \/bot \+v \/Família\/_$/);
        assert.deepEqual(await bot.replyAlt('/bot -o +5521911111111'),
            ['🗑️ *bot.admins* − 5521911111111 (Fulano)\n\n*bot.admins* (0)\n_(vazio)_' + CAPTION]);

        await bot.replyAlt('/set bot.users false');
        assert.deepEqual(await bot.replyAlt('/bot +v /Família/ /Fulano/'),
            ['✅ *bot.users* + 👥 Família 🗣️\n✅ *bot.users* + 5521911111111 (Fulano) 🗣️\n\n' +
                '*bot.users* (2)\n- 👥 Família 🗣️\n- 5521911111111 (Fulano) 🗣️' + CAPTION]);
        assert.match((await bot.replyAlt('/bot'))[0], /👥 \*Comandos:\* o dono e quem está na lista abaixo\n\n\*Quem usa\* \(2\)\n• 🗣️ \+v · 👥 Família\n• 🗣️ \+v · 👤 Fulano · \+5521911111111\n/);
        assert.deepEqual(await bot.replyAlt('/bot -v /Família/'),
            ['🗑️ *bot.users* − 👥 Família\n\n*bot.users* (1)\n- 5521911111111 (Fulano) 🗣️' + CAPTION]);

        // Each with the highest role: the owner (you) 🤖, the admin 👑
        await bot.setSetting('bot.admins', ['5521911111111']);
        assert.deepEqual(await bot.replyAlt('/bot +v +5521900000000'),
            ['✅ *bot.users* + 5521900000000 (Dono) 🤖\n\n*bot.users* (2)\n- 5521911111111 (Fulano) 👑\n- 5521900000000 (Dono) 🤖' + CAPTION]);
        assert.match((await bot.replyAlt('/bot'))[0], /• 👑 \+o 🗣️ \+v · 👤 Fulano · \+5521911111111\n• 🤖 dono 🗣️ \+v · 👤 Dono · \+5521900000000\n💡 _🤖 dono: você, que já usa tudo_\n/);
        await bot.setSetting('bot.admins', []);

        // Owner only (not even an extra admin); with nobody, the usage
        await bot.setSetting('bot.admins', ['5521911111111']);
        assert.deepEqual(await bot.replyAlt('/bot +o /Fulano/', { de: OTHERAlt.jid }), ['⛔ Só o dono do bot altera o *bot.admins*.']);
        assert.deepEqual(await bot.replyAlt('/bot -v /Fulano/', { de: OTHERAlt.jid }), ['⛔ Só o dono do bot altera o *bot.users*.']);
    });

    test('/bot +v|-v|+o|-o sem ninguém: o chat atual (o grupo ou a pessoa do privado)', async () => {
        await bot.setSetting('bot.users', []);

        // In the group: the group; +o refuses (a group does not become admin)
        assert.deepEqual(await bot.replyAlt('/bot +v'), ['✅ *bot.users* + 👥 Família 🗣️\n\n*bot.users* (1)\n- 👥 Família 🗣️' + CAPTION]);
        assert.deepEqual(bot.getSetting('bot.users'), [GROUP]);
        assert.deepEqual(await bot.replyAlt('/bot +v'), ['ℹ️ *bot.users* já tem 👥 Família.']);
        assert.match((await bot.replyAlt('/bot +o'))[0], /^❌ Um grupo não pode ser admin .*\n💡 _Para liberar os comandos comuns neste grupo: \/bot \+v_$/);
        assert.deepEqual(await bot.replyAlt('/bot -v'), ['🗑️ *bot.users* − 👥 Família\n\n*bot.users* (0)\n_(vazio)_' + CAPTION]);
        assert.deepEqual(await bot.replyAlt('/bot -v'), ['❌ *bot.users* não tem 👥 Família.\n💡 _Veja os itens com /bot_']);

        // In someone's private chat: the person, by phone (also when the chat is the LID)
        assert.match((await bot.replyAlt('/bot +o', { chat: OTHERAlt.jid }))[0], /^✅ \*bot\.admins\* \+ 5521911111111 \(Fulano\) 👑\n/);
        const LID = '100000000000002@lid';
        bot.createContact('5521966666666@c.us', 'Ciclano');
        bot.client.lids.set(LID, '5521966666666@c.us');
        assert.match((await bot.replyAlt('/bot +v', { chat: LID }))[0], /^✅ \*bot\.users\* \+ 5521966666666 \(Ciclano\) 🗣️\n/);

        // In your private chat, there is no one; LID without a phone, use the number
        assert.match((await bot.replyAlt('/bot +v', { chat: OWNER.jid }))[0], /^❌ Este é o seu privado: você \(o dono\) já usa tudo\./);
        assert.match((await bot.replyAlt('/bot +v', { chat: '999999999999999@lid' }))[0], /❌ Não sei o telefone desta pessoa/);
    });

    test('/bot -reset (-r): ligado, sem admins e sem usuários; só o dono', async () => {
        await bot.setSetting('bot.admins', ['5521911111111']);
        await bot.setSetting('bot.users', [GROUP]);
        await bot.setSetting('bot.paused', true);

        assert.deepEqual(await bot.replyAlt('/bot -r', { de: OTHERAlt.jid }), ['⛔ Só o dono do bot volta o /bot ao padrão.'], 'admin extra');
        assert.deepEqual(await bot.replyAlt('/bot -reset'),
            ['♻️ *Padrão restaurado:* bot ligado, sem admins extras e sem usuários.\n\n▶️ *Bot:* ativo\n🔒 *Comandos:* só o dono']);
        assert.deepEqual([bot.getSetting('bot.paused'), bot.getSetting('bot.admins'), bot.getSetting('bot.users')], [false, [], []]);
        assert.match((await bot.replyAlt('/bot -r -on'))[0], /❌ O -reset não combina com as outras opções/);
    });

    test('/bot: admins (+o) e usuários (+v) numa lista só, com o tipo, o nome e o número', async () => {
        bot.createContact('5521933333333@c.us', 'Jorge Pereira');
        await bot.setSetting('bot.admins', ['5521933333333', '5521911111111']);
        await bot.setSetting('bot.users', ['5521911111111', GROUP, '5521977777777']);

        const [r] = await bot.replyAlt('/bot');
        assert.equal(r.slice(r.indexOf('*Quem usa*')), '*Quem usa* (4)\n' +
            '• 👑 +o · 👤 Jorge Pereira · +5521933333333\n' +
            '• 👑 +o 🗣️ +v · 👤 Fulano · +5521911111111\n' +
            '• 🗣️ +v · 👥 Família\n' +
            '• 🗣️ +v · 👤 +5521977777777\n' +
            '💡 _👑 +o: admin, usa tudo (bot.admins) · 🗣️ +v: usuário, usa os comandos comuns (bot.users)_');

        // Nobody in the lists: without the list; with true, the warning
        await bot.setSetting('bot.admins', []);
        await bot.setSetting('bot.users', ['all']);
        assert.equal((await bot.replyAlt('/bot'))[0], '▶️ *Bot:* ativo\n🔓 *Comandos:* todos usam os comuns\n' +
            '⚠️ _Atenção: qualquer pessoa pode executar os comandos comuns do bot, em qualquer chat. ' +
            'Para restringir: /bot +admin (e depois /bot +v para liberar alguns)._');
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
