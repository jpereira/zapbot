/*
 * Comando /bot.
 */

const { findCommand, getCommandSyntax } = require('./base');
const { isOOwner, peopleItems } = require('./set');
const { client } = require('../client');
const { chatCurrentIds, resolveLidToPhone, groupResolverName } = require('../contacts');
const {
    describeDestination, describeDestinations, sendToDestinations, extractDestinations, resolverDestinations
} = require('../destinations');
const { waitConfirmation, authorAlt } = require('../choices');
const { GetOptFromCommand } = require('../options');
const { printInfo } = require('../log');
const { describeRule, recordRule, regraDe } = require('../permissions');
const {
    SETTINGS_SCHEMA, userCommand, getSetting, setSetting, validateSetting
} = require('../settings');
const { infoText } = require('../system');
const {
    schedulingDaily, scheduleStatusDaily, turnOffStatusDaily, statusDestinations, whereGoes,
    statusText
} = require('../status');
const { fmtWhen, readHour } = require('../util/when');

/*
 * /bot: the bot and who uses it (settings 'bot.paused', 'bot.admins' and 'bot.users')
 * /bot           → the status (the same as -status): the state, the 24 h report and who uses it
 * /bot -on|-off  → turns on and off: when off, ALL commands are ignored, except /bot
 * (the admin and user lists stay as they are)
 * /bot -users    → the users of this chat (in a group, those from there; in your private chat, all)
 * /bot -all-users → all users, in any chat (in a group, with the outside phones
 *                     escondidos)
 * /bot -reset    → back to default: on, no extra admins and no users (owner only)
 * Deleted-message recovery, /watch and the alerts keep working with it off.
 *
 * The IRC shortcuts (o: operator, commands; v: voice, only speaks), owner only, one at a time:
 * /bot +o|-o <person...>        → adds and removes admins (bot.admins)
 * /bot +v|-v <person|group...>  → adds and removes users (bot.users)
 * The person is /Name/, "Name", @mention or +number, as in -to. With nobody, the
 * the current chat: in a group, the group (which does not become admin); in someone's private chat, the person.
 * A person's +v typed in a group applies only in that group.
 *
 * And the report (src/status.js) and the versions (src/system.js), which do not match the others:
 * /bot -status (-s)         → the report now (the same as /bot with no option)
 * /bot -s 06h [-to <dest>]  → every day at 06:00 (Brasília), in your private chat or in the -to
 * /bot -s -to <dest>        → the report now, to the -to (people, groups, emails)
 * /bot -s off               → turns off the daily send
 * /bot -info (-i)           → versions (Node.js, whatsapp-web.js, Chromium...) and the system
 */
