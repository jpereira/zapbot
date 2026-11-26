/*
 * What the web interface shows: the chats and the messages of the database (the same ones /show reads),
 * with the edits, the reactions and the media of each one.
 */

const fs = require('fs-extra');
const path = require('path');

const { client } = require('../client');
const { CONTACTS_DIR, MEDIA_DIR } = require('../constants');
const { contactPhoto } = require('../contactPhotos');
const { contactName, resolveGroupName, resolvePrivateName, resolveLidToPhone, resolveMentions } = require('../contacts');
const { dbAll, dbGet } = require('../db');
const { getSetting } = require('../settings');
const { isJpegPreview, visibleBody } = require('../util/messageBody');
const { findMatch } = require('../watch/rules');

const STATUS = 'status@broadcast';
const MAX_PAGE = 500;
// The page filters the list itself (the search box), so it gets every chat, not only the first ones
const MAX_CHATS = 3000;
const NAME_TIMEOUT_MS = 2500;
// The whole list waits at most this for the names it has never seen; the rest come in the background (next load)
const LIST_NAMES_BUDGET_MS = 1500;

// The media the browser may show on the page itself; the rest is always a download
const INLINE_TYPES = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.3gp': 'video/3gpp',
    '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4',
    '.aac': 'audio/aac', '.wav': 'audio/wav', '.pdf': 'application/pdf'
};

const digits = (id) => String(id ?? '').split('@')[0].replace(/\D/g, '');

// The live names (address book, group subject): an old one is still shown at once and asked again in the
// background (getChatById builds the whole group: asking for every chat on every page made the list take seconds)
const names = new Map();       // id → { name, at }
const asking = new Map();      // id → the lookup in progress
const NAME_TTL_MS = 30 * 60 * 1000;
const NAME_LOOKUPS = 4;        // at most these at the same time in the WhatsApp page
let lookups = 0;
const waiting = [];

async function lookupName(id) {
    if (lookups >= NAME_LOOKUPS) await new Promise(resolve => waiting.push(resolve));
    lookups++;
    try {
        const isGroup = id.endsWith('@g.us');
        const name = await withTimeout((isGroup ? resolveGroupName(id, { maxAge: 0 }) : resolvePrivateName(id)).catch(() => null), NAME_TIMEOUT_MS);
        names.set(id, { name: name || names.get(id)?.name || null, at: Date.now() });
    } finally {
        lookups--;
        waiting.shift()?.();
        asking.delete(id);
    }
}

// The live name of a chat (null: unknown); `wait` is how long to wait for one never seen (0: only the cache)
async function liveName(id, wait = NAME_TIMEOUT_MS) {
    const cached = names.get(id);
    if (client.pupPage && (!cached || Date.now() - cached.at >= NAME_TTL_MS) && !asking.has(id)) asking.set(id, lookupName(id));
    if (cached || !asking.has(id) || wait <= 0) return cached?.name ?? null;
    await withTimeout(asking.get(id), wait);
    return names.get(id)?.name ?? null;
}

// "X's security code changed": the WhatsApp notice (type e2e_notification) that the bot saves with the jid of X as the body.
// zapbot.web.warnChangedPhone off: these notices do not appear in the history, nor in the counts
const E2E = 'e2e_notification';
// The other notices of the system (a group event, a call, a protocol message): a discreet line, never a bubble of an empty message from an unknown sender
const SYSTEM_NOTICES = new Set(['broadcast_notification', 'call_log', 'gp2', 'notification', 'notification_template', 'protocol', 'message_history_notice', 'group-history']);
// A chat is listed for its messages: the notices (a security code that changed, a group event...) do not make a chat
// appear, move it up in the list, nor count in its totals (they still show inside the chat, as lines)
const NOTICE_TYPES = [E2E, ...SYSTEM_NOTICES].map(type => `'${type}'`).join(', ');
const REAL = `type NOT IN (${NOTICE_TYPES})`;

