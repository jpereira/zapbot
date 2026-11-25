/*
 * Comando /whois.
 */

const { ROLES, describeItem, chatScope, permissions } = require('./bot');
const { activeCommands } = require('./base');
const { ROLES: LEVEL } = require('../roles');
const { isOOwner, textItems } = require('./set');
const { client } = require('../client');
const { resolveLidToPhone, resolveGroupName } = require('../contacts');
const { describeRule, permissionHere } = require('../permissions');
const { resolveOrChoose } = require('../destinations');
const { t } = require('../i18n');
const { limitsWithUsage, usageLine } = require('../usageLimit');
const { getSetting } = require('../settings');

/*
 * /whois: who you are and what you can do in the bot, in this chat
 * /whois                → you (whoever typed)
 * /whois <person...>    → (owner and admins) other people: /Name/, @mention or +number
 * /whois, replying   → (owner and admins) who wrote the replied message
 * The level applies to the chat where the command was typed: a bot.users group
 * lets everyone in there, but not in each one's private chat. In a group, the
 * the phone of whoever is not in it is hidden, as in /bot.
 */

// Someone's level in this chat, from highest to lowest
async function levelAlt(numberAlt, { chatId, isGroup }) {
    const users = getSetting('bot.users');
    const soInGroups = users.filter(u => u.startsWith(`${numberAlt}:`))
        .map(u => u.slice(u.indexOf(':') + 1));
    if (isOOwner(numberAlt)) return `${ROLES.owner} ${t('whois.owner')}`;
    if (getSetting('bot.admins').includes(numberAlt)) return `${ROLES.admin} ${t('whois.admin')}`;
    if (users.includes(numberAlt)) return `${ROLES.user} ${t('whois.user')}`;
    if (users.includes('all')) return `${ROLES.user} ${t('whois.everyone')}`;
    if (isGroup && users.includes(chatId)) return `${ROLES.user} ${t('whois.userByGroup')}`;
    if (isGroup && soInGroups.includes(chatId)) return `${ROLES.user} ${t('whois.userInThisGroup')}`;

    // Only in other groups: says where
    if (soInGroups.length) {
        const groups = await Promise.all(soInGroups.map(async g => `👥 ${await resolveGroupName(g).catch(() => null) || g}`));
        return `${ROLES.none} ${t('whois.noneHere', { groups: groups.join(', ') })}`;
    }
    return `${ROLES.none} ${t('whois.none')}`;
}

// The phone of an id (the LID becomes the phone, if WhatsApp knows); null: I do not know
async function phoneAlt3(id) {
    const phoneAlt = id?.endsWith('@lid') ? await resolveLidToPhone(id) : id;
    return phoneAlt?.endsWith('@c.us') ? phoneAlt.split('@')[0] : null;
}

/**
 * The people in the text become phones (the number goes as it came, the name is
 * looked up in the contacts). Group and email are refused.
 * @returns {Promise<string[]|null>} null: already replied the error
 */
async function textPhones(msg, textAlt) {
    const numbers = [];

    for (const item of textItems(textAlt)) {
        if (/^\+?[\d\s().-]+$/.test(item)) {
            numbers.push(item.replace(/\D/g, ''));
            continue;
        }

        const person = await resolveOrChoose(msg, item, {
            noEmail: t('whois.noEmail')
        });
        if (!person) return null;

        if (person.group) {
            await msg.reply(t('whois.isGroup', { name: person.name }));
            return null;
        }

        const phoneAlt = await phoneAlt3(person.id);
        if (!phoneAlt) {
            await msg.reply(t('whois.unknownPhoneOf', { name: person.name }));
            return null;
        }
        numbers.push(phoneAlt);
    }

    return [...new Set(numbers)];
}

