/*
 * Comando /bot.
 */

const { getSetting, setSetting } = require('../settings');

/*
 * /bot: bot state (settings 'bot.paused' and 'bot.adminMode', survive restarts)
 *   /bot        → mostra o estado
 *   /bot -on    → ativa
 * /bot -off   → turns off: ALL commands are ignored, including yours, except /bot
 * /bot +admin → admin mode: only the owner uses commands (other people's are silently ignored)
 * /bot -admin → turns admin mode off (each command goes back to following its own onlyAdmin)
 * Options combine: /bot -on +admin. Deleted-message recovery and /watch keep working.
 * The parser only recognizes options with '-', so '+admin' arrives in opts.argv.
 */
function stateBot() {
    return (getSetting('bot.paused')
        ? '⏸️ *Bot:* desligado (todos os comandos são ignorados)'
        : '▶️ *Bot:* ativo') + '\n' +
        (getSetting('bot.adminMode')
            ? '🔒 *Modo admin:* ligado (só o dono usa comandos)'
            : '🔓 *Modo admin:* desligado');
}

async function cmdBot({ msg, opts }) {
    const { on, off, admin: adminOff } = opts.opt;
    const adminOn = opts.argv.includes('+admin');
    const unknown = opts.argv.filter(a => a !== '+admin');

    if (unknown.length || (on && off) || (adminOn && adminOff)) {
        await msg.reply('❌ Uso: /bot [-on|-off] [+admin|-admin]\n💡 _/bot -h para ajuda_');
        return;
    }

    if (on || off) await setSetting('bot.paused', off);
    if (adminOn || adminOff) await setSetting('bot.adminMode', adminOn);

    await msg.reply(stateBot());
}

module.exports = {
    cmdBot
};
