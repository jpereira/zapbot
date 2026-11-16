/*
 * Comando /whois.
 */

const { ROLES, describeItem, chatScope, permissions } = require('./bot');
const { isOOwner, textItems } = require('./set');
const { client } = require('../client');
const { resolveLidToPhone, groupResolverName } = require('../contacts');
const { describeRule, permissionHere } = require('../permissions');
const { resolverOrChoose } = require('../destinations');
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
    if (isOOwner(numberAlt)) return `${ROLES.dono} ${t('whois.owner')}`;
    if (getSetting('bot.admins').includes(numberAlt)) return `${ROLES.admin} ${t('whois.admin')}`;
    if (users.includes(numberAlt)) return `${ROLES.usuario} ${t('whois.user')}`;
    if (users.includes('all')) return `${ROLES.usuario} ${t('whois.everyone')}`;
    if (isGroup && users.includes(chatId)) return `${ROLES.usuario} ${t('whois.userByGroup')}`;
    if (isGroup && soInGroups.includes(chatId)) return `${ROLES.usuario} ${t('whois.userInThisGroup')}`;

    // Only in other groups: says where
    if (soInGroups.length) {
        const groups = await Promise.all(soInGroups.map(async g => `👥 ${await groupResolverName(g).catch(() => null) || g}`));
        return `${ROLES.nenhum} ${t('whois.noneHere', { groups: groups.join(', ') })}`;
    }
    return `${ROLES.nenhum} ${t('whois.none')}`;
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

        const person = await resolverOrChoose(msg, item, {
            semEmail: t('whois.noEmail')
        });
        if (!person) return null;

        if (person.grupo) {
            await msg.reply(t('whois.isGroup', { name: person.nome }));
            return null;
        }

        const phoneAlt = await phoneAlt3(person.id);
        if (!phoneAlt) {
            await msg.reply(t('whois.unknownPhoneOf', { name: person.nome }));
            return null;
        }
        numbers.push(phoneAlt);
    }

    return [...new Set(numbers)];
}

async function cmdWhois({ msg, args, quotedMsg, senderNumber, chatId, isGroup, admin }) {
    const textAlt = String(args ?? '').trim();
    const other = Boolean(textAlt || quotedMsg);

    // The others, only the owner and the admins: whoever uses the bot does not need to know everyone's level
    if (other && !admin) {
        await msg.reply(t('whois.ownerOnly'));
        return;
    }

    let numbers;
    if (textAlt) {
        numbers = await textPhones(msg, textAlt);
        if (!numbers) return;
    } else if (quotedMsg) {
        const author = quotedMsg.fromMe
            ? client.info.wid._serialized
            : (quotedMsg.author || quotedMsg.from);
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
    }

    const chat = { chatId, isGroup };
    const scope = await chatScope(chat);
    const levels = await Promise.all(numbers.map(n => levelAlt(n, chat)));
    // User with a rule (/bot +cmd|-cmd): their commands here, below
    const linesAlt = await Promise.all(numbers.map(async (n, i) => {
        const { regras: rules } = permissionHere({ numero: n, chatId, isGroup });
        const user = levels[i].startsWith(ROLES.usuario);
        // And the usage limits (/bot +limit), with what has already been used
        const limits = user ? await limitsWithUsage({ numero: n, chatId, isGroup }) : [];
        return `• ${levels[i]} · ${await describeItem(n, scope)}` +
            (user && rules.length ? `\n → ${rules.map(describeRule).join('; ')}` : '') +
            (limits.length ? `\n ⏱️ ${limits.map(usageLine).join('; ')}` : '');
    }));

    await msg.reply(`${t('whois.title', { n: numbers.length })}\n${linesAlt.join('\n')}\n\n` +
        permissions({
            dono: numbers.some(isOOwner),
            semPermissao: levels.some(n => n.startsWith(ROLES.nenhum))
        }) +
        '\n\n' + t('whois.helpHint'));
}

module.exports = {
    cmdWhois,
    phoneAlt3,
    textPhones
};
