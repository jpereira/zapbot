/*
 * /welcome and /goodbye: the message the bot sends in the group when someone joins (group_join) or leaves
 * (group_leave). Each group has its own, in the `group_greetings` table; without its own text, the default applies
 * of the language. {name} is the person (on join, a mention) and {group}, the group name.
 */

const { client } = require('./client');
const { scheduleName, contactName, groupResolverName } = require('./contacts');
const { dbGet, dbReady, dbRun } = require('./db');
const { t } = require('./i18n');
const { printError, printInfo } = require('./log');

const TYPES = {
    welcome: { evento: 'group_join', padrao: 'saudacoes.welcomeDefault' },
    goodbye: { evento: 'group_leave', padrao: 'saudacoes.goodbyeDefault' }
};

const MAX_CHARACTERS = 1000;

// { text: string|null } (null: the language default) or null (off in this group)
async function readGreeting(chatId, type) {
    await dbReady;
    const line = await dbGet('SELECT text FROM group_greetings WHERE chat_id = ? AND kind = ?', [chatId, type]);
    return line ? { text: line.text } : null;
}

async function recordGreeting(chatId, type, textAlt) {
    await dbReady;
    await dbRun(
        `INSERT INTO group_greetings (chat_id, kind, text) VALUES (?, ?, ?)
         ON CONFLICT(chat_id, kind) DO UPDATE SET text = excluded.text`,
        [chatId, type, textAlt]
    );
}

async function deleteGreeting(chatId, type) {
    await dbReady;
    await dbRun('DELETE FROM group_greetings WHERE chat_id = ? AND kind = ?', [chatId, type]);
}

// The final text: {name} and {group} replaced (the language default, with no text of its own)
function assembleText(type, greeting, { nome: nameAlt, grupo: group }) {
    const modelAlt = greeting.text ?? t(TYPES[type].padrao);
    return modelAlt.replace(/\{name\}/g, nameAlt).replace(/\{group\}/g, group);
}

// Who joined/left: the mention (@number) on joining and the address book name on leaving
async function nameAltAlt(id, mention) {
    if (mention) return `@${id.split('@')[0]}`;
    const contactAlt = await client.getContactById(id).catch(() => null);
    return (contactAlt && (scheduleName(contactAlt) || contactName(contactAlt))) || `+${id.split('@')[0]}`;
}

/**
 * Sends the group greeting to each person in the event (if the group has one turned on).
 * @param {'welcome'|'goodbye'} tipo
 * @param {{ chatId: string, recipientIds?: string[] }} notificacao  the whatsapp-web.js GroupNotification
 */
async function greet(type, notification) {
    try {
        const chatId = notification.chatId;
        const greeting = await readGreeting(chatId, type);
        if (!greeting) return;

        const souEu = client.info?.wid?._serialized;
        const people = (notification.recipientIds ?? []).filter(id => id !== souEu);
        if (!people.length) return;

        const group = (await groupResolverName(chatId).catch(() => null)) ?? chatId.split('@')[0];
        for (const id of people) {
            const textAlt = assembleText(type, greeting, { nome: await nameAltAlt(id, type === 'welcome'), grupo: group });
            await client.sendMessage(chatId, textAlt, type === 'welcome' ? { mentions: [id] } : {});
            printInfo(`/${type}: ${id} em ${group}`);
        }
    } catch (err) {
        printError(`/${type}: falhou:`, err.message);
    }
}

for (const [type, { evento: event }] of Object.entries(TYPES)) {
    client.on(event, (notification) => greet(type, notification));
}

module.exports = {
    MAX_CHARACTERS,
    TYPES,
    deleteGreeting,
    recordGreeting,
    readGreeting,
    assembleText,
    greet
};
