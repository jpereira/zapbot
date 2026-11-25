/*
 * Comando /tldr.
 */

const fs = require('fs');
const path = require('path');

const { client, completeNotice } = require('../client');
const { commandUsage } = require('./base');
const { resolveTarget } = require('./show');
const { HOUR_MS } = require('../constants');
const { chatCurrentIds } = require('../contacts');
const { CHATGPT, engineProcessing, withEngineTip } = require('../engines');
const { dbAll, dbReady, dbRun } = require('../db');
const { language, t } = require('../i18n');
const { WITHOUT_KEY, keyOpenAi, errorOpenAi, measureConsumption, askOnChat, consumptionFooter, transcribeAudio } = require('../openaiChat');
const { getSetting } = require('../settings');
const { mediaIsPath } = require('../util/files');
const { readDuration } = require('../util/when');

/*
 * /tldr: summarizes a chat's conversation through ChatGPT (same key and model as /gpt).
 * /tldr              → the last 100 messages of this chat
 * /tldr 2h | 1d     → those of the last period, as in /cron: 30m, 2h, 1d, 1h30m (the "-" in front is optional)
 * /tldr 300          → the last 300 (max. setting 'tldr.maxMsgs')
 * /tldr -c família   → from another chat: name, /regex/ or @contact
 * /tldr -private          → in your private chat instead of exposing it in the current chat
 * (replying)      → from the replied message until now (the typed period or -c win)
 * Uses the text already stored in the database: regular messages stay cache.messageRetentionHours (68 h). They stay
 * except the commands, the deleted ones and the media without a caption.
 */
const SUMMARY_DEFAULT = 100;
const SUMMARY_MIN = 3;
const SUMMARY_MAX_CHARS_MSG = 500;      // each message is cut here
const SUMMARY_MAX_CHARS = 60000;        // and the total, from oldest to newest

const SUMMARY_INSTRUCTIONS = () => t('tldr.instructions', { tag: t('tldr.audioTag') });

const AUDIOS_MAX = 10;                 // only the most recent are transcribed (it costs API)
const AUDIO_MAX_BYTES = 25 * 1024 * 1024;
const AUDIO_EXTENSIONS = new Set(['ogg', 'oga', 'opus', 'mpeg', 'mp3', 'mp4', 'm4a', 'wav', 'webm', 'flac']);

/**
 * Requested period, with the same duration as /cron: "30m", "2h", "1d", "1h30m", "2d4h" (time window, the "-"
 * in front is optional) or "300" (number of messages).
 * @returns {{ ms?: number, n?: number } | null} null if the text is not a period
 */
function readPeriod(textAlt) {
    const t = String(textAlt).trim().toLowerCase().replace(/^-/, '').replace(/\s+/g, '');
    if (/^\d+$/.test(t)) return Number(t) >= 1 ? { n: Number(t) } : null;

    const ms = readDuration(t);
    return ms ? { ms } : null;
}

// "2 hours", "1 day e 12 hours", "30 minutos"
function byLong(ms) {
    const minutes = Math.round(ms / 60_000);
    const partsAlt = [
        [Math.floor(minutes / 1440), 'tldr.days'],
        [Math.floor((minutes % 1440) / 60), 'tldr.hours'],
        [minutes % 60, 'tldr.minutes']
    ].filter(([n]) => n).map(([n, keyAlt]) => t(keyAlt, { n }));
    return partsAlt.length > 1 ? `${partsAlt.slice(0, -1).join(', ')}${t('tldr.and')}${partsAlt.at(-1)}` : partsAlt[0];
}

const hour = (ms) => new Date(ms).toLocaleString(language() === 'pt_BR' ? 'pt-BR' : 'en-US', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
});

/*
 * The transcription of an audio stored on disk: the one already done (transcription column) or OpenAI's, which
 * stays stored. Without a file, too large, format out of range or error: null (the audio is left out).
 */
async function audioTranscription(r) {
    if (r.transcription) return r.transcription;

    const extension = path.extname(String(r.media_path ?? '')).slice(1).toLowerCase();
    if (!AUDIO_EXTENSIONS.has(extension) || !mediaIsPath(r.media_path) || !fs.existsSync(r.media_path)) return null;
    if (fs.statSync(r.media_path).size > AUDIO_MAX_BYTES) return null;

    try {
        const textAlt = await transcribeAudio({
            cmd: '/tldr',
            audio: {
                file: `audio.${extension === 'oga' || extension === 'opus' ? 'ogg' : extension}`,
                mimetype: `audio/${extension === 'oga' || extension === 'opus' ? 'ogg' : extension}`,
                data: fs.readFileSync(r.media_path).toString('base64')
            }
        });
        await dbRun('UPDATE messages SET transcription = ? WHERE id = ?', [textAlt, r.id]).catch(() => {});
        return textAlt || null;
    } catch {
        return null;
    }
}

