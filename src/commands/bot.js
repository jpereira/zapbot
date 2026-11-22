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
const { isDelegable, describeRule, recordRule, ruleOf } = require('../permissions');
const { commandLimitable, describeLimit, recordLimitAlt, readLimit, limitsAlt } = require('../usageLimit');
const {
    SETTINGS_SCHEMA, userCommand, getSetting, setSetting, validateSetting
} = require('../settings');
const { definePassword } = require('../login');
const { noticeModel } = require('../noPermission');
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
 *   /bot +a|-a <person...>        → adiciona e tira admins (bot.admins)
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
const ROLES = { owner: '🤖', admin: '👑', user: '🗣️', none: '🚫' };

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
    return { number: numberAlt, soEm: soIn, isGroup: !soIn && item.endsWith('@g.us') };
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
async function chatScope({ chatId, isGroup, all: allAlt2 = false } = {}) {
    if (isGroup) {
        const members = await groupMembers(chatId);
        const group = (item) => {
            const { number: numberAlt, soEm: soIn, isGroup: isGroupAlt } = readItem(item);
            if (isGroupAlt) return item === chatId;
            return soIn ? soIn === chatId : members.has(numberAlt);
        };
        const show = allAlt2 ? null : group;
        return { chatId, members, show, where: t('adm.bot.whereGroup'), here: t('adm.bot.hereGroup') };
    }

    const ids = chatId ? await chatCurrentIds(chatId) : [];
    if (allAlt2 || !chatId || ids.includes(client.info.wid._serialized)) {
        return { chatId, members: null, show: null };
    }

    const phoneAlt = ids.find(i => i.endsWith('@c.us'))?.split('@')[0];
    const personAlt = (item) => readItem(item).number === phoneAlt;
    return { chatId, members: null, show: personAlt, where: t('adm.bot.whereChat'), here: t('adm.bot.hereChat') };
}

// 5521999982222 → 5521•••••2222 (the country code and area code stay, and the last 4)
const mask = (n) => `${n.slice(0, 4)}${'•'.repeat(Math.max(1, n.length - 8))}${n.slice(-4)}`;
const numberVisible = (n, members) => contextDebug().maskPhones ? maskPhones(n)
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
    return t('adm.bot.onlyInNamed', { name: await itemName(soIn) || soIn });
}

/*
 * An item as the rest of the bot shows a destination: "👤 Maria Lucia · +5521988887777",
 * "👤 +5521977777777" (no name) or "👥 Grupo Familia"; the person in a single group,
 * with the group at the end.
 */
async function describeItem(item, scope) {
    const { number: numberAlt, soEm: soIn, isGroup: isGroupAlt } = readItem(item);
    const nameAlt = await itemName(numberAlt);
    if (isGroupAlt) return describeDestination({ id: item, name: nameAlt || item, group: true });

    const phone = `+${numberVisible(numberAlt, scope?.members)}`;
    const person = nameAlt ? `${describeDestination({ name: nameAlt, group: false })} · ${phone}` : `👤 ${phone}`;
    return person + await soInText(soIn, scope);
}

/*
 * Each one's role, by the highest: 🤖 the owner (the bot account, which already uses
 * everything), 👑 admin or 🗣️ user.
 */
function marks(item, admins, users) {
    const { number: numberAlt, soEm: soIn } = readItem(item);
    if (soIn) return [`${ROLES.user} +u`];
    return [
        isOOwner(numberAlt) && `${ROLES.owner} ${t('adm.bot.markOwner')}`,
        admins.includes(item) && `${ROLES.admin} +a`,
        users.includes(item) && `${ROLES.user} +u`
    ].filter(Boolean);
}

/*
 * Admins (+a) and users (+u) in a single list: whoever is in both appears once
 * time, with both marks. First the admins, in each setting's order.
 * new ones: those who just joined (with ✅). tip: 'all' (the -list-users all, with
 * the care not to expose outsiders) or 'users' (the -list-users, in the reply
 * do +a/+u).
 */
