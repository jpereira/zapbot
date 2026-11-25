/*
 * The Show of the web: what /show keeps (the deleted messages and statuses, the edits, the reaction changes, the
 * deleted channel posts) and who is muted (/mute), by kind, with search, the person and pages.
 */

const fs = require('fs-extra');
const path = require('path');

const { MEDIA_DIR } = require('../constants');
const { dbAll, dbGet, dbRun } = require('../db');
const { idKey } = require('../mute');
const { getSetting } = require('../settings');

const STATUS = 'status@broadcast';
const CHANNEL = "chat_id LIKE '%@newsletter'";
const PAGE = 50;
const ALERTS = ['show.alert.deleted', 'show.alert.edited', 'show.alert.reaction', 'show.alert.status'];

// Each kind: the rows that make it, newest first. "at" is when it happened (the deletion, the edit, the change)
const KINDS = {
    deleted: {
        from: 'messages', at: 'COALESCE(revoked_at, timestamp)', text: ['body'],
        where: `revoked = 1 AND chat_id <> '${STATUS}' AND NOT ${CHANNEL}`,
        select: "id, id AS message_id, chat_id, chat_name, is_group, sender_name, sender_jid, sender_number, body AS text, type, has_media, timestamp, COALESCE(revoked_at, timestamp) AS at"
    },
    status: {
        from: 'messages', at: 'COALESCE(revoked_at, timestamp)', text: ['body'],
        where: `chat_id = '${STATUS}' AND revoked = 1`,
        select: "id, id AS message_id, chat_id, chat_name, is_group, sender_name, sender_jid, sender_number, body AS text, type, has_media, timestamp, COALESCE(revoked_at, timestamp) AS at"
    },
    channels: {
        from: 'messages', at: 'COALESCE(revoked_at, timestamp)', text: ['body'],
        where: `revoked = 1 AND ${CHANNEL}`,
        select: "id, id AS message_id, chat_id, chat_name, is_group, sender_name, sender_jid, sender_number, body AS text, type, has_media, timestamp, COALESCE(revoked_at, timestamp) AS at"
    },
    edited: {
        from: 'message_edits', at: 'edited_at', text: ['old_body', 'new_body'], where: '1 = 1',
        select: "id, message_id, chat_id, chat_name, is_group, sender_name, NULL AS sender_jid, sender_number, old_body, new_body, type, 0 AS has_media, timestamp, edited_at AS at"
    },
    reactions: {
        from: 'reaction_changes', at: 'changed_at', text: ['body'], where: '1 = 1',
        select: "id, message_id, chat_id, chat_name, is_group, sender_name, sender_jid, sender_number, old_reaction, new_reaction, body AS text, msg_from_me, 0 AS has_media, reacted_at AS timestamp, changed_at AS at"
    }
};

// The person of a row: the number (what /mute matches) and the jid that opens the photo and the contact
function person(row) {
    const number = String(row.sender_number ?? '').replace(/\D/g, '') ||
        (String(row.sender_jid ?? '').endsWith('@c.us') ? row.sender_jid.split('@')[0] : '');
    return { number, id: number ? `${number}@c.us` : row.sender_jid || null, name: row.sender_name || (number ? `+${number}` : '?') };
}

async function mutedNumbers() {
    const rows = await dbAll('SELECT target_id FROM mutes WHERE expires_at IS NULL OR expires_at > ?', [Date.now()]);
    return new Set(rows.map(r => idKey(r.target_id)));
}

/** The top of the page: the counts of each kind, the /show notices (on/off) and who deletes, edits and reacts the most */
async function showSummary() {
    const counts = {};
    for (const [kind, k] of Object.entries(KINDS)) {
        counts[kind] = (await dbGet(`SELECT COUNT(*) AS n FROM ${k.from} WHERE ${k.where}`)).n;
    }
    const muted = await mutedNumbers();
    const people = new Map();
    for (const kind of ['deleted', 'edited', 'reactions']) {
        const k = KINDS[kind];
        const rows = await dbAll(`SELECT sender_name, ${kind === 'edited' ? 'NULL AS sender_jid' : 'sender_jid'}, sender_number, COUNT(*) AS n
            FROM ${k.from} WHERE ${k.where} GROUP BY COALESCE(sender_number, sender_jid)`);
        for (const row of rows) {
            const who = person(row);
            if (!who.number) continue;
            const entry = people.get(who.number) ?? { ...who, deleted: 0, edited: 0, reactions: 0, muted: muted.has(who.number) };
            entry[kind] += row.n;
            people.set(who.number, entry);
        }
    }
    const ranking = [...people.values()]
        .sort((a, b) => (b.deleted + b.edited + b.reactions) - (a.deleted + a.edited + a.reactions))
        .slice(0, 30);
    return {
        counts,
        alerts: Object.fromEntries(ALERTS.map(key => [key, Boolean(getSetting(key))])),
        people: ranking,
        mutedCount: muted.size
    };
}

