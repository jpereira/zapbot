/*
 * Comando /bot.
 */

const { getCommandSyntax } = require('./base');
const { peopleChangeList } = require('./set');
const { client } = require('../client');
const { chatCurrentIds, groupResolverName } = require('../contacts');
const { describeDestination } = require('../destinations');
const { SETTINGS_SCHEMA, getSetting, setSetting } = require('../settings');
const { infoText } = require('../system');
const { scheduleStatusDaily, turnOffStatusDaily, statusText } = require('../status');
const { fmtWhen, readHour } = require('../util/when');

/*
 * /bot: bot state (settings 'bot.paused', 'bot.admins' and 'bot.users', survive restarts)
 * /bot        → shows the state and who uses it: admins (+o) and users (+v) in a single list
 *   /bot -on    → ativa
 * /bot -off   → turns off: ALL commands are ignored, including yours, except /bot
 * /bot +admin → only the owner (and bot.admins) uses commands: bot.users = false (the list goes away)
 * /bot -admin → everyone uses the common commands: bot.users = true (/bot shows a warning)
 * /bot -reset → back to default: on, no extra admins and no users (owner only)
 * Options combine: /bot -on +admin. Deleted-message recovery and /watch keep working.
 * The parser only recognizes options with '-', so '+admin' arrives in opts.argv.
 *
 * The IRC shortcuts (o: operator, commands; v: voice, only speaks), owner only, one at a time:
 * /bot +o|-o <person...>        → adds and removes admins (bot.admins)
 * /bot +v|-v <person|group...>  → adds and removes users (bot.users)
 * The person is /Name/, "Name", @mention or +number, as in -to. With nobody, the
 * the current chat: in a group, the group (which does not become admin); in someone's private chat, the person.
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
    if (users.includes('all')) {
        return '🔓 *Comandos:* todos usam os comuns\n' +
            '⚠️ _Atenção: qualquer pessoa pode executar os comandos comuns do bot, em qualquer chat. ' +
            'Para restringir: /bot +admin (e depois /bot +v para liberar alguns)._';
    }
    if (!users.length) return `🔒 *Comandos:* só o dono${admins}`;
    return '👥 *Comandos:* o dono e quem está na lista abaixo';
}

/*
 * A bot.admins/bot.users item as the rest of the bot shows a destination:
 * "👤 Camila Gama · +5521988887777", "👤 +5521977777777" (no name) or
 * "👥 Grupo Familia".
 */
async function describeItem(item) {
    if (item.endsWith('@g.us')) {
        const nameAlt = await groupResolverName(item).catch(() => null);
        return describeDestination({ id: item, nome: nameAlt || item, grupo: true });
    }

    const contactAlt = await client.getContactById(`${item}@c.us`).catch(() => null);
    const nameAlt = contactAlt?.name || contactAlt?.pushname;
    return nameAlt ? `${describeDestination({ nome: nameAlt, grupo: false })} · +${item}` : `👤 +${item}`;
}

/*
 * Admins (+o) and users (+v) in a single list: whoever is in both appears once
 * time, with both marks. First the admins, in each setting's order.
 */
async function whoUsesList() {
    const admins = getSetting('bot.admins');
    const users = getSetting('bot.users').filter(i => i !== 'all');
    const items = [...new Set([...admins, ...users])];
    if (!items.length) return '';

    const linesAlt = await Promise.all(items.map(async (item) => {
        const marks = [admins.includes(item) && '👑 +o', users.includes(item) && '🗣️ +v']
            .filter(Boolean);
        return `• ${marks.join(' ')} · ${await describeItem(item)}`;
    }));

    return `\n\n*Quem usa* (${items.length})\n${linesAlt.join('\n')}\n` +
        '💡 _👑 +o: admin, usa tudo (bot.admins) · 🗣️ +v: usuário, usa os comandos comuns (bot.users)_';
}

async function stateBot() {
    return (getSetting('bot.paused')
        ? '⏸️ *Bot:* desligado (todos os comandos são ignorados)'
        : '▶️ *Bot:* ativo') + '\n' +
        whoUses() +
        await whoUsesList();
}

// +o/-o (bot.admins) e +v/-v (bot.users)
const SHORTCUT = /^([+-])([ov])(?:\s+([\s\S]*))?$/;
const SHORTCUT_LIST = { o: 'bot.admins', v: 'bot.users' };

/*
 * Nobody, the chat where the command was typed: in a group, the group; in the
 * someone's private chat, the person (by phone). In your private chat, there is no one.
 */
async function shortcutInChat(msg, key, append, { chatId, isGroup }) {
    if (isGroup) {
        if (key === 'bot.admins') {
            await msg.reply('❌ Um grupo não pode ser admin (todos ali mandariam no bot).\n' +
                '💡 _Para liberar os comandos comuns neste grupo: /bot +v_');
            return;
        }
        await peopleChangeList(msg, key, chatId, append, { itensProntos: true });
        return;
    }

    const ids = await chatCurrentIds(chatId);
    if (ids.includes(client.info.wid._serialized)) {
        await msg.reply('❌ Este é o seu privado: você (o dono) já usa tudo.\n' +
            '💡 _Use num grupo ou no privado de alguém, ou informe quem: /bot +v /Nome/_');
        return;
    }

    const phoneAlt = ids.find(i => i.endsWith('@c.us'));
    if (!phoneAlt) {
        await msg.reply('❌ Não sei o telefone desta pessoa (o WhatsApp só informou o id interno): use o número, ex.: /bot +v +5521999999999.');
        return;
    }
    const numberAlt = phoneAlt.split('@')[0];
    await peopleChangeList(msg, key, numberAlt, append, { itensProntos: true });
}

async function handleShortcut(msg, [, signalAlt, letter, textAlt], chat) {
    const key = SHORTCUT_LIST[letter];

    // Owner only, as in /set: an extra admin promotes nobody (not even themselves)
    if (!msg.fromMe) {
        await msg.reply(`⛔ Só o dono do bot altera o *${key}*.`);
        return;
    }
    if (!textAlt?.trim()) {
        await shortcutInChat(msg, key, signalAlt === '+', chat);
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

// What -reset puts back to default (the daily send of -status stays)
const DO_RESET = ['bot.paused', 'bot.admins', 'bot.users'];

async function reset(msg) {
    if (!msg.fromMe) {
        await msg.reply('⛔ Só o dono do bot volta o /bot ao padrão.');
        return;
    }

    for (const key of DO_RESET) await setSetting(key, SETTINGS_SCHEMA[key].default);
    await msg.reply('♻️ *Padrão restaurado:* bot ligado, sem admins extras e sem usuários.\n\n' +
        await stateBot());
}

async function cmdBot({ msg, opts, args, chatId, isGroup }) {
    const shortcut = String(args ?? '').trim().match(SHORTCUT);
    if (shortcut) {
        await handleShortcut(msg, shortcut, { chatId, isGroup });
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

    // -reset: alone, like -info
    if (opts.given.has('reset')) {
        if (other || opts.given.has('status') || opts.argv.length) {
            await msg.reply('❌ O -reset não combina com as outras opções.\n💡 _/bot -reset_');
            return;
        }
        await reset(msg);
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
        await msg.reply('❌ Uso: /bot [-on|-off] [+admin|-admin]  ou  /bot +o|-o|+v|-v [pessoa...]  ou  /bot -reset  ou  /bot -status [<hora>|off]  ou  /bot -info\n' +
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
