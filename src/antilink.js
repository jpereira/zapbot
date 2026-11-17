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

const { notify, noticeText } = require('./commands/warn');
const { client } = require('./client');
const { dbGet, dbReady, dbRun } = require('./db');
const { t } = require('./i18n');
const { printError, printInfo } = require('./log');

const MODES = ['off', 'delete', 'warn', 'remove'];

// http(s)://, www., WhatsApp invites and loose domains with common TLDs (arquivo.zip does not count)
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
    return { modo: row?.mode ?? 'off', liberados: releasedAlt };
}

async function recordConfig(chatId, { modo: mode, liberados: releasedAlt }) {
    await dbReady;
    await dbRun(
        `INSERT INTO antilink (chat_id, mode, allow) VALUES (?, ?, ?)
         ON CONFLICT(chat_id) DO UPDATE SET mode = excluded.mode, allow = excluded.allow`,
        [chatId, mode, JSON.stringify(releasedAlt)]
    );
}

const groupIsAdmin = (p) => Boolean(p?.isAdmin || p?.isSuperAdmin);

/**
 * Checks a group message and acts according to the mode. Called by the messages event, after saving.
 * @param {object} o
 * @param {object} o.msg
 * @param {string} o.chatId
 * @param {string} o.body
 * @param {boolean} o.dispensado   the owner or a bot admin: never caught
 * @param {string} o.senderName
 * @returns {Promise<boolean>} true = a mensagem foi tratada (apagada)
 */
async function checkAntilink({ msg, chatId, body, dispensado: dismissed, senderName }) {
    if (dismissed || msg.fromMe || !chatId.endsWith('@g.us') || body.startsWith('/')) return false;

    const domains = domainsAlt(body);
    if (!domains.length) return false;

    const { modo: mode, liberados: releasedAlt } = await groupConfig(chatId);
    if (mode === 'off') return false;

    const bad = prohibited(domains, releasedAlt);
    if (!bad.length) return false;

    const group = await msg.getChat().catch(() => null);
    if (!group?.isGroup) return false;

    const authorId = msg.author || msg.from;
    const author = group.participants.find((p) => p.id._serialized === authorId || p.id.user === authorId.split('@')[0]);
    if (groupIsAdmin(author)) return false;

    const eu = group.participants.find((p) => p.id._serialized === client.info.wid._serialized || p.id.user === client.info.wid.user);
    if (!groupIsAdmin(eu)) {
        printInfo(`[Antilink] link de ${senderName} em ${chatId} mantido: o bot não é admin do grupo`);
        return false;
    }

    try {
        await msg.delete(true);
    } catch (err) {
        printError('[Antilink] não apaguei:', err.message);
        return false;
    }
    printInfo(`[Antilink] link de ${senderName} apagado em ${chatId} (${mode}): ${bad.join(', ')}`);

    const nameAlt = senderName || authorId.split('@')[0];
    if (mode === 'delete') {
        await client.sendMessage(chatId, t('antilink.deleted', { name: nameAlt }), { linkPreview: false }).catch(() => {});
    } else if (mode === 'warn' && author) {
        const r = await notify({ grupo: group, participante: author, nome: nameAlt, motivo: t('antilink.reason'), por: 'antilink' });
        await client.sendMessage(chatId, `${t('antilink.deleted', { name: nameAlt })}\n${noticeText(nameAlt, t('antilink.reason'), r)}`, { linkPreview: false }).catch(() => {});
    } else if (mode === 'remove' && author) {
        try {
            await group.removeParticipants([author.id._serialized]);
            await client.sendMessage(chatId, t('antilink.removed', { name: nameAlt }), { linkPreview: false }).catch(() => {});
        } catch (err) {
            printError('[Antilink] não removi:', err.message);
        }
    }
    return true;
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
