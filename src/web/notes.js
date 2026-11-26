/*
 * The notes (/notes) in the web interface: the tags, the notes of each one, their images and files and the PDF.
 *
 * A tag protected by /notes -lock is shown LOCKED (no text, no files) until you type its password in the page.
 * The key lives only in memory, tied to that login (session) and for notes.lockMinutes without use, and it is a
 * different unlock from the one of WhatsApp: unlocking here does not open the tag in the chat, and the other way
 * around. Nothing decrypted is written to the cache: the files are decrypted in memory (the PDF uses a temporary
 * copy that is deleted right after).
 */

const crypto = require('crypto');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const { NOTES_DIR } = require('../constants');
const { dbAll, dbGet, dbRun } = require('../db');
const { printInfo } = require('../log');
const { renderNotesPdf } = require('../notes');
const { notifyWeb } = require('./alert');
const { PREFIX, derive, seal, unseal } = require('../notesLock');
const { attemptFor } = require('../util/attempts');
const { getSetting } = require('../settings');

const NONE = '@none'; // the tag filter of the notes with no tag
const MAX_ERRORS = 5;
const BLOCK_MS = 15 * 60 * 1000;

const keys = new Map();     // session token → Map(tag → { key, expires })
const attempts = new Map(); // "address:tag" → { errors, until }

const minutes = () => getSetting('notes.lockMinutes');

function keyOf(token, tag) {
    const entry = keys.get(token)?.get(tag);
    if (!entry) return null;
    if (entry.expires <= Date.now()) {
        keys.get(token).delete(tag);
        return null;
    }
    entry.expires = Date.now() + minutes() * 60_000; // used: renews, as in the chat
    return entry.key;
}

const protectedTags = async () => new Set((await dbAll('SELECT tag FROM note_locks')).map(r => r.tag));

/**
 * Tries the password of a tag for this login.
 * @returns {Promise<{ ok: true } | { ok: false, error: 'unknown'|'wrong'|'blocked', minutes?: number }>}
 */
async function unlockTag(token, tag, password, address) {
    const row = await dbGet('SELECT salt, verifier FROM note_locks WHERE tag = ?', [tag]);
    if (!row) return { ok: false, error: 'unknown' };
    const id = `${address}:${tag}`;
    const entry = attemptFor(attempts, id, BLOCK_MS);
    if (!entry || entry.active) return { ok: false, error: 'blocked', minutes: 1 };
    if (entry.until > Date.now()) return { ok: false, error: 'blocked', minutes: Math.ceil((entry.until - Date.now()) / 60000) };

    let key;
    entry.active = true;
    try {
        key = await derive(String(password ?? ''), row.salt);
        if (!key) return { ok: false, error: 'blocked', minutes: 1 };
        unseal(Buffer.from(row.verifier.slice(PREFIX.length), 'base64'), key); // throws if the password is wrong
    } catch {
        key = null;
    } finally {
        entry.active = false;
    }
    if (!key) {
        entry.errors += 1;
        const vars = { address, tag, attempt: entry.errors, max: MAX_ERRORS, minutes: BLOCK_MS / 60000 };
        if (entry.errors >= MAX_ERRORS) {
            entry.errors = 0;
            entry.until = Date.now() + BLOCK_MS;
            notifyWeb('blockedTag', vars).catch(() => {});
        } else {
            notifyWeb('wrongTag', vars).catch(() => {});
        }
        printInfo(`Web: wrong password for the tag #${tag} from ${address}`);
        await new Promise(resolve => setTimeout(resolve, 500));
        return entry.until > Date.now() ? { ok: false, error: 'blocked', minutes: BLOCK_MS / 60000 } : { ok: false, error: 'wrong' };
    }
    attempts.delete(id);
    if (!keys.has(token)) keys.set(token, new Map());
    keys.get(token).set(tag, { key, expires: Date.now() + minutes() * 60_000 });
    printInfo(`Web: tag #${tag} unlocked from ${address}`);
    return { ok: true };
}

function lockTag(token, tag) {
    return keys.get(token)?.delete(tag) ?? false;
}

// A login that ended (logout or expired): its keys go away
const forget = (token) => keys.delete(token);

