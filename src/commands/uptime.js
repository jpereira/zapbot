/*
 * Comando /uptime e /version.
 */

const { state: stateAlt } = require('../state');
const { BOT_START_TIME } = require('../constants');
const { t } = require('../i18n');
const { getBotUptime } = require('../log');
const { versionWithCommit } = require('../version');

// Also serves /version: the banner already carries the version
async function cmdUptime({ msg }) {
    const connected = stateAlt.authenticatedAt ? getBotUptime(stateAlt.authenticatedAt) : t('uptime.notConnected');

    await msg.reply(
        t('uptime.text', { version: versionWithCommit(), online: getBotUptime(BOT_START_TIME), connected: connected })
    );
}

module.exports = {
    cmdUptime
};
