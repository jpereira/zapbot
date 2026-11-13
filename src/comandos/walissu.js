/*
 * Comando /walissu.
 */

const { enviarSorteio, sortearParticipantes } = require('./bills');
const { buscarCvesRecentes, formatarCve } = require('./cve');
const { t } = require('../i18n');
const { printError } = require('../log');

// /walissu: Walissu CVE BOT (usa o sorteio do /bills e as CVEs do /cve)
async function cmdWalissu({ msg }) {
    const chat = await msg.getChat().catch(() => null);

    if (!chat?.isGroup) {
        await msg.reply(t('walissu.groupOnly'));
        return;
    }

    const sorteados = sortearParticipantes(chat.participants, 2);

    if (sorteados.length < 2) {
        await msg.reply(t('bills.notEnough'));
        return;
    }

    try {
        const cves = await buscarCvesRecentes({ dias: 2, max: 50 });
        const cve = cves[Math.floor(Math.random() * cves.length)];

        if (!cve) {
            await msg.reply(t('walissu.noCve'));
            return;
        }

        await enviarSorteio(msg, chat, sorteados, ([a, b]) =>
            t('walissu.message', { a, b, cve: formatarCve(cve) })
        );
    } catch (err) {
        printError('/walissu:', err.message);
        await msg.reply(t('walissu.failed'));
    }
}

module.exports = {
    cmdWalissu
};