async function cmdWhois({ msg, opts, quotedMsg, senderNumber, chatId, isGroup, admin }) {
    const textAlt = opts.argv.join(' ').trim();
    const other = Boolean(textAlt || quotedMsg);

    // The others, only the owner and the admins: whoever uses the bot does not need to know everyone's level
    if (other && !admin) {
        await msg.reply(t('whois.ownerOnly'));
        return;
    }

    let numbers;
    let raw = null;   // the id as WhatsApp sent it (may be the @lid), of whoever typed or was replied to
    if (textAlt) {
        numbers = await textPhones(msg, textAlt);
        if (!numbers) return;
    } else if (quotedMsg) {
        const author = quotedMsg.fromMe
            ? client.info.wid._serialized
            : (quotedMsg.author || quotedMsg.from);
        raw = author;
        const phoneAlt = await phoneAlt3(author);
        if (!phoneAlt) {
            await msg.reply(t('whois.unknownPhoneAuthor'));
            return;
        }
        numbers = [phoneAlt];
    } else {
        // Yourself: the owner through the bot account; the others, by the sender's phone
        const eu = msg.fromMe ? client.info.wid.user : senderNumber;
        if (!eu) {
            await msg.reply(t('whois.unknownPhoneYou'));
            return;
        }
        numbers = [eu];
        raw = msg.fromMe ? client.info.wid._serialized : (msg.author || msg.from);
    }

    // -id: only the identifiers (the chat's and each person's), without the permission level
    if (opts.opt.id) {
        await msg.reply(listIds({ numbers, raw, chatId, isGroup }));
        return;
    }

    const chat = { chatId, isGroup };
    const scope = await chatScope(chat);
    const levels = await Promise.all(numbers.map(n => levelAlt(n, chat)));
    // User with a rule (/bot +cmd|-cmd): their commands here, below
    const linesAlt = await Promise.all(numbers.map(async (n, i) => {
        const { rules, can: canUse } = permissionHere({ number: n, chatId, isGroup });
        const user = levels[i].startsWith(ROLES.user);
        const commands = activeCommands().filter(c => c.role !== LEVEL.OWNER).map(c => c.cmd).sort();
        // And the usage limits (/bot +limit), with what has already been used
        const limits = user ? await limitsWithUsage({ number: n, chatId, isGroup }) : [];
        // What they can use here: the user's, by the rule; the admin's and the owner's, all (the owner's included)
        const allowed = user ? commands.filter(canUse) : [];
        const everything = levels[i].startsWith(ROLES.admin) || levels[i].startsWith(ROLES.owner);
        return `• ${levels[i]} · ${await describeItem(n, scope)}` +
            (user && rules.length ? `\n → ${rules.map(describeRule).join('; ')}` : '') +
            (user ? `\n ✅ ${t('whois.canUse', { n: allowed.length, list: allowed.join(', ') })}` : '') +
            (everything ? `\n ✅ ${t('whois.canUseAll', { n: levels[i].startsWith(ROLES.owner) ? activeCommands().length : commands.length })}` : '') +
            (limits.length ? `\n ⏱️ ${limits.map(usageLine).join('; ')}` : '');
    }));

    await msg.reply(`${t('whois.title', { n: numbers.length })}\n${linesAlt.join('\n')}\n\n` +
        permissions({
            owner: numbers.some(isOOwner),
            noPermission: levels.some(n => n.startsWith(ROLES.none))
        }) +
        '\n\n' + t('whois.helpHint'));
}

/*
 * /whois -id: the chat id (group, private) and each person's: the phone, the @c.us and, when the
 * WhatsApp sent, the @lid (the internal id, which is not the phone).
 */
function listIds({ numbers, raw, chatId, isGroup }) {
    const people = numbers.map(n => {
        const lid = numbers.length === 1 && raw?.endsWith('@lid') ? `\n  🔗 ${raw}` : '';
        return `• 📞 +${n}\n  🪪 ${n}@c.us${lid}`;
    });
    return `${t('whois.idsTitle')}\n` +
        `${isGroup ? '👥' : '💬'} ${t(isGroup ? 'whois.idGroup' : 'whois.idChat')}: ${chatId}\n` +
        people.join('\n');
}

module.exports = {
    cmdWhois,
    phoneAlt3,
    textPhones
};