// The name of whoever the notice is about (null: the bot does not know who it is)
const noticeNames = new Map();
async function whoOfNotice(body) {
    const jid = String(body ?? '').trim();
    if (!/^\d+@(?:lid|c\.us)$/.test(jid)) return null;
    if (noticeNames.has(jid)) return noticeNames.get(jid);
    const byJid = await dbGet('SELECT sender_name FROM messages WHERE sender_jid = ? AND sender_name IS NOT NULL AND sender_name <> ? ORDER BY timestamp DESC LIMIT 1', [jid, jid]);
    let name = byJid?.sender_name ?? null;
    if (!name) {
        let number = jid.endsWith('@c.us') ? jid.split('@')[0] : null;
        if (!number && client.pupPage) {
            const phone = await withTimeout(resolveLidToPhone(jid).catch(() => null), NAME_TIMEOUT_MS);
            number = phone?.endsWith('@c.us') ? phone.split('@')[0] : null;
        }
        if (number) {
            const byNumber = await dbGet('SELECT sender_name FROM messages WHERE sender_number = ? AND sender_name IS NOT NULL AND sender_name <> ? ORDER BY timestamp DESC LIMIT 1', [number, number]);
            name = byNumber?.sender_name ?? `+${number}`;
        }
    }
    if (name) noticeNames.set(jid, name);
    return name;
}

const withTimeout = (promise, ms) => Promise.race([promise, new Promise(resolve => setTimeout(() => resolve(null), ms))]);

/**
 * The name shown for a chat: the address book name; without it, the profile name (pushname) the bot
 * stored; without it, the number.
 * @param {{ chat_id: string, chat_name?: string|null, is_group?: number }} chat
 */
async function chatName(chat, { wait = NAME_TIMEOUT_MS } = {}) {
    const id = chat.chat_id;
    if (id === STATUS) return 'Status';
    const stored = String(chat.chat_name ?? '').trim();
    if (chat.is_group || id.endsWith('@g.us')) {
        const live = await liveName(id, wait);
        if (live) return live;
        const last = await dbGet(`SELECT chat_name FROM messages
            WHERE chat_id = ? AND TRIM(chat_name) <> ''
            ORDER BY timestamp DESC, id DESC LIMIT 1`, [id]);
        return last?.chat_name.trim() || stored || id.split('@')[0];
    }

    const live = await liveName(id, wait);
    const number = digits(id);
    // A stored name that is only the number is not a name
    const storedName = stored && !(number && stored.replace(/\D/g, '') === number) ? stored : null;
    return live || storedName || (number ? `+${number}` : id);
}

/**
 * The chats with messages in the database, from the most recent to the oldest, with the last message.
 * @param {string} [search]  part of the name or the number
 */
async function listChats(search = '') {
    const rows = await dbAll(`
        SELECT chat_id, MAX(chat_name) AS chat_name, MAX(is_group) AS is_group, COUNT(*) AS total,
               SUM(revoked) AS deleted, MIN(timestamp) AS first_ts, MAX(timestamp) AS last_ts
          FROM messages WHERE ${REAL}
         GROUP BY chat_id
         ORDER BY (chat_id = ?) DESC, last_ts DESC`, [STATUS]);
    const until = Date.now() + LIST_NAMES_BUDGET_MS;
    const chats = await Promise.all(rows.map(async row => ({ ...row, name: await chatName(row, { wait: until - Date.now() }) })));
    const q = String(search ?? '').trim().toLowerCase();
    const found = q ? chats.filter(c => c.name.toLowerCase().includes(q) || digits(c.chat_id).includes(q.replace(/\D/g, '') || '\0')) : chats;

    for (const chat of found.slice(0, MAX_CHATS)) {
        const last = await dbGet('SELECT body, type, has_media, revoked, from_me FROM messages WHERE chat_id = ? AND ' + REAL + ' ORDER BY timestamp DESC LIMIT 1', [chat.chat_id]);
        chat.last = last ? { body: last.type === E2E ? '🔒' : SYSTEM_NOTICES.has(last.type) ? 'ℹ️' : visibleBody(last.body).slice(0, 120), type: last.type, media: Boolean(last.has_media), deleted: Boolean(last.revoked), fromMe: Boolean(last.from_me) } : null;
    }
    return found.slice(0, MAX_CHATS).map(c => ({
        id: c.chat_id, name: c.name, isGroup: Boolean(c.is_group), total: c.total, deleted: c.deleted ?? 0,
        firstAt: c.first_ts, lastAt: c.last_ts, last: c.last
    }));
}

