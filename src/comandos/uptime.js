/*
 * Comando /uptime e /version.
 */

const { estado } = require('../estado');
const { BOT_START_TIME } = require('../constantes');
const { getBotUptime } = require('../log');
const { versaoComCommit } = require('../versao');

// Também atende o /version: o banner já traz a versão
async function cmdUptime({ msg }) {
    const conectado = estado.autenticadoEm ? getBotUptime(estado.autenticadoEm) : 'não conectado';

    await msg.reply(
        `🤖 *ZapBot ${versaoComCommit()}*\n` +
        '━━━━━━━━━━━━━━━━━━\n' +
        `⚡ Online: *${getBotUptime(BOT_START_TIME)}*\n` +
        `🔐 Conectado: *${conectado}*`
    );
}

module.exports = {
    cmdUptime
};
