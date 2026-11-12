/*
 * Comando /bot.
 */

const { findCommand, getCommandSyntax } = require('./base');
const { isOOwner, peopleItems } = require('./set');
const { client, completeNotice } = require('../client');
const { chatCurrentIds, contactName, resolveLidToPhone, groupResolverName } = require('../contacts');
const {
    describeDestination, describeDestinations, sendToDestinations, extractDestinations, resolverDestinations
} = require('../destinations');
const { waitConfirmation, authorAlt } = require('../choices');
const { GetOptFromCommand } = require('../options');
const { boxes } = require('../imap');
const { printInfo } = require('../log');
const { delegavel, describeRule, recordRule, regraDe } = require('../permissions');
const {
    SETTINGS_SCHEMA, userCommand, getSetting, setSetting, validateSetting
} = require('../settings');
const { definePassword } = require('../login');
const { testText } = require('../diagnostics');
const { infoText } = require('../system');
const {
    schedulingDaily, scheduleStatusDaily, turnOffStatusDaily, statusDestinations, whereGoes,
    statusText
} = require('../status');
const { fmtWhen, readHour } = require('../util/when');
const { maskPhones, removeOptionMask } = require('../util/phone');
const { contextDebug } = require('../debugContext');
const { t } = require('../i18n');

/*
 * /bot: the bot and who uses it (settings 'bot.paused', 'bot.admins' and 'bot.users')
 * /bot           → the status (the same as -status): the state, the 24 h report and who uses it
 * /bot -on|-off  → turns on and off: when off, ALL commands are ignored, except /bot
 * (the admin and user lists stay as they are)
 * /bot -list-users → the users of this chat (in a group, those from there; in your private chat, all)
 * /bot -list-users all → all users, in any chat (in a group, with the outside phones
 *                     escondidos)
 * /bot -passwd <password|off> → (owner) sets the login password (only the hash stays in the database)
 * /bot -login <password>      → whoever is an outsider, in private, becomes admin; the owner is notified (WhatsApp and email)
 * /bot -reset    → removes all users and their limits (the admins and the on/off stay)
 * /bot -reset force → puts everything back to default: also removes the extra admins and turns the bot on
 * Deleted-message recovery, /watch and the alerts keep working with it off.
 *
 * The IRC shortcuts (o: operator, commands; v: voice, only speaks), owner only, one at a time:
 *   /bot +a|-a <pessoa...>        → adiciona e tira admins (bot.admins)
 * /bot +u|-u <person|group...>  → adds and removes users (bot.users)
 * The person is /Name/, "Name", @mention or +number, as in -to. With nobody, the
 * the current chat: in a group, the group (which does not become admin); in someone's private chat, the person.
 * A person's +u typed in a group applies only in that group.
 *
 * The report (src/status.js) accepts -to and -mask; the versions (src/system.js), -mask:
 * /bot -status (-s)         → the report now (the same as /bot with no option)
 * /bot -s 06h [-to <dest>]  → every day at 06:00 (Brasília), in your private chat or in the -to
 * /bot -s -to <dest>        → the report now, to the -to (people, groups, emails)
 * /bot -s off               → turns off the daily send
 * /bot -info (-i)           → versions (Node.js, whatsapp-web.js, Chromium...) and the system
 */
// Who uses the commands, by bot.users
function whoUses() {
    const users = getSetting('bot.users');
    const admins = getSetting('bot.admins').length ? t('adm.bot.andAdmins') : '';
    if (users.includes('all')) return t('adm.bot.everyone');
    if (!users.length) return t('adm.bot.ownerOnly', { admins });
    return t('adm.bot.ownerAndList');
}

// The marks of each role
const ROLES = { dono: '🤖', admin: '👑', usuario: '🗣️', nenhum: '🚫' };

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
 * A list item: the person (the phone), the group (the @g.us id) or the person
 * only in a group ("phone:group", /bot +u typed in the group).
 */
function readItem(item) {
    const [numberAlt, soIn = null] = item.split(':');
    return { numero: numberAlt, soEm: soIn, ehGrupo: !soIn && item.endsWith('@g.us') };
}

