/*
 * /whois -id: the ids of the chat and the people.
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, OTHERAlt } = bot;

beforeEach(async () => {
    await bot.restart();
});

test('-id: o id do chat e o da pessoa (telefone e @c.us), sem o nível de permissão', async () => {
    const [r] = await bot.replyAlt('/whois -id', { chat: OWNER.jid });
    assert.match(r, /^\*🆔 IDs\*\n💬 Chat: /);
    assert.ok(r.includes(`📞 +${OWNER.user}`), r);
    assert.ok(r.includes(`🪪 ${OWNER.user}@c.us`), r);
    assert.ok(!r.includes('Quem é?') && !r.includes('Permiss'), r);
});

test('-id com uma pessoa (número ou nome): os ids dela', async () => {
    for (const line of [`/whois -id +${OTHERAlt.user}`, '/whois -id /Fulano/']) {
        const [r] = await bot.replyAlt(line);
        assert.ok(r.includes(`🪪 ${OTHERAlt.user}@c.us`), `${line}: ${r}`);
    }
});
