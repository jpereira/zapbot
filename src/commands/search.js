/*
 * /search command: searches the WhatsApp history (not only the bot cache).
 */

const { client } = require('../client');
const { commandUsage } = require('./base');
const { chatCurrentIds, contactName } = require('../contacts');
const { t } = require('../i18n');
const { printError } = require('../log');
const { ROLES } = require('../roles');
const { formatData, toMillis, plural } = require('../util/format');

/*
 * /search [-N] <text>
 * WhatsApp Web's own search (client.searchMessages): the messages that the
 * WhatsApp Web has, including those that never went through the bot cache. In this
 * chat; in your private chat, in all chats. Without -N, the 10 most recent.
 *
 * /search -read|-r <id>
 * Shows in full the message of a search-list id (same scope as the search).
 */
const DEFAULT = 10;
const LIST_MS_VALIDITY = 2 * 60 * 60 * 1000; // -read <no.> works for the last search of up to 2 h
const MAX = 50;
const SNIPPET = 200;

// The /search command you typed earlier and the list the bot replied: just noise in another search
const searchPreviousIs = (m) => m.fromMe && /^\s*(\/search\b|🔎 )/i.test(String(m.body ?? ''));

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

// The ids of each chat's last search, so -read accepts the list number (the whole id is huge)
const lastSearches = new Map();

// "3" → the id of the 3rd result of the last search in this chat; a whole id passes as is
function resultId(request, chatId) {
    if (!/^\d{1,3}$/.test(request)) return { id: request };
    const last = lastSearches.get(chatId);
    if (!last || Date.now() - last.when > LIST_MS_VALIDITY) return { error: t('search.noList') };
    const id = last.ids[Number(request) - 1];
    return id ? { id } : { error: t('search.outOfList', { n: request, max: last.ids.length }) };
}

// -read <no.|id>: the whole message, without cutting the text
async function readMessage({ msg, id, chatId, all: allAlt2 }) {
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

async function cmdSearch({ msg, opts, chatId, level }) {
    const idRead = opts.opt.read;
    if (idRead) {
        const allAlt2 = (await chatCurrentIds(chatId)).includes(client.info.wid._serialized);
        const { id, error: errorAlt } = resultId(String(idRead).trim(), chatId);
        if (errorAlt) {
            await msg.reply(errorAlt);
            return;
        }
        await readMessage({ msg, id, chatId, all: allAlt2 });
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
        await msg.reply(commandUsage('/search'));
        return;
    }

    let notice = '';
    n ??= DEFAULT;
    if (n > MAX) {
        notice = '\n' + t('search.limited', { max: MAX });
        n = MAX;
    }

    // In your private chat, all chats; in the others, only this one. With -all, all chats from anywhere, but
    // the reply goes to your private chat (in a conversation or a group it would leak what belongs to other chats)
    const myId = client.info.wid._serialized;
    const inMyPrivate = (await chatCurrentIds(chatId)).includes(myId);
    const inAll = opts.given.has('all');
    if (inAll && level !== ROLES.OWNER) {
        await msg.reply(t('search.allOwnerOnly'));
        return;
    }
    const allAlt2 = inMyPrivate || inAll;
    const toPrivate = inAll && !inMyPrivate;

    let foundAlt3;
    try {
        foundAlt3 = await client.searchMessages(textAlt, { page: 1, limit: n, ...(allAlt2 ? {} : { chatId }) });
    } catch (err) {
        printError(`/search "${textAlt}":`, err.message);
        await msg.reply(t('search.failed', { error: err.message }));
        return;
    }

    // The /search message itself also has the text, and so do the previous searches (the command and the list)
    foundAlt3 = foundAlt3.filter(m => m.id?._serialized !== msg.id?._serialized && !searchPreviousIs(m));
    const whereAlt = allAlt2 ? t('search.noChat') : t('search.thisChat');
    if (!foundAlt3.length) {
        // In a chat that is not your private chat, the search only looked at it: reminds about -all
        await msg.reply(t('search.nothing', { text: textAlt, where: whereAlt }) + (allAlt2 ? '' : `\n${t('search.allHint')}`));
        return;
    }

    foundAlt3.sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp));

    const names = new Map();
    const chats = new Map();
    const linesAlt = await Promise.all(foundAlt3.map(async (m, i) => {
        const who = m.fromMe ? t('search.you') : await nameAltAlt(m.author || m.from, names);
        const chat = allAlt2 ? ` · 💬 ${await chatNameAlt(m.id?.remote ?? m.from, chats)}` : '';
        return `${i + 1}. 📅 ${formatData(m.timestamp)}${chat} · 👤 ${who}\n   ${snippet(m)}` +
            `\n   🆔 ${m.id?._serialized}`;
    }));

    lastSearches.set(chatId, { ids: foundAlt3.map(m => m.id?._serialized), when: Date.now() });

    const reply = t('search.header', { count: plural(foundAlt3.length, t('search.message'), t('search.messages')), text: textAlt }) +
        `${allAlt2 ? ' ' + t('search.allChats') : ''}${notice}\n\n${linesAlt.join('\n\n')}` +
        (foundAlt3.length >= n ? '\n\n' + t('search.more') : '') +
        '\n\n' + t('search.readHint');

    if (toPrivate) {
        // The -read <no.> in your private chat uses this list
        lastSearches.set(myId, lastSearches.get(chatId));
        await client.sendMessage(myId, reply, { linkPreview: false });
        await msg.reply(t('search.sentPrivate', { count: foundAlt3.length }));
        return;
    }
    await msg.reply(reply, null, { linkPreview: false });
}

// Forgets the lists of the latest searches (the tests start from zero)
const cleanLastSearches = () => lastSearches.clear();

module.exports = {
    cmdSearch,
    cleanLastSearches
};