/*
 * Who the list shows, by the chat where the command was typed:
 * - in your private chat (or with -list-users all): everyone;
 * - in a group: who participates in it, the group itself and whoever only has permission in it;
 * - in someone's private chat: only that person.
 * members: in a group, the phones of whoever is in it; that of whoever is not leaves
 * hidden (with -list-users all, everyone shows up, but without giving away the number
 * from nobody to the group). Outside a group, null: nothing is hidden.
 */
async function chatScope({ chatId, isGroup, todos: allAlt2 = false } = {}) {
    if (isGroup) {
        const members = await groupMembers(chatId);
        const group = (item) => {
            const { numero: numberAlt, soEm: soIn, ehGrupo: isGroupAlt } = readItem(item);
            if (isGroupAlt) return item === chatId;
            return soIn ? soIn === chatId : members.has(numberAlt);
        };
        const show = allAlt2 ? null : group;
        return { chatId, membros: members, mostra: show, onde: t('adm.bot.whereGroup'), aqui: t('adm.bot.hereGroup') };
    }

    const ids = chatId ? await chatCurrentIds(chatId) : [];
    if (allAlt2 || !chatId || ids.includes(client.info.wid._serialized)) {
        return { chatId, membros: null, mostra: null };
    }

    const phoneAlt = ids.find(i => i.endsWith('@c.us'))?.split('@')[0];
    const personAlt = (item) => readItem(item).numero === phoneAlt;
    return { chatId, membros: null, mostra: personAlt, onde: t('adm.bot.whereChat'), aqui: t('adm.bot.hereChat') };
}

// 5521999982222 → 5521•••••2222 (the country code and area code stay, and the last 4)
const mask = (n) => `${n.slice(0, 4)}${'•'.repeat(Math.max(1, n.length - 8))}${n.slice(-4)}`;
const numberVisible = (n, members) => contextDebug().maskTelefones ? maskPhones(n)
    : members && !members.has(n) ? mask(n) : n;

// A phone's or group's name: the group's, the contact's or, for you, your profile's
async function itemName(item) {
    if (item.endsWith('@g.us')) return groupResolverName(item).catch(() => null);

    // You are rarely in your own address book: your profile name counts
    const contactAlt = await client.getContactById(`${item}@c.us`).catch(() => null);
    return contactName(contactAlt) || (isOOwner(item) ? client.info.pushname : null);
}

// " · only in this group" or " · only in 👥 Amigos Faculdade" (the person is in a single group)
async function soInText(soIn, scope) {
    if (!soIn) return '';
    if (soIn === scope?.chatId) return t('adm.bot.onlyInGroup');
    return t('adm.bot.onlyInNamed', { nome: await itemName(soIn) || soIn });
}

/*
 * An item as the rest of the bot shows a destination: "👤 Maria Lucia · +5521988887777",
 * "👤 +5521977777777" (no name) or "👥 Grupo Familia"; the person in a single group,
 * with the group at the end.
 */
async function describeItem(item, scope) {
    const { numero: numberAlt, soEm: soIn, ehGrupo: isGroupAlt } = readItem(item);
    const nameAlt = await itemName(numberAlt);
    if (isGroupAlt) return describeDestination({ id: item, nome: nameAlt || item, grupo: true });

    const phone = `+${numberVisible(numberAlt, scope?.membros)}`;
    const person = nameAlt ? `${describeDestination({ nome: nameAlt, grupo: false })} · ${phone}` : `👤 ${phone}`;
    return person + await soInText(soIn, scope);
}

/*
 * Each one's role, by the highest: 🤖 the owner (the bot account, which already uses
 * everything), 👑 admin or 🗣️ user.
 */
function marks(item, admins, users) {
    const { numero: numberAlt, soEm: soIn } = readItem(item);
    if (soIn) return [`${ROLES.usuario} +u`];
    return [
        isOOwner(numberAlt) && `${ROLES.dono} ${t('adm.bot.markOwner')}`,
        admins.includes(item) && `${ROLES.admin} +a`,
        users.includes(item) && `${ROLES.usuario} +u`
    ].filter(Boolean);
}

