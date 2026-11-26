/*
 * The media gallery of the web: every picture, video, audio, sticker and document the bot kept (messages.media_path,
 * in the media folder), by chat, kind and period, with the space each one takes, the chats that take the most and
 * a way to free a file (the message stays, its media shows as missing).
 */

const fs = require('fs-extra');
const path = require('path');

const { MEDIA_DIR } = require('../constants');
const { dbAll, dbGet, dbRun } = require('../db');

const PAGE = 60;
const MAX_DELETE = 500;
const KIND_TYPES = { image: ['image'], video: ['video'], audio: ['audio', 'ptt'], sticker: ['sticker'], document: ['document'] };
const kindOf = (type) => Object.keys(KIND_TYPES).find(k => KIND_TYPES[k].includes(type)) ?? 'document';

// The size of every file of the media folder, read once a minute (a page of the gallery does not stat 3000 files)
let sizes = { at: 0, map: new Map() };
async function mediaSizes() {
    if (Date.now() - sizes.at < 60_000) return sizes.map;
    const map = new Map();
    const walk = async (dir) => {
        for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) await walk(full);
            else if (entry.isFile()) map.set(full, (await fs.stat(full).catch(() => null))?.size ?? 0);
        }
    };
    await walk(MEDIA_DIR);
    sizes = { at: Date.now(), map };
    return map;
}
const forgetSizes = () => { sizes = { at: 0, map: new Map() }; };

function where({ chat, from, to }) {
    const parts = ['has_media = 1', 'media_path IS NOT NULL'];
    const params = [];
    if (chat) { parts.push('chat_id = ?'); params.push(String(chat)); }
    if (Number.isFinite(from)) { parts.push('timestamp >= ?'); params.push(from); }
    if (Number.isFinite(to)) { parts.push('timestamp <= ?'); params.push(to); }
    return { sql: parts.join(' AND '), params };
}

/**
 * A page of the gallery, the newest first, and the totals of the filter.
 * @param {{chat?: string, kind?: string, from?: number, to?: number, before?: string}} filter  before: "timestamp:id"
 */
async function gallery({ chat = '', kind = '', from = null, to = null, before = '' } = {}) {
    const sizesOf = await mediaSizes();
    const sizeOf = (row) => sizesOf.get(path.resolve(MEDIA_DIR, row.media_path)) ?? 0;
    const base = where({ chat, from, to });
    // The totals (per kind and the chats that take the most) are of the filter without the kind: the chips show them all
    const all = await dbAll(`SELECT chat_id, chat_name, type, media_path FROM messages WHERE ${base.sql}`, base.params);
    const byKind = Object.fromEntries(Object.keys(KIND_TYPES).map(k => [k, { count: 0, size: 0 }]));
    const byChat = new Map();
    for (const row of all) {
        const size = sizeOf(row);
        const k = byKind[kindOf(row.type)];
        k.count++;
        k.size += size;
        const c = byChat.get(row.chat_id) ?? { id: row.chat_id, name: row.chat_name || row.chat_id, count: 0, size: 0 };
        c.count++;
        c.size += size;
        byChat.set(row.chat_id, c);
    }

    const types = KIND_TYPES[kind];
    const filter = where({ chat, from, to });
    if (types) { filter.sql += ` AND type IN (${types.map(() => '?').join(',')})`; filter.params.push(...types); }
    const [beforeAt, beforeId] = String(before ?? '').split(':');
    if (beforeAt && Number.isFinite(Number(beforeAt))) {
        filter.sql += ' AND (timestamp < ? OR (timestamp = ? AND id < ?))';
        filter.params.push(Number(beforeAt), Number(beforeAt), beforeId ?? '');
    }
    const rows = await dbAll(`SELECT id, chat_id, chat_name, is_group, sender_name, sender_number, from_me, type, body, timestamp, revoked, media_path
        FROM messages WHERE ${filter.sql} ORDER BY timestamp DESC, id DESC LIMIT ?`, [...filter.params, PAGE + 1]);
    const page = rows.slice(0, PAGE);
    return {
        items: page.map(r => ({
            id: r.id, chat: r.chat_id, chatName: r.chat_name || r.chat_id, sender: r.from_me ? null : (r.sender_name || (r.sender_number ? `+${r.sender_number}` : null)),
            fromMe: Boolean(r.from_me), kind: kindOf(r.type), type: r.type, at: r.timestamp, deleted: Boolean(r.revoked),
            caption: String(r.body ?? '').slice(0, 200), size: sizeOf(r), name: path.basename(r.media_path),
            url: `/api/media?id=${encodeURIComponent(r.id)}`
        })),
        next: rows.length > PAGE ? `${page.at(-1).timestamp}:${page.at(-1).id}` : null,
        totals: { count: all.length, size: [...byChat.values()].reduce((n, c) => n + c.size, 0), byKind },
        chats: [...byChat.values()].sort((a, b) => b.size - a.size).slice(0, 12)
    };
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
            freed += (await fs.stat(real).catch(() => null))?.size ?? 0;
            await fs.remove(real).catch(() => {});
        }
        await dbRun('UPDATE messages SET media_path = NULL WHERE id = ?', [id]);
        removed++;
    }
    forgetSizes();
    return removed ? { ok: true, removed, freed } : { ok: false, error: 'item: not found' };
}

module.exports = { KIND_TYPES, deleteMedia, forgetSizes, gallery };
