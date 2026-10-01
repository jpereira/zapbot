/*
 * Comando /walissu (alias /ualisu).
 */

const { enviarSorteio, sortearParticipantes } = require('./boletos');
const { buscarCvesRecentes, formatarCve } = require('./cve');
const { printError } = require('../log');

// /walissu: Walissu CVE BOT (usa o sorteio do /boletos e as CVEs do /cve)
async function cmdWalissu({ msg }) {
    const chat = await msg.getChat().catch(() => null);

    if (!chat?.isGroup) {
        await msg.reply('Apenas utilizado dentro de grupos.');
        return;
    }

    const sorteados = sortearParticipantes(chat.participants, 2);

    if (sorteados.length < 2) {
        await msg.reply('Membros insuficientes no grupo.');
        return;
    }

    try {
        const cves = await buscarCvesRecentes({ dias: 2, max: 50 });
        const cve = cves[Math.floor(Math.random() * cves.length)];

        if (!cve) {
            await msg.reply('🛡️ Nenhuma CVE publicada nos últimos 2 dias.');
            return;
        }

        await enviarSorteio(msg, chat, sorteados, ([a, b]) =>
            `Hey ${a} e ${b}, aqui é o Walissu CVE BOT! Dá uma olhada nesse CVE ou você vai sair da rave 😊\n\n` +
            `${formatarCve(cve)}\n\n` +
            'Cadê o exploit? Preciso sair de Brasília!'
        );
    } catch (err) {
        printError('/walissu:', err.message);
        await msg.reply('❌ Não consegui consultar o NVD agora.');
    }
}

module.exports = {
    cmdWalissu
};