async function usersList(scope, { added: freshAlt3 = [], hint: tip = 'todos' } = {}) {
    const admins = getSetting('bot.admins');
    const users = getSetting('bot.users').filter(i => i !== 'all');
    const allAlt2 = [...new Set([...admins, ...users])];
    if (!allAlt2.length) return '';

    // Only this chat's: how many were left out, and how to see everyone
    const { show, where: whereAlt, here } = scope;
    const items = show ? allAlt2.filter(show) : allAlt2;
    const outside = allAlt2.length - items.length;
    const asSee = tip === 'todos' ? t('adm.bot.seeAllHint', { where: whereAlt }) : t('adm.bot.listUsersHint');
    const footer = outside ? `\n\n${t('adm.bot.footerOutside', { where: whereAlt, out: outside, howToSee: asSee })}` : '';
    const title = show ? t('adm.bot.usersTitleScoped', { n: items.length, here }) : t('adm.bot.usersTitle', { n: items.length });
    if (!items.length) return `${title}\n${t('adm.bot.nobody', { where: whereAlt })}${footer}`;

    const linesAlt = await Promise.all(items.map(async (item) => {
        const freshAlt = freshAlt3.includes(item) ? ' ✅' : '';
        // The +cmd|-cmd rule below (admin uses everything: without it)
        const rule = !admins.includes(item) && ruleOf(item);
        const limits = admins.includes(item) ? [] : [...limitsAlt(item)].map(([c, l]) => `${c} ${describeLimit(l)}`);
        return `• ${marks(item, admins, users).join(' ')} · ${await describeItem(item, scope)}${freshAlt}` +
            (rule ? `\n → ${describeRule(rule)}` : '') +
            (limits.length ? `\n ⏱️ ${limits.join(', ')}` : '');
    }));

    const owner = items.some(i => !readItem(i).soEm && isOOwner(i));
    return `${title}\n${linesAlt.join('\n')}\n\n${permissions({ owner })}${footer}`;
}

// What each mark means (the owner's, with only you in the list; the no-permission one, in /whois)
function permissions({ owner = false, noPermission: withoutPermission = false } = {}) {
    return `${t('adm.bot.permTitle')}\n` +
        (owner ? `${t('adm.bot.permOwner', { e: ROLES.owner })}\n` : '') +
        `${t('adm.bot.permAdmin', { e: ROLES.admin })}\n` +
        t('adm.bot.permUser', { e: ROLES.user }) +
        (withoutPermission ? `\n${t('adm.bot.permNone', { e: ROLES.none })}` : '');
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
    const textAlt = await statusText(Date.now(), { botState: botState(), users: usersAlt });
    return `${textAlt}\n\n${t('adm.bot.moreInfo')}`;
}