/** The span and the size of a chat's history (for the "history of X until Y" notice) */
async function chatInfo(chatId) {
    const row = await dbGet(`SELECT chat_id, MAX(chat_name) AS chat_name, MAX(is_group) AS is_group, COUNT(*) AS total,
        SUM(revoked) AS deleted, MIN(timestamp) AS first_ts, MAX(timestamp) AS last_ts FROM messages WHERE chat_id = ? AND ${REAL}`, [chatId]);
    if (!row?.total) {
        // Only notices: the chat is not listed, but it can be opened (from a link), empty
        const any = await dbGet('SELECT chat_id, MAX(chat_name) AS chat_name, MAX(is_group) AS is_group, MIN(timestamp) AS first_ts, MAX(timestamp) AS last_ts FROM messages WHERE chat_id = ?', [chatId]);
        if (!any?.chat_id) return null;
        return { id: chatId, name: await chatName(any), isGroup: Boolean(any.is_group), total: 0, deleted: 0, edited: 0, firstAt: any.first_ts, lastAt: any.last_ts };
    }
    const edits = await dbGet('SELECT COUNT(*) AS n FROM message_edits WHERE chat_id = ?', [chatId]);
    return {
        id: chatId, name: await chatName(row), isGroup: Boolean(row.is_group), total: row.total, deleted: row.deleted ?? 0,
        edited: edits?.n ?? 0, firstAt: row.first_ts, lastAt: row.last_ts
    };
}

// The file of a message's media, only if it is really inside the media folder
async function mediaFile(row) {
    if (!row.media_path) return null;
    const file = path.resolve(MEDIA_DIR, row.media_path);
    const base = await fs.realpath(MEDIA_DIR).catch(() => null);
    const real = await fs.realpath(file).catch(() => null);
    if (!base || !real || !real.startsWith(base + path.sep)) return null;
    const stat = await fs.stat(real).catch(() => null);
    return stat?.isFile() ? { file: real, size: stat.size } : null;
}

const mimeOf = (file) => INLINE_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';

async function reactionDetails(ids) {
    if (!ids.length) return new Map();
    const marks = ids.map(() => '?').join(',');
    const [active, changes] = await Promise.all([
        dbAll(`SELECT message_id, reaction FROM reactions WHERE message_id IN (${marks})`, ids),
        dbAll(`SELECT message_id, sender_name, sender_number, old_reaction, new_reaction, changed_at
            FROM reaction_changes WHERE message_id IN (${marks}) ORDER BY changed_at, id`, ids)
    ]);
    const activeById = Map.groupBy(active, row => row.message_id);
    const changesById = Map.groupBy(changes, row => row.message_id);
    return new Map(ids.map(id => [id, {
        reactions: (activeById.get(id) ?? []).map(row => row.reaction),
        reactionChanges: (changesById.get(id) ?? []).map(row => ({
            by: row.sender_name || (row.sender_number ? `+${row.sender_number}` : null),
            old: row.old_reaction || '', new: row.new_reaction || '', at: row.changed_at
        }))
    }]));
}

async function chatReactions(chat, ids) {
    if (!ids.length) return [];
    const marks = ids.map(() => '?').join(',');
    const rows = await dbAll(`SELECT id FROM messages WHERE chat_id = ? AND id IN (${marks})`, [chat, ...ids]);
    const details = await reactionDetails(rows.map(row => row.id));
    return Array.from(details, ([id, data]) => ({ id, ...data }));
}

/**
 * A page of a chat's messages (in the order asked), with the edits, reactions and media.
 * @param {object} o
 * @param {string} o.chat
 * @param {number} [o.from]    timestamp (s), inclusive
 * @param {number} [o.to]      timestamp (s), inclusive
 * @param {'asc'|'desc'} [o.order]
 * @param {string} [o.cursor]  "<timestamp>:<id>" of the last message of the previous page
 * @param {number} [o.limit]
 * @param {string} [o.q]       text to look for
 * @param {string[]} [o.ids]   only these messages (the selection to export)
 */
