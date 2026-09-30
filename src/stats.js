/*
 * Contadores do /stats (mensagens, mídias, apagadas e editadas por chat, dia, hora e remetente).
 */

const { client } = require('./cliente');
const { dbRun } = require('./db');
const { printError } = require('./log');
const { getSetting } = require('./settings');

/*
 * Contadores do /stats
 */

// Dia (AAAA-MM-DD) e hora (0-23) no fuso de São Paulo
function diaEHora(ms) {
    const s = new Date(ms).toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo', hour12: false });
    return { day: s.slice(0, 10), hour: Number(s.slice(11, 13)) % 24 };
}

/**
 * Soma 1 no contador do remetente (msgs, media, deleted ou edited).
 * @param {object} c { chatId, chatName, isGroup, senderId, senderName, quando (ms), campos: {msgs, media, deleted, edited} }
 */
async function contarStats({ chatId, chatName, isGroup, senderId, senderName, quando = Date.now(), campos }) {
    if (!getSetting('stats.enabled')) return;
    if (!chatId || chatId === 'status@broadcast' || !senderId) return;
    // O seu privado recebe os alertas do bot: não é conversa
    if (chatId === client.info?.wid?._serialized) return;

    const { day, hour } = diaEHora(quando);
    const v = { msgs: 0, media: 0, deleted: 0, edited: 0, ...campos };

    await dbRun(
        `INSERT INTO stats (chat_id, chat_name, is_group, day, hour, sender_id, sender_name, msgs, media, deleted, edited)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (chat_id, day, hour, sender_id) DO UPDATE SET
            chat_name   = COALESCE(excluded.chat_name, stats.chat_name),
            sender_name = COALESCE(excluded.sender_name, stats.sender_name),
            msgs        = stats.msgs + excluded.msgs,
            media       = stats.media + excluded.media,
            deleted     = stats.deleted + excluded.deleted,
            edited      = stats.edited + excluded.edited`,
        [chatId, chatName, isGroup ? 1 : 0, day, hour, senderId, senderName, v.msgs, v.media, v.deleted, v.edited]
    ).catch(err => printError('/stats: erro ao contar:', err.message));
}

// As suas mensagens contam para o seu número (em qualquer chat)
const meuIdStats = () => client.info?.wid?.user;

module.exports = {
    contarStats,
    diaEHora,
    meuIdStats
};
