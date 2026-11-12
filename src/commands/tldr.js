/*
 * Comando /tldr (alias /resumo).
 */

const fs = require('fs');
const path = require('path');

const { client, completeNotice } = require('../client');
const { getCommandSyntax } = require('./base');
const { HOUR_MS } = require('../constants');
const { chatCurrentIds } = require('../contacts');
const { dbAll, dbReady, dbRun } = require('../db');
const { WITHOUT_KEY, keyOpenAi, errorOpenAi, measureConsumption, askOnChat, consumptionFooter, transcribeAudio } = require('../openaiChat');
const { getSetting } = require('../settings');
const { mediaIsPath } = require('../util/files');
const { plural, withoutAccents } = require('../util/format');
const { readDuration } = require('../util/when');

/*
 * /tldr: summarizes a chat's conversation through ChatGPT (same key and model as /gpt).
 * /tldr              → the last 100 messages of this chat
 * /tldr 2h | 1d     → those of the last period, as in /cron: 30m, 2h, 1d, 1h30m (the "-" in front is optional)
 * /tldr 300          → the last 300 (max. setting 'tldr.maxMsgs')
 * /tldr -c família   → from another chat, looked up by name
 * /tldr -pv          → in your private chat instead of exposing it in the current chat
 * (replying)      → from the replied message until now (the typed period or -c win)
 * Uses the text already stored in the database: regular messages stay cache.messageRetentionHours (68 h). They stay
 * except the commands, the deleted ones and the media without a caption.
 */
const SUMMARY_DEFAULT = 100;
const SUMMARY_MIN = 3;
const SUMMARY_MAX_CHARS_MSG = 500;      // each message is cut here
const SUMMARY_MAX_CHARS = 60000;        // and the total, from oldest to newest

const SUMMARY_INSTRUCTIONS =
    'Você resume conversas de WhatsApp em português do Brasil. Escreva um resumo curto, em tópicos ' +
    'começados por "• ", com os assuntos principais, as decisões, os combinados e as pendências, ' +
    'citando quem disse quando for relevante. No máximo 15 tópicos. Não invente nada que não esteja ' +
    'nas mensagens e não use títulos nem markdown além de *negrito*. As linhas "[ÁUDIO]" são ' +
    'transcrições de áudios: resuma cada um (ou os de um mesmo assunto) num tópico no formato ' +
    '"🎤 *Fulano* enviou áudio DD/MM HH:mm falando sobre ...", com quem enviou e quando.';

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

// "2 horas", "1 dia e 12 horas", "30 minutos"
function byLong(ms) {
    const minutes = Math.round(ms / 60_000);
    const partsAlt = [
        [Math.floor(minutes / 1440), 'dia', 'dias'],
        [Math.floor((minutes % 1440) / 60), 'hora', 'horas'],
        [minutes % 60, 'minuto', 'minutos']
    ].filter(([n]) => n).map(([n, um, several]) => plural(n, um, several));
    return partsAlt.length > 1 ? `${partsAlt.slice(0, -1).join(', ')} e ${partsAlt.at(-1)}` : partsAlt[0];
}

// Chats with messages in the database whose name has all the words of the search
async function searchChat(search) {
    const chats = await dbAll(
        `SELECT chat_id, MAX(chat_name) AS chat_name, COUNT(*) AS total
           FROM messages GROUP BY chat_id ORDER BY MAX(timestamp) DESC`
    );
    const words = withoutAccents(search).trim().split(/\s+/);
    const foundAlt6 = chats.filter(c => words.every(p => withoutAccents(c.chat_name).includes(p)));
    const exact = foundAlt6.find(c => withoutAccents(c.chat_name) === withoutAccents(search).trim());

    if (exact || foundAlt6.length === 1) return { chat: exact || foundAlt6[0] };
    if (!foundAlt6.length) return { erro: `❌ Nenhum chat com mensagens guardadas tem "${search}" no nome.` };

    return {
        erro: `🔎 "${search}" corresponde a ${foundAlt6.length} chats. Seja mais específico:\n` +
            foundAlt6.slice(0, 10).map(c => `• ${c.chat_name}`).join('\n')
    };
}

