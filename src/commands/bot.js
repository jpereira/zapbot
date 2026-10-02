/*
 * Comando /bot.
 */

const { getCommandSyntax } = require('./base');
const { isOOwner, peopleChangeList } = require('./set');
const { client } = require('../client');
const { chatCurrentIds, resolveLidToPhone, groupResolverName } = require('../contacts');
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
 * Each one's role, by the highest: 🤖 the owner (the bot account, which already uses
 * everything), 👑 admin (bot.admins) or 🗣️ user (bot.users).
 */
const ROLES = { dono: '🤖', admin: '👑', usuario: '🗣️', nenhum: '🚫' };
function role(item) {
    if (isOOwner(item)) return ROLES.dono;
    if (getSetting('bot.admins').includes(item)) return ROLES.admin;
    return ROLES.usuario;
}

// The phones of whoever is in the group (the LID becomes the phone)
async function groupMembers(chatId) {
    const chat = await client.getChatById(chatId).catch(() => null);
    const members = new Set();
    for (const p of chat?.participants ?? []) {
        const id = p.id?._serialized ?? '';
        const phoneAlt = id.endsWith('@lid') ? await resolveLidToPhone(id) : id;
        if (phoneAlt) members.add(phoneAlt.split('@')[0]);
    }
    return members;
}

/*
 * Who the list shows, by the chat where the command was typed:
 * - in your private chat (or with -all-users): everyone;
 * - in a group: who participates in it and the group itself;
 * - in someone's private chat: only that person.
 * members: in a group, the phones of whoever is in it; that of whoever is not leaves
 * hidden (with -au, everyone shows up, but without giving away the number of
 * nobody to the group). Outside a group, null: nothing is hidden.
 */
async function chatScope({ chatId, isGroup, todos: allAlt2 = false } = {}) {
    if (isGroup) {
        const members = await groupMembers(chatId);
        const group = (i) => i === chatId || members.has(i);
        return { membros: members, mostra: allAlt2 ? null : group, onde: 'deste grupo' };
    }

    const ids = chatId ? await chatCurrentIds(chatId) : [];
    if (allAlt2 || !chatId || ids.includes(client.info.wid._serialized)) {
        return { membros: null, mostra: null };
    }

    const phoneAlt = ids.find(i => i.endsWith('@c.us'))?.split('@')[0];
    return { membros: null, mostra: i => i === phoneAlt, onde: 'deste chat' };
}

// 5521999982222 → 5521•••••2222 (the country code and area code stay, and the last 4)
const mask = (n) => `${n.slice(0, 4)}${'•'.repeat(Math.max(1, n.length - 8))}${n.slice(-4)}`;
const numberVisible = (n, members) => (members && !members.has(n) ? mask(n) : n);

// An item's name: the group's, the contact's or, for you, your profile's
async function itemName(item) {
    if (item.endsWith('@g.us')) return groupResolverName(item).catch(() => null);

    // You are rarely in your own address book: your profile name counts
    const contactAlt = await client.getContactById(`${item}@c.us`).catch(() => null);
    return contactAlt?.name || contactAlt?.pushname || (isOOwner(item) ? client.info.pushname : null);
}

/*
 * An item as the rest of the bot shows a destination: "👤 Camila Gama · +5521988887777",
 * "👤 +5521977777777" (no name) or "👥 Grupo Familia".
 */
async function describeItem(item, members) {
    const nameAlt = await itemName(item);
    if (item.endsWith('@g.us')) {
        return describeDestination({ id: item, nome: nameAlt || item, grupo: true });
    }

    const numberAlt = `+${numberVisible(item, members)}`;
    return nameAlt ? `${describeDestination({ nome: nameAlt, grupo: false })} · ${numberAlt}` : `👤 ${numberAlt}`;
}

// In the "already has"/"does not have" and in the line of what changed: "5521999982222 (Camila Gama)" or "👥 Família"
async function itemShort(item, members) {
    const nameAlt = await itemName(item);
    if (item.endsWith('@g.us')) return `👥 ${nameAlt || item}`;
    const numberAlt = numberVisible(item, members);
    return nameAlt ? `${numberAlt} (${nameAlt})` : numberAlt;
}

/*
 * Admins (+o) and users (+v) in a single list: whoever is in both appears once
 * time, with both marks. First the admins, in each setting's order.
 */
async function whoUsesList({ membros: members, mostra: show, onde: whereAlt }) {
    const admins = getSetting('bot.admins');
    const users = getSetting('bot.users').filter(i => i !== 'all');
    const allAlt2 = [...new Set([...admins, ...users])];
    if (!allAlt2.length) return '';

    // Only this chat's: how many were left out, and how to see everyone
    const items = show ? allAlt2.filter(show) : allAlt2;
    const outside = allAlt2.length - items.length;
    const tip = outside ? `\n💡 _Só quem é ${whereAlt}; mais ${outside} fora daqui. Todos: /bot -au_` : '';
    if (!items.length) return `*Quem usa* (0)\n_Ninguém ${whereAlt}._${tip}`;

    const linesAlt = await Promise.all(items.map(async (item) => {
        const marks = [
            isOOwner(item) && `${ROLES.dono} dono`,
            admins.includes(item) && `${ROLES.admin} +o`,
            users.includes(item) && `${ROLES.usuario} +v`
        ].filter(Boolean);
        return `• ${marks.join(' ')} · ${await describeItem(item, members)}`;
    }));

    return `*Quem usa* (${items.length})\n${linesAlt.join('\n')}\n` + captionAlt({ dono: items.some(isOOwner) }) + tip;
}

