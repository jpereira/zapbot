/*
 * Comando /ualisu.
 */

const { sendDraw, drawParticipants } = require('./boletos');
const { searchCvesRecent, formatCve } = require('./cve');
const { printError } = require('../log');

// /ualisu: Walissu CVE BOT (uses the /boletos draw and the /cve CVEs)
async function cmdUalisu({ msg }) {
    const chat = await msg.getChat().catch(() => null);

    if (!chat?.isGroup) {
        await msg.reply('Apenas utilizado dentro de grupos.');
        return;
    }

    const drawn = drawParticipants(chat.participants, 2);

    if (drawn.length < 2) {
        await msg.reply('Membros insuficientes no grupo.');
        return;
    }

    try {
        const cves = await searchCvesRecent({ dias: 2, max: 50 });
        const cve = cves[Math.floor(Math.random() * cves.length)];

        if (!cve) {
            await msg.reply('🛡️ Nenhuma CVE publicada nos últimos 2 dias.');
            return;
        }

        await sendDraw(msg, chat, drawn, ([a, b]) =>
            `Hey ${a} e ${b}, aqui é o Walissu CVE BOT! Dá uma olhada nesse CVE ou você vai sair da rave 😊\n\n` +
            `${formatCve(cve)}\n\n` +
            'Cadê o exploit? Preciso sair de Brasília!'
        );
    } catch (err) {
        printError('/ualisu:', err.message);
        await msg.reply('❌ Não consegui consultar o NVD agora.');
    }
}

module.exports = {
    cmdUalisu
};