// Who uses the commands, by bot.users
function whoUses() {
    const users = getSetting('bot.users');
    const admins = getSetting('bot.admins').length ? ' e os admins' : '';
    if (users.includes('all')) {
        return '🔓 *Comandos:* todos usam os comuns\n' +
            '⚠️ _Atenção: qualquer pessoa pode executar os comandos comuns do bot, em qualquer chat. ' +
            'Para restringir: /set bot.users false (e depois /bot +v para liberar alguns)._';
    }
    if (!users.length) return `🔒 *Comandos:* só o dono${admins}`;
    return '👥 *Comandos:* o dono e quem está na lista abaixo';
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
 * only in a group ("phone:group", /bot +v typed in the group).
 */
function readItem(item) {
    const [numberAlt, soIn = null] = item.split(':');
    return { numero: numberAlt, soEm: soIn, ehGrupo: !soIn && item.endsWith('@g.us') };
}

/*
 * Who the list shows, by the chat where the command was typed:
 * - in your private chat (or with -all-users): everyone;
 * - in a group: who participates in it, the group itself and whoever only has permission in it;
 * - in someone's private chat: only that person.
 * members: in a group, the phones of whoever is in it; that of whoever is not leaves
 * hidden (with -all-users, everyone shows up, but without giving away the number
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
        return { chatId, membros: members, mostra: show, onde: 'deste grupo', aqui: 'neste grupo' };
    }

    const ids = chatId ? await chatCurrentIds(chatId) : [];
    if (allAlt2 || !chatId || ids.includes(client.info.wid._serialized)) {
        return { chatId, membros: null, mostra: null };
    }

    const phoneAlt = ids.find(i => i.endsWith('@c.us'))?.split('@')[0];
    const personAlt = (item) => readItem(item).numero === phoneAlt;
    return { chatId, membros: null, mostra: personAlt, onde: 'deste chat', aqui: 'neste chat' };
}

// 5521999982222 → 5521•••••2222 (the country code and area code stay, and the last 4)
const mask = (n) => `${n.slice(0, 4)}${'•'.repeat(Math.max(1, n.length - 8))}${n.slice(-4)}`;
const numberVisible = (n, members) => (members && !members.has(n) ? mask(n) : n);

// A phone's or group's name: the group's, the contact's or, for you, your profile's
async function itemName(item) {
    if (item.endsWith('@g.us')) return groupResolverName(item).catch(() => null);

    // You are rarely in your own address book: your profile name counts
    const contactAlt = await client.getContactById(`${item}@c.us`).catch(() => null);
    return contactAlt?.name || contactAlt?.pushname || (isOOwner(item) ? client.info.pushname : null);
}

// " · only in this group" or " · only in 👥 Amigos Faculdade" (the person is in a single group)
async function soInText(soIn, scope) {
    if (!soIn) return '';
    if (soIn === scope?.chatId) return ' · só neste grupo';
    return ` · só em 👥 ${await itemName(soIn) || soIn}`;
}

/*
 * An item as the rest of the bot shows a destination: "👤 Camila Gama · +5521988887777",
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
    if (soIn) return [`${ROLES.usuario} +v`];
    return [
        isOOwner(numberAlt) && `${ROLES.dono} dono`,
        admins.includes(item) && `${ROLES.admin} +o`,
        users.includes(item) && `${ROLES.usuario} +v`
    ].filter(Boolean);
}

/*
 * Admins (+o) and users (+v) in a single list: whoever is in both appears once
 * time, with both marks. First the admins, in each setting's order.
 * new ones: those who just joined (with ✅). tip: 'todos' (the -all-users, with
 * the care not to expose outsiders) or 'usuarios' (the -users, in the reply
 * do +o/+v).
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
    const asSee = tip === 'todos'
        ? `⚠️ _Para listar todos: /bot -all-users ou /bot -au. Cuidado: mostra também quem não é ${whereAlt}._`
        : '_Listar usuários: /bot -users ou /bot -u_';
    const footer = outside ? `\n\n💡 _Só quem é ${whereAlt}; mais ${outside} fora daqui._\n${asSee}` : '';
    const title = `*Usuários* (${items.length})${show ? ` ${here}` : ''}`;
    if (!items.length) return `${title}\n_Ninguém ${whereAlt}._${footer}`;

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
    return '*Permissões*\n' +
        (owner ? `${ROLES.dono} dono: você, que já usa tudo\n` : '') +
        `${ROLES.admin} +o: admin, usa tudo\n` +
        `${ROLES.usuario} +v: usuário, usa os comandos comuns` +
        (withoutPermission ? `\n${ROLES.nenhum} sem permissão: o bot ignora os comandos dela` : '');
}

// On or off, and who uses the commands
const botState = () => (getSetting('bot.paused')
    ? '⏸️ *Bot:* desligado (todos os comandos são ignorados)'
    : '▶️ *Bot:* ativo') + '\n' + whoUses();

const MORE_INFORMATION = 'ℹ️ _Mais informações em /bot -h_';

// The -users and -all-users list (with nobody in it, the line of who uses the commands)
async function usersText(chat) {
    return await usersList(await chatScope(chat)) || whoUses();
}

// /bot without an option and -status: the state at the top, the report, the users and the daily send
async function report(chat) {
    const usersAlt = await usersList(await chatScope(chat));
    const textAlt = await statusText(Date.now(), { estadoDoBot: botState(), usuarios: usersAlt });
    return `${textAlt}\n\n${MORE_INFORMATION}`;
}

// +o/-o (bot.admins), +v/-v (bot.users) and +cmd/-cmd (each user's commands), in any
// ordem
const SHORTCUT = /(^|\s)[+-](o|v|cmd)(?=\s|$)/;
const OPERATION = /(^|\s)([+-])([ov])(?=\s|$)/;
const OPTION_CMD = /(^|\s)([+-])cmd(?:\s+((?:[^\s+-]\S*,\s*)*[^\s+-]\S*))?(?=\s|$)/;
const SHORTCUT_LIST = { o: 'bot.admins', v: 'bot.users' };

/*
 * The shortcut text: the operation (+o/-o/+v/-v), +cmd/-cmd and its commands,
 * -all-users (the reply with everyone; -users is the normal one) and the rest (who).
 */
function readShortcut(textAlt) {
    let rest = ` ${textAlt} `;
    const remove = (re) => {
        const m = rest.match(re);
        if (m) rest = rest.slice(0, m.index) + m[1] + rest.slice(m.index + m[0].length);
        return m;
    };
    const allAlt2 = Boolean(remove(/(^|\s)-(?:au|all-users)(?=\s|$)/));
    remove(/(^|\s)-(?:u|users)(?=\s|$)/);
    const cmd = remove(OPTION_CMD);
    const op = remove(OPERATION);
    return {
        op: op ? { sinal: op[2], letra: op[3] } : null,
        cmd: cmd ? { sinal: cmd[2], texto: cmd[3] ?? '' } : null,
        todos: allAlt2,
        quem: rest.trim()
    };
}

// "/cotacao,/crypto meme" → ['/cotacao', '/crypto', '/meme']; "all" → ['all']; invalid: throws
function readCommands(textAlt) {
    const names = textAlt.split(/[\s,]+/).filter(Boolean);
    if (!names.length) throw new Error('informe os comandos, separados por vírgula: +cmd /cotacao,/meme');
    if (names.length === 1 && /^all$/i.test(names[0])) return ['all'];
    return [...new Set(names.map(userCommand))];
}
const WHO = { 'bot.admins': { um: 'admin', varios: 'admins' }, 'bot.users': { um: 'usuário', varios: 'usuários' } };

/*
 * Nobody, the chat where the command was typed: in a group, the group; in the
 * someone's private chat, the person (by phone). In your private chat, there is no one.
 * @returns {Promise<string[]|null>} null: already replied the error
 */
async function chatItems(msg, key, { chatId, isGroup }) {
    if (isGroup) {
        if (key === 'bot.users') return [chatId];
        await msg.reply('❌ Um grupo não pode ser admin (todos ali mandariam no bot).\n' +
            '💡 _Para liberar os comandos comuns neste grupo: /bot +v_');
        return null;
    }

    const ids = await chatCurrentIds(chatId);
    if (ids.includes(client.info.wid._serialized)) {
        await msg.reply('❌ Este é o seu privado: você (o dono) já usa tudo.\n' +
            '💡 _Use num grupo ou no privado de alguém, ou informe quem: /bot +v /Nome/_');
        return null;
    }

    const phoneAlt = ids.find(i => i.endsWith('@c.us'));
    if (!phoneAlt) {
        await msg.reply('❌ Não sei o telefone desta pessoa (o WhatsApp só informou o id interno): use o número, ex.: /bot +v +5521999999999.');
        return null;
    }
    return [phoneAlt.split('@')[0]];
}

/*
 * The text's items (names, mentions, numbers, groups), already validated. In a
 * group, a person's +v applies only in that group ("phone:group").
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
        await msg.reply('❌ Informe quem: /nome/, @menção, +número ou /grupo/.');
        return null;
    }

    const soInGroup = key === 'bot.users' && isGroup;
    return items.map(i => (soInGroup && !i.endsWith('@g.us') ? `${i}:${chatId}` : i));
}

/*
 * What comes out with -v: in a group, their permission (or, without it, the general one); in the
 * private, all of the person's (the general one and each group's).
 */
function aRemove(item, current, { isGroup }) {
    const { numero: numberAlt, soEm: soIn } = readItem(item);
    if (soIn && isGroup) return current.includes(item) ? [item] : current.filter(i => i === numberAlt);
    if (readItem(item).ehGrupo) return current.filter(i => i === item);
    return current.filter(i => readItem(i).numero === numberAlt);
}

/*
 * +o|-o|+v|-v: changes the list and replies with this chat's list (those who joined,
 * with ✅; those that left, in a 🗑️ line on top). Those that entered and do not appear
 * on the list here get a ✅ line on top.
 */
async function changeList(msg, key, items, append, chat) {
    const current = getSetting(key);
    const who = WHO[key];
    const scope = await chatScope(chat);
    const short = (list) => Promise.all(list.map(i => describeItem(i, scope)));

    if (append && current.includes('all')) {
        await msg.reply('❌ Todos já usam os comandos comuns (/set bot.users true). ' +
            'Para liberar só alguns: /set bot.users false antes.');
        return;
    }

    let freshAlt3;
    let removed = [];
    if (append) {
        // Already has it: the item itself or, for whoever would only gain a group, the general permission
        freshAlt3 = items.filter(i => !current.includes(i) && !current.includes(readItem(i).numero));
        if (!freshAlt3.length) {
            await msg.reply(`ℹ️ Já é ${who.um}: ${(await short(items)).join(', ')}.`);
            return;
        }
        await setSetting(key, [...current, ...freshAlt3]);
        // Whoever joins starts with no rule (an old one, from before leaving through /set, does not come back)
        if (key === 'bot.users') for (const i of freshAlt3) await recordRule(i, null);
    } else {
        removed = [...new Set(items.flatMap(i => aRemove(i, current, chat)))];
        if (!removed.length) {
            await msg.reply(`❌ Não é ${who.um}: ${(await short(items)).join(', ')}.\n💡 _Veja com /bot -users_`);
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
 * +cmd|-cmd: each user's rule. Together with +v, defines the rule:
 * +v +cmd /a,/b = only those; +v -cmd /a = all, except that one. Alone:
 * +cmd: whoever is not a user enters only with these; "Only" gains these; "All,
 * except" lets those in again; whoever uses all stays as is; all deletes the rule;
 * -cmd: "Only" loses these (the last one, no: that is -v); whoever uses all stays
 *         "Todos, menos" esses; "Todos, menos" ganha esses.
 * In a group, the person is the one there ("phone:group") or, without it, the one from any chat.
 */
async function changeCommands(msg, items, { sinal: signalAlt, comandos: commands, comV: withV }, chat) {
    const users = getSetting('bot.users');
    if (users.includes('all')) {
        await msg.reply('❌ Todos já usam os comandos comuns (/set bot.users true). ' +
            'Para liberar só alguns: /set bot.users false antes.');
        return;
    }

    const scope = await chatScope(chat);
    const all = commands.includes('all');
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
            else if (!rule) {
                notices.push(`ℹ️ ${who} já usa todos os comandos comuns.`);
                continue;
            } else if (rule.apenas) fresh = { apenas: true, comandos: union };
            else fresh = leftOver.length ? { apenas: false, comandos: leftOver } : null;
        } else {
            if (!isUser) {
                notices.push(`❌ Não é usuário: ${who}.`);
                continue;
            }
            if (all || (rule?.apenas && !leftOver.length)) {
                notices.push(`❌ Não sobraria comando para ${who}: para tirar a pessoa, /bot -v; para liberar todos, /bot +cmd all.`);
                continue;
            }
            if (!rule) fresh = { apenas: false, comandos: commands };
            else fresh = rule.apenas ? { apenas: true, comandos: leftOver } : { apenas: false, comandos: union };
        }

        const same = JSON.stringify(fresh) === JSON.stringify(rule);
        if (isUser && same) {
            notices.push(`ℹ️ Nada mudou: ${who}${rule ? ` (${describeRule(rule)})` : ''}.`);
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
    const key = SHORTCUT_LIST[op?.letra ?? 'v'];
    const chat = { ...chatCurrent, todos: allAlt2 };

    // Owner only: an extra admin promotes nobody (not even themselves)
    if (!msg.fromMe) {
        await msg.reply(`⛔ Só o dono do bot põe e tira ${WHO[key].varios}.`);
        return;
    }

    // +cmd|-cmd belongs to users: with +o/-o or -v, no
    if (cmd && op && (op.letra === 'o' || op.sinal === '-')) {
        await msg.reply('❌ O +cmd|-cmd vale só para usuários: /bot +v +cmd /cotacao /Fulano/ ou /bot -cmd /meme /Fulano/.');
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
            await msg.reply('❌ Para tirar todos os comandos, tire a pessoa: /bot -v.');
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
        await sendToDestinations(destinations, textAlt, { assunto: '📊 Status do ZapBot' })
            .then(() => msg.reply(`📊 Status enviado em ${describeDestinations(destinations)}.`))
            .catch(err => msg.reply(`❌ Não consegui enviar o status: ${err.message}`));
        return;
    }

    if (values.length === 1 && values[0].toLowerCase() === 'off') {
        if (destinations) {
            await msg.reply('❌ O -to não vale com o off: /bot -status off desliga o envio diário.');
            return;
        }
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

    const next = await scheduleStatusDaily(hour, Date.now(), destinations);
    const two = (n) => String(n).padStart(2, '0');
    const whereAlt = whereGoes(statusDestinations(await schedulingDaily()));
    await msg.reply(`⏰ *Status diário:* todo dia às *${two(hour.h)}:${two(hour.m)}*${whereAlt}\n📅 Próximo: ${fmtWhen(next)}`);
}

// What -reset puts back to default (the daily send of -status stays)
const DO_RESET = ['bot.paused', 'bot.admins', 'bot.users', 'bot.users.cmds'];

// Quanto tempo o -reset espera o "sim"
const CONFIRM_RESET_MS = 10_000;

// -reset: asks first (reply "sim" within 10 s); with force, goes straight back
async function reset(msg, { chatId, forcar: force }) {
    if (!msg.fromMe) {
        await msg.reply('⛔ Só o dono do bot volta o /bot ao padrão.');
        return;
    }

    if (!force) {
        const seconds = CONFIRM_RESET_MS / 1000;
        await msg.reply('⚠️ *Voltar ao padrão?* O bot fica ligado, sem admins extras e sem usuários.\n' +
            `💡 _Responda *sim* em ${seconds} s para confirmar (ou /bot -r force, sem perguntar)._`);
        const confirmed = await waitConfirmation(chatId, {
            ms: CONFIRM_RESET_MS,
            autor: authorAlt(msg),
            aoExpirar: () => msg.reply(`⌛ Nada mudou: sem *sim* em ${seconds} s.`)
        });
        if (confirmed === false) await msg.reply('👍 Nada mudou.');
        if (!confirmed) return;
    }

    for (const key of DO_RESET) await setSetting(key, SETTINGS_SCHEMA[key].default);
    printInfo('/bot -reset: admins, usuários e bot.paused de volta ao padrão');
    await msg.reply(`♻️ *Padrão restaurado:* bot ligado, sem admins extras e sem usuários.\n\n${botState()}`);
}

const USAGE = '❌ Uso: /bot [-on|-off] [-users|-all-users]  ou  ' +
    '/bot +o|-o|+v|-v [+cmd|-cmd <comandos>] [pessoa...] [-all-users]  ou  /bot -reset [force]  ou  ' +
    '/bot -status [<hora>|off] [-to <destino>]...  ou  /bot -info\n💡 _/bot -h para ajuda_';

async function cmdBot({ msg, opts: commandOpts, args, chatId, isGroup }) {
    if (SHORTCUT.test(String(args ?? ''))) {
        await handleShortcut(msg, String(args).trim(), { chatId, isGroup });
        return;
    }

    // -to accepts spaces (/Grupo L200/), which the option parser would split: it goes out first
    const { destinos: destinationsText, informado: withDestination, resto: rest } = extractDestinations(args);
    const opts = withDestination ? GetOptFromCommand(rest, findCommand('/bot')) : commandOpts;
    const { on, off } = opts.opt;
    const allAlt2 = opts.given.has('all-users');
    const listAlt = allAlt2 || opts.given.has('users');
    const chat = { chatId, isGroup, todos: allAlt2 };

    if (withDestination && !opts.given.has('status')) {
        await msg.reply('❌ O -to é do -status: /bot -status [<hora>] -to <destino>');
        return;
    }

    // -info and -reset: alone (-reset accepts force, which does not ask)
    for (const alone of ['info', 'reset']) {
        if (!opts.given.has(alone)) continue;
        const other = alone === 'info' ? 'reset' : 'info';
        // The value of -reset: nothing or force
        const valueAlt = alone === 'reset' ? opts.opt.reset : null;
        const force = /^force$/i.test(valueAlt ?? '');
        const combined = on || off || listAlt || opts.given.has('status') || opts.given.has(other);
        if (combined || opts.argv.length || (valueAlt && !force)) {
            await msg.reply(`❌ O -${alone} não combina com as outras opções.\n💡 _/bot -${alone}_`);
            return;
        }
        if (alone === 'info') await msg.reply(await infoText());
        else await reset(msg, { chatId, forcar: force });
        return;
    }

    // -status [<time>|off] [-to ...]: the parser takes one value; "às 18h" leaves the rest in argv
    if (opts.given.has('status')) {
        if (on || off || listAlt) {
            await msg.reply('❌ O -status não combina com as outras opções.\n💡 _/bot -status [<hora>|off] [-to <destino>]_');
            return;
        }
        const values = [opts.opt.status, ...opts.argv].filter(Boolean);
        await handleStatus(msg, values, { destinosTexto: destinationsText, comDestino: withDestination, chat });
        return;
    }

    if (opts.argv.length || (on && off)) {
        await msg.reply(USAGE);
        return;
    }

    // -on|-off: only turns on and off (the lists stay); -users|-all-users: the users
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
