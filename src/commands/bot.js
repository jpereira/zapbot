/*
 * Comando /bot.
 */

const { getCommandSyntax } = require('./base');
const { getSetting, setSetting } = require('../settings');
const { infoText } = require('../system');
const { scheduleStatusDaily, turnOffStatusDaily, statusText } = require('../status');
const { fmtWhen, readHour } = require('../util/when');

/*
 * /bot: bot state (settings 'bot.paused' and 'bot.adminMode', survive restarts)
 *   /bot        → mostra o estado
 *   /bot -on    → ativa
 * /bot -off   → turns off: ALL commands are ignored, including yours, except /bot
 * /bot +admin → admin mode: only the owner uses commands (other people's are silently ignored)
 * /bot -admin → turns admin mode off (each command goes back to following its own onlyAdmin)
 * Options combine: /bot -on +admin. Deleted-message recovery and /watch keep working.
 * The parser only recognizes options with '-', so '+admin' arrives in opts.argv.
 *
 * And the bot report (src/status.js) and the versions (src/system.js), which do not
 * combine with the others:
 * /bot -status (-s)   → the report now (last 24 h) and, at the end, the daily send
 * /bot -s 06h         → every day at 06:00 (Brasília), in your private chat ("6h", "06:00", "às 6h30"...)
 * /bot -s off         → turns off the daily send
 * /bot -info (-i)     → versions (Node.js, whatsapp-web.js, Chromium, yt-dlp, ffmpeg...) and the system
 */
function stateBot() {
    return (getSetting('bot.paused')
        ? '⏸️ *Bot:* desligado (todos os comandos são ignorados)'
        : '▶️ *Bot:* ativo') + '\n' +
        (getSetting('bot.adminMode')
            ? `🔒 *Modo admin:* ligado (só o dono${getSetting('bot.admins').length ? ' e os admins do bot.admins usam' : ' usa'} comandos)`
            : '🔓 *Modo admin:* desligado');
}

async function handleStatus(msg, values) {
    if (!values.length) {
        await msg.reply(await statusText());
        return;
    }

    if (values.length === 1 && values[0].toLowerCase() === 'off') {
        await msg.reply(await turnOffStatusDaily()
            ? '🔕 Status diário desligado.'
            : 'ℹ️ O status diário já estava desligado.');
        return;
    }

    // "at 6h" or "6h": the time of the daily send
    const hour = readHour(values.filter(e => !/^[àa]s$/i.test(e)).join(''));
    if (!hour || values.length > 2) {
        await msg.reply('❌ Não entendi a hora. Use 06h, 6h30, 06:00 ou às 18h (ou off para desligar).\n\n```' + getCommandSyntax('/bot') + '```');
        return;
    }

    const next = await scheduleStatusDaily(hour);
    const two = (n) => String(n).padStart(2, '0');
    await msg.reply(`⏰ *Status diário:* todo dia às *${two(hour.h)}:${two(hour.m)}*, no seu privado.\n📅 Próximo: ${fmtWhen(next)}`);
}

async function cmdBot({ msg, opts }) {
    const { on, off, admin: adminOff } = opts.opt;
    const adminOn = opts.argv.includes('+admin');
    const other = on || off || adminOn || adminOff;

    // -info: versions and system
    if (opts.given.has('info')) {
        if (other || opts.given.has('status') || opts.argv.length) {
            await msg.reply('❌ O -info não combina com as outras opções.\n💡 _/bot -info_');
            return;
        }
        await msg.reply(await infoText());
        return;
    }

    // -status [<time>|off]: the parser takes one value; "às 18h" leaves the rest in argv
    if (opts.given.has('status')) {
        if (other) {
            await msg.reply('❌ O -status não combina com as outras opções.\n💡 _/bot -status [<hora>|off]_');
            return;
        }
        await handleStatus(msg, [opts.opt.status, ...opts.argv].filter(Boolean));
        return;
    }

    const unknown = opts.argv.filter(a => a !== '+admin');

    if (unknown.length || (on && off) || (adminOn && adminOff)) {
        await msg.reply('❌ Uso: /bot [-on|-off] [+admin|-admin]  ou  /bot -status [<hora>|off]  ou  /bot -info\n💡 _/bot -h para ajuda_');
        return;
    }

    if (on || off) await setSetting('bot.paused', off);
    if (adminOn || adminOff) await setSetting('bot.adminMode', adminOn);

    await msg.reply(stateBot());
}

module.exports = {
    cmdBot
};