/*
 * Admins (+a) and users (+u) in a single list: whoever is in both appears once
 * time, with both marks. First the admins, in each setting's order.
 * new ones: those who just joined (with ✅). tip: 'todos' (the -list-users all, with
 * the care not to expose outsiders) or 'usuarios' (the -list-users, in the reply
 * do +a/+u).
 */
async function usersList(scope, { novos: freshAlt3 = [], dica: tip = 'todos' } = {}) {
    const admins = getSetting('bot.admins');
    const users = getSetting('bot.users').filter(i => i !== 'all');
    const allAlt2 = [...new Set([...admins, ...users])];
    if (!allAlt2.length) return '';

    // Only this chat's: how many were left out, and how to see everyone
    const { mostra: show, onde: whereAlt, aqui: here } = scope;
    const items = show ? allAlt2.filter(show) : allAlt2;
    const outside = allAlt2.length - items.length;
    const asSee = tip === 'todos' ? t('adm.bot.seeAllHint', { onde: whereAlt }) : t('adm.bot.listUsersHint');
    const footer = outside ? `\n\n${t('adm.bot.footerOutside', { onde: whereAlt, fora: outside, comoVer: asSee })}` : '';
    const title = show ? t('adm.bot.usersTitleScoped', { n: items.length, aqui: here }) : t('adm.bot.usersTitle', { n: items.length });
    if (!items.length) return `${title}\n${t('adm.bot.nobody', { onde: whereAlt })}${footer}`;

    const linesAlt = await Promise.all(items.map(async (item) => {
        const freshAlt = freshAlt3.includes(item) ? ' ✅' : '';
        // The +cmd|-cmd rule below (admin uses everything: without it)
        const rule = !admins.includes(item) && regraDe(item);
        return `• ${marks(item, admins, users).join(' ')} · ${await describeItem(item, scope)}${freshAlt}` +
            (rule ? `\n → ${describeRule(rule)}` : '');
    }));

    const owner = items.some(i => !readItem(i).soEm && isOOwner(i));
    return `${title}\n${linesAlt.join('\n')}\n\n${permissions({ dono: owner })}${footer}`;
}

// What each mark means (the owner's, with only you in the list; the no-permission one, in /whois)
function permissions({ dono: owner = false, semPermissao: withoutPermission = false } = {}) {
    return `${t('adm.bot.permTitle')}\n` +
        (owner ? `${t('adm.bot.permOwner', { e: ROLES.dono })}\n` : '') +
        `${t('adm.bot.permAdmin', { e: ROLES.admin })}\n` +
        t('adm.bot.permUser', { e: ROLES.usuario }) +
        (withoutPermission ? `\n${t('adm.bot.permNone', { e: ROLES.nenhum })}` : '');
}

// On or off, and who uses the commands
const botState = () => (getSetting('bot.paused') ? t('adm.bot.paused') : t('adm.bot.active')) + '\n' + whoUses();

// The -list-users [all] list (with nobody in it, the line of who uses the commands)
async function usersText(chat) {
    return await usersList(await chatScope(chat)) || whoUses();
}

// /bot without an option and -status: the state at the top, the report, the users and the daily send
async function report(chat) {
    const usersAlt = await usersList(await chatScope(chat));
    const textAlt = await statusText(Date.now(), { estadoDoBot: botState(), usuarios: usersAlt });
    return `${textAlt}\n\n${t('adm.bot.moreInfo')}`;
}

// +a/-a (bot.admins), +u/-u (bot.users) and +cmd/-cmd (each user's commands), in any
// ordem
const SHORTCUT = /(^|\s)[+-](a|u|cmd)(?=\s|$)/;
const OPERATION = /(^|\s)([+-])([au])(?=\s|$)/;
const OPTION_CMD = /(^|\s)([+-])cmd(?:\s+((?:[^\s+,-][^\s,]*,\s*)*[^\s+,-][^\s,]*))?(?=\s|$)/;
const SHORTCUT_LIST = { a: 'bot.admins', u: 'bot.users' };

/*
 * The shortcut text: the operation (+a/-a/+u/-u), +cmd/-cmd and its commands,
 * -list-users all (the reply with everyone; without all is the normal one) and the rest (who).
 */
