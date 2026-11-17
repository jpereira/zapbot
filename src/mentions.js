/*
 * The mentions of a stored message: the text carries the raw id (@265472113143884) and the column
 * messages.mentions stores the real ids (@lid or @c.us) that WhatsApp sent with it. With them,
 * the name is found without guessing whether the number is a LID or a phone.
 */

const { dbGet } = require('./db');
const { resolverMentions } = require('./contacts');

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
async function messageResolverMentions(textAlt, messageId) {
    if (!/@\d{6,}/.test(String(textAlt ?? ''))) return String(textAlt ?? '');
    return resolverMentions(textAlt, await mentionsRecorded(messageId));
}

// The mention ids of a WhatsApp message, as JSON for the column (null: none)
function mentionsForRecord(mentionedIds) {
    const ids = (mentionedIds ?? [])
        .map(m => typeof m === 'string' ? m : m?._serialized)
        .filter(Boolean);
    return ids.length ? JSON.stringify([...new Set(ids)]) : null;
}

module.exports = { mentionsRecorded, mentionsForRecord, messageResolverMentions };
