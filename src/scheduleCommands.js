/*
 * Commands in the /cron text: "Bitcoin now: {/crypto BTC}". At the time of
 * send, each {/command args} runs and its reply goes in its place.
 */

const { client } = require('./client');
const { activeCommands, findCommand } = require('./commands/base');
const { printError } = require('./log');
const { GetOptFromCommand } = require('./options');

/*
 * Only the commands with "cron": true in commands.json (the query ones), and without the
 * options with "cron": false (those that change something, like /crypto's -add). The
 * command runs as if you typed it in the destination chat, but the replies are
 * stored instead of sent: the text goes in place of the {...} and the media
 * (/meme, /giphy...) come out after the message.
 */
const MARK = /\{(\/[^{}\n]+)\}/g;

const commandsInText = (textAlt) => [...String(textAlt ?? '').matchAll(MARK)].map(m => ({ marca: m[0], linha: m[1].trim() }));

const allowed = () => activeCommands().filter(c => c.cron).map(c => c.cmd);

// "/crypto BTC" → { command, args, opts }, or { error }
function readCommand(line) {
    const caller = line.split(/\s+/, 1)[0].toLowerCase();
    const command = findCommand(caller);

    if (!command) return { erro: `❌ {${line}}: o ${caller} não existe.` };
    if (!command.cron) {
        return { erro: `❌ {${line}}: o ${command.cmd} não roda dentro do /cron.\n💡 _Rodam: ${allowed().join(', ')}._` };
    }

    const args = line.slice(caller.length).trim();
    const opts = GetOptFromCommand(args, command);
    const prohibited = (command.cmd_opts ?? []).find(o => o.cron === false && o.opts?.some(nameAlt => opts.given.has(nameAlt)));
    if (prohibited) return { erro: `❌ {${line}}: o -${prohibited.opts[0]} do ${command.cmd} não roda dentro do /cron.` };

    return { command, args, opts };
}

/**
 * Checks the text's {/command}s when creating or editing the item.
 * @returns {string|null} the error (of the first invalid one) or null
 */
function commandsError(textAlt) {
    for (const { linha: line } of commandsInText(textAlt)) {
        const { erro: errorAlt } = readCommand(line);
        if (errorAlt) return errorAlt;
    }
    return null;
}

// Message "typed" by you in the chat, with the reply keeping the answers
function messageSynthetic(chatId, line, replies) {
    const myId = client.info.wid._serialized;
    const id = `CRON_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return {
        id: { id, remote: chatId, fromMe: true, _serialized: `true_${chatId}_${id}` },
        from: myId,
        to: chatId,
        fromMe: true,
        body: line,
        type: 'chat',
        timestamp: Math.floor(Date.now() / 1000),
        hasMedia: false,
        hasQuotedMsg: false,
        links: [],
        mentionedIds: [],
        _data: {},
        async reply(content, _chatId, options = {}) {
            replies.push({ content, options });
        },
        getChat: () => client.getChatById(chatId),
        getContact: () => client.getContactById(myId),
        async getQuotedMessage() { return null; },
        async downloadMedia() { return null; }
    };
}

// Runs a {/command}: the reply text and the media
async function runCommand(chatId, line, { chatName, isGroup }) {
    const { erro: errorAlt, command, args, opts } = readCommand(line);
    if (errorAlt) return { texto: `⚠️ ${line.split(/\s+/, 1)[0]} não roda no /cron`, midias: [] };

    // The handler lives in commands/index, which loads /cron (and this file): only here, at the time
    const { HANDLERS } = require('./commands/index');
    const replies = [];
    const msg = messageSynthetic(chatId, line, replies);

    try {
        await HANDLERS[command.cmd]({
            msg, opts, args, quotedMsg: null, senderContact: null, senderName: client.info?.pushname || 'Você',
            isGroup, chatId, chatName, admin: true
        });
    } catch (err) {
        printError(`/cron: ${line} falhou:`, err.message);
        return { texto: `⚠️ ${command.cmd} falhou`, midias: [] };
    }

    const texts = replies.filter(r => typeof r.content === 'string').map(r => r.content.trim());
    const mediaAltAlt = replies.filter(r => typeof r.content !== 'string');
    return { texto: texts.join('\n'), midias: mediaAltAlt };
}

/*
 * Puts the reply in place of the mark. One of several lines (/crypto, /tempo...)
 * becomes a paragraph: a blank line before and after it, so it does not stick to the
 * surrounding text. A single-line one stays in the middle of the sentence, as it came.
 */
function fit(textAlt, mark, reply) {
    const i = textAlt.indexOf(mark);
    let beforeAlt = textAlt.slice(0, i);
    let afterAlt = textAlt.slice(i + mark.length);

    if (reply.includes('\n')) {
        beforeAlt = beforeAlt.replace(/[ \t]+$/, '');
        if (beforeAlt && !beforeAlt.endsWith('\n\n')) beforeAlt += beforeAlt.endsWith('\n') ? '\n' : '\n\n';
        afterAlt = afterAlt.replace(/^[ \t]+/, '');
        if (afterAlt && !afterAlt.startsWith('\n\n')) afterAlt = (afterAlt.startsWith('\n') ? '\n' : '\n\n') + afterAlt;
    }
    return beforeAlt + reply + afterAlt;
}

/**
 * The text with each {/command} replaced by its reply, the replies' media
 * and the commands executed (for the log). Without {/command}, the text as it is.
 */
async function assembleText(textAlt, s) {
    const commands = commandsInText(textAlt);
    if (!commands.length) return { texto: textAlt, midias: [], comandos: [] };

    const ctx = { chatName: s.chat_name, isGroup: Boolean(s.is_group) };
    const mediaAltAlt = [];
    let final = textAlt;

    for (const { marca: mark, linha: line } of commands) {
        const r = await runCommand(s.chat_id, line, ctx);
        final = fit(final, mark, r.texto);
        mediaAltAlt.push(...r.midias);
    }

    return { texto: final.trim(), midias: mediaAltAlt, comandos: commands.map(c => c.linha) };
}

// Sends the stored media, in order, to the chat
async function sendMedia(chatId, mediaAltAlt) {
    for (const { content, options } of mediaAltAlt) {
        // Without quoting: the command's synthetic message does not exist on WhatsApp
        const optionsAlt = { ...options };
        delete optionsAlt.quotedMessageId;
        await client.sendMessage(chatId, content, optionsAlt);
    }
}

module.exports = {
    commandsInText,
    sendMedia,
    commandsError,
    assembleText,
    allowed
};
