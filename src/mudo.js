/*
 * /mute: people and groups whose notices of deleted, edited, deleted-status and reactions are muted.
 */

const { dbAll, dbGet, dbReady, dbRun } = require('./db');
const { t } = require('./i18n');
const { printInfo } = require('./log');

/*
 * Each muted entry (`mutes` table) is a person or a group, with what stays
 * silenced: deleted, edited, deleted-status and/or removed reactions
 * or changed. Only the NOTICE in your
 * private is cut: the message stays stored, and /show shows it.
 * In a group, it applies to everyone there; on a person, to whatever they send in
 * any chat (and for its status).
 *
 * /watch also stays quiet in your private chat for whoever is muted in
 * any of the types (the rules' -to keep receiving).
 *
 * Each cut notice goes to `mute_hits` (/bot -status counts the ignored ones).
 */
const TYPES = {
    apagada: { coluna: 'deleted', get rotulo() { return t('grp.mute.type.deleted'); } },
    editada: { coluna: 'edited', get rotulo() { return t('grp.mute.type.edited'); } },
    status: { coluna: 'status', get rotulo() { return t('grp.mute.type.status'); } },
    reacao: { coluna: 'reaction', get rotulo() { return t('grp.mute.type.reaction'); } }
};

// The number of a person jid (5521...@c.us → 5521...); @lid and groups stay whole
const idKey = (id) => (String(id ?? '').endsWith('@c.us') ? String(id).split('@')[0] : String(id ?? ''));

/**
 * Is the notice of this type, from this chat/sender, muted?
 * 'watch' applies to any muted entry, of whatever type.
 * @param {'apagada'|'editada'|'status'|'reacao'|'watch'} tipo
 * @param {object} o
 * @param {string} o.chatId
 * @param {Array<string|null>} o.remetentes  jids and/or numbers of the senders
 * @returns {Promise<object|null>} the muted one that matched (or null)
 */
async function muted(type, { chatId, remetentes: senders = [] }) {
    await dbReady;
    const whereAlt = type === 'watch'
        ? Object.values(TYPES).map(t => `${t.coluna} = 1`).join(' OR ')
        : `${TYPES[type].coluna} = 1`;
    const mutes = await dbAll(`SELECT * FROM mutes WHERE ${whereAlt}`);
    if (!mutes.length) return null;

    const keys = new Set([chatId, ...senders].filter(Boolean).map(r => idKey(r.includes('@') ? r : `${r}@c.us`)));
    return mutes.find(m => keys.has(idKey(m.target_id))) ?? null;
}

// Records a cut notice (for /bot -status and for the /mute list)
async function registerIgnored(mute, type) {
    await dbRun('INSERT INTO mute_hits (target_id, kind, at) VALUES (?, ?, ?)', [mute.target_id, type, Date.now()]);
    printInfo(`/mute: ${type} notice from ${mute.target_name} ignored`);
}

/**
 * Checks and, if muted, records. Shortcut for the events.
 * @returns {Promise<boolean>} true = do not notify
 */
async function ignoreNotice(type, origin) {
    const mute = await muted(type, origin);
    if (!mute) return false;
    await registerIgnored(mute, type);
    return true;
}

/**
 * Records where a sent notice came from (/mute replying to it knows who to mute).
 * @param {object} enviada  the Message returned by client.sendMessage
 * @param {object} origem
 * @param {string} origem.chatId     the chat of the notified message
 * @param {string} [origem.remetente]  the phone (or id) of who sent it
 */
async function registerNotice(sent, { chatId, remetente: sender }) {
    const id = sent?.id?.id;
    if (!id || !chatId) return;
    await dbRun(
        'INSERT OR REPLACE INTO alerts (message_id, chat_id, sender, created_at) VALUES (?, ?, ?, ?)',
        [id, chatId, sender ?? null, Date.now()]
    ).catch(() => {});
}

// Where the notice with this id came from: { chat_id, sender }, or null
async function noticeOrigin(messageId) {
    if (!messageId) return null;
    await dbReady;
    const origin = await dbGet('SELECT chat_id, sender FROM alerts WHERE message_id = ?', [messageId]);
    return origin ?? null;
}

module.exports = {
    TYPES,
    idKey,
    ignoreNotice,
    noticeOrigin,
    registerNotice,
    silenciado: muted
};
