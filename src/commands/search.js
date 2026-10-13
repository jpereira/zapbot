/*
 * /search (/buscar) command: searches the WhatsApp history (not only the bot cache).
 */

const { client } = require('../client');
const { getCommandSyntax } = require('./base');
const { chatCurrentIds } = require('../contacts');
const { printError } = require('../log');
const { formatData, paraMs, plural } = require('../util/format');

/*
 * /search [-N] <texto>
 * WhatsApp Web's own search (client.searchMessages): the messages that the
 * WhatsApp Web has, including those that never went through the bot cache. In this
 * chat; in your private chat, in all chats. Without -N, the 10 most recent.
 */
const DEFAULT = 10;
const MAX = 50;
const SNIPPET = 200;

// "Fulano" from an id, without repeating the lookup for the same id
async function nameAltAlt(id, cache) {
    if (!cache.has(id)) {
        cache.set(id, client.getContactById(id)
            .then(c => c.name || c.pushname || id.split('@')[0])
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

async function cmdSearch({ msg, opts, chatId }) {
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
        notice = `\n_(limitado a ${MAX} por vez)_`;
        n = MAX;
    }

    // In your private chat, all chats; in the others, only this one
    const allAlt2 = (await chatCurrentIds(chatId)).includes(client.info.wid._serialized);

    let foundAlt3;
    try {
        foundAlt3 = await client.searchMessages(textAlt, { page: 1, limit: n, ...(allAlt2 ? {} : { chatId }) });
    } catch (err) {
        printError(`/search "${textAlt}":`, err.message);
        await msg.reply(`⚠️ A busca do WhatsApp falhou: ${err.message}`);
        return;
    }

    // The /search message itself also has the text
    foundAlt3 = foundAlt3.filter(m => m.id?._serialized !== msg.id?._serialized);
    const whereAlt = allAlt2 ? 'em nenhum chat' : 'neste chat';
    if (!foundAlt3.length) {
        await msg.reply(`🔎 Nada com "${textAlt}" ${whereAlt}.`);
        return;
    }

    foundAlt3.sort((a, b) => paraMs(b.timestamp) - paraMs(a.timestamp));

    const names = new Map();
    const chats = new Map();
    const linesAlt = await Promise.all(foundAlt3.map(async (m, i) => {
        const who = m.fromMe ? 'Você' : await nameAltAlt(m.author || m.from, names);
        const chat = allAlt2 ? ` · 💬 ${await chatNameAlt(m.id?.remote ?? m.from, chats)}` : '';
        return `${i + 1}. 📅 ${formatData(m.timestamp)}${chat} · 👤 ${who}\n   ${snippet(m)}`;
    }));

    await msg.reply(`🔎 *${plural(foundAlt3.length, 'mensagem', 'mensagens')} com* "${textAlt}"` +
        `${allAlt2 ? ' _(todos os chats)_' : ''}${notice}\n\n${linesAlt.join('\n\n')}` +
        (foundAlt3.length >= n ? '\n\n💡 _Pode haver mais: use -N para ver mais (ex.: /search -30 <texto>)._' : ''),
    null, { linkPreview: false });
}

module.exports = {
    cmdSearch
};