// A tag was deleted: no session should keep it "unlocked" (a new tag with the same name would inherit the key)
const forgetKey = (tag) => { for (const perLogin of keys.values()) perLogin.delete(tag); };

/** The tags with how many notes, with the locks of this login */
async function listTags(token) {
    const locked = await protectedTags();
    const rows = await dbAll(`SELECT COALESCE(tag, '') AS tag, COUNT(*) AS total, SUM(media_path IS NOT NULL AND media_path <> '') AS withMedia,
        SUM(alert_at IS NOT NULL) AS withAlert, MAX(created_at) AS lastAt FROM notes GROUP BY COALESCE(tag, '') ORDER BY COALESCE(tag, '') = '', COALESCE(tag, '')`);
    const descriptions = new Map((await dbAll('SELECT tag, description FROM note_tags')).map(r => [r.tag, r.description]));
    const tags = rows.map(r => ({
        tag: r.tag, id: r.tag || NONE, description: descriptions.get(r.tag) ?? '', total: r.total, withMedia: r.withMedia ?? 0,
        withAlert: r.withAlert ?? 0, lastAt: r.lastAt, protected: locked.has(r.tag), unlocked: locked.has(r.tag) && Boolean(keyOf(token, r.tag))
    }));
    // A tag made with a description (no notes yet) is listed too
    const known = new Set(rows.map(r => r.tag));
    for (const [tag, description] of descriptions) {
        if (!known.has(tag)) tags.push({ tag, id: tag, description, total: 0, withMedia: 0, withAlert: 0, lastAt: null, protected: locked.has(tag), unlocked: locked.has(tag) && Boolean(keyOf(token, tag)) });
    }
    return tags.sort((a, b) => (a.tag === '') - (b.tag === '') || a.tag.localeCompare(b.tag));
}

const readableText = (row, key) => {
    if (!row.text?.startsWith(PREFIX)) return row.text;
    return unseal(Buffer.from(row.text.slice(PREFIX.length), 'base64'), key).toString('utf8');
};

/**
 * The notes of a tag (or of all), the ones of a locked tag only as a lock.
 * @param {string} [tag]  a tag, NONE (no tag) or empty (all)
 * @param {string} [q]    text to look for
 */
async function listNotes(token, tag = '', q = '') {
    const locked = await protectedTags();
    const where = [];
    const params = [];
    if (tag === NONE) where.push("(tag IS NULL OR tag = '')");
    else if (tag) { where.push('tag = ?'); params.push(tag.toLowerCase()); }
    const rows = await dbAll(`SELECT * FROM notes ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC`, params);
    const needle = String(q ?? '').trim().toLowerCase();

    const notes = [];
    for (const row of rows) {
        const base = {
            id: row.id, tag: row.tag || '', createdAt: row.created_at, alertAt: row.alert_at || null,
            protected: locked.has(row.tag), locked: false, text: row.text, media: null
        };
        if (base.protected) {
            const key = keyOf(token, row.tag);
            if (!key) {
                if (!needle) notes.push({ ...base, locked: true, text: '' }); // a locked note cannot match a search
                continue;
            }
            try {
                base.text = readableText(row, key);
            } catch {
                notes.push({ ...base, locked: true, text: '' });
                continue;
            }
        }
        if (needle && !base.text.toLowerCase().includes(needle)) continue;
        if (row.media_path) {
            const name = path.basename(row.media_path).replace(/\.enc$/, '').replace(/^\d+_[a-z0-9]+_/, '');
            base.media = { url: `/api/notes/media?id=${row.id}`, mime: row.media_mime || 'application/octet-stream', name };
        }
        notes.push(base);
    }
    return notes;
}

// The file of a note inside the notes folder, decrypted in memory when it is of a protected tag
async function noteMedia(token, id) {
    const row = await dbGet('SELECT id, tag, media_path, media_mime FROM notes WHERE id = ?', [id]);
    if (!row?.media_path) return null;
    const base = await fs.realpath(NOTES_DIR).catch(() => null);
    const real = await fs.realpath(path.resolve(NOTES_DIR, row.media_path)).catch(() => null);
    if (!base || !real || !real.startsWith(base + path.sep)) return null;

    const name = path.basename(row.media_path).replace(/\.enc$/, '').replace(/^\d+_[a-z0-9]+_/, '');
    const mime = row.media_mime || 'application/octet-stream';
    if (!(await protectedTags()).has(row.tag)) return { buffer: await fs.readFile(real), mime, name, open: true };
    const key = keyOf(token, row.tag);
    if (!key) return { locked: true };
    try {
        return { buffer: real.endsWith('.enc') ? unseal(await fs.readFile(real), key) : await fs.readFile(real), mime, name };
    } catch {
        return null;
    }
}