// +a/-a (bot.admins), +u/-u (bot.users) and +cmd/-cmd (each user's commands), in any
// order
const SHORTCUT = /(^|\s)[+-](a|u|cmd|limit)(?=\s|$)/;
const OPTION_LIMIT = /(^|\s)([+-])limit(?:\s+([^\s+-]\S*))?(?=\s|$)/;
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
    const limit = remove(OPTION_LIMIT);
    const cmd = remove(OPTION_CMD);
    const op = remove(OPERATION);
    return {
        limit: limit ? { sign: limit[2], text: limit[3] ?? '' } : null,
        op: op ? { sign: op[2], letter: op[3] } : null,
        cmd: cmd ? { sign: cmd[2], text: cmd[3] ?? '' } : null,
        all: allAlt2,
        who: rest.trim()
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
    const { number: numberAlt, soEm: soIn } = readItem(item);
    if (soIn && isGroup) return current.includes(item) ? [item] : current.filter(i => i === numberAlt);
    if (readItem(item).isGroup) return current.filter(i => i === item);
    return current.filter(i => readItem(i).number === numberAlt);
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
        freshAlt3 = items.filter(i => !current.includes(i) && !current.includes(readItem(i).number));
        if (!freshAlt3.length) {
            await msg.reply(t(admin ? 'adm.bot.alreadyAdmin' : 'adm.bot.alreadyUser', { list: (await short(items)).join(', ') }));
            return;
        }
        await setSetting(key, [...current, ...freshAlt3]);
        // Whoever joins starts with no rule (an old one, from before leaving through /set, does not come back)
        if (key === 'bot.users') for (const i of freshAlt3) await recordRule(i, null);
    } else {
        removed = [...new Set(items.flatMap(i => aRemove(i, current, chat)))];
        if (!removed.length) {
            await msg.reply(t(admin ? 'adm.bot.notAdmin' : 'adm.bot.notUser', { list: (await short(items)).join(', ') }));
            return;
        }
        await setSetting(key, current.filter(i => !removed.includes(i)));
        if (key === 'bot.users') {
            for (const i of removed) {
                await recordRule(i, null);
                for (const c of limitsAlt(i).keys()) await recordLimitAlt(i, c, null);
            }
        }
    }
    printInfo(`/bot: ${key} ${append ? '+' : '-'} ${JSON.stringify(append ? freshAlt3 : removed)}`);

    const list = await usersList(scope, { added: freshAlt3 ?? [], hint: 'usuarios' });
    const listOutside = (freshAlt3 ?? []).filter(i => scope.show && !scope.show(i));
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
async function changeCommands(msg, items, { sign: signalAlt, commands, withV }, chat, afterRecord = null) {
    const users = getSetting('bot.users');
    if (users.includes('all')) {
        await msg.reply(t('adm.bot.everyoneAlready'));
        return;
    }

    const scope = await chatScope(chat);
    const all = commands.includes('all');
    const admins = commands.filter(isDelegable);
    const changed = [];
    const newUsers = [];
    const notices = [];
    const targets = [];

    for (const item of items) {
        const { number: numberAlt, soEm: soIn } = readItem(item);
        const target = !users.includes(item) && soIn && users.includes(numberAlt) ? numberAlt : item;
        targets.push(target);
        const isUser = users.includes(target);
        const rule = ruleOf(target);
        const who = await describeItem(target, scope);
        // The rule list with these (union) and without these (leftover)
        const union = rule ? [...new Set([...rule.commands, ...commands])] : commands;
        const leftOver = rule ? rule.commands.filter(c => !commands.includes(c)) : [];
        let fresh;

        if (withV) {
            fresh = all ? null : { only: signalAlt === '+', commands };
        } else if (signalAlt === '+') {
            if (!isUser || all) fresh = all ? null : { only: true, commands };
            else if (!rule?.only && admins.length) {
                notices.push(t('adm.bot.adminNeedsOnly', { who, admins: admins.join(', '), ex: admins[0] }));
                continue;
            } else if (!rule) {
                notices.push(t('adm.bot.alreadyAll', { who }));
                continue;
            } else if (rule.only) fresh = { only: true, commands: union };
            else fresh = leftOver.length ? { only: false, commands: leftOver } : null;
        } else {
            if (!isUser) {
                notices.push(t('adm.bot.notUserWho', { who }));
                continue;
            }
            if (all || (rule?.only && !leftOver.length)) {
                notices.push(t('adm.bot.nothingLeft', { who }));
                continue;
            }
            if (!rule) fresh = { only: false, commands };
            else fresh = rule.only ? { only: true, commands: leftOver } : { only: false, commands: union };
        }

        const same = JSON.stringify(fresh) === JSON.stringify(rule);
        if (isUser && same) {
            notices.push(t('adm.bot.nothingChanged', { who, rule: rule ? ` (${describeRule(rule)})` : '' }));
            continue;
        }
        if (!isUser) newUsers.push(target);
        await recordRule(target, fresh);
        changed.push(target);
    }

    if (newUsers.length) await setSetting('bot.users', [...users, ...newUsers]);
    // The +limit on the same line: saves now (the users already exist) and the list below already shows the ⏱️
    if (afterRecord) notices.push(...await afterRecord(targets));
    if (!changed.length) {
        await msg.reply(notices.join('\n'));
        return;
    }
    printInfo(`/bot: bot.users.cmds ${signalAlt}cmd ${commands.join(',')} → ${JSON.stringify(changed)}`);

    const list = await usersList(scope, { added: changed, hint: 'usuarios' });
    const listOutside = changed.filter(i => scope.show && !scope.show(i));
    const inTop = [
        ...notices,
        ...(await Promise.all(listOutside.map(async i => {
            const rule = ruleOf(i);
            const limits = [...limitsAlt(i)].map(([c, l]) => `${c} ${describeLimit(l)}`);
            return `✅ ${await describeItem(i, scope)}${rule ? `\n → ${describeRule(rule)}` : ''}` +
                (limits.length ? `\n ⏱️ ${limits.join(', ')}` : '');
        })))
    ];
    await msg.reply((inTop.length ? `${inTop.join('\n')}\n\n` : '') + (list || whoUses()));
}

