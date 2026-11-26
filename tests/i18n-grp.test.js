/*
 * i18n (en_US) of the /mute, /unmute, /block, /poll and /leave replies. The other tests run in pt_BR.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, OTHERAlt } = bot;
const { setSetting } = bot.src('settings');

const L200 = '120363000000000200@g.us';

beforeEach(async () => {
    await bot.restart();
    bot.createGroup(L200, 'Grupo sobre L200', [OWNER.jid, OTHERAlt.jid]);
    await setSetting('zapbot.lang', 'en_US');
});

describe('en_US: grp', () => {
    test('/mute: a lista vazia, silenciar e a lista', async () => {
        assert.match((await bot.replyAlt('/mute'))[0], /^🔇 Nobody muted\./);
        assert.deepEqual(await bot.replyAlt('/mute -d /Grupo L200/'), [
            '🔇 *Muted:* 👥 Grupo sobre L200 — deleted\n_Only the alert goes away: the messages are still stored for /show._\n💡 *Tips*\n/mute shows the list\n/unmute undoes it'
        ]);
        assert.match((await bot.replyAlt('/mute'))[0], /^🔇 \*Muted\* \(1\)\n\n1\. 👥 Grupo sobre L200 — deleted/);
    });

    test('/mute: opção desconhecida e nº inexistente', async () => {
        assert.match((await bot.replyAlt('/mute -x y'))[0], /^❌ Unknown option: -x/);
        assert.equal((await bot.replyAlt('/unmute 9'))[0], '❌ No. 9 does not exist. See the list with /mute');
    });

    test('/block: ninguém bloqueado', async () => {
        assert.match((await bot.replyAlt('/block'))[0], /^🚫 Nobody blocked\./);
    });

    test('/poll: poucas opções e o placar sem enquete', async () => {
        assert.match((await bot.replyAlt('/poll Hi? | only one'))[0], /^❌ Provide the question and at least 2 options\./);
        assert.match((await bot.replyAlt('/poll -r'))[0], /^📊 No poll recorded in this chat\./);
    });
});
