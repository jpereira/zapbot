/*
 * i18n (en_US) of the core: login, unknown option, unknown command, deleted/edited notices
 * and the uptime. The other tests run in pt_BR.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OTHERAlt } = bot;
const { setSetting } = bot.src('settings');
const { getBotUptime } = bot.src('log');
const { readWhen } = bot.src('util/when');

beforeEach(async () => {
    await bot.restart();
    await setSetting('show.delayMs', 0);
    await setSetting('zapbot.lang', 'en_US');
});

describe('en_US: núcleo', () => {
    test('/bot -passwd e -login em inglês', async () => {
        const private = { chat: OTHERAlt.jid, de: OTHERAlt.jid };

        assert.equal((await bot.replyAlt('/bot -login x', private))[0], '🚫 Login disabled.');
        assert.match((await bot.replyAlt('/bot -passwd short'))[0], /^❌ The password needs at least 8 characters\./);
        assert.match((await bot.replyAlt('/bot -passwd segredo123'))[0], /^🔐 \*Password saved\*/);
        assert.equal((await bot.replyAlt('/bot -login errada123', private))[0], '❌ Wrong password.');

        const replies = await bot.replyAlt('/bot -login segredo123', private);
        assert.ok(replies.includes('👑 *Done:* you are now an admin of the bot.'));
        assert.ok(replies.some(r => r.startsWith('🔑 New admin by password')));
    });

    test('comando desconhecido e opção desconhecida', async () => {
        assert.equal((await bot.replyAlt('/naoexiste'))[0], "⚠️ Unknown command '/naoexiste', try: /help");
        assert.match((await bot.replyAlt('/mute -zzz'))[0], /^❌ Unknown option: -zzz/);
    });

    test('aviso de mensagem apagada e de editada', async () => {
        const deleted = bot.createMessage({ text: 'segredo', de: OTHERAlt.jid });
        await bot.deliver(deleted);
        const [alert] = await bot.erase(deleted);
        assert.match(alert.content, /^❌ \*DELETED MESSAGE DETECTED\*\n\n/);
        assert.match(alert.content, /\*Sent at:\*/);
        assert.match(alert.content, /💬 \*Text:\* "segredo"$/);

        const edited = bot.createMessage({ text: 'antes', de: OTHERAlt.jid });
        await bot.deliver(edited);
        const [notice] = await bot.edit(edited, 'depois');
        assert.match(notice.content, /^✏️ \*EDITED MESSAGE DETECTED\*/);
        assert.match(notice.content, /📝 \*Before:\* "antes"\n💬 \*After:\* "depois"/);
    });

    test('tempo no ar e o "quando" em inglês', () => {
        const nowAlt = Date.now();
        assert.equal(getBotUptime(nowAlt - (2 * 86400 + 3 * 3600 + 60) * 1000), '2 days, 3 hours, 1 minute');
        assert.equal(getBotUptime(nowAlt - 1000), '1 second');
        assert.ok(readWhen(['tomorrow', '9h'], nowAlt)?.ms > nowAlt);
        assert.equal(readWhen(['at', '18h'], nowAlt)?.used, 2);
    });
});
