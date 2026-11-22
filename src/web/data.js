/*
 * What the web interface shows: the chats and the messages of the database (the same ones /show reads),
 * with the edits, the reactions and the media of each one.
 */

const fs = require('fs-extra');
const path = require('path');

const { client } = require('../client');
const { CONTACTS_DIR, MEDIA_DIR } = require('../constants');
const { contactPhoto } = require('../contactPhotos');
const { privateResolverName, resolveLidToPhone, resolverMentions } = require('../contacts');
const { dbAll, dbGet } = require('../db');
const { getSetting } = require('../settings');
const { findMatch } = require('../watch/rules');

const STATUS = 'status@broadcast';
const MAX_PAGE = 500;
const NAME_TIMEOUT_MS = 2500;

// The media the browser may show on the page itself; the rest is always a download
const INLINE_TYPES = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.3gp': 'video/3gpp',
    '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4',
    '.aac': 'audio/aac', '.wav': 'audio/wav', '.pdf': 'application/pdf'
};

const digits = (id) => String(id ?? '').split('@')[0].replace(/\D/g, '');

// Name cache of the private chats (the address book name), so as not to ask WhatsApp on every page
const names = new Map();
const NAME_TTL_MS = 30 * 60 * 1000;

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
async function chatName(chat) {
    const id = chat.chat_id;
    if (id === STATUS) return 'Status';
    const stored = String(chat.chat_name ?? '').trim();
    if (chat.is_group || id.endsWith('@g.us')) return stored || id.split('@')[0];

    const cached = names.get(id);
    let live = cached && Date.now() - cached.at < NAME_TTL_MS ? cached.name : null;
    if (!live && !cached && client.pupPage) {
        live = await withTimeout(privateResolverName(id).catch(() => null), NAME_TIMEOUT_MS);
        names.set(id, { name: live, at: Date.now() });
    }
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
         ORDER BY last_ts DESC`);
    const chats = [];
    for (let i = 0; i < rows.length; i += 8) {
        chats.push(...await Promise.all(rows.slice(i, i + 8).map(async (row) => ({ ...row, name: await chatName(row) }))));
    }
    const q = String(search ?? '').trim().toLowerCase();
    const found = q ? chats.filter(c => c.name.toLowerCase().includes(q) || digits(c.chat_id).includes(q.replace(/\D/g, '') || '\0')) : chats;

    for (const chat of found.slice(0, 300)) {
        const last = await dbGet('SELECT body, type, has_media, revoked, from_me FROM messages WHERE chat_id = ? AND ' + REAL + ' ORDER BY timestamp DESC LIMIT 1', [chat.chat_id]);
        chat.last = last ? { body: last.type === E2E ? '🔒' : SYSTEM_NOTICES.has(last.type) ? 'ℹ️' : String(last.body ?? '').slice(0, 120), type: last.type, media: Boolean(last.has_media), deleted: Boolean(last.revoked), fromMe: Boolean(last.from_me) } : null;
    }
    return found.slice(0, 300).map(c => ({
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
    const reactions = ids.length ? await dbAll(`SELECT message_id, reaction, sender_jid FROM reactions WHERE message_id IN (${marks})`, ids) : [];
    const changes = ids.length ? await dbAll(`SELECT message_id, sender_name, old_reaction, new_reaction, changed_at FROM reaction_changes WHERE message_id IN (${marks}) ORDER BY changed_at`, ids) : [];
    const editsOf = Map.groupBy(edits, e => e.message_id);
    const reactionsOf = Map.groupBy(reactions, r => r.message_id);
    const changesOf = Map.groupBy(changes, c => c.message_id);
    const hitRows = ids.length ? await dbAll(`SELECT message_id, rule FROM watch_hits WHERE message_id IN (${marks})`, ids) : [];
    const hitsOf = Map.groupBy(hitRows, h => h.message_id);
    const quotedIds = [...new Set(page.map(r => r.quoted_id).filter(Boolean))];
    const quotedRows = quotedIds.length ? await dbAll(`SELECT id, sender_name, sender_number, body, type, revoked, from_me FROM messages WHERE id IN (${quotedIds.map(() => '?').join(',')})`, quotedIds) : [];
    const quotedOf = new Map(quotedRows.map(r => [r.id, r]));

    const messages = [];
    for (const row of page) {
        const media = row.has_media ? await mediaFile(row) : null;
        const body = row.type === E2E || SYSTEM_NOTICES.has(row.type) ? '' : await withMentions(row.body ?? '', row.mentions);
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
            reactionChanges: (changesOf.get(row.id) ?? []).map(c => ({ by: c.sender_name || null, old: c.old_reaction || '', new: c.new_reaction || '', at: c.changed_at })),
            deleted: Boolean(row.revoked),
            deletedAt: row.revoked_at || null,
            edits: (editsOf.get(row.id) ?? []).map(e => ({ old: e.old_body ?? '', new: e.new_body ?? '', at: e.edited_at })),
            reactions: (reactionsOf.get(row.id) ?? []).map(r => r.reaction),
            location: row.location_lat != null ? { lat: row.location_lat, lng: row.location_lng } : null,
            media: row.has_media
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
        fromMe: Boolean(row.from_me), body: String(row.body ?? '').slice(0, 240), type: row.type, deleted: Boolean(row.revoked)
    };
}

// "@5521999990001" → "@Fulano": the name of the mention (the live contact, or whoever the bot already saw with that number)
const mentionNames = new Map();
async function withMentions(body, mentions) {
    if (!/@\d{6,}/.test(body)) return body;
    const ids = (() => { try { return JSON.parse(mentions ?? '[]'); } catch { return []; } })();
    let text = body;
    if (client.pupPage) text = await withTimeout(resolverMentions(body, ids).catch(() => body), NAME_TIMEOUT_MS) ?? body;
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
    const rows = await dbAll(`SELECT id, chat_id, chat_name, is_group, sender_name, body, timestamp, revoked, from_me FROM messages
        WHERE (body LIKE ? ESCAPE '\\' OR transcription LIKE ? ESCAPE '\\') AND type <> '${E2E}' ORDER BY timestamp DESC LIMIT ?`, [like, like, Math.min(200, Number(limit) || 60)]);
    return Promise.all(rows.map(async r => ({
        id: r.id, chat: r.chat_id, chatName: await chatName(r), at: r.timestamp, fromMe: Boolean(r.from_me), sender: r.sender_name || null,
        deleted: Boolean(r.revoked), body: String(r.body ?? '').slice(0, 200)
    })));
}

/** The media of a message: { file, mime, name, size }, or null if it has none (or it is not in the folder) */
async function messageMedia(id) {
    const row = await dbGet('SELECT media_path, has_media FROM messages WHERE id = ?', [id]);
    if (!row?.has_media) return null;
    const media = await mediaFile(row);
    return media ? { ...media, mime: mimeOf(media.file), name: path.basename(media.file), inline: Boolean(INLINE_TYPES[path.extname(media.file).toLowerCase()]) } : null;
}

/** The profile photo of a chat (a JPEG), from the contacts cache or from WhatsApp; null without one */
async function chatPhoto(chatId) {
    const id = String(chatId ?? '');
    if (!/^[\w.+-]+@(?:c\.us|lid|g\.us)$/.test(id)) return null;
    const key = id.endsWith('@g.us') ? id.split('@')[0] : digits(id);
    if (!key) return null;
    const cached = path.join(CONTACTS_DIR, `${key}.jpg`);
    if (await fs.pathExists(cached)) return fs.readFile(cached);
    if (!client.pupPage) return null;

    const source = { getProfilePicUrl: () => client.getProfilePicUrl(id) };
    const { photo } = await withTimeout(contactPhoto(source, key), 15000) ?? {};
    return photo ?? null;
}

module.exports = { chatInfo, chatName, chatPhoto, listChats, listMessages, messageMedia, REAL, searchMessages, STATUS };
