/*
 * /search (/buscar) command: searches the WhatsApp history (not only the bot cache).
 */

const { client } = require('../client');
const { getCommandSyntax } = require('./base');
const { chatCurrentIds, contactName } = require('../contacts');
const { t } = require('../i18n');
const { printError } = require('../log');
const { formatData, paraMs, plural } = require('../util/format');

/*
 * /search [-N] <texto>
 * WhatsApp Web's own search (client.searchMessages): the messages that the
 * WhatsApp Web has, including those that never went through the bot cache. In this
 * chat; in your private chat, in all chats. Without -N, the 10 most recent.
 *
 * /search -read|-r <id>
 * Shows in full the message of a search-list id (same scope as the search).
 */
const DEFAULT = 10;
const MAX = 50;
const SNIPPET = 200;

// "Fulano" from an id, without repeating the lookup for the same id
async function nameAltAlt(id, cache) {
    if (!cache.has(id)) {
        cache.set(id, client.getContactById(id)
            .then(c => contactName(c) || id.split('@')[0])
            .catch(() => id.split('@')[0]));
    }
    return cache.get(id);
}

async function chatNameAlt(id, cache) {
    if (!cache.has(id)) {
        cache.set(id, client.getChatById(id).then(c => c.name || id.split('@')[0]).catch(() => id.split('@')[0]));
    }
    return cache.get(id);
}

// The message text (the caption, on a media), on one line and short
function snippet(m) {
    const textAlt = String(m.body ?? '').replace(/\s+/g, ' ').trim();
    const short = textAlt.length > SNIPPET ? `${textAlt.slice(0, SNIPPET)}…` : textAlt;
    return m.hasMedia ? `📎 _[${m.type}]_${short ? ` "${short}"` : ''}` : `"${short}"`;
}

// -read <id>: the whole message, without cutting the text
async function readMessage({ msg, id, chatId, todos: allAlt2 }) {
    let foundAlt;
    try {
        foundAlt = await client.getMessageById(id);
    } catch (err) {
        printError(`/search -read "${id}":`, err.message);
        await msg.reply(t('search.readFailed', { error: err.message }));
        return;
    }

    // Outside your private chat, only this chat's messages
    if (!foundAlt || (!allAlt2 && (foundAlt.id?.remote ?? foundAlt.from) !== chatId)) {
        await msg.reply(t('search.notFound', { id, where: allAlt2 ? t('search.noChat') : t('search.thisChat') }));
        return;
    }

    const who = foundAlt.fromMe ? t('search.you') : await nameAltAlt(foundAlt.author || foundAlt.from, new Map());
    const chat = allAlt2 ? ` · 💬 ${await chatNameAlt(foundAlt.id?.remote ?? foundAlt.from, new Map())}` : '';
    const textAlt = String(foundAlt.body ?? '').trim();
    const mediaAlt = foundAlt.hasMedia ? `📎 _[${foundAlt.type}]_${textAlt ? '\n' : ''}` : '';

    await msg.reply(`📅 ${formatData(foundAlt.timestamp)}${chat} · 👤 ${who}\n\n${mediaAlt}${textAlt}`,
        null, { linkPreview: false });
}

async function cmdSearch({ msg, opts, chatId }) {
    const idLido = opts.opt.read;
    if (idLido) {
        const allAlt2 = (await chatCurrentIds(chatId)).includes(client.info.wid._serialized);
        await readMessage({ msg, id: String(idLido).trim(), chatId, todos: allAlt2 });
        return;
    }

    // "-20" is not a declared option: it comes in argv, together with the text
    let n = null;
    const words = [];
    for (const a of opts.argv.filter(Boolean)) {
        const m = a.match(/^-(\d+)$/);
        if (m && n === null && Number(m[1]) >= 1) n = Number(m[1]);
        else words.push(a);
    }

    const textAlt = words.join(' ').trim();
    if (!textAlt) {
        await msg.reply('```' + getCommandSyntax('/search') + '```');
        return;
    }

    let notice = '';
    n ??= DEFAULT;
    if (n > MAX) {
        notice = '\n' + t('search.limited', { max: MAX });
        n = MAX;
    }

    // In your private chat, all chats; in the others, only this one
    const allAlt2 = (await chatCurrentIds(chatId)).includes(client.info.wid._serialized);

    let foundAlt3;
    try {
        foundAlt3 = await client.searchMessages(textAlt, { page: 1, limit: n, ...(allAlt2 ? {} : { chatId }) });
    } catch (err) {
        printError(`/search "${textAlt}":`, err.message);
        await msg.reply(t('search.failed', { error: err.message }));
        return;
    }

    // The /search message itself also has the text
    foundAlt3 = foundAlt3.filter(m => m.id?._serialized !== msg.id?._serialized);
    const whereAlt = allAlt2 ? t('search.noChat') : t('search.thisChat');
    if (!foundAlt3.length) {
        await msg.reply(t('search.nothing', { text: textAlt, where: whereAlt }));
        return;
    }

    foundAlt3.sort((a, b) => paraMs(b.timestamp) - paraMs(a.timestamp));

    const names = new Map();
    const chats = new Map();
    const linesAlt = await Promise.all(foundAlt3.map(async (m, i) => {
        const who = m.fromMe ? t('search.you') : await nameAltAlt(m.author || m.from, names);
        const chat = allAlt2 ? ` · 💬 ${await chatNameAlt(m.id?.remote ?? m.from, chats)}` : '';
        return `${i + 1}. 📅 ${formatData(m.timestamp)}${chat} · 👤 ${who}\n   ${snippet(m)}` +
            `\n   🆔 ${m.id?._serialized}`;
    }));

    await msg.reply(t('search.header', { count: plural(foundAlt3.length, t('search.message'), t('search.messages')), text: textAlt }) +
        `${allAlt2 ? ' ' + t('search.allChats') : ''}${notice}\n\n${linesAlt.join('\n\n')}` +
        (foundAlt3.length >= n ? '\n\n' + t('search.more') : '') +
        '\n\n' + t('search.readHint'),
    null, { linkPreview: false });
}

module.exports = {
    cmdSearch
};
