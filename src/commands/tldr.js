/*
 * Comando /tldr (alias /resumo).
 */

const { client } = require('../client');
const { getCommandSyntax } = require('./base');
const { MAX_DELETE_WINDOW } = require('../constants');
const { chatCurrentIds } = require('../contacts');
const { dbAll, dbReady } = require('../db');
const { WITHOUT_KEY, keyOpenAi, errorOpenAi, askOnChat } = require('../openaiChat');
const { getSetting } = require('../settings');
const { plural, withoutAccents } = require('../util/format');

/*
 * /tldr: summarizes a chat's conversation through ChatGPT (same key and model as /gpt).
 * /tldr              → the last 100 messages of this chat
 * /tldr 2h | 30m     → those of the last 2 hours | 30 minutes (the "-" in front is optional)
 *   /tldr 300          → as últimas 300 (máx. setting 'resumo.maxMsgs')
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
    'nas mensagens e não use títulos nem markdown além de *negrito*.';

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

async function cmdTldr({ msg, opts, chatId, chatName }) {
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

    const max = getSetting('resumo.maxMsgs');
    const notices = [];

    if (period.n > max) {
        notices.push(`limitado a ${max} mensagens (setting resumo.maxMsgs)`);
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
        `SELECT sender_name, from_me, body, timestamp
           FROM messages
          WHERE chat_id IN (${ids.map(() => '?').join(', ')})
            AND revoked = 0
            AND TRIM(body) != ''
            AND body NOT LIKE '/%'
            ${filterTime}
          ORDER BY timestamp DESC, rowid DESC
          LIMIT ?`,
        params
    )).reverse();

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

    try {
        msg.getChat().then(chat => chat.sendStateTyping()).catch(() => {});

        const summary = await askOnChat({
            cmd: '/tldr',
            sistema: SUMMARY_INSTRUCTIONS,
            texto: `Conversa "${nameAlt}" (${linesAlt.length} mensagens):\n\n${linesAlt.join('\n')}`
        });

        const textAlt = `📝 *Resumo de ${nameAlt}*\n` +
            `_${plural(linesAlt.length, 'mensagem', 'mensagens')} · ${hour(first)} a ${hour(last)}_` +
            (notices.length ? `\n_(${notices.join('; ')})_` : '') +
            `\n\n${summary}`;

        if (opts.opt.pv) {
            await msg.reply('📝 Resumo enviado no seu privado.');
            await client.sendMessage(client.info.wid._serialized, textAlt);
        } else {
            await msg.reply(textAlt);
        }
    } catch (err) {
        await msg.reply(errorOpenAi(err, '/tldr'));
    }
}

module.exports = {
    cmdTldr,
    readPeriod
};
