/*
 * The media gallery of the web: every picture, video, audio, sticker and document the bot kept (messages.media_path,
 * in the media folder), by chat, kind, period and name, sorted by date, size or name, with the space each one takes,
 * when the cleanup takes it (the retention windows of src/cleanup.js), the chats that take the most, a way to free a
 * file (the message stays, its media shows as missing) and the files that are the same.
 *
 * The same file received in several chats (a forwarded meme, the same PDF in two groups) is kept once per message.
 * "Join the copies" makes them hard links of one file: the space is freed, every message keeps its media, and the
 * cleanup still removes each path on its own schedule (a link removed does not take the others).
 */

const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');

const { DAY_MS, MAX_DELETE_WINDOW, MEDIA_DIR } = require('../constants');
const { dbAll, dbGet, dbRun } = require('../db');
const { getSetting } = require('../settings');
const { durationOf } = require('./thumbs');

const PAGE = 60;
const MAX_DELETE = 500;
const KIND_TYPES = { image: ['image'], video: ['video'], audio: ['audio', 'ptt'], sticker: ['sticker'], document: ['document'] };
const kindOf = (type) => Object.keys(KIND_TYPES).find(k => KIND_TYPES[k].includes(type)) ?? 'document';
const SORTS = ['date', 'size', 'name', 'chat', 'expires'];

// The MIME type of a file by its extension (what the page shows in the list; the media route has its own for serving)
const MIME = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.heic': 'image/heic',
    '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.3gp': 'video/3gpp', '.mkv': 'video/x-matroska',
    '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/opus', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav', '.amr': 'audio/amr',
    '.pdf': 'application/pdf', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.csv': 'text/csv',
    '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.odt': 'application/vnd.oasis.opendocument.text', '.ods': 'application/vnd.oasis.opendocument.spreadsheet', '.odp': 'application/vnd.oasis.opendocument.presentation',
    '.txt': 'text/plain', '.json': 'application/json', '.xml': 'application/xml', '.html': 'text/html', '.zip': 'application/zip',
    '.rar': 'application/vnd.rar', '.7z': 'application/x-7z-compressed', '.gz': 'application/gzip', '.apk': 'application/vnd.android.package-archive',
    '.vcf': 'text/vcard', '.ics': 'text/calendar', '.epub': 'application/epub+zip'
};
const mimeOf = (file) => MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';

// The size and the inode of every file of the media folder, read once a minute (a page does not stat 4000 files)
let index = { at: 0, map: new Map() };
async function mediaIndex() {
    if (Date.now() - index.at < 60_000) return index.map;
    const map = new Map();
    const walk = async (dir) => {
        for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) await walk(full);
            else if (entry.isFile()) {
                const stat = await fs.stat(full).catch(() => null);
                if (stat) map.set(full, { size: stat.size, ino: `${stat.dev}:${stat.ino}`, links: stat.nlink, mtime: stat.mtimeMs });
            }
        }
    };
    await walk(MEDIA_DIR);
    index = { at: Date.now(), map };
    return map;
}
const forgetSizes = () => { index = { at: 0, map: new Map() }; };
const fileOf = (row) => path.resolve(MEDIA_DIR, row.media_path);

// When the cleanup takes the media of a message (src/cleanup.js): a deleted one by its window, the others by the media one
function expiresAt(row) {
    if (row.revoked) return (row.revoked_at ?? row.timestamp) + getSetting('cache.revokedRetentionDays') * DAY_MS;
    return row.timestamp + Math.max(getSetting('cache.messageMediaRetentionDays') * DAY_MS, MAX_DELETE_WINDOW);
}

/*
 * The "chat" of the gallery: the chat itself, except the statuses. They all are one chat (status@broadcast), of
 * everyone who posts: there, each person is one (status@broadcast|<who posted>), so picking one does not bring the
 * statuses of the others.
 */
const STATUS = 'status@broadcast';
const POSTER_SQL = "COALESCE(NULLIF(sender_jid, ''), NULLIF(sender_number, ''), 'unknown')";
const chatKey = (row) => (row.chat_id === STATUS ? `${STATUS}|${row.sender_jid || row.sender_number || 'unknown'}` : row.chat_id);

function where({ chat, from, to, q }) {
    const parts = ['has_media = 1', 'media_path IS NOT NULL'];
    const params = [];
    const poster = String(chat ?? '').startsWith(`${STATUS}|`) ? String(chat).slice(STATUS.length + 1) : null;
    if (poster) { parts.push(`chat_id = '${STATUS}' AND ${POSTER_SQL} = ?`); params.push(poster); }
    else if (chat) { parts.push('chat_id = ?'); params.push(String(chat)); }
    if (Number.isFinite(from)) { parts.push('timestamp >= ?'); params.push(from); }
    if (Number.isFinite(to)) { parts.push('timestamp <= ?'); params.push(to); }
    if (q) {
        parts.push("(LOWER(media_path) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(body, '')) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(chat_name, '')) LIKE ? ESCAPE '\\')");
        const like = `%${String(q).toLowerCase().replace(/[\\%_]/g, '\\$&')}%`;
        params.push(like, like, like);
    }
    return { sql: parts.join(' AND '), params };
}

