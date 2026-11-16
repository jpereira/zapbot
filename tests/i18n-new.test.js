/*
 * i18n (en_US) of the /welcome, /goodbye, /promote, /demote, /invite, /ocr, /tts, /qr replies,
 * /carbon, /profile -set and /forward. The other tests run in pt_BR.
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
    await setSetting('gpt.status', false);
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
    assert.deepEqual(await bot.replyAlt('/promote'), ['```Usage: /promote [/contact/|@mention|+number]...```\n💡 _/promote -h for help_']);
    assert.deepEqual(await bot.replyAlt('/invite'), ['🔗 Group invite link:\nhttps://chat.whatsapp.com/ABC123']);
    assert.deepEqual(await bot.replyAlt('/welcome Hi', { chat: OTHERAlt.jid }), ['Only usable inside groups.']);
});

test('/ocr, /tts, /qr, /carbon e /profile -set', async () => {
    assert.match((await bot.replyAlt('/ocr'))[0], /^⚠️ OpenAI API key not found: \/ocr is disabled\./);
    assert.match((await bot.replyAlt('/tts hi'))[0], /^⚠️ OpenAI API key not found: \/tts is disabled\./);

    await setSetting('gpt.api.key', 'sk-teste');
    assert.deepEqual(await bot.replyAlt('/ocr'), ['Reply to a photo with /ocr (or send the photo with /ocr as the caption).\n💡 _/ocr -h for help_']);
    assert.deepEqual(await bot.replyAlt('/tts'), ['```Usage: /tts [-status|-s] [<text>]```\n💡 _/tts -h for help_']);

    assert.match((await bot.replyAlt('/qr'))[0], /^```Usage: \/qr \[-decode\|-d\] \[<text>\]```/);
    assert.deepEqual(await bot.replyAlt('/qr -d'), ['Reply to a photo of a QR Code with /qr -d (or send the photo with /qr -d as the caption).\n💡 _/qr -h for help_']);
    assert.deepEqual(await bot.replyAlt('/carbon -t neon x'), ['❌ Unknown theme "neon". Available: dark, light.']);
    assert.match((await bot.replyAlt('/carbon'))[0], /^```Usage: \/carbon /);
    assert.deepEqual(await bot.replyAlt('/profile -s'), ['Reply to an image with /profile -s (or send the photo with /profile -s as the caption).\n💡 _/profile -h for help_']);
});

test('/forward', async () => {
    assert.match((await bot.replyAlt('/forward'))[0], /^```Usage: \/forward /);
    assert.deepEqual(await bot.replyAlt('/forward /Fulano/'), ['Reply to the message you want to forward, or give its position (e.g. /forward -1 /Fulano/).\n💡 _/forward -h for help_']);

    const quoted = bot.createMessage({ texto: 'Meeting at 10', de: OTHERAlt.jid });
    const sendings = await bot.executar('/forward /Fulano/', { citada: quoted });
    assert.equal(sendings.find(e => e.chatId === OTHERAlt.jid).content, '🤖 Message forwarded by ZapBot!\n\nMeeting at 10');
    assert.equal(sendings.find(e => /forwarded successfully/.test(e.texto)).texto, '✉️ Message forwarded successfully!\n\n👤 Fulano');
});