function readShortcut(textAlt) {
    let rest = ` ${textAlt} `;
    const remove = (re) => {
        const m = rest.match(re);
        if (m) rest = rest.slice(0, m.index) + m[1] + rest.slice(m.index + m[0].length);
        return m;
    };
    const allAlt2 = Boolean(remove(/(^|\s)-(?:list-users|lu)\s+all(?=\s|$)/));
    remove(/(^|\s)-(?:list-users|lu)(?=\s|$)/);
    const cmd = remove(OPTION_CMD);
    const op = remove(OPERATION);
    return {
        op: op ? { sinal: op[2], letra: op[3] } : null,
        cmd: cmd ? { sinal: cmd[2], texto: cmd[3] ?? '' } : null,
        todos: allAlt2,
        quem: rest.trim()
    };
}

// "/rates,/crypto meme" → ['/rates', '/crypto', '/meme']; "all" → ['all']; invalid: throws
function readCommands(textAlt) {
    const names = textAlt.split(/[\s,]+/).filter(Boolean);
    if (!names.length) throw new Error(t('adm.bot.needCommands'));
    if (names.length === 1 && /^all$/i.test(names[0])) return ['all'];
    return [...new Set(names.map(userCommand))];
}

/*
 * Nobody, the chat where the command was typed: in a group, the group; in the
 * someone's private chat, the person (by phone). In your private chat, there is no one.
 * @returns {Promise<string[]|null>} null: already replied the error
 */
async function chatItems(msg, key, { chatId, isGroup }) {
    if (isGroup) {
        if (key === 'bot.users') return [chatId];
        await msg.reply(t('adm.bot.groupNotAdmin'));
        return null;
    }

    const ids = await chatCurrentIds(chatId);
    if (ids.includes(client.info.wid._serialized)) {
        await msg.reply(t('adm.bot.ownPrivate'));
        return null;
    }

    const phoneAlt = ids.find(i => i.endsWith('@c.us'));
    if (!phoneAlt) {
        await msg.reply(t('adm.bot.noPhone'));
        return null;
    }
    return [phoneAlt.split('@')[0]];
}

/*
 * The text's items (names, mentions, numbers, groups), already validated. In a
 * group, a person's +u applies only in that group ("phone:group").
 * @returns {Promise<string[]|null>} null: already replied the error
 */
async function textItems(msg, key, textAlt, { chatId, isGroup }) {
    const raw = await peopleItems(msg, key, textAlt);
    if (raw === null) return null;

    let items;
    try {
        items = validateSetting(key, raw);
    } catch (e) {
        await msg.reply(`❌ ${e.message}`);
        return null;
    }
    if (items.includes('all')) {
        await msg.reply(t('adm.bot.needWho'));
        return null;
    }

    const soInGroup = key === 'bot.users' && isGroup;
    return items.map(i => (soInGroup && !i.endsWith('@g.us') ? `${i}:${chatId}` : i));
}

/*
 * What comes out with -u: in a group, their permission (or, without it, the general one); in the
 * private, all of the person's (the general one and each group's).
 */
function aRemove(item, current, { isGroup }) {
    const { numero: numberAlt, soEm: soIn } = readItem(item);
    if (soIn && isGroup) return current.includes(item) ? [item] : current.filter(i => i === numberAlt);
    if (readItem(item).ehGrupo) return current.filter(i => i === item);
    return current.filter(i => readItem(i).numero === numberAlt);
}

/*
 * +a|-a|+u|-u: changes the list and replies with this chat's list (those who joined,
 * with ✅; those that left, in a 🗑️ line on top). Those that entered and do not appear
 * on the list here get a ✅ line on top.
 */
