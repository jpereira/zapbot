/*
 * /antilink: the bot deletes (and, depending on the mode, warns or removes) whoever sends a link in a group and is not an admin.
 *
 * Modes (antilink table, one per group):
 * off     → does nothing (the default)
 * delete  → deletes the message for everyone
 * warn    → deletes and adds a /warn warning (at the warn.max limit, the person leaves)
 * remove  → deletes and removes the person right away
 * A group admin, the owner and the bot admins are never caught. The allowed domains
 * (/antilink -allow youtube.com) apply to subdomains (m.youtube.com).
 * Deleting other people's message and removing require the bot account to be a group admin.
 */

const { dbGet, dbReady, dbRun } = require('./db');
const { t } = require('./i18n');
const { MODES, applyMode } = require('./moderation');

// http(s)://, www., WhatsApp invites and loose domains with common TLDs (file.zip does not count)
const TLDS = 'com|net|org|io|me|gg|ly|co|app|dev|xyz|info|link|tv|ai|br|pt|us|uk|de|fr|es|it|ru|cn|in|club|shop|site|online|top|vip|cc|to|sh|gl|be';
const LINK = new RegExp(
    `(?:https?:\\/\\/[^\\s<>"']+)|(?:www\\.[^\\s<>"']+)|(?:\\b[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.(?:${TLDS})\\b(?:\\/[^\\s<>"']*)?)`,
    'gi'
);

/**
 * The domains of a text's links, lowercase and without "www.".
 * @returns {string[]}
 */
function domainsAlt(textAlt) {
    const foundAlt4 = String(textAlt ?? '').match(LINK) ?? [];
    const domains = foundAlt4.map((l) => l.toLowerCase()
        .replace(/^https?:\/\//, '').replace(/^www\./, '')
        .split(/[/?#:]/)[0].replace(/[.,;!)\]]+$/, '')).filter(Boolean);
    return [...new Set(domains)];
}

// "m.youtube.com" matches "youtube.com" (and itself); "notyoutube.com" does not
const home = (domain, released) => domain === released || domain.endsWith(`.${released}`);

// The domains that are not on the allowed list
const prohibited = (domains, releasedAlt) => domains.filter((d) => !releasedAlt.some((l) => home(d, l)));

// "https://www.YouTube.com/x" or "youtube.com" → "youtube.com"; no domain: null
function normalizeDomain(textAlt) {
    const d = String(textAlt ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#:]/)[0];
    return /^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)+$/.test(d) ? d : null;
}

async function groupConfig(chatId) {
    await dbReady;
    const row = await dbGet('SELECT mode, allow FROM antilink WHERE chat_id = ?', [chatId]);
    let releasedAlt;
    try {
        releasedAlt = JSON.parse(row?.allow ?? '[]');
    } catch {
        releasedAlt = [];
    }
    return { mode: row?.mode ?? 'off', allowed: releasedAlt };
}

async function recordConfig(chatId, { mode, allowed: releasedAlt }) {
    await dbReady;
    await dbRun(
        `INSERT INTO antilink (chat_id, mode, allow) VALUES (?, ?, ?)
         ON CONFLICT(chat_id) DO UPDATE SET mode = excluded.mode, allow = excluded.allow`,
        [chatId, mode, JSON.stringify(releasedAlt)]
    );
}

/**
 * Checks a group message and acts according to the mode. Called by the messages event, after saving.
 * @param {object} o
 * @param {object} o.msg
 * @param {string} o.chatId
 * @param {string} o.body
 * @param {boolean} o.dismissed   the owner or a bot admin: never caught
 * @param {string} o.senderName
 * @returns {Promise<boolean>} true = a message foi tratada (apagada)
 */
async function checkAntilink({ msg, chatId, body, dismissed, senderName }) {
    if (dismissed || msg.fromMe || !chatId.endsWith('@g.us') || body.startsWith('/')) return false;

    const domains = domainsAlt(body);
    if (!domains.length) return false;

    const { mode, allowed: releasedAlt } = await groupConfig(chatId);
    if (mode === 'off') return false;

    const bad = prohibited(domains, releasedAlt);
    if (!bad.length) return false;

    return applyMode({
        msg, chatId, mode, senderName,
        tag: 'Antilink',
        detail: bad.join(', '),
        deletedNotice: t('antilink.deleted', { name: '{name}' }),
        removedNotice: t('antilink.removed', { name: '{name}' }),
        reason: t('antilink.reason')
    });
}

module.exports = {
    MODES,
    groupConfig,
    domainsAlt,
    recordConfig,
    normalizeDomain,
    prohibited,
    checkAntilink
};