/*
 * +limit N[/period] (with the +cmd on the same line) records the limit of those commands for the items;
 * -limit /cmd,/cmd (or all) removes it. It only applies to whoever is a user (bot.users).
 */
async function applyLimits(targets, limit, commands, chat) {
    const users = getSetting('bot.users');
    const scope = await chatScope(chat);
    const limitAlt = readLimit(limit.text);
    const notices = [];
    for (const target of targets) {
        if (!users.includes(target)) {
            notices.push(t('usage.notUser', { who: await describeItem(target, scope) }));
            continue;
        }
        for (const cmd of commands) await recordLimitAlt(target, cmd, limitAlt);
    }
    printInfo(`/bot: bot.users.limits +limit ${limit.text} ${commands.join(',')} → ${JSON.stringify(targets)}`);
    return notices;
}

async function changeLimits(msg, items, limit, commands, chat) {
    const users = getSetting('bot.users');
    const scope = await chatScope(chat);
    const linesAlt = [];

    if (limit.sign === '+') {
        const limitAlt = readLimit(limit.text);
        for (const cmd of commands) {
            if (!commandLimitable(cmd)) throw new Error(t('usage.notLimitable', { cmd }));
        }
        for (const item of items) {
            const { number: numberAlt, soEm: soIn } = readItem(item);
            const target = !users.includes(item) && soIn && users.includes(numberAlt) ? numberAlt : item;
            if (!users.includes(target)) {
                linesAlt.push(t('usage.notUser', { who: await describeItem(target, scope) }));
                continue;
            }
            for (const cmd of commands) await recordLimitAlt(target, cmd, limitAlt);
            linesAlt.push(`⏱️ ${await describeItem(target, scope)}\n → ${commands.join(', ')}: ${describeLimit(limitAlt)}`);
        }
    } else {
        for (const item of items) {
            const { number: numberAlt, soEm: soIn } = readItem(item);
            const target = limitsAlt(item).size || !soIn ? item : numberAlt;
            const own = [...limitsAlt(target).keys()];
            const remove = commands.includes('all') ? own : commands.filter(c => own.includes(c));
            for (const cmd of remove) await recordLimitAlt(target, cmd, null);
            linesAlt.push(remove.length
                ? `✅ ${await describeItem(target, scope)}\n → ${t('usage.removed', { cmds: remove.join(', ') })}`
                : t('usage.nothingToRemove', { who: await describeItem(target, scope) }));
        }
    }
    printInfo(`/bot: bot.users.limits ${limit.sign}limit → ${JSON.stringify(items)}`);
    await msg.reply(linesAlt.join('\n'));
}