const hour = (ms) => new Date(ms).toLocaleString('pt-BR', {
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
                arquivo: `audio.${extension === 'oga' || extension === 'opus' ? 'ogg' : extension}`,
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
        notices.push('a partir da mensagem respondida');
    }

    if (!period) {
        await msg.reply('```' + getCommandSyntax('/tldr') + '```');
        return;
    }

    const max = getSetting('tldr.maxMsgs');

    if (period.n > max) {
        notices.push(`limitado a ${max} mensagens (setting tldr.maxMsgs)`);
        period.n = max;
    }

    // The database stores the text of regular messages for cache.messageRetentionHours
    const hoursSaved = getSetting('cache.messageRetentionHours');
    const saved = hoursSaved * HOUR_MS;
    if (period.ms > saved) {
        notices.push(`as mensagens comuns ficam só ${byLong(saved)} (${hoursSaved} h) no banco (setting cache.messageRetentionHours)`);
        period.ms = saved;
    }

    await dbReady;

    // -c <name>: another chat (by the name saved in the database)
    let ids = await chatCurrentIds(chatId);
    let nameAlt = chatName;

    if (opts.opt.chat) {
        const r = await searchChat(String(opts.opt.chat));
        if (r.erro) {
            await msg.reply(r.erro);
            return;
        }
        ids = [r.chat.chat_id];
        nameAlt = r.chat.chat_name;
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

    if (sinceAReply && rows.length >= max) notices.push(`só as ${max} mais recentes (setting tldr.maxMsgs)`);

    // The audios (the AUDIOS_MAX most recent) become text; whatever could not be transcribed leaves the summary
    const audios = rows.filter(r => ['audio', 'ptt'].includes(r.type)).slice(-AUDIOS_MAX);
    for (const r of audios) r.body = (await audioTranscription(r)) ?? '';
    for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        if (!['audio', 'ptt'].includes(r.type)) continue;
        if (r.body && audios.includes(r)) r.body = `[ÁUDIO] ${r.body}`;
        else rows.splice(i, 1);
    }

    if (rows.length < SUMMARY_MIN) {
        await msg.reply(`📝 Poucas mensagens para resumir (${rows.length}) em ${nameAlt}.\n` +
            `💡 _O resumo usa o texto guardado no banco: as mensagens comuns ficam ${getSetting('cache.messageRetentionHours')} h (setting cache.messageRetentionHours), e comandos e mídias sem legenda não entram._`);
        return;
    }

    // One line per message; above the limit, the oldest leave. Yours go with your profile name.
    const myName = client.info.pushname || 'Você';
    const author = (r) => (r.from_me ? myName : r.sender_name || 'Desconhecido');
    const linesAlt = rows.map(r => `[${hour(r.timestamp)}] ${author(r)}: ${r.body.replace(/\s+/g, ' ').slice(0, SUMMARY_MAX_CHARS_MSG)}`);
    let size = linesAlt.reduce((s, l) => s + l.length + 1, 0);
    while (size > SUMMARY_MAX_CHARS && linesAlt.length > SUMMARY_MIN) size -= linesAlt.shift().length + 1;

    const first = rows[rows.length - linesAlt.length].timestamp;
    const last = rows[rows.length - 1].timestamp;

    // What is being summarized: the amount, the time window or "since the replied message"
    const messages = plural(linesAlt.length, 'mensagem', 'mensagens');
    const scope = sinceAReply
        ? `das ${messages} de ${nameAlt} desde a mensagem respondida (há ${byLong(period.ms)})`
        : period.ms
            ? `das ${messages} de ${nameAlt} do período de ${byLong(period.ms)}`
            : `das últimas ${messages} de ${nameAlt}`;
    const notice = await msg.reply(`⏳ Processando o /tldr ${scope}, aguarde.`, null, { linkPreview: false });
    try {
        const summary = await askOnChat({
            cmd: '/tldr',
            sistema: SUMMARY_INSTRUCTIONS,
            texto: `Conversa "${nameAlt}" (${linesAlt.length} mensagens):\n\n${linesAlt.join('\n')}`
        });

        const textAlt = `🤖 *Resumo de ${nameAlt}*\n` +
            `_${plural(linesAlt.length, 'mensagem', 'mensagens')} · ${hour(first)} a ${hour(last)}_` +
            (notices.length ? `\n_(${notices.join('; ')})_` : '') +
            `\n\n${summary}${await consumptionFooter()}`;

        if (opts.opt.pv) {
            await completeNotice(msg, notice, '🤖 Resumo enviado no seu privado.');
            await client.sendMessage(client.info.wid._serialized, textAlt);
        } else {
            await completeNotice(msg, notice, textAlt);
        }
    } catch (err) {
        await completeNotice(msg, notice, errorOpenAi(err, '/tldr'));
    }
}

// The -status|-s (or the openai.status setting) shows the call usage in the footer
const cmdTldr = (ctx) => measureConsumption(ctx.opts?.given.has('status'), () => summarize(ctx));

module.exports = {
    cmdTldr,
    readPeriod
};