const COLUMNS = 'id, chat_id, chat_name, is_group, sender_name, sender_jid, sender_number, from_me, type, body, timestamp, revoked, revoked_at, media_path';

function item(r, info) {
    const file = fileOf(r);
    return {
        id: r.id, chat: r.chat_id, chatKey: chatKey(r), chatName: r.chat_name || r.chat_id, sender: r.from_me ? null : (r.sender_name || (r.sender_number ? `+${r.sender_number}` : null)),
        fromMe: Boolean(r.from_me), kind: kindOf(r.type), type: r.type, at: r.timestamp, deleted: Boolean(r.revoked),
        caption: String(r.body ?? '').slice(0, 200), size: info?.size ?? 0, name: path.basename(file), mime: mimeOf(file),
        expiresAt: expiresAt(r), linked: (info?.links ?? 1) > 1, url: `/api/media?id=${encodeURIComponent(r.id)}`,
        // a picture or a video: its thumbnail (made on the first look), and the duration of a video already seen
        thumb: ['image', 'video'].includes(r.type) ? `/api/media/thumb?id=${encodeURIComponent(r.id)}` : null,
        duration: r.type === 'video' ? durationOf(file, info) : null
    };
}

/**
 * A page of the gallery and the totals of the filter.
 * @param {{chat?: string, kind?: string, from?: number, to?: number, q?: string, sort?: string, desc?: boolean, offset?: number}} filter
 */
async function gallery({ chat = '', kind = '', from = null, to = null, q = '', sort = 'date', desc = true, offset = 0 } = {}) {
    const files = await mediaIndex();
    // The newest first: the name of a chat is its most recent one (a group renamed, a contact saved again)
    const rows = await dbAll(`SELECT ${COLUMNS} FROM messages WHERE ${where({ chat, from, to, q }).sql} ORDER BY timestamp DESC`, where({ chat, from, to, q }).params);
    const byKind = Object.fromEntries(Object.keys(KIND_TYPES).map(k => [k, { count: 0, size: 0 }]));
    const byChat = new Map();
    const inodes = new Map();
    for (const row of rows) {
        const info = files.get(fileOf(row));
        const size = info?.size ?? 0;
        const k = byKind[kindOf(row.type)];
        k.count++;
        k.size += size;
        const key = chatKey(row);
        const c = byChat.get(key) ?? { id: key, name: row.chat_name || row.chat_id, count: 0, size: 0 };
        c.count++;
        c.size += size;
        byChat.set(key, c);
        if (info) inodes.set(info.ino, size);
    }

    // The kind filters the page, not the totals (the chips show every kind)
    const types = KIND_TYPES[kind];
    const picked = (types ? rows.filter(r => types.includes(r.type)) : rows).map(r => item(r, files.get(fileOf(r))));
    const key = SORTS.includes(sort) ? sort : 'date';
    const value = { date: i => i.at, size: i => i.size, name: i => i.name.toLowerCase(), chat: i => i.chatName.toLowerCase(), expires: i => i.expiresAt }[key];
    picked.sort((a, b) => {
        const [x, y] = [value(a), value(b)];
        const order = x < y ? -1 : x > y ? 1 : (a.at - b.at) || String(a.id).localeCompare(String(b.id));
        return desc ? -order : order;
    });
    const start = Math.max(0, Math.floor(Number(offset) || 0));
    const total = [...byChat.values()].reduce((n, c) => n + c.size, 0);
    return {
        items: picked.slice(start, start + PAGE),
        next: start + PAGE < picked.length ? start + PAGE : null,
        matched: picked.length,
        // disk: what the files take for real (hard links of a joined copy count once)
        totals: { count: rows.length, size: total, disk: [...inodes.values()].reduce((n, s) => n + s, 0), byKind },
        chats: [...byChat.values()].sort((a, b) => b.size - a.size).slice(0, 12)
    };
}

// The SHA-1 of a file, remembered while its size and date do not change
const hashes = new Map();
async function hashOf(file, info) {
    const key = `${file}:${info.size}:${info.mtime}`;
    if (hashes.has(key)) return hashes.get(key);
    const hash = await new Promise((resolve, reject) => {
        const sum = crypto.createHash('sha1');
        fs.createReadStream(file).on('data', d => sum.update(d)).on('error', reject).on('end', () => resolve(sum.digest('hex')));
    }).catch(() => null);
    if (hashes.size > 20_000) hashes.clear();
    hashes.set(key, hash);
    return hash;
}

/**
 * The files that are the same (same size, then same SHA-1: only the ones that share a size are read), the most
 * wasted space first. wasted: what joining them would free (0 when they are already one file).
 */
