/*
 * Comando /walissu (alias /ualisu).
 */

const { sendDraw, drawParticipants } = require('./bills');
const { searchCvesRecent, formatCve } = require('./cve');
const { t } = require('../i18n');
const { printError } = require('../log');

// /walissu: Walissu CVE BOT (uses the /bills draw and the /cve CVEs)
async function cmdWalissu({ msg }) {
    const chat = await msg.getChat().catch(() => null);

    if (!chat?.isGroup) {
        await msg.reply(t('walissu.groupOnly'));
        return;
    }

    const drawn = drawParticipants(chat.participants, 2);

    if (drawn.length < 2) {
        await msg.reply(t('bills.notEnough'));
        return;
    }

    try {
        const cves = await searchCvesRecent({ dias: 2, max: 50 });
        const cve = cves[Math.floor(Math.random() * cves.length)];

        if (!cve) {
            await msg.reply(t('walissu.noCve'));
            return;
        }

        await sendDraw(msg, chat, drawn, ([a, b]) =>
            t('walissu.message', { a, b, cve: formatCve(cve) })
        );
    } catch (err) {
        printError('/walissu:', err.message);
        await msg.reply(t('walissu.failed'));
    }
}

module.exports = {
    cmdWalissu
};