/**
 * The PDF of the notes of a tag (or of all the ones that can be read): the locked tags stay out.
 * @returns {Promise<{ pdf: Buffer, name: string, skipped: string[] } | null>} null: no note to put in it
 */
async function notesPdf(token, tag = '') {
    const locked = await protectedTags();
    const rows = await listNotes(token, tag);
    const raw = new Map((await dbAll('SELECT id, media_path, media_mime FROM notes')).map(r => [r.id, r]));
    const readable = rows.filter(n => !n.locked);
    const skipped = [...new Set(rows.filter(n => n.locked).map(n => n.tag))];
    if (!readable.length) return null;

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zapbot-webpdf-'));
    try {
        const notes = [];
        for (const n of readable) {
            const media = raw.get(n.id);
            let mediaPath = null;
            if (media?.media_path) {
                const file = path.resolve(NOTES_DIR, media.media_path);
                const key = locked.has(n.tag) ? keyOf(token, n.tag) : null;
                if (file.endsWith('.enc') && key) {
                    mediaPath = path.join(dir, `${crypto.randomBytes(6).toString('hex')}_${path.basename(file).replace(/\.enc$/, '')}`);
                    await fs.writeFile(mediaPath, unseal(await fs.readFile(file), key)).catch(() => { mediaPath = null; });
                } else if (!file.endsWith('.enc')) {
                    mediaPath = file;
                }
            }
            notes.push({
                id: n.id, text: n.text, tag: n.tag || null, created_at: n.createdAt, alert_at: n.alertAt,
                media_path: mediaPath, media_mime: media?.media_mime ?? null, locked: false, plain: false
            });
        }
        const tags = tag && tag !== NONE ? [tag.toLowerCase()] : [];
        const { pdf, name } = await renderNotesPdf(notes, tags);
        return { pdf, name, skipped };
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

const NOTE_TAG = /^[\p{L}\p{N}_-]{1,40}$/u;

/**
 * Changes a note: its text, its tag and its alert (null clears it). A note of a protected tag needs the tag unlocked
 * in this login, and its text goes back encrypted; moving a note to or from a protected tag is /notes -move (the
 * files are encrypted too), not here.
 * @returns {Promise<{ ok: true }|{ ok: false, error: string }>}
 */
async function updateNote(token, { id, text, tag, alertAt }) {
    const row = await dbGet('SELECT id, tag FROM notes WHERE id = ?', [Number(id)]);
    if (!row) return { ok: false, error: 'note: not found' };
    const body = String(text ?? '').trim();
    if (!body || body.length > 3500) return { ok: false, error: 'text: 1 to 3500 characters' };
    const nextTag = String(tag ?? '').trim().replace(/^#/, '').toLowerCase();
    if (nextTag && !NOTE_TAG.test(nextTag)) return { ok: false, error: 'tag: letters, digits, - and _ (up to 40)' };
    const locked = await protectedTags();
    const key = locked.has(row.tag) ? keyOf(token, row.tag) : null;
    if (locked.has(row.tag) && !key) return { ok: false, error: 'locked: unlock the tag first' };
    if ((nextTag || '') !== (row.tag || '') && (locked.has(row.tag) || locked.has(nextTag))) return { ok: false, error: 'protected tag: move the note with /notes -move in WhatsApp' };
    const alert = alertAt == null || alertAt === '' ? null : Number(alertAt);
    if (alert !== null && !(alert > 1e11)) return { ok: false, error: 'alert: a date and time' };

    const stored = key ? `${PREFIX}${seal(Buffer.from(body, 'utf8'), key).toString('base64')}` : body;
    await dbRun('UPDATE notes SET text = ?, tag = ?, alert_at = ? WHERE id = ?', [stored, nextTag || null, alert, row.id]);
    return { ok: true };
}

const TAG_NAME = /^[\p{L}\p{N}_-]{1,40}$/u;
const readTagName = (value) => String(value ?? '').trim().replace(/^#/, '').toLowerCase();

/** A new tag (as /notes -desc #tag <text> makes one): its name and its description */
async function addTag(token, { tag, description }) {
    const name = readTagName(tag);
    if (!TAG_NAME.test(name)) return { ok: false, error: 'tag: letters, digits, - and _ (up to 40)' };
    const text = String(description ?? '').trim();
    if (!text || text.length > 300) return { ok: false, error: 'description: 1 to 300 characters' };
    const exists = await dbGet('SELECT 1 AS ok FROM note_tags WHERE tag = ? UNION SELECT 1 FROM notes WHERE tag = ? UNION SELECT 1 FROM note_locks WHERE tag = ?', [name, name, name]);
    if (exists) return { ok: false, error: 'tag: it already exists' };
    await dbRun('INSERT INTO note_tags (tag, description) VALUES (?, ?)', [name, text]);
    return { ok: true, tag: name };
}

/** Changes the description of a tag (empty removes it) and, when the name changes, moves its notes (/notes -move) */
async function editTag(token, { id, tag, description }) {
    const from = readTagName(id);
    const to = readTagName(tag ?? from);
    if (!from) return { ok: false, error: 'tag: not found' };
    if (!TAG_NAME.test(to)) return { ok: false, error: 'tag: letters, digits, - and _ (up to 40)' };
    const locked = await protectedTags();
    if (to !== from && (locked.has(from) || locked.has(to))) return { ok: false, error: 'protected tag: move it with /notes -move in WhatsApp' };
    const known = await dbGet('SELECT 1 AS ok FROM note_tags WHERE tag = ? UNION SELECT 1 FROM notes WHERE tag = ?', [from, from]);
    if (!known) return { ok: false, error: 'tag: not found' };
    if (to !== from) {
        const taken = await dbGet('SELECT 1 AS ok FROM note_tags WHERE tag = ? UNION SELECT 1 FROM notes WHERE tag = ?', [to, to]);
        if (taken) return { ok: false, error: 'tag: the new name already exists' };
        await dbRun('UPDATE notes SET tag = ? WHERE tag = ?', [to, from]);
        await dbRun('UPDATE note_tags SET tag = ? WHERE tag = ?', [to, from]);
    }
    const text = String(description ?? '').trim();
    if (text.length > 300) return { ok: false, error: 'description: at most 300 characters' };
    if (text) await dbRun('INSERT INTO note_tags (tag, description) VALUES (?, ?) ON CONFLICT(tag) DO UPDATE SET description = excluded.description', [to, text]);
    else await dbRun('DELETE FROM note_tags WHERE tag = ?', [to]);
    return { ok: true, tag: to };
}

/**
 * Removes a tag. With no notes, it goes away at once (its description, if any). With notes, it is the same as
 * /notes -rm #tag -yes in WhatsApp (every note and its media are deleted) plus the tag's own description and lock
 * (which that command leaves behind): confirm has to match the tag name, so nothing goes by a stray click.
 */
async function deleteTag(token, { id, confirm } = {}) {
    const name = readTagName(id);
    const rows = await dbAll('SELECT id, media_path FROM notes WHERE tag = ?', [name]);
    if (rows.length) {
        if (String(confirm ?? '').trim().toLowerCase() !== name) return { ok: false, error: `confirm: type the name of the tag (${rows.length} notes will be deleted)` };
        await dbRun('DELETE FROM notes WHERE tag = ?', [name]);
        const base = await fs.realpath(NOTES_DIR).catch(() => null);
        for (const { media_path: file } of rows) {
            if (!file) continue;
            const real = await fs.realpath(path.resolve(NOTES_DIR, file)).catch(() => null);
            if (base && real?.startsWith(base + path.sep)) await fs.remove(real).catch(() => {});
        }
    }
    await dbRun('DELETE FROM note_locks WHERE tag = ?', [name]);
    const removedTag = await dbRun('DELETE FROM note_tags WHERE tag = ?', [name]);
    if (!rows.length && !removedTag.changes) return { ok: false, error: 'tag: not found' };
    forgetKey(name);
    return { ok: true, removed: rows.length };
}

/**
 * Duplicates a tag (a /notes -cp #tag #newtag): every note goes as a copy to the new tag, with its file copied too
 * and without the alert (the original already notifies), and the description goes along. The new name has to be
 * free; a protected tag is not copied (its text and files are encrypted with its own password).
 */
async function copyTag(token, { id, tag }) {
    const from = readTagName(id);
    const to = readTagName(tag);
    if (!TAG_NAME.test(to)) return { ok: false, error: 'tag: letters, digits, - and _ (up to 40)' };
    const known = await dbGet('SELECT 1 AS ok FROM note_tags WHERE tag = ? UNION SELECT 1 FROM notes WHERE tag = ?', [from, from]);
    if (!from || !known) return { ok: false, error: 'tag: not found' };
    if ((await protectedTags()).has(from)) return { ok: false, error: 'protected tag: it cannot be copied' };
    const taken = await dbGet('SELECT 1 AS ok FROM note_tags WHERE tag = ? UNION SELECT 1 FROM notes WHERE tag = ? UNION SELECT 1 FROM note_locks WHERE tag = ?', [to, to, to]);
    if (taken) return { ok: false, error: 'tag: the new name already exists' };

    const rows = await dbAll('SELECT text, created_at, media_path, media_mime FROM notes WHERE tag = ? ORDER BY id', [from]);
    for (const row of rows) {
        const media = await copyMedia(row.media_path);
        await dbRun('INSERT INTO notes (text, created_at, tag, media_path, media_mime) VALUES (?, ?, ?, ?, ?)',
            [row.text, row.created_at, to, media, media ? row.media_mime : null]);
    }
    const description = await dbGet('SELECT description FROM note_tags WHERE tag = ?', [from]);
    if (description) await dbRun('INSERT INTO note_tags (tag, description) VALUES (?, ?)', [to, description.description]);
    printInfo(`[web] notes: #${from} copied to #${to} (${rows.length} notes)`);
    return { ok: true, tag: to, copied: rows.length };
}

// A copy of a note's file in NOTES_DIR (null if it is gone)
async function copyMedia(file) {
    if (!file) return null;
    const source = path.resolve(NOTES_DIR, file);
    const name = path.basename(source).replace(/^\d+_[a-z0-9]+_/, '');
    const target = path.join(NOTES_DIR, `${Date.now()}_${crypto.randomBytes(3).toString('hex')}_${name}`);
    return (await fs.copy(source, target).then(() => true, () => false)) ? target : null;
}

/**
 * Copies one note to a tag (the same tag: a duplicate; empty: no tag), with its file and without the alert (the
 * original already notifies). Not from or to a protected tag (its text and files are encrypted with its password).
 */
async function copyNote(token, { id, tag }) {
    const row = await dbGet('SELECT id, text, tag, media_path, media_mime FROM notes WHERE id = ?', [Number(id)]);
    if (!row) return { ok: false, error: 'note: not found' };
    const to = tag === undefined ? (row.tag ?? '') : readTagName(tag);
    if (to && !TAG_NAME.test(to)) return { ok: false, error: 'tag: letters, digits, - and _ (up to 40)' };
    const locked = await protectedTags();
    if (locked.has(row.tag) || locked.has(to)) return { ok: false, error: 'protected tag: a note is not copied to or from it here' };
    const media = await copyMedia(row.media_path);
    const r = await dbRun('INSERT INTO notes (text, created_at, tag, media_path, media_mime) VALUES (?, ?, ?, ?, ?)',
        [row.text, Date.now(), to || null, media, media ? row.media_mime : null]);
    return { ok: true, id: r.lastID, tag: to };
}

/**
 * Moves every note of a tag into another one, picked from the list (/notes -m #tag #tag2: if it already exists, the
 * two merge). The description goes along when the other has none. Not from or to a protected tag.
 */
async function moveTag(token, { id, tag }) {
    const from = readTagName(id);
    const to = readTagName(tag);
    if (!TAG_NAME.test(to)) return { ok: false, error: 'tag: letters, digits, - and _ (up to 40)' };
    if (from === to) return { ok: false, error: 'tag: pick another tag' };
    const known = await dbGet('SELECT 1 AS ok FROM note_tags WHERE tag = ? UNION SELECT 1 FROM notes WHERE tag = ?', [from, from]);
    if (!from || !known) return { ok: false, error: 'tag: not found' };
    const locked = await protectedTags();
    if (locked.has(from) || locked.has(to)) return { ok: false, error: 'protected tag: move it with /notes -move in WhatsApp' };
    const moved = await dbRun('UPDATE notes SET tag = ? WHERE tag = ?', [to, from]);
    await dbRun('INSERT OR IGNORE INTO note_tags (tag, description) SELECT ?, description FROM note_tags WHERE tag = ?', [to, from]);
    await dbRun('DELETE FROM note_tags WHERE tag = ?', [from]);
    printInfo(`[web] notes: #${from} moved into #${to} (${moved.changes} notes)`);
    return { ok: true, tag: to, moved: moved.changes };
}

/**
 * Moves one note to another tag (empty: no tag), keeping its text, file and alert. Not to or from a protected tag
 * (the text and the file would have to be encrypted again, or decrypted).
 */
async function moveNote(token, { id, tag }) {
    const row = await dbGet('SELECT id, tag FROM notes WHERE id = ?', [Number(id)]);
    if (!row) return { ok: false, error: 'note: not found' };
    const to = readTagName(tag);
    if (to && !TAG_NAME.test(to)) return { ok: false, error: 'tag: letters, digits, - and _ (up to 40)' };
    if ((to || null) === (row.tag || null)) return { ok: false, error: 'tag: the note is already there' };
    const locked = await protectedTags();
    if (locked.has(row.tag) || locked.has(to)) return { ok: false, error: 'protected tag: a note does not move to or from it here' };
    await dbRun('UPDATE notes SET tag = ? WHERE id = ?', [to || null, row.id]);
    return { ok: true, tag: to };
}

/** A new note, as /notes <text> #tag makes one (in a protected tag only with it unlocked: the text goes encrypted) */
async function addNote(token, { text, tag, alertAt }) {
    const body = String(text ?? '').trim();
    if (!body || body.length > 3500) return { ok: false, error: 'text: 1 to 3500 characters' };
    const name = readTagName(tag);
    if (name && !TAG_NAME.test(name)) return { ok: false, error: 'tag: letters, digits, - and _ (up to 40)' };
    const alert = alertAt == null || alertAt === '' ? null : Number(alertAt);
    if (alert !== null && !(alert > 1e11)) return { ok: false, error: 'alert: a date and time' };
    const key = name && (await protectedTags()).has(name) ? keyOf(token, name) : null;
    if (name && (await protectedTags()).has(name) && !key) return { ok: false, error: 'locked: unlock the tag first' };
    const stored = key ? `${PREFIX}${seal(Buffer.from(body, 'utf8'), key).toString('base64')}` : body;
    const r = await dbRun('INSERT INTO notes (text, created_at, alert_at, tag) VALUES (?, ?, ?, ?)', [stored, Date.now(), alert, name || null]);
    return { ok: true, id: r.lastID };
}

/** Deletes a note and its file; of a protected tag, only with the tag unlocked in this login */
async function deleteNote(token, id) {
    const row = await dbGet('SELECT id, tag, media_path FROM notes WHERE id = ?', [Number(id)]);
    if (!row) return { ok: false, error: 'note: not found' };
    if ((await protectedTags()).has(row.tag) && !keyOf(token, row.tag)) return { ok: false, error: 'locked: unlock the tag first' };
    await dbRun('DELETE FROM notes WHERE id = ?', [row.id]);
    if (row.media_path) {
        const base = await fs.realpath(NOTES_DIR).catch(() => null);
        const real = await fs.realpath(path.resolve(NOTES_DIR, row.media_path)).catch(() => null);
        if (base && real?.startsWith(base + path.sep)) await fs.remove(real).catch(() => {});
    }
    return { ok: true };
}

const reset = () => { keys.clear(); attempts.clear(); };

module.exports = { NONE, addNote, addTag, copyNote, copyTag, deleteNote, deleteTag, editTag, moveNote, moveTag, forget, listNotes, listTags, lockTag, noteMedia, notesPdf, reset, unlockTag, updateNote };
