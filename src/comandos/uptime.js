/*
 * Comando /uptime e /version.
 */

const { estado } = require('../estado');
const { BOT_START_TIME } = require('../constantes');
const { t } = require('../i18n');
const { getBotUptime } = require('../log');
const { versaoComCommit } = require('../versao');

// Também atende o /version: o banner já traz a versão
async function cmdUptime({ msg }) {
    const conectado = estado.autenticadoEm ? getBotUptime(estado.autenticadoEm) : t('uptime.notConnected');

    await msg.reply(
        t('uptime.text', { version: versaoComCommit(), online: getBotUptime(BOT_START_TIME), connected: conectado })
    );
}

module.exports = {
    cmdUptime
};