/**
 * A page of one kind, newest first
 * @param {{ kind: string, q?: string, person?: string, before?: number }} o
 */
async function showItems({ kind, q = '', person: number = '', before = null }) {
    const k = KINDS[kind];
    if (!k) return null;
    const where = [k.where];
    const params = [];
    const text = String(q).trim().slice(0, 200);
    if (text) {
        where.push(`(${[...k.text, 'chat_name', 'sender_name'].map(c => `${c} LIKE ? ESCAPE '\\'`).join(' OR ')})`);
        const like = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        params.push(...[...k.text, 'chat_name', 'sender_name'].map(() => like));
    }
    const digits = String(number).replace(/\D/g, '');
    if (digits) {
        where.push(`(sender_number = ? ${kind === 'edited' ? '' : 'OR sender_jid = ?'})`);
        params.push(digits, ...(kind === 'edited' ? [] : [`${digits}@c.us`]));
    }
    if (Number.isFinite(Number(before)) && before !== null) {
        where.push(`${k.at} < ?`);
        params.push(Number(before));
    }
    const rows = await dbAll(`SELECT ${k.select} FROM ${k.from} WHERE ${where.join(' AND ')} ORDER BY at DESC, id DESC LIMIT ?`,
        [...params, PAGE + 1]);
    const muted = await mutedNumbers();
    const items = rows.slice(0, PAGE).map(row => {
        const who = person(row);
        return {
            kind, id: row.id, messageId: row.message_id, chat: row.chat_id, chatName: row.chat_name || row.chat_id,
            group: Boolean(row.is_group), at: row.at, sentAt: row.timestamp, person: { ...who, muted: muted.has(who.number) },
            text: row.text ?? null, before: row.old_body ?? null, after: row.new_body ?? null,
            reaction: kind === 'reactions' ? { from: row.old_reaction || '', to: row.new_reaction || '' } : null,
            media: Boolean(row.has_media), type: row.type ?? null
        };
    });
    return { items, next: rows.length > PAGE ? rows[PAGE - 1].at : null };
}

const MAX_DELETE = 500;

/**
 * Takes items out of the cache (a deleted message with its media, an edit, a reaction change):
 * one (id) or several of the same kind (ids, the ones selected on the page)
 */
async function deleteShowItem({ kind, id, ids }) {
    const k = KINDS[kind];
    if (!k) return { ok: false, error: 'kind: deleted, status, channels, edited or reactions' };
    const list = [...new Set((Array.isArray(ids) ? ids : [id]).filter(v => v !== undefined && v !== null && v !== ''))];
    if (!list.length || list.length > MAX_DELETE) return { ok: false, error: `ids: 1 to ${MAX_DELETE} items` };
    const base = await fs.realpath(MEDIA_DIR).catch(() => null);
    let removed = 0;
    for (const one of list) {
        const row = await dbGet(`SELECT * FROM ${k.from} WHERE id = ? AND ${k.where}`, [one]);
        if (!row) continue;
        await dbRun(`DELETE FROM ${k.from} WHERE id = ?`, [one]);
        removed++;
        if (k.from === 'messages' && row.media_path && base) {
            const real = await fs.realpath(path.resolve(MEDIA_DIR, row.media_path)).catch(() => null);
            if (real?.startsWith(base + path.sep)) await fs.remove(real).catch(() => {});
        }
    }
    return removed ? { ok: true, removed } : { ok: false, error: 'item: not found' };
}

/** /mute and /unmute of a person, from the page: every kind of notice, with no deadline */
async function toggleMute({ number, name }) {
    const digits = String(number ?? '').replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) return { ok: false, error: 'number: the phone with the country code' };
    const existing = (await dbAll('SELECT id, target_id FROM mutes')).filter(m => idKey(m.target_id) === digits);
    if (existing.length) {
        for (const m of existing) await dbRun('DELETE FROM mutes WHERE id = ?', [m.id]);
        return { ok: true, muted: false };
    }
    await dbRun(`INSERT INTO mutes (target_id, target_name, is_group, deleted, edited, status, reaction, created_at)
        VALUES (?, ?, 0, 1, 1, 1, 1, ?)`, [`${digits}@c.us`, String(name ?? '').slice(0, 120) || `+${digits}`, Date.now()]);
    return { ok: true, muted: true };
}

module.exports = { deleteShowItem, showItems, showSummary, toggleMute };