async function listMessages({ chat, from = null, to = null, order = 'asc', cursor = null, limit = null, q = '', ids: only = null }) {
    const size = only ? 2000 : Math.min(MAX_PAGE, Math.max(1, Number(limit) || getSetting('zapbot.web.pageSize')));
    const asc = order !== 'desc';
    const where = ['chat_id = ?'];
    if (!getSetting('zapbot.web.warnChangedPhone')) where.push(`type <> '${E2E}'`);
    const params = [chat];
    if (only) { where.push(`id IN (${only.map(() => '?').join(',')})`); params.push(...only); }
    if (Number.isFinite(from)) { where.push('timestamp >= ?'); params.push(from); }
    if (Number.isFinite(to)) { where.push('timestamp <= ?'); params.push(to); }
    if (q) { where.push("(body LIKE ? ESCAPE '\\' OR transcription LIKE ? ESCAPE '\\')"); const like = `%${String(q).replace(/[\\%_]/g, '\\$&')}%`; params.push(like, like); }
    const [cursorTs, ...cursorId] = String(cursor ?? '').split(':');
    if (cursor && Number.isFinite(Number(cursorTs))) {
        where.push(asc ? '(timestamp > ? OR (timestamp = ? AND id > ?))' : '(timestamp < ? OR (timestamp = ? AND id < ?))');
        params.push(Number(cursorTs), Number(cursorTs), cursorId.join(':'));
    }

    const rows = await dbAll(`
        SELECT id, sender_name, sender_number, chat_id, is_group, body, type, timestamp, has_media, media_path,
               location_lat, location_lng, revoked, revoked_at, from_me, transcription, quoted_id, mentions
          FROM messages WHERE ${where.join(' AND ')}
         ORDER BY timestamp ${asc ? 'ASC' : 'DESC'}, id ${asc ? 'ASC' : 'DESC'} LIMIT ?`, [...params, size + 1]);
    const more = rows.length > size;
    const page = rows.slice(0, size);

    const ids = page.map(r => r.id);
    const marks = ids.map(() => '?').join(',');
    const edits = ids.length ? await dbAll(`SELECT message_id, old_body, new_body, edited_at FROM message_edits WHERE message_id IN (${marks}) ORDER BY edited_at`, ids) : [];
    const reactions = await reactionDetails(ids);
    const editsOf = Map.groupBy(edits, e => e.message_id);
    const hitRows = ids.length ? await dbAll(`SELECT message_id, rule FROM watch_hits WHERE message_id IN (${marks})`, ids) : [];
    const hitsOf = Map.groupBy(hitRows, h => h.message_id);
    const quotedIds = [...new Set(page.map(r => r.quoted_id).filter(Boolean))];
    const quotedRows = quotedIds.length ? await dbAll(`SELECT id, sender_name, sender_number, body, type, revoked, from_me FROM messages WHERE id IN (${quotedIds.map(() => '?').join(',')})`, quotedIds) : [];
    const quotedOf = new Map(quotedRows.map(r => [r.id, r]));

    const messages = [];
    for (const row of page) {
        const media = row.has_media ? await mediaFile(row) : null;
        const body = row.type === E2E || SYSTEM_NOTICES.has(row.type) ? '' : await withMentions(visibleBody(row.body), row.mentions);
        messages.push({
            id: row.id,
            at: row.timestamp,
            fromMe: Boolean(row.from_me),
            sender: row.from_me ? null : (row.sender_name || (row.sender_number ? `+${row.sender_number}` : null)),
            senderNumber: row.sender_number || null,
            type: row.type,
            body,
            // The /watch rules this message matched, and where in the text (to mark it)
            watch: await Promise.all((hitsOf.get(row.id) ?? []).map(async h => ({
                rule: h.rule, ...await findMatch(h.rule, body)
            }))),
            notice: row.type === E2E ? { kind: 'security', who: await whoOfNotice(row.body) }
                : SYSTEM_NOTICES.has(row.type) ? { kind: 'system', text: String(row.body ?? '').slice(0, 200) || null } : null,
            transcription: row.transcription || null,
            quoted: row.quoted_id ? quotedSummary(quotedOf.get(row.quoted_id)) : null,
            ...reactions.get(row.id),
            deleted: Boolean(row.revoked),
            deletedAt: row.revoked_at || null,
            edits: (editsOf.get(row.id) ?? []).map(e => ({ old: visibleBody(e.old_body), new: visibleBody(e.new_body), at: e.edited_at })),
            location: row.location_lat != null ? { lat: row.location_lat, lng: row.location_lng } : null,
            media: (row.has_media || (row.location_lat == null && isJpegPreview(row.body)))
                ? (media ? { url: `/api/media?id=${encodeURIComponent(row.id)}`, mime: mimeOf(media.file), name: path.basename(media.file), size: media.size } : { missing: true })
                : null
        });
    }
    const last = page.at(-1);
    return { messages, next: more && last ? `${last.timestamp}:${last.id}` : null };
}