async function handleShortcut(msg, textAlt, chatCurrent) {
    const { op, cmd, limit, all: allAlt2, who } = readShortcut(textAlt);
    const key = SHORTCUT_LIST[op?.letter ?? 'u'];
    const chat = { ...chatCurrent, all: allAlt2 };

    // Owner only: an extra admin promotes nobody (not even themselves)
    if (!msg.fromMe) {
        await msg.reply(t(key === 'bot.admins' ? 'adm.bot.ownerOnlyAdmins' : 'adm.bot.ownerOnlyUsers'));
        return;
    }

    // +cmd|-cmd belongs to users: with +a/-a or -u, no
    if (cmd && op && (op.letter === 'a' || op.sign === '-')) {
        await msg.reply(t('adm.bot.cmdOnlyUsers'));
        return;
    }

    // +limit needs the commands (the +cmd on the same line); -limit, the commands to release (or all)
    let limitCommands = null;
    if (limit) {
        try {
            if (limit.sign === '+') {
                if (!cmd || cmd.sign !== '+') throw new Error(t('usage.needsCmd'));
                readLimit(limit.text);
            } else {
                limitCommands = readCommands(limit.text);
            }
        } catch (e) {
            await msg.reply(`❌ ${e.message}`);
            return;
        }
    }

    let commands = null;
    if (cmd) {
        try {
            commands = readCommands(cmd.text);
        } catch (e) {
            await msg.reply(`❌ ${e.message}`);
            return;
        }
        if (cmd.sign === '-' && commands.includes('all')) {
            await msg.reply(t('adm.bot.cmdRemoveAll'));
            return;
        }
    }

    const items = who
        ? await textItems(msg, key, who, chat)
        : await chatItems(msg, key, chat);
    if (!items) return;

    // +cmd and +limit together: a single reply (the list, already with each user's ⏱️)
    const together = limit?.sign === '+' && cmd;
    if (together) {
        for (const c of commands) {
            if (!commandLimitable(c)) {
                await msg.reply(`❌ ${t('usage.notLimitable', { cmd: c })}`);
                return;
            }
        }
    }
    if (cmd) {
        await changeCommands(msg, items, { sign: cmd.sign, commands, withV: Boolean(op) }, chat,
            together ? (targets) => applyLimits(targets, limit, commands, chat) : null);
    } else if (op) {
        await changeList(msg, key, items, op.sign === '+', chat);
    }

    if (limit && !together) {
        try {
            await changeLimits(msg, items, limit, limit.sign === '+' ? commands : limitCommands, chat);
        } catch (e) {
            await msg.reply(`❌ ${e.message}`);
        }
    }
}

/*
 * -status: the report now (in the chat or, with -to, in the destinations), the send
 * daily at a time (in your private chat or in the -to; without -to, the previous ones stay) or off.
 */
async function handleStatus(msg, values, { destinationsText, withDestination, chat }) {
    const destinations = withDestination
        ? await resolverDestinations(msg, destinationsText, { acceptsEmail: true })
        : undefined;
    if (destinations === null) return;

    if (!values.length) {
        if (!destinations) {
            await msg.reply(await report(chat));
            return;
        }
        // Outward, the report goes without the list of who uses it
        const textAlt = await statusText(Date.now(), { botState: botState() });
        await sendToDestinations(destinations, textAlt, { subject: t('adm.bot.statusSubject') })
            .then(() => msg.reply(t('adm.bot.statusSent', { where: describeDestinations(destinations) })))
            .catch(err => msg.reply(t('adm.bot.statusFail', { error: err.message })));
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
        await msg.reply(t('adm.bot.badHour', { syntax: getCommandSyntax('/bot') }));
        return;
    }

    const next = await scheduleStatusDaily(hour, Date.now(), destinations);
    const two = (n) => String(n).padStart(2, '0');
    const whereAlt = whereGoes(statusDestinations(await schedulingDaily()));
    await msg.reply(t('adm.bot.dailySet', { hour: `${two(hour.h)}:${two(hour.m)}`, where: whereAlt, next: fmtWhen(next) }));
}

// What each -reset puts back to default (the daily send of -status always stays)
const DO_RESET = ['bot.users', 'bot.users.cmds', 'bot.users.limits'];
const RESET_COMPLETE = [...DO_RESET, 'bot.admins', 'bot.paused'];

// Quanto time o -reset wait o "sim"
const CONFIRM_RESET_MS = 10_000;

/*
 * -reset: removes all users and their limits; the extra admins and the on/off stay.
 * -reset force: puts everything back to default (also removes the extra admins and turns the bot on).
 * Both ask first (reply "sim" within 10 s), unless -yes (-y) comes along.
 */