async function summarize({ msg, opts, chatId, chatName, quotedMsg }) {
    if (!keyOpenAi()) {
        await msg.reply(WITHOUT_KEY('/tldr'));
        return;
    }

    const extras = opts.argv.filter(Boolean);
    let period = extras.length ? readPeriod(extras.join('')) : { n: SUMMARY_DEFAULT };
    const notices = [];

    // Replying to a message (without a typed period or -c): summarizes from it until now
    const sinceAReply = !extras.length && !opts.opt.chat && quotedMsg?.timestamp;
    if (sinceAReply) {
        period = { ms: Math.max(Date.now() - quotedMsg.timestamp * 1000, 0) };
        notices.push(t('tldr.sinceReply'));
    }

    if (!period) {
        await msg.reply(commandUsage('/tldr'));
        return;
    }

    const max = getSetting('tldr.maxMsgs');

    if (period.n > max) {
        notices.push(t('tldr.limited', { max }));
        period.n = max;
    }

    // The database stores the text of regular messages for cache.messageRetentionHours
    const hoursSaved = getSetting('cache.messageRetentionHours');
    const saved = hoursSaved * HOUR_MS;
    if (period.ms > saved) {
        notices.push(t('tldr.retention', { time: byLong(saved), hours: hoursSaved }));
        period.ms = saved;
    }

    await dbReady;

    // -c <name>: another chat (by the name saved in the database)
    let ids = await chatCurrentIds(chatId);
    let nameAlt = chatName;

    if (opts.opt.chat) {
        // Like /show: /regex/, @contact, no. from /show -l or the name; several: lists and waits for the no.
        const chats = await dbAll(
            `SELECT chat_id, MAX(chat_name) AS chat_name, MAX(is_group) AS is_group
               FROM messages GROUP BY chat_id ORDER BY MAX(timestamp) DESC`
        );
        const target = await resolveTarget(msg, String(opts.opt.chat).trim(), { chats });
        if (!target) return;
        ids = target.ids;
        nameAlt = target.name;
    }

    const params = [...ids];
    let filterTime = '';
    if (period.ms) {
        filterTime = 'AND timestamp >= ?';
        params.push(Date.now() - period.ms);
    }
    params.push(period.ms ? max : period.n);

    const rows = (await dbAll(
        `SELECT id, sender_name, from_me, body, timestamp, type, media_path, transcription
           FROM messages
          WHERE chat_id IN (${ids.map(() => '?').join(', ')})
            AND revoked = 0
            AND ((TRIM(body) != '' AND body NOT LIKE '/%')
                 OR (type IN ('audio', 'ptt') AND (media_path IS NOT NULL OR transcription IS NOT NULL)))
            ${filterTime}
          ORDER BY timestamp DESC, rowid DESC
          LIMIT ?`,
        params
    )).reverse();

    if (sinceAReply && rows.length >= max) notices.push(t('tldr.latest', { max }));

    // The audios (the AUDIOS_MAX most recent) become text; whatever could not be transcribed leaves the summary
    const audios = rows.filter(r => ['audio', 'ptt'].includes(r.type)).slice(-AUDIOS_MAX);
    for (const r of audios) r.body = (await audioTranscription(r)) ?? '';
    for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        if (!['audio', 'ptt'].includes(r.type)) continue;
        if (r.body && audios.includes(r)) r.body = `${t('tldr.audioTag')} ${r.body}`;
        else rows.splice(i, 1);
    }

    if (rows.length < SUMMARY_MIN) {
        await msg.reply(t('tldr.few', { total: rows.length, name: nameAlt, hours: getSetting('cache.messageRetentionHours') }));
        return;
    }

    // One line per message; above the limit, the oldest leave. Yours go with your profile name.
    const myName = client.info.pushname || t('tldr.me');
    const author = (r) => (r.from_me ? myName : r.sender_name || t('tldr.unknown'));
    const linesAlt = rows.map(r => `[${hour(r.timestamp)}] ${author(r)}: ${r.body.replace(/\s+/g, ' ').slice(0, SUMMARY_MAX_CHARS_MSG)}`);
    let size = linesAlt.reduce((s, l) => s + l.length + 1, 0);
    while (size > SUMMARY_MAX_CHARS && linesAlt.length > SUMMARY_MIN) size -= linesAlt.shift().length + 1;

    const first = rows[rows.length - linesAlt.length].timestamp;
    const last = rows[rows.length - 1].timestamp;

    // What is being summarized: the amount, the time window or "since the replied message"
    const messages = t('tldr.messages', { n: linesAlt.length });
    const scope = sinceAReply
        ? t('tldr.scopeReply', { messages, name: nameAlt, time: byLong(period.ms) })
        : period.ms
            ? t('tldr.scopePeriod', { messages, name: nameAlt, time: byLong(period.ms) })
            : t('tldr.scopeLast', { messages, name: nameAlt });
    const notice = await msg.reply(engineProcessing('tldr', CHATGPT, { scope }), null, { linkPreview: false });
    try {
        const summary = await askOnChat({
            cmd: '/tldr',
            system: SUMMARY_INSTRUCTIONS(),
            text: t('tldr.prompt', { name: nameAlt, total: linesAlt.length, lines: linesAlt.join('\n') })
        });

        const textAlt = t('tldr.header', { name: nameAlt, messages, start: hour(first), end: hour(last) }) +
            (notices.length ? `\n_(${notices.join('; ')})_` : '') +
            `${withEngineTip(`\n\n${summary}`, 'tldr', CHATGPT, { sep: '\n\n', quiet: opts.opt.quiet })}${await consumptionFooter()}`;

        if (opts.opt.private) {
            await completeNotice(msg, notice, t('tldr.sentPrivate'));
            await client.sendMessage(client.info.wid._serialized, textAlt);
        } else {
            await completeNotice(msg, notice, textAlt);
        }
    } catch (err) {
        await completeNotice(msg, notice, errorOpenAi(err, '/tldr'));
    }
}

// The -status|-s (or the gpt.status setting) shows the call usage in the footer
const cmdTldr = (ctx) => measureConsumption(ctx.opts?.given.has('status'), () => summarize(ctx));

module.exports = {
    cmdTldr,
    readPeriod
};