async function changeList(msg, key, items, append, chat) {
    const current = getSetting(key);
    const admin = key === 'bot.admins';
    const scope = await chatScope(chat);
    const short = (list) => Promise.all(list.map(i => describeItem(i, scope)));

    if (append && current.includes('all')) {
        await msg.reply(t('adm.bot.everyoneAlready'));
        return;
    }

    let freshAlt3;
    let removed = [];
    if (append) {
        // Already has it: the item itself or, for whoever would only gain a group, the general permission
        freshAlt3 = items.filter(i => !current.includes(i) && !current.includes(readItem(i).numero));
        if (!freshAlt3.length) {
            await msg.reply(t(admin ? 'adm.bot.alreadyAdmin' : 'adm.bot.alreadyUser', { lista: (await short(items)).join(', ') }));
            return;
        }
        await setSetting(key, [...current, ...freshAlt3]);
        // Whoever joins starts with no rule (an old one, from before leaving through /set, does not come back)
        if (key === 'bot.users') for (const i of freshAlt3) await recordRule(i, null);
    } else {
        removed = [...new Set(items.flatMap(i => aRemove(i, current, chat)))];
        if (!removed.length) {
            await msg.reply(t(admin ? 'adm.bot.notAdmin' : 'adm.bot.notUser', { lista: (await short(items)).join(', ') }));
            return;
        }
        await setSetting(key, current.filter(i => !removed.includes(i)));
        if (key === 'bot.users') for (const i of removed) await recordRule(i, null);
    }
    printInfo(`/bot: ${key} ${append ? '+' : '-'} ${JSON.stringify(append ? freshAlt3 : removed)}`);

    const list = await usersList(scope, { novos: freshAlt3 ?? [], dica: 'usuarios' });
    const listOutside = (freshAlt3 ?? []).filter(i => scope.mostra && !scope.mostra(i));
    const inTop = [
        ...(await Promise.all(removed.map(async i => `🗑️ ${await describeItem(i, scope)}`))),
        ...(await Promise.all(listOutside.map(async i => `✅ ${await describeItem(i, scope)}`)))
    ];
    await msg.reply((inTop.length ? `${inTop.join('\n')}\n\n` : '') + (list || whoUses()));
}

/*
 * +cmd|-cmd: each user's rule. Together with +u, defines the rule:
 * +u +cmd /a,/b = only those; +u -cmd /a = all, except that one. Alone:
 * +cmd: (an admin command only enters "Only") whoever is not a user enters only with these; "Only" gains these; "All,
 * except" lets those in again; whoever uses all stays as is; all deletes the rule;
 * -cmd: "Only" loses these (the last one, no: that is -u); whoever uses all stays
 *         "Todos, menos" esses; "Todos, menos" ganha esses.
 * In a group, the person is the one there ("phone:group") or, without it, the one from any chat.
 */