// The message a reply quotes (null: the quoted one is not in the database anymore)
function quotedSummary(row) {
    if (!row) return { missing: true };
    return {
        sender: row.from_me ? null : (row.sender_name || (row.sender_number ? `+${row.sender_number}` : null)),
        fromMe: Boolean(row.from_me), body: visibleBody(row.body).slice(0, 240), type: row.type, deleted: Boolean(row.revoked)
    };
}

// "@5521999990001" → "@Fulano": the name of the mention (the live contact, or whoever the bot already saw with that number)
const mentionNames = new Map();
async function withMentions(body, mentions) {
    if (!/@\d{6,}/.test(body)) return body;
    const ids = (() => { try { return JSON.parse(mentions ?? '[]'); } catch { return []; } })();
    let text = body;
    if (client.pupPage) text = await withTimeout(resolveMentions(body, ids).catch(() => body), NAME_TIMEOUT_MS) ?? body;
    for (const user of new Set([...text.matchAll(/@(\d{6,})/g)].map(m => m[1]))) {
        if (!mentionNames.has(user)) {
            const row = await dbGet('SELECT sender_name FROM messages WHERE sender_number = ? AND sender_name IS NOT NULL AND sender_name <> ? ORDER BY timestamp DESC LIMIT 1', [user, user]);
            mentionNames.set(user, row?.sender_name ?? null);
        }
        if (mentionNames.get(user)) text = text.replaceAll(`@${user}`, `@${mentionNames.get(user)}`);
    }
    return text;
}

/**
 * The messages of every chat that have a text (in the body or in the transcription), the most recent first.
 * @param {string} q
 */
async function searchMessages(q, limit = 60) {
    const text = String(q ?? '').trim();
    if (text.length < 2) return [];
    const like = `%${text.replace(/[\\%_]/g, '\\$&')}%`;
    const rows = await dbAll(`SELECT id, chat_id, chat_name, is_group, sender_name, body, transcription, timestamp, revoked, from_me FROM messages
        WHERE (body LIKE ? ESCAPE '\\' OR transcription LIKE ? ESCAPE '\\') AND type <> '${E2E}' ORDER BY timestamp DESC LIMIT ?`, [like, like, Math.min(200, Number(limit) || 60)]);
    const matches = rows.filter(r => !isJpegPreview(r.body)
        || String(r.transcription ?? '').toLowerCase().includes(text.toLowerCase()));
    const labels = new Map();
    for (const row of matches) {
        if (!labels.has(row.chat_id)) labels.set(row.chat_id, chatName(row));
    }
    return Promise.all(matches.map(async r => ({
        id: r.id, chat: r.chat_id, chatName: await labels.get(r.chat_id), at: r.timestamp, fromMe: Boolean(r.from_me), sender: r.sender_name || null,
        deleted: Boolean(r.revoked), body: visibleBody(r.body).slice(0, 200)
    })));
}

/** The media of a message: { file, mime, name, size }, or null if it has none (or it is not in the folder) */
async function messageMedia(id) {
    const row = await dbGet('SELECT media_path, has_media FROM messages WHERE id = ?', [id]);
    if (!row?.has_media) return null;
    const media = await mediaFile(row);
    return media ? { ...media, mime: mimeOf(media.file), name: path.basename(media.file), inline: Boolean(INLINE_TYPES[path.extname(media.file).toLowerCase()]) } : null;
}

// Use the same badge decision WhatsApp Web uses for contact displays, when available.
async function contactBadge(id) {
    return client.pupPage.evaluate(jid => {
        const wid = window.require('WAWebWidFactory').createWid(jid);
        const contact = window.require('WAWebCollections').Contact.get(wid);
        if (!contact) return null;
        const getters = window.require('WAWebContactGetters');
        const checks = ['getShowBusinessCheckmarkAsPrimary', 'getShowBusinessCheckmarkAsSecondary',
            'getShowBusinessCheckmarkInChatlist'];
        const values = checks.filter(key => typeof getters[key] === 'function')
            .map(key => getters[key](contact)).filter(value => typeof value === 'boolean');
        return values.length ? values.some(Boolean) : null;
    }, id).catch(() => null);
}

