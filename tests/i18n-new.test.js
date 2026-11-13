/*
 * i18n (en_US) of the /welcome, /goodbye, /promote, /demote, /invite, /ocr, /tts, /qr, /decodeqr replies,
 * /carbon and /profile -set. The other tests run in pt_BR.
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, GROUP, OTHERAlt } = bot;
const { setSetting } = bot.src('settings');

beforeEach(async () => {
    await bot.restart();
    const group = bot.createGroup(GROUP, 'Family', [{ jid: OWNER.jid, isAdmin: true }, OTHERAlt.jid]);
    group.promoteParticipants = async () => ({ status: 200 });
    group.getInviteCode = async () => 'ABC123';
    await setSetting('zapbot.lang', 'en_US');
    await setSetting('openai.status', false);
});

test('/welcome e /goodbye', async () => {
    assert.match((await bot.replyAlt('/welcome'))[0], /^🔕 This group has no welcome message\./);
    assert.match((await bot.replyAlt('/welcome -on'))[0], /^✅ The welcome message is on in this group:\n\n👋 Welcome to \{group\}, \{name\}!$/);
    assert.deepEqual(await bot.replyAlt('/goodbye -off'), ['🔕 The goodbye message is off in this group.']);

    const sentAlt2 = [];
    for (const h of bot.client.listeners('group_join')) {
        const beforeAlt = bot.client.enviadas.length;
        await h({ chatId: GROUP, recipientIds: [OTHERAlt.jid] });
        sentAlt2.push(...bot.client.enviadas.slice(beforeAlt));
    }
    assert.equal(sentAlt2[0].content, '👋 Welcome to Family, @5521911111111!');
});

test('/promote, /demote e /invite', async () => {
    assert.deepEqual(await bot.replyAlt(`/promote +${OTHERAlt.user}`), ['✅ Fulano is now a group admin.']);
    assert.deepEqual(await bot.replyAlt('/promote'), ['❌ Use: /promote [/contact/|@mention|+number]... (or reply to a message)']);
    assert.deepEqual(await bot.replyAlt('/invite'), ['🔗 Group invite link:\nhttps://chat.whatsapp.com/ABC123']);
    assert.deepEqual(await bot.replyAlt('/welcome Hi', { chat: OTHERAlt.jid }), ['Only usable inside groups.']);
});

test('/ocr, /tts, /qr, /decodeqr, /carbon e /profile -set', async () => {
    assert.match((await bot.replyAlt('/ocr'))[0], /^⚠️ OpenAI API key not found: \/ocr is disabled\./);
    assert.match((await bot.replyAlt('/tts hi'))[0], /^⚠️ OpenAI API key not found: \/tts is disabled\./);

    await setSetting('openai.api.key', 'sk-teste');
    assert.deepEqual(await bot.replyAlt('/ocr'), ['❌ Reply to a photo with /ocr (or send the photo with /ocr as the caption).']);
    assert.deepEqual(await bot.replyAlt('/tts'), ['❌ Use: /tts <text> (or reply to a text message)']);

    assert.match((await bot.replyAlt('/qr'))[0], /^❌ Use: \/qr <text> /);
    assert.deepEqual(await bot.replyAlt('/decodeqr'), ['❌ Reply to a photo of a QR Code with /decodeqr (or send the photo with /decodeqr as the caption).']);
    assert.deepEqual(await bot.replyAlt('/carbon -t neon x'), ['❌ Unknown theme "neon". Available: dark, light.']);
    assert.match((await bot.replyAlt('/carbon'))[0], /^❌ Use: \/carbon /);
    assert.deepEqual(await bot.replyAlt('/profile -set'), ['❌ Reply to an image with /profile -set (or send the photo with /profile -set as the caption).']);
});