async function changeCommands(msg, items, { sinal: signalAlt, comandos: commands, comV: withV }, chat) {
    const users = getSetting('bot.users');
    if (users.includes('all')) {
        await msg.reply(t('adm.bot.everyoneAlready'));
        return;
    }

    const scope = await chatScope(chat);
    const all = commands.includes('all');
    const admins = commands.filter(delegavel);
    const changed = [];
    const newUsers = [];
    const notices = [];

    for (const item of items) {
        const { numero: numberAlt, soEm: soIn } = readItem(item);
        const target = !users.includes(item) && soIn && users.includes(numberAlt) ? numberAlt : item;
        const isUser = users.includes(target);
        const rule = regraDe(target);
        const who = await describeItem(target, scope);
        // The rule list with these (union) and without these (leftover)
        const union = rule ? [...new Set([...rule.comandos, ...commands])] : commands;
        const leftOver = rule ? rule.comandos.filter(c => !commands.includes(c)) : [];
        let fresh;

        if (withV) {
            fresh = all ? null : { apenas: signalAlt === '+', comandos: commands };
        } else if (signalAlt === '+') {
            if (!isUser || all) fresh = all ? null : { apenas: true, comandos: commands };
            else if (!rule?.apenas && admins.length) {
                notices.push(t('adm.bot.adminNeedsOnly', { quem: who, admins: admins.join(', '), ex: admins[0] }));
                continue;
            } else if (!rule) {
                notices.push(t('adm.bot.alreadyAll', { quem: who }));
                continue;
            } else if (rule.apenas) fresh = { apenas: true, comandos: union };
            else fresh = leftOver.length ? { apenas: false, comandos: leftOver } : null;
        } else {
            if (!isUser) {
                notices.push(t('adm.bot.notUserWho', { quem: who }));
                continue;
            }
            if (all || (rule?.apenas && !leftOver.length)) {
                notices.push(t('adm.bot.nothingLeft', { quem: who }));
                continue;
            }
            if (!rule) fresh = { apenas: false, comandos: commands };
            else fresh = rule.apenas ? { apenas: true, comandos: leftOver } : { apenas: false, comandos: union };
        }

        const same = JSON.stringify(fresh) === JSON.stringify(rule);
        if (isUser && same) {
            notices.push(t('adm.bot.nothingChanged', { quem: who, regra: rule ? ` (${describeRule(rule)})` : '' }));
            continue;
        }
        if (!isUser) newUsers.push(target);
        await recordRule(target, fresh);
        changed.push(target);
    }

    if (newUsers.length) await setSetting('bot.users', [...users, ...newUsers]);
    if (!changed.length) {
        await msg.reply(notices.join('\n'));
        return;
    }
    printInfo(`/bot: bot.users.cmds ${signalAlt}cmd ${commands.join(',')} → ${JSON.stringify(changed)}`);

    const list = await usersList(scope, { novos: changed, dica: 'usuarios' });
    const listOutside = changed.filter(i => scope.mostra && !scope.mostra(i));
    const inTop = [
        ...notices,
        ...(await Promise.all(listOutside.map(async i => {
            const rule = regraDe(i);
            return `✅ ${await describeItem(i, scope)}${rule ? `\n → ${describeRule(rule)}` : ''}`;
        })))
    ];
    await msg.reply((inTop.length ? `${inTop.join('\n')}\n\n` : '') + (list || whoUses()));
}

async function handleShortcut(msg, textAlt, chatCurrent) {
    const { op, cmd, todos: allAlt2, quem: who } = readShortcut(textAlt);
    const key = SHORTCUT_LIST[op?.letra ?? 'u'];
    const chat = { ...chatCurrent, todos: allAlt2 };

    // Owner only: an extra admin promotes nobody (not even themselves)
    if (!msg.fromMe) {
        await msg.reply(t(key === 'bot.admins' ? 'adm.bot.ownerOnlyAdmins' : 'adm.bot.ownerOnlyUsers'));
        return;
    }

    // +cmd|-cmd belongs to users: with +a/-a or -u, no
    if (cmd && op && (op.letra === 'a' || op.sinal === '-')) {
        await msg.reply(t('adm.bot.cmdOnlyUsers'));
        return;
    }

    let commands = null;
    if (cmd) {
        try {
            commands = readCommands(cmd.texto);
        } catch (e) {
            await msg.reply(`❌ ${e.message}`);
            return;
        }
        if (cmd.sinal === '-' && commands.includes('all')) {
            await msg.reply(t('adm.bot.cmdRemoveAll'));
            return;
        }
    }

    const items = who
        ? await textItems(msg, key, who, chat)
        : await chatItems(msg, key, chat);
    if (!items) return;

    if (cmd) {
        await changeCommands(msg, items, { sinal: cmd.sinal, comandos: commands, comV: Boolean(op) }, chat);
        return;
    }
    await changeList(msg, key, items, op.sinal === '+', chat);
}

/*
 * -status: the report now (in the chat or, with -to, in the destinations), the send
 * daily at a time (in your private chat or in the -to; without -to, the previous ones stay) or off.
 */
