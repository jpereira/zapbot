/*
 * 'message_create' event: saving, command routing and permissions.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, GROUP, OTHERAlt } = bot;

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

    test('comando liberado (onlyAdmin false) funciona para os outros', async () => {
        const [r] = await bot.replyAlt('/noffa oi gente', { de: OTHERAlt.jid });
        assert.match(r, /oi .* gente/);
    });

    test('modo admin: comandos dos outros ignorados, os seus funcionam', async () => {
        await bot.setSetting('bot.adminMode', true);
        assert.deepEqual(await bot.replyAlt('/noffa oi gente', { de: OTHERAlt.jid }), []);
        assert.equal((await bot.replyAlt('/noffa oi gente')).length, 1);
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

    test('status e o seu privado não contam; stats.enabled off para de contar', async () => {
        await bot.deliver(bot.createMessage({ texto: 'status', chat: 'status@broadcast', de: OTHERAlt.jid }));
        await bot.deliver(bot.createMessage({ texto: 'nota', chat: OWNER.jid }));
        await bot.setSetting('stats.enabled', false);
        await bot.deliver(bot.createMessage({ texto: 'oi', de: OTHERAlt.jid }));

        assert.deepEqual(await count(), []);
    });
});
