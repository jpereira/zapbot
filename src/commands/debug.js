/*
 * Comando /debug.
 */

const { isDebugMode, setSetting } = require('../settings');

async function cmdDebug({ msg, opts }) {
    // Persisted in the 'debug.enabled' setting: survives restarts
    if (opts.opt.on) await setSetting('debug.enabled', true);
    if (opts.opt.off) await setSetting('debug.enabled', false);

    await msg.reply(isDebugMode() ? '🪲 Debug Ativado.' : '🪲 Debug Desativado.');
}

module.exports = {
    cmdDebug
};