async function handleStatus(msg, values, { destinosTexto: destinationsText, comDestino: withDestination, chat }) {
    const destinations = withDestination
        ? await resolverDestinations(msg, destinationsText, { aceitaEmail: true })
        : undefined;
    if (destinations === null) return;

    if (!values.length) {
        if (!destinations) {
            await msg.reply(await report(chat));
            return;
        }
        // Outward, the report goes without the list of who uses it
        const textAlt = await statusText(Date.now(), { estadoDoBot: botState() });
        await sendToDestinations(destinations, textAlt, { assunto: t('adm.bot.statusSubject') })
            .then(() => msg.reply(t('adm.bot.statusSent', { onde: describeDestinations(destinations) })))
            .catch(err => msg.reply(t('adm.bot.statusFail', { erro: err.message })));
        return;
    }

    if (values.length === 1 && values[0].toLowerCase() === 'off') {
        if (destinations) {
            await msg.reply(t('adm.bot.toNotWithOff'));
            return;
        }
        await msg.reply(await turnOffStatusDaily()
            ? t('adm.bot.dailyOff')
            : t('adm.bot.dailyWasOff'));
        return;
    }

    // "at 6h" or "6h": the time of the daily send
    const hour = readHour(values.filter(e => !/^[àa]s$/i.test(e)).join(''));
    if (!hour || values.length > 2) {
        await msg.reply(t('adm.bot.badHour', { sintaxe: getCommandSyntax('/bot') }));
        return;
    }

    const next = await scheduleStatusDaily(hour, Date.now(), destinations);
    const two = (n) => String(n).padStart(2, '0');
    const whereAlt = whereGoes(statusDestinations(await schedulingDaily()));
    await msg.reply(t('adm.bot.dailySet', { hora: `${two(hour.h)}:${two(hour.m)}`, onde: whereAlt, proximo: fmtWhen(next) }));
}

// What each -reset puts back to default (the daily send of -status always stays)
const DO_RESET = ['bot.users', 'bot.users.cmds'];
const RESET_COMPLETE = [...DO_RESET, 'bot.admins', 'bot.paused'];

// Quanto tempo o -reset espera o "sim"
const CONFIRM_RESET_MS = 10_000;

/*
 * -reset: removes all users and their limits; the extra admins and the on/off stay.
 * -reset force: puts everything back to default (also removes the extra admins and turns the bot on).
 * Both ask first (reply "sim" within 10 s).
 */
async function reset(msg, { chatId, completo: complete }) {
    if (!msg.fromMe) {
        await msg.reply(t(complete ? 'adm.bot.resetOwnerFull' : 'adm.bot.resetOwner'));
        return;
    }

    const seconds = CONFIRM_RESET_MS / 1000;
    const question = await msg.reply(t(complete ? 'adm.bot.askFull' : 'adm.bot.ask', { segundos: seconds }));
    const confirmed = await waitConfirmation(chatId, {
        ms: CONFIRM_RESET_MS,
        autor: authorAlt(msg),
        aoExpirar: () => completeNotice(msg, question, t('adm.bot.resetExpired', { segundos: seconds }))
    });
    if (confirmed === false) await msg.reply(t('adm.bot.nothingChangedShort'));
    if (!confirmed) return;

    const usersAlt = getSetting('bot.users').length;
    for (const key of complete ? RESET_COMPLETE : DO_RESET) await setSetting(key, SETTINGS_SCHEMA[key].default);

    if (complete) {
        printInfo('/bot -reset force: usuários, admins e bot.paused de volta ao padrão');
        await msg.reply(t('adm.bot.resetFullDone', { estado: botState() }));
        return;
    }
    printInfo(`/bot -reset: ${usersAlt} usuário(s) e os limites deles removidos`);
    await msg.reply(t('adm.bot.resetDone', { n: usersAlt, estado: botState() }));
}

// -flush-email: counts the Sent and Trash messages; with "true", deletes everything (owner only)
async function cleanEmail(msg, { apagar: removeAlt }) {
    if (removeAlt && !msg.fromMe) {
        await msg.reply(t('adm.bot.flushOwner'));
        return;
    }

    const notice = removeAlt ? await msg.reply(t('adm.bot.flushing')) : null;
    try {
        const { sent, trash } = await boxes({ apagar: removeAlt });
        printInfo(`/bot -flush-email${removeAlt ? ' true' : ''}: Sent ${sent}, Trash ${trash}`);
        const textAlt = removeAlt
            ? t('adm.bot.flushed', { sent, trash, total: sent + trash })
            : t('adm.bot.flushCount', { sent, trash });
        await (removeAlt ? completeNotice(msg, notice, textAlt) : msg.reply(textAlt));
    } catch (err) {
        const textAlt = t('adm.bot.flushFail', { erro: err.message });
        await (removeAlt ? completeNotice(msg, notice, textAlt) : msg.reply(textAlt));
    }
}

