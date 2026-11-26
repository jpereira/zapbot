/*
 * Pipes: "/stocks -q USD | /tts -l -v tugão". Each command's output is the replied message of the next one, as if you
 * had answered its reply with the next command: the same input a command already reads from a reply (the text, a
 * picture, an audio), so nothing new is parsed and the piped text never turns into options.
 *
 *   /a | /b | /c   → /a runs with its replies kept; its output (the text, cleaned of the WhatsApp marks and of the
 *                    tips, or its media) becomes the replied message of /b, and so on; only the last one answers
 *                    in the chat, through the usual path (help, options, permissions, the usage limit)
 *
 * Only " | /command" splits: the bar with spaces around and a command (or an alias) right after it, outside
 * {/commands}. "\|" is a literal bar, and the commands whose text is a command or a rule (/alias, /cron, /me, /batch,
 * /watch) are never split. A source that fails (❌ ⚠️ 🚫) stops the pipe with its own message; it is not fed on.
 */

const { MessageMedia } = require('whatsapp-web.js');

const { roleMoreRestricted } = require('./roles');
const { t } = require('./i18n');
const { printError, printInfo } = require('./log');

const MAX_STAGES = 4;
const MAX_INPUT = 8000;                  // characters that go on to the next command
const STAGE_TIMEOUT_MS = 10 * 60 * 1000; // a /get may take minutes; a stuck one does not hold the pipe forever
// The bot starts a reply that is a failure, a warning or a refusal with one of these (the same as {/command})
const FAILURE_MARK = /^\s*(?:❌|⚠️|🚫)/u;
// A notice that the work is going on ("⏳ Baixando..."): not the output
const PROGRESS = /^\s*⏳/u;

/**
 * The commands of a pipe, or [] when the text has no " | /command" outside {...}.
 * @param {string} line
 * @returns {string[]}
 */
function splitPipeline(line) {
    const text = String(line ?? '');
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '\\') { i++; continue; }
        if (c === '{') depth++;
        else if (c === '}') depth = Math.max(0, depth - 1);
        else if (c === '|' && depth === 0 && /\s/.test(text[i - 1] ?? '') && /^\s+\/[\p{L}\d]/u.test(text.slice(i + 1))) {
            parts.push(text.slice(start, i).trim());
            start = i + 1;
        }
    }
    if (!parts.length) return [];
    parts.push(text.slice(start).trim());
    // "\|" was kept as the bar itself in each command
    return parts.map(p => p.replace(/\\\|/g, '|'));
}

/**
 * The stages of a typed pipe, already resolved (commands and aliases), or null when it is not one.
 * @param {object} resolved  what resolveAlias gave for the whole message
 * @param {string} body
 * @param {object} o
 * @param {Function} o.resolve  resolveAlias
 * @param {boolean} o.owner  whoever typed is the owner (a private alias exists only for them)
 * @returns {Promise<null|{error: string}|{sources: object[], resolved: object}>}
 */
async function readPipeline(resolved, body, { resolve, owner }) {
    if (!resolved?.command || resolved.text || resolved.command.pipeOut === false) return null;
    const line = resolved.alias ? [resolved.destination, resolved.args].filter(Boolean).join(' ') : body;
    const parts = splitPipeline(line);
    if (parts.length < 2) return null;
    if (parts.length > MAX_STAGES) return { error: t('pipe.tooMany', { max: MAX_STAGES }) };

    const stages = [];
    for (const part of parts) {
        const stage = await resolve(part);
        const caller = part.split(/\s+/, 1)[0];
        if (!stage?.command || stage.text || (stage.ownerOnly && !owner)) return { error: t('pipe.unknown', { cmd: caller }) };
        stages.push(stage);
    }
    const deaf = stages.slice(1).find(s => !s.command.pipeIn);
    if (deaf) return { error: t('pipe.noInput', { cmd: deaf.command.cmd, list: pipeInputs().join(' ') }) };

    const last = stages.at(-1);
    const targets = stages.flatMap(s => s.command.targets ?? [s.command.cmd]);
    return {
        sources: stages.slice(0, -1),
        resolved: { ...last, command: { ...last.command, role: roleMoreRestricted(stages.map(s => s.command.role)), targets } }
    };
}

// The commands that read a piped input (pipeIn: true in the definition)
function pipeInputs() {
    const { activeCommands } = require('./commands/base');
    return activeCommands().filter(c => c.pipeIn).map(c => c.cmd);
}

