/*
 * "▶️ Test" of the shortcut form: the command of a shortcut checked while you type (each stage of a pipe: it exists,
 * its options, whether it reads the previous output) and, on the click, run as if you had typed it in your private
 * chat, with every reply KEPT (the same capture of the pipes, src/pipeline.js): nothing is sent to WhatsApp.
 *
 * Only what changes nothing runs: what /cron can run (cron: true in the definition) or a command that reads a pipe
 * (/tts, /translate, /qr...), with no option /cron refuses (-alert, -rm, -pause...). The rest is checked, not run.
 */

const { resolveAlias } = require('../aliases');
const { client } = require('../client');
const { handlerFor } = require('../commands/index');
const { assembleContext, optionsError, readOptions } = require('../execute');
const { captureMessage, readPipeline, runSources } = require('../pipeline');
const { ROLES } = require('../roles');

const RUN_TIMEOUT_MS = 90_000;
const MAX_MEDIA = 8 * 1024 * 1024;

// The same rule of /cron (src/textCommands.js), plus the commands made to read a pipe
function blockedOption(command, opts) {
    const option = (command.cmd_opts ?? []).find(o => o.cron === false && o.opts?.some(name => opts.given.has(name)));
    return option ? `-${option.opts[0]}` : null;
}
const runnable = (command) => Boolean(command.cron) || Boolean(command.pipeIn);

/**
 * The stages of a command line, each one checked: { stages: [{ line, cmd, ok, problem, message }], runnable, error }
 * problem: 'unknown' | 'options' | 'noInput' | 'option' (refused here) | 'command' (does not run here)
 */
async function checkLine(text) {
    const line = String(text ?? '').trim();
    if (!line.startsWith('/')) return { stages: [], runnable: false, error: 'empty' };
    const resolved = await resolveAlias(line);
    if (!resolved?.command) return { stages: [{ line, cmd: line.split(/\s+/, 1)[0], ok: false, problem: 'unknown' }], runnable: false };
    if (resolved.text) return { stages: [{ line, cmd: resolved.command.cmd, ok: true }], runnable: false, text: true };
    const pipe = await readPipeline(resolved, line, { resolve: resolveAlias, owner: true });
    if (pipe?.error) return { stages: [], runnable: false, error: pipe.error };
    const parts = pipe ? [...pipe.sources, pipe.resolved] : [resolved];
    const stages = parts.map((stage, i) => {
        const command = stage.command;
        const opts = readOptions(command, stage.args ?? '');
        const entry = { line: [command.cmd, stage.args].filter(Boolean).join(' '), cmd: command.cmd, ok: true };
        const options = optionsError(command, opts);
        const blocked = blockedOption(command, opts);
        if (i > 0 && !command.pipeIn) Object.assign(entry, { ok: false, problem: 'noInput' });
        else if (options) Object.assign(entry, { ok: false, problem: 'options', message: options });
        else if (blocked) Object.assign(entry, { ok: true, problem: 'option', message: blocked });
        else if (!runnable(command)) Object.assign(entry, { ok: true, problem: 'command' });
        return { entry, stage, opts };
    });
    return {
        stages: stages.map(s => s.entry),
        runnable: stages.every(s => s.entry.ok && !s.entry.problem),
        parts: stages
    };
}

// The message "you typed" in your private chat: the base the captured ones copy (the chat, who)
function typedInPrivate(self) {
    return {
        id: { remote: self, id: 'WEBTRY', fromMe: true, _serialized: `true_${self}_WEBTRY` },
        from: self, to: self, author: undefined, fromMe: true, mentionedIds: [], timestamp: Math.floor(Date.now() / 1000),
        getChat: () => client.getChatById(self),
        getContact: () => client.getContactById(self)
    };
}

/**
 * Runs the line (only when checkLine says it can) and gives what the last command would answer:
 * { replies: [{ text } | { media: { mimetype, data, filename }, caption, kind }], ms } or { error }
 */
async function tryLine(text) {
    const check = await checkLine(text);
    if (!check.runnable) return { ...check, parts: undefined, error: check.error ?? 'not runnable' };
    const self = client.info?.wid?._serialized;
    if (!self) return { stages: check.stages, error: 'WhatsApp is not connected' };

    const base = typedInPrivate(self);
    const name = client.info?.pushname ?? 'you';
    const chat = { chatId: self, chatName: name, isGroup: false };
    const who = { level: ROLES.OWNER, admin: true, canUse: () => true, senderContact: null, senderName: name, senderNumber: self.split('@')[0] };
    const run = async (stage, capture, quoted) => {
        await handlerFor(stage.command)(assembleContext({ msg: capture, args: stage.args ?? '', opts: readOptions(stage.command, stage.args ?? ''), quotedMsg: quoted, chat, who }));
        return null;
    };

    const started = Date.now();
    const work = (async () => {
        const stages = check.parts.map(p => p.stage);
        const last = stages.at(-1);
        let quoted = null;
        if (stages.length > 1) {
            const fed = await runSources(stages.slice(0, -1), { msg: base, quotedMsg: null, run, last: last.command });
            if (fed.error) return { error: fed.error };
            quoted = fed.quoted;
        }
        // The last one: its replies as they would go (with the WhatsApp marks), not cleaned as a pipe input
        const replies = [];
        await run(last, captureMessage(base, [last.command.cmd, last.args].filter(Boolean).join(' '), quoted, replies), quoted);
        return {
            replies: replies.filter(r => !r.deleted).map((r) => {
                if (typeof r.content === 'string') return { text: r.content };
                const media = r.content ?? {};
                const size = Buffer.byteLength(String(media.data ?? ''), 'base64');
                return {
                    media: size <= MAX_MEDIA ? { mimetype: media.mimetype, data: media.data, filename: media.filename ?? null } : null,
                    size, caption: r.options?.caption ?? '', voice: Boolean(r.options?.sendAudioAsVoice), sticker: Boolean(r.options?.sendMediaAsSticker)
                };
            })
        };
    })();
    let timer;
    const result = await Promise.race([work, new Promise(resolve => { timer = setTimeout(() => resolve({ error: 'timeout' }), RUN_TIMEOUT_MS); })])
        .catch(err => ({ error: String(err.message ?? err) }))
        .finally(() => clearTimeout(timer));
    return { stages: check.stages, ms: Date.now() - started, ...result };
}

module.exports = { checkLine, tryLine };
