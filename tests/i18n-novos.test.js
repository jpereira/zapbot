/*
 * i18n (en_US) das respostas de /welcome, /goodbye, /promote, /demote, /invite, /ocr, /tts, /qr, /decodeqr,
 * /carbon e /profile -set. Os outros testes rodam em pt_BR.
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { DONO, GRUPO, OUTRO } = bot;
const { setSetting } = bot.src('settings');

beforeEach(async () => {
    await bot.reiniciar();
    const grupo = bot.criarGrupo(GRUPO, 'Family', [{ jid: DONO.jid, isAdmin: true }, OUTRO.jid]);
    grupo.promoteParticipants = async () => ({ status: 200 });
    grupo.getInviteCode = async () => 'ABC123';
    await setSetting('zapbot.lang', 'en_US');
    await setSetting('openai.status', false);
});

test('/welcome e /goodbye', async () => {
    assert.match((await bot.responder('/welcome'))[0], /^🔕 This group has no welcome message\./);
    assert.match((await bot.responder('/welcome -on'))[0], /^✅ The welcome message is on in this group:\n\n👋 Welcome to \{group\}, \{name\}!$/);
    assert.deepEqual(await bot.responder('/goodbye -off'), ['🔕 The goodbye message is off in this group.']);

    const enviadas = [];
    for (const h of bot.client.listeners('group_join')) {
        const antes = bot.client.enviadas.length;
        await h({ chatId: GRUPO, recipientIds: [OUTRO.jid] });
        enviadas.push(...bot.client.enviadas.slice(antes));
    }
    assert.equal(enviadas[0].content, '👋 Welcome to Family, @5521911111111!');
});

test('/promote, /demote e /invite', async () => {
    assert.deepEqual(await bot.responder(`/promote +${OUTRO.user}`), ['✅ Fulano is now a group admin.']);
    assert.deepEqual(await bot.responder('/promote'), ['❌ Use: /promote [/contact/|@mention|+number]... (or reply to a message)']);
    assert.deepEqual(await bot.responder('/invite'), ['🔗 Group invite link:\nhttps://chat.whatsapp.com/ABC123']);
    assert.deepEqual(await bot.responder('/welcome Hi', { chat: OUTRO.jid }), ['Only usable inside groups.']);
});

test('/ocr, /tts, /qr, /decodeqr, /carbon e /profile -set', async () => {
    assert.match((await bot.responder('/ocr'))[0], /^⚠️ OpenAI API key not found: \/ocr is disabled\./);
    assert.match((await bot.responder('/tts hi'))[0], /^⚠️ OpenAI API key not found: \/tts is disabled\./);

    await setSetting('openai.api.key', 'sk-teste');
    assert.deepEqual(await bot.responder('/ocr'), ['❌ Reply to a photo with /ocr (or send the photo with /ocr as the caption).']);
    assert.deepEqual(await bot.responder('/tts'), ['❌ Use: /tts <text> (or reply to a text message)']);

    assert.match((await bot.responder('/qr'))[0], /^❌ Use: \/qr <text> /);
    assert.deepEqual(await bot.responder('/decodeqr'), ['❌ Reply to a photo of a QR Code with /decodeqr (or send the photo with /decodeqr as the caption).']);
    assert.deepEqual(await bot.responder('/carbon -t neon x'), ['❌ Unknown theme "neon". Available: dark, light.']);
    assert.match((await bot.responder('/carbon'))[0], /^❌ Use: \/carbon /);
    assert.deepEqual(await bot.responder('/profile -set'), ['❌ Reply to an image with /profile -set (or send the photo with /profile -set as the caption).']);
});
