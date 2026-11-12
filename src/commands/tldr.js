/*
 * Comando /tldr (alias /resumo).
 */

const fs = require('fs');
const path = require('path');

const { client, completeNotice } = require('../client');
const { getCommandSyntax } = require('./base');
const { MAX_DELETE_WINDOW } = require('../constants');
const { chatCurrentIds } = require('../contacts');
const { dbAll, dbReady, dbRun } = require('../db');
const { WITHOUT_KEY, keyOpenAi, errorOpenAi, measureConsumption, askOnChat, consumptionFooter, transcribeAudio } = require('../openaiChat');
const { getSetting } = require('../settings');
const { mediaIsPath } = require('../util/files');
const { plural, withoutAccents } = require('../util/format');

/*
 * /tldr: summarizes a chat's conversation through ChatGPT (same key and model as /gpt).
 * /tldr              → the last 100 messages of this chat
 * /tldr 2h | 30m     → those of the last 2 hours | 30 minutes (the "-" in front is optional)
 * /tldr 300          → the last 300 (max. setting 'tldr.maxMsgs')
 * /tldr -c família   → from another chat, looked up by name
 * /tldr -pv          → in your private chat instead of exposing it in the current chat
 * Uses the text already stored in the database: regular messages stay 68 h. They stay
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
 * Requested period: "2h", "-2h", "30m" (time window) or "300", "-300" (amount).
 * @returns {{ ms?: number, n?: number } | null} null if the text is not a period
 */
function readPeriod(textAlt) {
    const m = String(textAlt).trim().match(/^-?(\d+)\s*(h|m|min)?$/i);
    if (!m || Number(m[1]) < 1) return null;

    const n = Number(m[1]);
    if (!m[2]) return { n };
    return { ms: n * (m[2].toLowerCase() === 'h' ? 3600_000 : 60_000) };
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

async function summarize({ msg, opts, chatId, chatName }) {
    if (!keyOpenAi()) {
        await msg.reply(WITHOUT_KEY('/tldr'));
        return;
    }

    const extras = opts.argv.filter(Boolean);
    const period = extras.length ? readPeriod(extras.join('')) : { n: SUMMARY_DEFAULT };

    if (!period) {
        await msg.reply('```' + getCommandSyntax('/tldr') + '```');
        return;
    }

    const max = getSetting('tldr.maxMsgs');
    const notices = [];

    if (period.n > max) {
        notices.push(`limitado a ${max} mensagens (setting tldr.maxMsgs)`);
        period.n = max;
    }

    if (period.ms > MAX_DELETE_WINDOW) {
        notices.push('as mensagens comuns ficam só 68 h no banco');
        period.ms = MAX_DELETE_WINDOW;
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
            '💡 _O resumo usa o texto guardado no banco: as mensagens comuns ficam 68 h, e comandos e mídias sem legenda não entram._');
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

    const notice = await msg.reply('⏳ Processando o /tldr, aguarde.', null, { linkPreview: false });
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