// The list captions (the owner's, with only you in it; the no-permission one, the /whois one)
function captionAlt({ dono: owner = false, semPermissao: withoutPermission = false } = {}) {
    return (owner ? `💡 _${ROLES.dono} dono: você, que já usa tudo_\n` : '') +
        `💡 _${ROLES.admin} +o: admin, usa tudo (bot.admins) · ` +
        `${ROLES.usuario} +v: usuário, usa os comandos comuns (bot.users)_` +
        (withoutPermission ? `\n💡 _${ROLES.nenhum} sem permissão: o bot ignora os comandos dela_` : '');
}

async function stateBot(chat) {
    const list = await whoUsesList(await chatScope(chat));
    return (getSetting('bot.paused')
        ? '⏸️ *Bot:* desligado (todos os comandos são ignorados)'
        : '▶️ *Bot:* ativo') + '\n' +
        whoUses() +
        (list ? `\n\n${list}` : '');
}

/*
 * The reply of +o|-o|+v|-v: what changed, one line per item, and the same list
 * of /bot (with nobody in it, the line of who uses the commands).
 */
function shortcutReply(key, append, chat) {
    return async (change, valueAlt) => {
        const scope = await chatScope(chat);
        const changed = await Promise.all(change.map(async i => (append
            ? `✅ *${key}* + ${await itemShort(i, scope.membros)} ${role(i)}`
            : `🗑️ *${key}* − ${await itemShort(i, scope.membros)}`)));
        const list = await whoUsesList(scope);
        return `${changed.join('\n')}\n\n${list || whoUses()}`;
    };
}

// The reply and the way of showing the items (in the "already has"/"does not have") of +o|-o|+v|-v
const asReply = (key, append, chat) => ({
    resposta: shortcutReply(key, append, chat),
    mostrar: async (items) => {
        const { membros: members } = await chatScope(chat);
        return Promise.all(items.map(i => itemShort(i, members)));
    }
});

// +o/-o (bot.admins) e +v/-v (bot.users)
const SHORTCUT = /^([+-])([ov])(?:\s+([\s\S]*))?$/;
const SHORTCUT_LIST = { o: 'bot.admins', v: 'bot.users' };

/*
 * Nobody, the chat where the command was typed: in a group, the group; in the
 * someone's private chat, the person (by phone). In your private chat, there is no one.
 */
async function shortcutInChat(msg, key, append, chat) {
    const { chatId, isGroup } = chat;
    if (isGroup) {
        if (key === 'bot.admins') {
            await msg.reply('❌ Um grupo não pode ser admin (todos ali mandariam no bot).\n' +
                '💡 _Para liberar os comandos comuns neste grupo: /bot +v_');
            return;
        }
        await peopleChangeList(msg, key, chatId, append,
            { itensProntos: true, ...asReply(key, append, chat) });
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
    await peopleChangeList(msg, key, numberAlt, append,
        { itensProntos: true, ...asReply(key, append, chat) });
}

async function handleShortcut(msg, [, signalAlt, letter, textWithOptions], chatCurrent) {
    const key = SHORTCUT_LIST[letter];

    // -au (-all-users) together: the reply list shows everyone
    const ALL = /(^|\s)-(au|all-users)(?=\s|$)/;
    const chat = { ...chatCurrent, todos: ALL.test(textWithOptions ?? '') };
    const textAlt = (textWithOptions ?? '').replace(ALL, ' ').trim();

    // Owner only, as in /set: an extra admin promotes nobody (not even themselves)
    if (!msg.fromMe) {
        await msg.reply(`⛔ Só o dono do bot altera o *${key}*.`);
        return;
    }
    if (!textAlt?.trim()) {
        await shortcutInChat(msg, key, signalAlt === '+', chat);
        return;
    }

    const append = signalAlt === '+';
    await peopleChangeList(msg, key, textAlt.trim(), append, asReply(key, append, chat));
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

async function reset(msg, chat) {
    if (!msg.fromMe) {
        await msg.reply('⛔ Só o dono do bot volta o /bot ao padrão.');
        return;
    }

    for (const key of DO_RESET) await setSetting(key, SETTINGS_SCHEMA[key].default);
    await msg.reply('♻️ *Padrão restaurado:* bot ligado, sem admins extras e sem usuários.\n\n' +
        await stateBot(chat));
}

async function cmdBot({ msg, opts, args, chatId, isGroup }) {
    const shortcut = String(args ?? '').trim().match(SHORTCUT);
    if (shortcut) {
        await handleShortcut(msg, shortcut, { chatId, isGroup });
        return;
    }

    const { on, off, admin: adminOff } = opts.opt;
    const allAlt2 = opts.given.has('all-users');
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
        await reset(msg, { chatId, isGroup });
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
        await msg.reply('❌ Uso: /bot [-on|-off] [+admin|-admin] [-au]  ou  /bot +o|-o|+v|-v [pessoa...] [-au]  ou  /bot -reset  ou  /bot -status [<hora>|off]  ou  /bot -info\n' +
            '💡 _/bot -h para ajuda_');
        return;
    }

    if (on || off) await setSetting('bot.paused', off);
    // +admin: only the owner and the admins (the bot.users list goes away); -admin: everyone
    if (adminOn || adminOff) await setSetting('bot.users', adminOn ? [] : ['all']);

    await msg.reply(await stateBot({ chatId, isGroup, todos: allAlt2 }));
}

module.exports = {
    ROLES,
    cmdBot,
    describeItem,
    chatScope,
    captionAlt
};