async function duplicates(filter = {}) {
    const files = await mediaIndex();
    const { sql, params } = where(filter);
    const types = KIND_TYPES[filter.kind];
    const rows = (await dbAll(`SELECT ${COLUMNS} FROM messages WHERE ${sql}`, params)).filter(r => !types || types.includes(r.type));
    const bySize = new Map();
    for (const r of rows) {
        const info = files.get(fileOf(r));
        if (!info?.size) continue;
        if (!bySize.has(info.size)) bySize.set(info.size, []);
        bySize.get(info.size).push({ r, info });
    }
    const groups = new Map();
    for (const list of bySize.values()) {
        if (list.length < 2) continue;
        for (const { r, info } of list) {
            const hash = await hashOf(fileOf(r), info);
            if (!hash) continue;
            if (!groups.has(hash)) groups.set(hash, []);
            groups.get(hash).push({ r, info });
        }
    }
    const out = [...groups.entries()].filter(([, list]) => list.length > 1).map(([hash, list]) => {
        const inodes = new Set(list.map(x => x.info.ino));
        const size = list[0].info.size;
        return {
            hash, size, count: list.length, files: inodes.size, wasted: (inodes.size - 1) * size,
            items: list.map(x => item(x.r, x.info)).sort((a, b) => a.at - b.at)
        };
    }).sort((a, b) => b.wasted - a.wasted || b.count - a.count);
    return { groups: out, wasted: out.reduce((n, g) => n + g.wasted, 0), copies: out.reduce((n, g) => n + g.count, 0) };
}

/*
 * Joins the copies of these groups (by hash): each copy becomes a hard link of the oldest file, after checking again
 * that it is the same (size and SHA-1). The link is made beside it and renamed over it: no moment without the file.
 */
async function joinCopies({ hashes: wanted }) {
    const list = [...new Set((Array.isArray(wanted) ? wanted : []).filter(h => /^[0-9a-f]{40}$/.test(String(h))))];
    if (!list.length) return { ok: false, error: 'hashes: the groups to join' };
    const { groups } = await duplicates();
    let joined = 0;
    let freed = 0;
    let failed = null;
    for (const group of groups.filter(g => list.includes(g.hash))) {
        const keep = path.resolve(MEDIA_DIR, (await dbGet('SELECT media_path FROM messages WHERE id = ?', [group.items[0].id])).media_path);
        const keepStat = await fs.stat(keep);
        for (const it of group.items.slice(1)) {
            const row = await dbGet('SELECT media_path FROM messages WHERE id = ?', [it.id]);
            const file = row?.media_path ? path.resolve(MEDIA_DIR, row.media_path) : null;
            const stat = file ? await fs.stat(file).catch(() => null) : null;
            if (!stat || (stat.dev === keepStat.dev && stat.ino === keepStat.ino)) continue;
            if (stat.size !== keepStat.size || await hashOf(file, { size: stat.size, mtime: stat.mtimeMs }) !== group.hash) continue;
            // A disk with no hard links (or another device) keeps the copy as it is, and says so
            const temporary = `${file}.link-${process.pid}`;
            try {
                await fs.link(keep, temporary);
                await fs.rename(temporary, file);
            } catch (err) {
                await fs.remove(temporary).catch(() => {});
                failed = failed ?? err.code ?? err.message;
                continue;
            }
            joined++;
            freed += stat.size;
        }
    }
    forgetSizes();
    if (failed && !joined) return { ok: false, error: `the disk refused the hard links (${failed})` };
    return { ok: true, joined, freed, ...(failed ? { failed } : {}) };
}

/** Frees the files of these messages: the message stays (its media shows as missing on the page) */
async function deleteMedia({ ids }) {
    const list = [...new Set((Array.isArray(ids) ? ids : []).filter(id => typeof id === 'string' && id))];
    if (!list.length || list.length > MAX_DELETE) return { ok: false, error: `ids: 1 to ${MAX_DELETE} items` };
    const root = await fs.realpath(MEDIA_DIR).catch(() => null);
    let removed = 0;
    let freed = 0;
    for (const id of list) {
        const row = await dbGet('SELECT media_path FROM messages WHERE id = ? AND has_media = 1 AND media_path IS NOT NULL', [id]);
        if (!row) continue;
        const real = root ? await fs.realpath(path.resolve(MEDIA_DIR, row.media_path)).catch(() => null) : null;
        if (real?.startsWith(root + path.sep)) {
            const stat = await fs.stat(real).catch(() => null);
            // a joined copy frees nothing on its own: the other links keep the data
            if (stat && stat.nlink <= 1) freed += stat.size;
            await fs.remove(real).catch(() => {});
        }
        await dbRun('UPDATE messages SET media_path = NULL WHERE id = ?', [id]);
        removed++;
    }
    forgetSizes();
    return removed ? { ok: true, removed, freed } : { ok: false, error: 'item: not found' };
}

module.exports = { KIND_TYPES, deleteMedia, duplicates, expiresAt, forgetSizes, gallery, joinCopies, mimeOf };
