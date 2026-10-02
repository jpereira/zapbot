/*
 * Comando /bot.
 */

const { getCommandSyntax } = require('./base');
const { showItems, peopleChangeList } = require('./set');
const { getSetting, setSetting } = require('../settings');
const { infoText } = require('../system');
const { scheduleStatusDaily, turnOffStatusDaily, statusText } = require('../status');
const { fmtWhen, readHour } = require('../util/when');

/*
 * /bot: bot state (settings 'bot.paused', 'bot.admins' and 'bot.users', survive restarts)
 * /bot        → shows the state, with the admins and the users
 *   /bot -on    → ativa
 * /bot -off   → turns off: ALL commands are ignored, including yours, except /bot
 * /bot +admin → only the owner (and bot.admins) uses commands: bot.users = false (the list goes away)
 * /bot -admin → everyone uses the common commands: bot.users = true
 * Options combine: /bot -on +admin. Deleted-message recovery and /watch keep working.
 * The parser only recognizes options with '-', so '+admin' arrives in opts.argv.
 *
 * The IRC shortcuts (o: operator, commands; v: voice, only speaks), owner only, one at a time:
 *   /bot +o <pessoa...>        → /set -append bot.admins <pessoa...>
 *   /bot -o <pessoa...>        → /set -rem bot.admins <pessoa...>
 *   /bot +v <pessoa|grupo...>  → /set -append bot.users <pessoa|grupo...>
 *   /bot -v <pessoa|grupo...>  → /set -rem bot.users <pessoa|grupo...>
 * The person is /Name/, "Name", @mention or +number, as in -to.
 *
 * And the bot report (src/status.js) and the versions (src/system.js), which do not
 * combine with the others:
 * /bot -status (-s)   → the report now (last 24 h) and, at the end, the daily send
 * /bot -s 06h         → every day at 06:00 (Brasília), in your private chat ("6h", "06:00", "às 6h30"...)
 * /bot -s off         → turns off the daily send
 * /bot -info (-i)     → versions (Node.js, whatsapp-web.js, Chromium, yt-dlp, ffmpeg...) and the system
 */
// Who uses the commands, by bot.users
function whoUses() {
    const users = getSetting('bot.users');
    const admins = getSetting('bot.admins').length ? ' e os admins' : '';
    if (users.includes('all')) return '🔓 *Comandos:* todos usam os comuns';
    if (!users.length) return `🔒 *Comandos:* só o dono${admins}`;
    return `👥 *Comandos:* o dono${admins} e os usuários abaixo`;
}

// A people list with names, one per line (empty: nothing)
async function listLines(title, key) {
    const items = getSetting(key).filter(i => i !== 'all');
    if (!items.length) return '';
    const linesAlt = (await showItems(key, items)).map(i => `• ${i}`);
    return `\n\n${title} _(${key})_\n${linesAlt.join('\n')}`;
}

async function stateBot() {
    return (getSetting('bot.paused')
        ? '⏸️ *Bot:* desligado (todos os comandos são ignorados)'
        : '▶️ *Bot:* ativo') + '\n' +
        whoUses() +
        await listLines('👑 *Admins*', 'bot.admins') +
        await listLines('🗣️ *Usuários*', 'bot.users');
}

// +o/-o (bot.admins) e +v/-v (bot.users)
const SHORTCUT = /^([+-])([ov])(?:\s+([\s\S]*))?$/;
const SHORTCUT_LIST = { o: 'bot.admins', v: 'bot.users' };

async function handleShortcut(msg, [, signalAlt, letter, textAlt]) {
    const key = SHORTCUT_LIST[letter];

    // Owner only, as in /set: an extra admin promotes nobody (not even themselves)
    if (!msg.fromMe) {
        await msg.reply(`⛔ Só o dono do bot altera o *${key}*.`);
        return;
    }
    if (!textAlt?.trim()) {
        const who = letter === 'o' ? '<pessoa...>' : '<pessoa|grupo...>';
        await msg.reply(`❌ Informe quem: /bot ${signalAlt}${letter} ${who}` +
            ' (/Nome/, @menção ou +número)');
        return;
    }

    await peopleChangeList(msg, key, textAlt.trim(), signalAlt === '+');
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

async function cmdBot({ msg, opts, args }) {
    const shortcut = String(args ?? '').trim().match(SHORTCUT);
    if (shortcut) {
        await handleShortcut(msg, shortcut);
        return;
    }

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
        await msg.reply('❌ Uso: /bot [-on|-off] [+admin|-admin]  ou  /bot +o|-o|+v|-v <pessoa...>  ou  /bot -status [<hora>|off]  ou  /bot -info\n' +
            '💡 _/bot -h para ajuda_');
        return;
    }

    if (on || off) await setSetting('bot.paused', off);
    // +admin: only the owner and the admins (the bot.users list goes away); -admin: everyone
    if (adminOn || adminOff) await setSetting('bot.users', adminOn ? [] : ['all']);

    await msg.reply(await stateBot());
}

module.exports = {
    cmdBot
};