// "*bold*", "_italic_", "~struck~", `code` and the "💡 Tips" block at the end: what reads well on WhatsApp, not as input
function plainOutput(text) {
    const lines = String(text ?? '').split('\n');
    const tips = lines.findIndex(l => /^\s*💡/u.test(l));
    const kept = (tips > 0 ? lines.slice(0, tips) : lines).join('\n');
    return kept
        .replace(/```([\s\S]*?)```/g, '$1')
        .replace(/`([^`\n]+)`/g, '$1')
        .replace(/(^|[\s(])([*_~])(?=\S)([^\n]*?\S)\2(?=[\s).,!?:;]|$)/gmu, '$1$3')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// The type WhatsApp would give the message of this media, the one the next command checks (an audio, a sticker...)
function mediaKind(media, options = {}) {
    const mime = String(media?.mimetype ?? '').split(';')[0].toLowerCase();
    if (options.sendMediaAsSticker || mime === 'image/webp') return 'sticker';
    if (options.sendMediaAsDocument) return 'document';
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return options.sendAudioAsVoice ? 'ptt' : 'audio';
    return 'document';
}

/*
 * The message a source command answers to: its replies are kept (with edit and delete, for the "⏳ ..." notices that
 * become the result), never sent. The rest is the typed message's (the chat, who typed).
 */
function captureMessage(msg, line, quoted, replies) {
    const id = `PIPE_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return {
        // Its own id: commands key things by it (the reply being quoted, the "sent by the bot" marks)
        id: { ...msg.id, id, _serialized: `${msg.fromMe ? 'true' : 'false'}_${msg.id?.remote ?? msg.from}_${id}` },
        from: msg.from,
        to: msg.to,
        author: msg.author,
        fromMe: msg.fromMe,
        body: line,
        type: 'chat',
        timestamp: msg.timestamp,
        hasMedia: false,
        hasQuotedMsg: Boolean(quoted),
        links: [],
        mentionedIds: msg.mentionedIds ?? [],
        _data: {},
        getChat: () => msg.getChat(),
        getContact: () => msg.getContact(),
        getQuotedMessage: async () => quoted,
        downloadMedia: async () => null,
        react: async () => {},
        delete: async () => {},
        async reply(content, _chatId, options = {}) {
            const entry = { content, options };
            replies.push(entry);
            return {
                id: { _serialized: `PIPE_REPLY_${replies.length}` },
                body: typeof content === 'string' ? content : '',
                edit: async (text) => { entry.content = text; },
                delete: async () => { entry.deleted = true; },
                react: async () => {}
            };
        }
    };
}

/*
 * What a source answered → the replied message of the next command: the first media (with its caption), or the
 * texts without the progress notices, cleaned. { error } when it failed or said nothing.
 */
function outputAsQuoted(replies, base, cmd) {
    const live = replies.filter(r => !r.deleted);
    const media = live.find(r => r.content && typeof r.content === 'object' && 'data' in r.content);
    const texts = live.filter(r => typeof r.content === 'string').map(r => r.content.trim()).filter(Boolean);
    const failure = texts.find(x => FAILURE_MARK.test(x));
    if (failure && !media) return { error: failure };

    const body = media ? String(media.options?.caption ?? '') : plainOutput(texts.filter(x => !PROGRESS.test(x)).join('\n\n')).slice(0, MAX_INPUT);
    if (!media && !body) return { error: t('pipe.empty', { cmd }) };
    const content = media?.content;
    return {
        quoted: {
            id: { ...base.id, id: `PIPE_OUT_${Date.now()}`, _serialized: `PIPE_OUT_${Date.now()}` },
            from: base.from,
            to: base.to,
            fromMe: true,
            body,
            type: media ? mediaKind(content, media.options) : 'chat',
            timestamp: Math.floor(Date.now() / 1000),
            hasMedia: Boolean(media),
            hasQuotedMsg: false,
            links: [...body.matchAll(/https?:\/\/\S+/g)].map(m => ({ link: m[0] })),
            mentionedIds: [],
            _data: media ? { mimetype: content.mimetype, filename: content.filename } : {},
            downloadMedia: async () => (media ? new MessageMedia(content.mimetype, content.data, content.filename) : null),
            getChat: () => base.getChat(),
            getContact: () => base.getContact(),
            getQuotedMessage: async () => null
        }
    };
}

const withTimeout = (promise, ms, onTimeout) => {
    let timer;
    return Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve(onTimeout()), ms); timer.unref?.(); })])
        .finally(() => clearTimeout(timer));
};

// pipeIn: 'text', 'media' or true (both): what the next command reads, checked before it runs (a picture given to
// the /tts used to answer with its usage, as if nothing had been replied)
function wrongKind(consumer, quoted, from) {
    const wants = consumer.pipeIn;
    if (wants === true || (wants === 'text') === !quoted.hasMedia) return null;
    return t('pipe.wrongKind', {
        cmd: consumer.cmd, from, wants: t(wants === 'text' ? 'pipe.kindText' : 'pipe.kindMedia'),
        got: t(quoted.hasMedia ? 'pipe.kindMedia' : 'pipe.kindText')
    });
}

/**
 * Runs the sources of a pipe in order, each one with the previous output as its replied message.
 * @param {object[]} sources  the resolved stages before the last one
 * @param {object} o
 * @param {object} o.msg  the typed message
 * @param {object|null} o.quotedMsg  what the typed message replies to: the input of the first command
 * @param {Function} o.run  (stage, msg, quoted) → the source's options check and handler (the caller's rules)
 * @param {object} o.last  the definition of the last command (the one that reads the last output)
 * @returns {Promise<{quoted: object}|{error: string}>}
 */
async function runSources(sources, { msg, quotedMsg, run, last }) {
    let quoted = quotedMsg;
    for (const [i, stage] of sources.entries()) {
        const cmd = stage.command.cmd;
        const line = [cmd, stage.args].filter(Boolean).join(' ');
        const replies = [];
        const capture = captureMessage(msg, line, quoted, replies);
        printInfo(`Pipe: ${line}`);
        const result = await withTimeout(
            Promise.resolve().then(() => run(stage, capture, quoted)).then(r => r ?? null, (err) => {
                printError(`Pipe: ${line} failed:`, err.message);
                return { error: t('pipe.failed', { cmd }) };
            }),
            STAGE_TIMEOUT_MS, () => ({ error: t('pipe.timeout', { cmd, minutes: STAGE_TIMEOUT_MS / 60000 }) }));
        if (result?.error) return result;
        const fed = outputAsQuoted(replies, msg, cmd);
        if (fed.error) return fed;
        const kind = wrongKind(sources[i + 1]?.command ?? last, fed.quoted, cmd);
        if (kind) return { error: kind };
        quoted = fed.quoted;
    }
    return { quoted };
}

module.exports = { MAX_STAGES, captureMessage, mediaKind, outputAsQuoted, pipeInputs, plainOutput, readPipeline, runSources, splitPipeline };