async function reset(msg, { chatId, full: complete, sim: yes = false }) {
    if (!msg.fromMe) {
        await msg.reply(t(complete ? 'adm.bot.resetOwnerFull' : 'adm.bot.resetOwner'));
        return;
    }

    // -yes (-y) already confirms: no question
    if (!yes) {
        const seconds = CONFIRM_RESET_MS / 1000;
        const question = await msg.reply(t(complete ? 'adm.bot.askFull' : 'adm.bot.ask', { seconds }));
        const confirmed = await waitConfirmation(chatId, {
            ms: CONFIRM_RESET_MS,
            author: authorAlt(msg),
            onExpire: () => completeNotice(msg, question, t('adm.bot.resetExpired', { seconds }))
        });
        if (confirmed === false) await msg.reply(t('adm.bot.nothingChangedShort'));
        if (!confirmed) return;
    }

    const usersAlt = getSetting('bot.users').length;
    for (const key of complete ? RESET_COMPLETE : DO_RESET) await setSetting(key, SETTINGS_SCHEMA[key].default);

    if (complete) {
        printInfo('/bot -reset force: users, admins and bot.paused back to the default');
        await msg.reply(t('adm.bot.resetFullDone', { state: botState() }));
        return;
    }
    printInfo(`/bot -reset: ${usersAlt} user(s) and their limits removed`);
    await msg.reply(t('adm.bot.resetDone', { n: usersAlt, state: botState() }));
}

// -flush-email: counts the Sent and Trash messages; with -yes (-y), deletes everything (owner only)
async function cleanEmail(msg, { erase: removeAlt }) {
    if (removeAlt && !msg.fromMe) {
        await msg.reply(t('adm.bot.flushOwner'));
        return;
    }

    const notice = removeAlt ? await msg.reply(t('adm.bot.flushing')) : null;
    try {
        const { sent, trash } = await boxes({ erase: removeAlt });
        printInfo(`/bot -flush-email${removeAlt ? ' -yes' : ''}: Sent ${sent}, Trash ${trash}`);
        const textAlt = removeAlt
            ? t('adm.bot.flushed', { sent, trash, total: sent + trash })
            : t('adm.bot.flushCount', { sent, trash });
        await (removeAlt ? completeNotice(msg, notice, textAlt) : msg.reply(textAlt));
    } catch (err) {
        const textAlt = t('adm.bot.flushFail', { error: err.message });
        await (removeAlt ? completeNotice(msg, notice, textAlt) : msg.reply(textAlt));
    }
}

/*
 * /bot -denied: with nothing, shows the notice; on|off turns it on and off; reset goes back to the default text; any other
 * text becomes the message ($cmd and $admin are swapped at notice time).
 */
async function handleNoticeDenied(valueAlt) {
    const v = valueAlt.toLowerCase();
    if (v === 'on' || v === 'off') await setSetting('bot.denied.enabled', v === 'on');
    else if (v === 'reset') await setSetting('bot.denied.message', '');
    else if (valueAlt) await setSetting('bot.denied.message', valueAlt);
    return t('adm.bot.denied', {
        state: t(getSetting('bot.denied.enabled') ? 'adm.bot.denied.on' : 'adm.bot.denied.off'),
        text: noticeModel()
    });
}

/*
 * /bot -flood: the flood protection (settings bot.flood.maxCommandRepeated and bot.flood.intervalCommand). With nothing,
 * shows; off turns off (0 repetitions); on goes back to the defaults; N[/seconds] changes the max (and the window).
 */
async function handleFlood(valueAlt) {
    const v = valueAlt.toLowerCase().trim();
    const max = 'bot.flood.maxCommandRepeated';
    const window = 'bot.flood.intervalCommand';
    try {
        if (v === 'off') await setSetting(max, 0);
        else if (v === 'on') {
            await setSetting(max, SETTINGS_SCHEMA[max].default);
            await setSetting(window, SETTINGS_SCHEMA[window].default);
        } else if (v) {
            const m = v.match(/^(\d+)(?:\/(\d+)s?)?$/);
            if (!m || Number(m[1]) < 1) return t('adm.bot.floodUsage');
            // Both values checked before saving the first (5/0 must not leave the 5 half done)
            validateSetting(max, m[1]);
            if (m[2]) validateSetting(window, m[2]);
            await setSetting(max, Number(m[1]));
            if (m[2]) await setSetting(window, Number(m[2]));
        }
    } catch (e) {
        return t('adm.set.invalid', { key: max, error: e.message });
    }
    const n = getSetting(max);
    return t('adm.bot.flood', {
        state: t(n ? 'adm.bot.flood.on' : 'adm.bot.flood.off'),
        detail: n ? t('adm.bot.flood.detail', { max: n, seconds: getSetting(window) }) : t('adm.bot.flood.none')
    });
}