async function cmdBot({ msg, opts: commandOpts, args, chatId, isGroup }) {
    args = removeOptionMask(args);
    if (SHORTCUT.test(String(args ?? ''))) {
        await handleShortcut(msg, String(args).trim(), { chatId, isGroup });
        return;
    }

    // Repeated and grouped destinations (/Grupo L200/) are resolved together.
    const { destinos: destinationsText, informado: withDestination, resto: rest } = extractDestinations(args);
    const opts = withDestination ? GetOptFromCommand(rest, findCommand('/bot')) : commandOpts;
    const { on, off } = opts.opt;
    // -list-users [all]: without all, those of this chat; with it, everyone
    const listAlt = opts.given.has('list-users');
    const allAlt2 = listAlt && /^all$/i.test(opts.opt['list-users'] ?? '');
    if (listAlt && opts.opt['list-users'] && !allAlt2) {
        await msg.reply(t('adm.bot.listUsersUse'));
        return;
    }
    const chat = { chatId, isGroup, todos: allAlt2 };

    if (withDestination && !opts.given.has('status')) {
        await msg.reply(t('adm.bot.toIsStatus'));
        return;
    }

    // -info, -test, -reset and -flush-email: alone (-reset accepts force, which does not ask;
    // o -flush-email, o true)
    // -passwd <password|off>: the /bot -login password (owner only)
    if (opts.given.has('passwd')) {
        if (!msg.fromMe) {
            await msg.reply(t('adm.bot.passwdOwner'));
            return;
        }
        const password = [opts.opt.passwd, ...opts.argv].filter(Boolean).join(' ').trim();
        await msg.reply(password ? await definePassword(password) : t('adm.bot.passwdUsage'));
        return;
    }

    const ALONE = ['info', 'test', 'reset', 'flush-email'];
    for (const alone of ALONE) {
        if (!opts.given.has(alone)) continue;
        const other = ALONE.filter(o => o !== alone);
        // The value of -reset: nothing or force; of -flush-email: nothing or true
        const valueAlt = alone === 'reset' || alone === 'flush-email' ? opts.opt[alone] : null;
        const force = new RegExp(`^${alone === 'reset' ? 'force' : 'true'}$`, 'i').test(valueAlt ?? '');
        const combined = on || off || listAlt || opts.given.has('status') || other.some(o => opts.given.has(o));
        if (combined || opts.argv.length || (valueAlt && !force)) {
            await msg.reply(t('adm.bot.noCombine', { opcao: alone }));
            return;
        }
        if (alone === 'info') await msg.reply(await infoText());
        else if (alone === 'test') {
            const notice = await msg.reply(t('adm.bot.testing'));
            await completeNotice(msg, notice, await testText());
        } else if (alone === 'flush-email') await cleanEmail(msg, { apagar: force });
        else await reset(msg, { chatId, completo: force });
        return;
    }

    // -status [<time>|off] [-to ...]: the parser takes one value; "às 18h" leaves the rest in argv
    if (opts.given.has('status')) {
        if (on || off || listAlt) {
            await msg.reply(t('adm.bot.statusNoCombine'));
            return;
        }
        const values = [opts.opt.status, ...opts.argv].filter(Boolean);
        await handleStatus(msg, values, { destinosTexto: destinationsText, comDestino: withDestination, chat });
        return;
    }

    if (opts.argv.length || (on && off)) {
        await msg.reply(t('adm.bot.usage'));
        return;
    }

    // -on|-off: only turns on and off (the lists stay); -list-users [all]: the users
    if (on || off) await setSetting('bot.paused', off);
    if (on || off || listAlt) {
        const partsAlt = [(on || off) && botState(), listAlt && await usersText(chat)]
            .filter(Boolean);
        await msg.reply(partsAlt.join('\n\n'));
        return;
    }

    // Without an option: the status
    await msg.reply(await report(chat));
}

module.exports = {
    ROLES,
    cmdBot,
    describeItem,
    chatScope,
    permissions
};
