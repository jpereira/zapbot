/*
 * /bills command: draw of group members. The draw is also used by /walissu.
 */

const { client } = require('../client');
const { t } = require('../i18n');

// Draws `n` different participants (other than the bot itself)
function drawParticipants(participants, n) {
    const myUser = client.info?.wid?.user;
    const pool = participants.filter(p => p.id.user !== myUser);

    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    return pool.slice(0, n);
}

async function sendDraw(msg, chat, drawn, assembleText) {
    const mentions = drawn.map(p => p.id._serialized.split(':')[0]);
    const tags = drawn.map(p => `@${p.id.user}`);

    await client.sendMessage(chat.id._serialized, assembleText(tags), {
        mentions,
        quotedMessageId: msg.id._serialized
    });
}

async function cmdBills({ msg }) {
    const chat = await msg.getChat().catch(() => null);

    if (!chat?.isGroup) {
        await msg.reply(t('bills.groupOnly'));
        return;
    }

    const drawn = drawParticipants(chat.participants, 2);

    if (drawn.length < 2) {
        await msg.reply(t('bills.notEnough'));
        return;
    }

    await sendDraw(msg, chat, drawn, ([a, b]) =>
        t('bills.winners', { a, b })
    );
}

module.exports = {
    cmdBills,
    sendDraw,
    drawParticipants
};