async function cmdBot({ msg, opts: commandOpts, args, chatId, isGroup }) {
    args = removeOptionMask(args);
    if (SHORTCUT.test(String(args ?? ''))) {
        await handleShortcut(msg, String(args).trim(), { chatId, isGroup });
        return;
    }

    // Repeated and grouped destinations (/Grupo L200/) are resolved together.
    const { destinations: destinationsText, given: withDestination, rest } = extractDestinations(args);
    const opts = withDestination ? GetOptFromCommand(rest, findCommand('/bot')) : commandOpts;
    const { on, off } = opts.opt;
    // -list-users [all]: without all, those of this chat; with it, everyone
    const listAlt = opts.given.has('list-users');
    const allAlt2 = listAlt && /^all$/i.test(opts.opt['list-users'] ?? '');
    if (listAlt && opts.opt['list-users'] && !allAlt2) {
        await msg.reply(t('adm.bot.listUsersUse'));
        return;
    }
    const chat = { chatId, isGroup, all: allAlt2 };

    if (withDestination && !opts.given.has('status')) {
        await msg.reply(t('adm.bot.toIsStatus'));
        return;
    }

    // -info, -test, -reset and -flush-email: alone (-reset accepts force; -reset and -flush-email accept -yes)
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

    // -flood [on|off|N[/seconds]]: the flood protection (settings flood.*)
    if (opts.given.has('flood')) {
        await msg.reply(await handleFlood([opts.opt.flood, ...opts.argv].filter(Boolean).join(' ')));
        return;
    }

    // -denied [on|off|reset|<text>]: the no-permission command notice (settings bot.denied.enabled and .message)
    if (opts.given.has('denied')) {
        await msg.reply(await handleNoticeDenied([opts.opt.denied, ...opts.argv].filter(Boolean).join(' ').trim()));
        return;
    }

    // -yes|-y confirms the -reset (no question) and makes the -flush-email delete; alone it means nothing
    const yes = opts.given.has('yes');
    if (yes && !opts.given.has('reset') && !opts.given.has('flush-email')) {
        await msg.reply(t('adm.bot.yesOnlyReset'));
        return;
    }

    const ALONE = ['info', 'test', 'reset', 'flush-email'];
    for (const alone of ALONE) {
        if (!opts.given.has(alone)) continue;
        const other = ALONE.filter(o => o !== alone);
        // The value of -reset: nothing or force (-flush-email has no value: -yes deletes)
        const valueAlt = alone === 'reset' ? opts.opt[alone] : null;
        const force = alone === 'reset' && /^force$/i.test(valueAlt ?? '');
        const combined = on || off || listAlt || opts.given.has('status') || other.some(o => opts.given.has(o)) || (yes && alone !== 'reset' && alone !== 'flush-email');
        if (combined || opts.argv.length || (valueAlt && !force)) {
            await msg.reply(t('adm.bot.noCombine', { option: alone }));
            return;
        }
        if (alone === 'info') await msg.reply(await infoText());
        else if (alone === 'test') {
            const notice = await msg.reply(t('adm.bot.testing'));
            await completeNotice(msg, notice, await testText());
        } else if (alone === 'flush-email') await cleanEmail(msg, { erase: yes });
        else await reset(msg, { chatId, full: force, sim: yes });
        return;
    }

    // -status [<time>|off] [-to ...]: the parser takes one value; "às 18h" leaves the rest in argv
    if (opts.given.has('status')) {
        if (on || off || listAlt) {
            await msg.reply(t('adm.bot.statusNoCombine'));
            return;
        }
        const values = [opts.opt.status, ...opts.argv].filter(Boolean);
        await handleStatus(msg, values, { destinationsText, withDestination, chat });
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
