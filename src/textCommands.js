/*
 * Commands in the text (/cron and /alias): "Bitcoin now: {/crypto BTC}".
 * At build time, each {/command args} runs and its reply goes in its place.
 * The `where` (e.g.: '/cron') only appears in the error messages.
 */

const { ROLES, roleMoreRestricted } = require('./roles');
const { client } = require('./client');
const { activeCommands, findCommand } = require('./commands/base');
const { printError, printExpand } = require('./log');
const { optionsError, readOptions, assembleContext, denial } = require('./execute');
const { dbGet, dbReady } = require('./db');
const { t } = require('./i18n');
const { unescape } = require('./util/format');
const { parseMarks } = require('./commandMarks');

/*
 * Only the commands with "cron": true in commands.js (the query ones), and without the
 * options with "cron": false (those that change something, like /crypto's -add). The
 * command runs as if typed in the destination chat (by you, if none comes
 * who runs), but the replies are stored instead of sent: the text goes
 * in place of the {...} and the media (/meme, /giphy...) go out after the message.
 */
// {/cmd args} or {cmd args} (the slash is optional for the commands that exist): see commandMarks.js
const commandsInText = parseMarks;

/*
 * The typed "\n" becomes a line break, without the surrounding spaces: in the
 * WhatsApp it is easier to type "Orca {/defi orca}\n Prjx {/defi prjx}" than
 * breaking the line in the middle of the command.
 */
const breakLines = (textAlt) => String(textAlt ?? '').replace(/[ \t]*\\n[ \t]*/g, '\n');

/*
 * Finds the command in a "/name args" line: the command itself or an alias of
 * saved command (with the $1, $2... applied). A text alias does not come in here
 * (an {/alias} inside the text itself could call itself).
 * @returns {Promise<{command, args, alias?}|{aliasText: string}|null>}
 */
async function findCommandAlt(line) {
    const caller = line.split(/\s+/, 1)[0].toLowerCase();
    const rest = line.slice(caller.length).trim();
    const direct = findCommand(caller);
    if (direct) return { command: direct, args: rest };

    await dbReady;
    const alias = await dbGet('SELECT command FROM command_aliases WHERE name = ?', [caller]);
    if (!alias) return null;
    if (!alias.command.startsWith('/')) return { aliasText: caller };

    const { applyParams } = require('./aliases'); // in here: aliases imports this file
    const { command: commandAlt, leftovers } = applyParams(alias.command, rest);
    const destination = commandAlt.split(/\s+/, 1)[0];
    const target = findCommand(destination);
    if (!target) return null;
    const args = [commandAlt.slice(destination.length).trim(), leftovers].filter(Boolean).join(' ');
    return { command: target, args, alias: caller };
}

/*
 * /me is a regular command, but it runs the {/command}s of what was typed: the permissions
 * (and the role) are its own and each one's (targets), checked before running.
 */
async function withTargets(command, textAlt) {
    if (command?.cmd !== '/me' && !command?.expandCommands) return command;
    const foundAlt4 = await Promise.all(commandsInText(textAlt).map(c => findCommandAlt(c.line)));
    const targets = foundAlt4.map(a => a?.command).filter(Boolean);
    return { ...command, role: roleMoreRestricted([command.role, ...targets.map(c => c.role)]),
        targets: [command.cmd, ...targets.map(c => c.cmd)] };
}

const allowed = () => activeCommands().filter(c => c.cron).map(c => c.cmd);

// "/crypto BTC" → { command, args, opts }, or { error }
async function readCommand(line, whereAlt = '/cron', owner = false) {
    const caller = line.split(/\s+/, 1)[0].toLowerCase();
    const foundAlt2 = await findCommandAlt(line);

    if (!foundAlt2) return { error: t('cnt.naoExiste', { line, caller }) };
    if (foundAlt2.aliasText) return { error: t('cnt.aliasTexto', { line, caller, where: whereAlt }) };

    const { command, args } = foundAlt2;
    if (!command.cron || (command.cron === 'dono' && !owner)) {
        return { error: t('cnt.naoRoda', { line, cmd: command.cmd, where: whereAlt, list: allowed().join(', ') }) };
    }

    const opts = readOptions(command, args);
    const prohibited = (command.cmd_opts ?? []).find(o => (o.cron === false || (o.cron === 'dono' && !owner)) &&
        o.opts?.some(nameAlt => opts.given.has(nameAlt)));
    if (prohibited) return { error: t('cnt.opcaoNaoRoda', { line, opt: prohibited.opts[0], cmd: command.cmd, where: whereAlt }) };

    return { command, args, opts };
}

