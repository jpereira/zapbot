/*
 * The mentions of a stored message: the text carries the raw id (@265472113143884) and the column
 * messages.mentions stores the real ids (@lid or @c.us) that WhatsApp sent with it. With them,
 * the name is found without guessing whether the number is a LID or a phone.
 */

const { dbAll, dbGet, dbRun } = require('./db');
const { client } = require('./client');
const { printInfo } = require('./log');
const { resolveMentions } = require('./contacts');

/**
 * The mention ids of the message, as stored (string[]); empty if none.
 * @param {string} messageId
 */
async function mentionsRecorded(messageId) {
    if (!messageId) return [];
    const row = await dbGet('SELECT mentions FROM messages WHERE id = ?', [messageId]).catch(() => null);
    try {
        const ids = JSON.parse(row?.mentions ?? '[]');
        return Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : [];
    } catch {
        return [];
    }
}

/** Swaps a text's raw mentions for the name, using the message's stored ids. */
async function resolveMessageMentions(textAlt, messageId) {
    if (!/@\d{6,}/.test(String(textAlt ?? ''))) return String(textAlt ?? '');
    return resolveMentions(textAlt, await mentionsRecorded(messageId));
}

// The mention ids of a WhatsApp message, as JSON for the column (null: none)
function mentionsForRecord(mentionedIds) {
    const ids = (mentionedIds ?? [])
        .map(m => typeof m === 'string' ? m : m?._serialized)
        .filter(Boolean);
    return ids.length ? JSON.stringify([...new Set(ids)]) : null;
}

/**
 * Joins the stored mentions with those of an edit (which may tag new people).
 * @param {string} messageId
 * @param {Array<string|{_serialized: string}>} mentionedIds  the mentionedIds of the edited message
 */
async function appendMentions(messageId, mentionedIds) {
    const freshAlt2 = mentionsForRecord(mentionedIds);
    if (!freshAlt2) return;
    const allAlt = mentionsForRecord([...await mentionsRecorded(messageId), ...JSON.parse(freshAlt2)]);
    await dbRun('UPDATE messages SET mentions = ? WHERE id = ?', [allAlt, messageId]);
}

/**
 * Messages stored before mentions existed: finds the @number ids of the text among the
 * group participants and stores it. Whoever is not found stays with [] (does not try again).
 * @param {object} [o]
 * @param {number} [o.limit]  how many messages at a time (the newest first)
 * @returns {Promise<{ read: number, filled: number }>}
 */
async function fillMentionsOld({ limit: limitAlt = 5000 } = {}) {
    const linesAlt = await dbAll(
        "SELECT id, chat_id, body FROM messages WHERE mentions IS NULL AND body LIKE '%@%' ORDER BY timestamp DESC LIMIT ?",
        [limitAlt]
    );

    const participants = new Map(); // chatId -> Map(number -> full id)
    const group = async (chatId) => {
        if (!participants.has(chatId)) {
            const chat = chatId.endsWith('@g.us') ? await client.getChatById(chatId).catch(() => null) : null;
            const map = new Map();
            for (const p of chat?.participants ?? []) {
                const id = p?.id?._serialized;
                if (id) map.set(id.split('@')[0], id);
            }
            participants.set(chatId, map);
        }
        return participants.get(chatId);
    };

    let read = 0;
    let filled = 0;
    for (const { id, chat_id: chatId, body } of linesAlt) {
        const numbers = [...new Set([...String(body).matchAll(/@(\d{6,})/g)].map(m => m[1]))];
        if (!numbers.length) continue;

        read++;
        const map = await group(chatId);
        const ids = numbers.map(n => map.get(n)).filter(Boolean);
        await dbRun('UPDATE messages SET mentions = ? WHERE id = ? AND mentions IS NULL', [JSON.stringify(ids), id]);
        if (ids.length) filled++;
    }

    if (read) printInfo(`[Mentions] ${filled} of ${read} old messages with mention ids filled in`);
    return { read, filled };
}

module.exports = { appendMentions, fillMentionsOld, mentionsRecorded, mentionsForRecord, resolveMessageMentions };
