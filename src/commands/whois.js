/*
 * Comando /whois.
 */

const { ROLES, describeItem, chatScope, captionAlt } = require('./bot');
const { isOOwner, textItems } = require('./set');
const { client } = require('../client');
const { resolveLidToPhone } = require('../contacts');
const { resolverOrChoose } = require('../destinations');
const { getSetting } = require('../settings');

/*
 * /whois (/who, /id): who you are and what you can do in the bot, in this chat
 * /whois                → you (whoever typed)
 * /whois <person...>    → (owner and admins) other people: /Name/, @mention or +number
 * /whois, replying   → (owner and admins) who wrote the replied message
 * The level applies to the chat where the command was typed: a bot.users group
 * lets everyone in there, but not in each one's private chat. In a group, the
 * the phone of whoever is not in it is hidden, as in /bot.
 */

// Someone's level in this chat, from highest to lowest
function levelAlt(numberAlt, { chatId, isGroup }) {
    const users = getSetting('bot.users');
    if (isOOwner(numberAlt)) return `${ROLES.dono} dono`;
    if (getSetting('bot.admins').includes(numberAlt)) return `${ROLES.admin} +o`;
    if (users.includes(numberAlt)) return `${ROLES.usuario} +v`;
    if (users.includes('all')) return `${ROLES.usuario} todos (bot.users true)`;
    if (isGroup && users.includes(chatId)) return `${ROLES.usuario} +v pelo grupo`;
    return `${ROLES.nenhum} sem permissão`;
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
            semEmail: '❌ O /whois é de pessoas: informe um contato, uma menção ou um número, não um e-mail.'
        });
        if (!person) return null;

        if (person.grupo) {
            await msg.reply(`❌ ${person.nome} é um grupo: o /whois é de pessoas.\n💡 _Para ver quem usa o bot no grupo: /bot_`);
            return null;
        }

        const phoneAlt = await phoneAlt3(person.id);
        if (!phoneAlt) {
            await msg.reply(`❌ Não sei o telefone de ${person.nome} (o WhatsApp só informou o id interno): use o número, ex.: /whois +5521999999999.`);
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
        await msg.reply('⛔ Só o dono do bot (e os admins) vê o nível dos outros.\n💡 _/whois sozinho mostra o seu._');
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
            await msg.reply('❌ Não sei o telefone de quem escreveu essa mensagem (o WhatsApp só informou o id interno).');
            return;
        }
        numbers = [phoneAlt];
    } else {
        // Yourself: the owner through the bot account; the others, by the sender's phone
        const eu = msg.fromMe ? client.info.wid.user : senderNumber;
        if (!eu) {
            await msg.reply('❌ Não sei o seu telefone (o WhatsApp só informou o id interno).');
            return;
        }
        numbers = [eu];
    }

    const chat = { chatId, isGroup };
    const { membros: members } = await chatScope(chat);
    const levels = numbers.map(n => levelAlt(n, chat));
    const linesAlt = await Promise.all(numbers.map(async (n, i) =>
        `• ${levels[i]} · ${await describeItem(n, members)}`));

    await msg.reply(`*Quem é?* (${numbers.length})\n${linesAlt.join('\n')}\n` +
        captionAlt({
            dono: numbers.some(isOOwner),
            semPermissao: levels.some(n => n.startsWith(ROLES.nenhum))
        }) +
        '\n\nDigite /help para saber quais comandos estão disponíveis.');
}

module.exports = {
    cmdWhois
};
