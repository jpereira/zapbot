/*
 * /mudo: people and groups whose notices of deleted, edited and deleted-status messages are muted.
 */

const { dbAll, dbReady, dbRun } = require('./db');
const { printInfo } = require('./log');

/*
 * Each muted entry (`mutes` table) is a person or a group, with what stays
 * silenced: deleted, edited and/or deleted-status ones. Only the NOTICE in your
 * private is cut: the message stays stored, and /show shows it.
 * In a group, it applies to everyone there; on a person, to whatever they send in
 * any chat (and for its status).
 *
 * Each cut notice goes to `mute_hits` (/status counts the ignored ones).
 */
const TYPES = {
    apagada: { coluna: 'deleted', rotulo: 'apagadas' },
    editada: { coluna: 'edited', rotulo: 'editadas' },
    status: { coluna: 'status', rotulo: 'status' }
};

// The number of a person jid (5521...@c.us → 5521...); @lid and groups stay whole
const idKey = (id) => (String(id ?? '').endsWith('@c.us') ? String(id).split('@')[0] : String(id ?? ''));

/**
 * Is the notice of this type, from this chat/sender, muted?
 * @param {'apagada'|'editada'|'status'} tipo
 * @param {object} o
 * @param {string} o.chatId
 * @param {Array<string|null>} o.remetentes  jids and/or numbers of the senders
 * @returns {Promise<object|null>} the muted one that matched (or null)
 */
async function muted(type, { chatId, remetentes: senders = [] }) {
    await dbReady;
    const column = TYPES[type].coluna;
    const mutes = await dbAll(`SELECT * FROM mutes WHERE ${column} = 1`);
    if (!mutes.length) return null;

    const keys = new Set([chatId, ...senders].filter(Boolean).map(r => idKey(r.includes('@') ? r : `${r}@c.us`)));
    return mutes.find(m => keys.has(idKey(m.target_id))) ?? null;
}

// Records a cut notice (for /status and for the /mudo list)
async function registerIgnored(mute, type) {
    await dbRun('INSERT INTO mute_hits (target_id, kind, at) VALUES (?, ?, ?)', [mute.target_id, type, Date.now()]);
    printInfo(`/mudo: aviso de ${type} de ${mute.target_name} ignorado`);
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

module.exports = {
    TYPES,
    idKey,
    ignoreNotice,
    silenciado: muted
};
