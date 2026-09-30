/*
 * Comando /uptime e /version.
 */

const packageJson = require('../../package.json');

const { estado: stateAlt } = require('../state');
const { BOT_START_TIME } = require('../constants');
const { getBotUptime } = require('../log');

// Also serves /version: the banner already carries the version
async function cmdUptime({ msg }) {
    const connected = stateAlt.autenticadoEm ? getBotUptime(stateAlt.autenticadoEm) : 'não conectado';

    await msg.reply(
        `🤖 *ZapBot ${packageJson.version}*\n` +
        '━━━━━━━━━━━━━━━━━━\n' +
        `⚡ Online: *${getBotUptime(BOT_START_TIME)}*\n` +
        `🔐 Conectado: *${connected}*`
    );
}

module.exports = {
    cmdUptime
};
