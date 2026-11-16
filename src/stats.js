/*
 * /stats counters (messages, media, deleted and edited per chat, day, hour and sender).
 */

const { client } = require('./client');
const { dbRun } = require('./db');
const { printError } = require('./log');
const { getSetting } = require('./settings');


// Day (YYYY-MM-DD) and hour (0-23) in the São Paulo timezone
function dayAndHour(ms) {
    const s = new Date(ms).toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo', hour12: false });
    return { day: s.slice(0, 10), hour: Number(s.slice(11, 13)) % 24 };
}

/**
 * Adds 1 to the sender's counter (msgs, media, deleted or edited).
 * @param {object} c { chatId, chatName, isGroup, senderId, senderName, quando (ms), campos: {msgs, media, deleted, edited} }
 */
async function countStats({ chatId, chatName, isGroup, senderId, senderName, quando: when = Date.now(), campos: fields }) {
    if (!getSetting('stats.enable')) return;
    if (!chatId || chatId === 'status@broadcast' || !senderId) return;
    // Your private chat receives the bot alerts: it is not a conversation
    if (chatId === client.info?.wid?._serialized) return;

    const { day, hour } = dayAndHour(when);
    const v = { msgs: 0, media: 0, deleted: 0, edited: 0, ...fields };

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
    ).catch(err => printError('/stats: error counting:', err.message));
}

// Your messages count for your number (in any chat)
const myIdStats = () => client.info?.wid?.user;

module.exports = {
    countStats,
    dayAndHour,
    myIdStats
};