/**
 * Checks the text's {/command}s when creating or editing (the /cron item).
 * @returns {Promise<string|null>} the error (of the first invalid one) or null
 */
async function commandsError(textAlt, whereAlt = '/cron', owner = false) {
    for (const { line } of commandsInText(textAlt)) {
        const { error: errorAlt } = await readCommand(line, whereAlt, owner);
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

/*
 * Runs a {/command}: the reply text and the media. Without `who`, it runs as
 * you (admin); with it, with the admin and the permissions of whoever runs.
 */
async function runCommand(chatId, line, { chatName, isGroup, where: whereAlt = '/cron', who = null, origin = null }) {
    const { error: errorAlt, command, args, opts } = await readCommand(line, whereAlt, !who); // without `who`: runs as the owner
    if (errorAlt) return { text: t('cnt.naoRodaNo', { cmd: line.split(/\s+/, 1)[0], where: whereAlt }), mediaItems: [] };

    printExpand(who?.senderName ?? client.info?.pushname ?? '-', origin ?? line, line);

    // The handler lives in commands/index, which loads /cron (and this file): only here, at the time
    const { HANDLERS } = require('./commands/index');
    const replies = [];
    const msg = messageSynthetic(chatId, line, replies);

    const owner = { level: ROLES.OWNER, admin: true, senderName: client.info?.pushname || t('core.voce') };
    const reject = optionsError(command, opts) ?? denial(command, opts, who?.level ?? owner.level);
    if (reject) return { text: reject, mediaItems: [] };

    try {
        await HANDLERS[command.cmd](assembleContext({
            msg, args, opts, chat: { chatId, chatName, isGroup }, who: { ...owner, ...who }
        }));
    } catch (err) {
        printError(`${whereAlt}: ${line} failed:`, err.message);
        return { text: `⚠️ ${command.cmd} falhou`, mediaItems: [] };
    }

    const texts = replies.filter(r => typeof r.content === 'string').map(r => r.content.trim());
    const mediaAltAlt = replies.filter(r => typeof r.content !== 'string');
    // Several replies (/defi sends one per position): separated by a blank line
    return { text: texts.join('\n\n'), mediaItems: mediaAltAlt };
}

/*
 * Puts the reply in place of the mark. One of several lines (/crypto, /weather...)
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
 * @param {object} s  the chat: chat_id, chat_name and is_group (the /cron columns)
 * @param {object} [o]
 * @param {string} [o.where]  who asked, for the error messages ('/cron')
 * @param {object} [o.who]  admin, canUse, senderName... of whoever runs (without it: you)
 * @param {string} [o.origin]  the text that had the marks, for the log (the typed command; by default, the text)
 * @param {Function} [o.transform]  what to do with each reply before it goes in (the /tts cleans it to be spoken)
 */
async function assembleText(textAlt, s, { where: whereAlt, who, transform = null, origin = textAlt } = {}) {
    const commands = commandsInText(textAlt);
    // \-foo becomes -foo in the sent text; a text that is a command (starts with /) stays as it is
    const literal = (s) => (String(s).trimStart().startsWith('/') ? s : unescape(s).replace(/\\\{/g, '{'));
    if (!commands.length) return { text: literal(textAlt), mediaItems: [], commands: [] };

    const ctx = { chatName: s.chat_name, isGroup: Boolean(s.is_group), where: whereAlt, who, origin };
    const mediaAltAlt = [];
    let final = textAlt;

    for (const { mark, line } of commands) {
        const r = await runCommand(s.chat_id, line, ctx);
        final = fit(final, mark, transform ? transform(r.text) : r.text);
        mediaAltAlt.push(...r.mediaItems);
    }

    return { text: literal(final.trim()), mediaItems: mediaAltAlt, commands: commands.map(c => c.line) };
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
    findCommandAlt,
    withTargets,
    commandsInText,
    sendMedia,
    commandsError,
    readCommand,
    assembleText,
    allowed,
    breakLines
};