async function contactProfile(id) {
    if (id === STATUS) return { id, name: 'Status', kind: 'status' };
    if (!/^[\w.+-]+@(?:c\.us|lid|g\.us|newsletter)$/.test(id)) return null;
    const stored = await dbGet(`SELECT chat_name, sender_name, sender_number, from_me FROM messages
        WHERE chat_id = ? ORDER BY from_me, timestamp DESC, id DESC LIMIT 1`, [id]);
    if (!stored) return null;
    if (id.endsWith('@g.us') || id.endsWith('@newsletter')) {
        const chat = client.pupPage ? await withTimeout(client.getChatById(id).catch(() => null), NAME_TIMEOUT_MS) : null;
        const name = id.endsWith('@g.us') ? await chatName({ chat_id: id, chat_name: stored.chat_name, is_group: 1 })
            : (chat?.name || stored.chat_name?.trim() || id.split('@')[0]);
        return { id, name, kind: id.endsWith('@g.us') ? 'group' : 'channel',
            description: chat?.groupMetadata?.desc || chat?.description || null };
    }
    const resolved = id.endsWith('@lid') && client.pupPage
        ? await withTimeout(resolveLidToPhone(id).catch(() => null), NAME_TIMEOUT_MS) : null;
    const phoneId = resolved || (id.endsWith('@c.us') ? id : null);
    const contact = client.pupPage
        ? await withTimeout(client.getContactById(phoneId || id)
            .catch(() => phoneId && phoneId !== id ? client.getContactById(id).catch(() => null) : null),
        NAME_TIMEOUT_MS) : null;
    const number = (phoneId && digits(phoneId)) || (!stored.from_me && stored.sender_number) || null;
    const [about, verified, status, monitored] = await Promise.all([
        contact?.getAbout ? withTimeout(contact.getAbout().catch(() => null), NAME_TIMEOUT_MS) : null,
        client.pupPage ? withTimeout(contactBadge(contact?.id?._serialized || phoneId || id), NAME_TIMEOUT_MS) : null,
        dbGet(`SELECT id, timestamp AS at FROM messages
            WHERE chat_id = ? AND (sender_jid IN (?, ?) OR sender_number = ?)
            ORDER BY timestamp DESC, id DESC LIMIT 1`, [STATUS, id, phoneId, number]),
        dbGet('SELECT MAX(last_seen) AS lastSeen FROM monitor_contacts WHERE contact_id IN (?, ?)',
            [id, phoneId])
    ]);
    const flag = value => typeof value === 'boolean' ? value : null;
    return {
        id, name: contactName(contact) || stored.chat_name?.trim()
            || (!stored.from_me && stored.sender_name) || (number ? `+${number}` : id),
        phone: number ? `+${number}` : null,
        profileName: contact?.pushname || null,
        businessName: contact?.verifiedName || null,
        business: flag(contact?.isBusiness), saved: flag(contact?.isMyContact),
        blocked: flag(contact?.isBlocked), verified, about: about || null,
        description: contact?.businessProfile?.description || null,
        lastStatus: status ? { chat: STATUS, id: status.id, at: status.at } : null,
        lastSeen: monitored?.lastSeen ?? null
    };
}

/** The profile photo of a chat (a JPEG), from the contacts cache or from WhatsApp; null without one */
const noPhotos = new Map();     // key → when it had no photo
const NO_PHOTO_TTL_MS = 30 * 60 * 1000;

async function chatPhoto(chatId) {
    const id = String(chatId ?? '');
    if (!/^[\w.+-]+@(?:c\.us|lid|g\.us)$/.test(id)) return null;
    const key = id.endsWith('@g.us') ? id.split('@')[0] : digits(id);
    if (!key) return null;
    const cached = path.join(CONTACTS_DIR, `${key}.jpg`);
    if (await fs.pathExists(cached)) return fs.readFile(cached);
    if (!client.pupPage) return null;
    // Without a photo (or private): not asked again for a while, each ask is a round trip to WhatsApp of up to 15 s
    if (Date.now() - (noPhotos.get(key) ?? 0) < NO_PHOTO_TTL_MS) return null;

    const source = { getProfilePicUrl: () => client.getProfilePicUrl(id) };
    const { photo } = await withTimeout(contactPhoto(source, key), 15000) ?? {};
    if (!photo) noPhotos.set(key, Date.now());
    return photo ?? null;
}

// Forgets the live names (the tests)
const resetNames = () => { names.clear(); asking.clear(); noPhotos.clear(); };

module.exports = { resetNames, chatInfo, chatName, chatPhoto, chatReactions, contactProfile, listChats, listMessages, messageMedia, REAL, searchMessages, STATUS };
