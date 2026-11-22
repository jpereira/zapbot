/*
 * /notes -lock: a protected tag. The text of its notes and its files are encrypted (AES-256-GCM) with a key derived
 * (scrypt) from a password that is never stored: only a salt and a "verifier" (a known text, encrypted with the key),
 * to know if the password is right. With the tag unlocked (/notes -lock #tag, the password), the key lives in
 * memory and the notes work as always; it locks by itself after notes.lockMinutes without using it
 * (or at once with -lock #tag -now) and a restart locks everything.
 *
 *   text:  "enc:v1:<base64 of iv(12) + tag(16) + ciphertext>" in the text column
 *   media: the same bytes in "<file>.enc"; to send or export it, a decrypted copy lives in TMP_DIR/notes while
 *          the tag is unlocked and is deleted when it locks
 *
 * The password is typed in your own private chat as the reply to the bot's question: the bot deletes the message
 * and does not keep it in the messages table.
 */

const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const path = require('path');
const fs = require('fs-extra');
const { client, wasBotText } = require('./client');
const { chatCurrentIds } = require('./contacts');
const { TMP_DIR } = require('./constants');
const { dbAll, dbGet, dbReady, dbRun } = require('./db');
const { t } = require('./i18n');
const { printError, printInfo } = require('./log');
const { getSetting } = require('./settings');

const PASSWORD_MIN = 6;
const MAX_ERRORS = 5;
const BLOCK_MS = 15 * 60 * 1000;
const ASK_MS = 60 * 1000;          // how long the bot waits for the password
const PREFIX = 'enc:v1:';
const VERIFIER = 'zapbot-notes-lock';
const PLAIN_DIR = path.join(TMP_DIR, 'notes');

/*
 * Where the command runs: a protected tag only opens in your own private chat, and never when the command sends the
 * notes to other destinations (-to). The /notes command runs inside runIn(); out of it (the alert, the timers),
 * nothing is read.
 */
const context = new AsyncLocalStorage();
const runIn = (ctx, fn) => context.run(ctx, fn);
const inPrivate = () => context.getStore()?.privateChat === true;
// notes.lockPrivateOnly (on by default): a protected tag only opens in your own private chat. Off: in any chat (never
// sent to others with -to, and the password is still typed only in your private chat)
const allowedHere = () => inPrivate() || !getSetting('notes.lockPrivateOnly');
const canRead = () => allowedHere() && !context.getStore()?.sending;

// A decrypted note was read in this command: whatever the bot sends from here on may carry it, so it is never saved
// (not in the messages table, not in the media folder): see client.sendMessage and 'message_create'
const markSecret = () => {
    const store = context.getStore();
    if (store) store.secret = true;
};
const isSecretOutput = () => context.getStore()?.secret === true;

async function isOwnPrivate(chatId) {
    return (await chatCurrentIds(chatId)).includes(client.info.wid._serialized);
}

const protectedTags = new Set();   // tags with a lock (loaded from the note_locks table)
const sessions = new Map();        // tag → { key, expires, timer, files: Set }
const attempts = new Map();        // tag → { errors, until }
const pending = new Map();         // chatId → { tag, step, first, expires }

const minutes = () => getSetting('notes.lockMinutes');
const { deriveKey } = require('./util/password');
const { attemptFor } = require('./util/attempts');
const derive = (password, salt) => deriveKey(password, Buffer.from(salt, 'hex'));

function seal(buffer, key) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([cipher.update(buffer), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

function unseal(buffer, key) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, buffer.subarray(0, 12));
    decipher.setAuthTag(buffer.subarray(12, 28));
    return Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]);
}

async function refresh() {
    await dbReady;
    protectedTags.clear();
    for (const r of await dbAll('SELECT tag FROM note_locks')) protectedTags.add(r.tag);
}

const isProtected = (tag) => Boolean(tag) && protectedTags.has(tag);

function session(tag) {
    const s = sessions.get(tag);
    if (!s) return null;
    if (s.expires <= Date.now()) {
        lockNow(tag);
        return null;
    }
    return s;
}

const isUnlocked = (tag) => Boolean(session(tag));

// Uses the key (and renews the time: "without interacting")
function keyOf(tag) {
    const s = session(tag);
    if (!s) return null;
    s.expires = Date.now() + minutes() * 60 * 1000;
    clearTimeout(s.timer);
    s.timer = setTimeout(() => lockNow(tag), minutes() * 60 * 1000 + 50);
    s.timer.unref?.();
    return s.key;
}

function unlock(tag, key) {
    lockNow(tag);
    sessions.set(tag, { key, expires: Date.now() + minutes() * 60 * 1000, timer: null, files: new Set() });
    keyOf(tag);
}

// Forgets the key and deletes the decrypted copies of the files
function lockNow(tag) {
    const s = sessions.get(tag);
    if (!s) return false;
    clearTimeout(s.timer);
    sessions.delete(tag);
    for (const file of s.files) fs.removeSync(file);
    printInfo(`/notes: tag #${tag} locked`);
    return true;
}

// Text and file of a note → what is stored
function sealText(tag, text) {
    return PREFIX + seal(Buffer.from(text, 'utf8'), keyOf(tag)).toString('base64');
}
const isSealedText = (text) => String(text ?? '').startsWith(PREFIX);
const unsealText = (tag, text) => unseal(Buffer.from(text.slice(PREFIX.length), 'base64'), keyOf(tag)).toString('utf8');

// Encrypts the file of a note (writes "<file>.enc" and deletes the original): the new path
async function sealFile(tag, file) {
    if (file.endsWith('.enc')) return file;
    const out = `${file}.enc`;
    await fs.writeFile(out, seal(await fs.readFile(file), keyOf(tag)));
    await fs.remove(file);
    return out;
}

/*
 * A note as the rest of the code sees it: a tag without a lock is as it is; unlocked, the text decrypted and
 * `media_path` the (future) decrypted copy, which ensurePlain() creates; locked, only the lock, with no text.
 * `media_file` is always the stored file.
 */
function open(n) {
    if (!n) return n;
    const stored = n.media_path;
    if (!isProtected(n.tag)) return { ...n, media_file: stored };
    if (!isUnlocked(n.tag) || !canRead()) return { ...n, text: t('notes.lock.lockedText'), locked: true, media_file: stored };
    let text = n.text;
    try {
        if (isSealedText(text)) text = unsealText(n.tag, text);
    } catch (err) {
        printError('/notes: could not decrypt note', n.id, err.message);
        return { ...n, text: t('notes.lock.lockedText'), locked: true, media_file: stored };
    }
    const plain = stored ? path.join(PLAIN_DIR, path.basename(stored).replace(/\.enc$/, '')) : stored;
    markSecret();
    return { ...n, text, media_file: stored, media_path: plain, plain: Boolean(stored) };
}

// Decrypts the copy of the file of an (unlocked) note, to send or put in the PDF
async function ensurePlain(n) {
    if (!n.plain || !n.media_file || !canRead()) return;
    if (await fs.pathExists(n.media_path)) return;
    const key = keyOf(n.tag);
    if (!key) return;
    await fs.outputFile(n.media_path, unseal(await fs.readFile(n.media_file), key));
    sessions.get(n.tag)?.files.add(n.media_path);
}

/*
 * A command about a protected tag leaves nothing in the clear: the body of the message is replaced in the messages
 * table and the media that came with it (the original, in cache/media) is deleted.
 */
async function purgeCopies(msg, label) {
    const id = msg?.id?.id;
    if (!id) return;
    const row = await dbGet('SELECT media_path FROM messages WHERE id = ?', [id]).catch(() => null);
    await dbRun('UPDATE messages SET body = ?, media_path = NULL WHERE id = ?', [label, id]).catch(() => {});
    if (row?.media_path) await fs.remove(row.media_path).catch(() => {});
}

// Old commands of the tag in the history (and their media): what -lock -clean -yes deletes
async function oldCopies(tag) {
    const rows = await dbAll("SELECT id, body, media_path FROM messages WHERE from_me = 1 AND body LIKE '/notes%'");
    const re = new RegExp(`(^|\\s)#${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'i');
    // The -lock commands themselves carry no secret: they do not count
    return rows.filter(r => re.test(r.body) && !/^\/notes\s+-(?:lock|lo)(?=\s|$)/i.test(r.body));
}

async function cleanCopies(tag) {
    const rows = await oldCopies(tag);
    for (const r of rows) {
        await dbRun('DELETE FROM messages WHERE id = ?', [r.id]);
        if (r.media_path) await fs.remove(r.media_path).catch(() => {});
    }
    return rows.length;
}

/*
 * -lock #tag: asks the password in your private chat. First time: asks twice and protects the tag; then, unlocks it.
 * `then` (/notes -v -lock #tag): what to run once it is unlocked.
 * @returns {Promise<string|null>} the reply to send (the password is asked as a reply, in the next message)
 */
async function start({ chatId, tag, then = null }) {
    await refresh();
    if (!(await isOwnPrivate(chatId))) return t('notes.lock.onlyPrivate');

    const tent = attempts.get(tag);
    if (tent?.until > Date.now()) return t('notes.lock.blocked', { tag, min: Math.ceil((tent.until - Date.now()) / 60000) });

    if (isProtected(tag) && isUnlocked(tag)) {
        keyOf(tag);
        return t('notes.lock.alreadyOpen', { tag, min: minutes() });
    }
    pending.set(chatId, { tag, step: isProtected(tag) ? 'open' : 'create', then, expires: Date.now() + ASK_MS });
    return isProtected(tag) ? t('notes.lock.askPassword') : t('notes.lock.askNew', { tag });
}

// The tag is locked at once (-lock #tag -now)
async function stop(tag) {
    await refresh();
    if (!isProtected(tag)) return t('notes.lock.notProtected', { tag });
    return lockNow(tag) ? t('notes.lock.locked', { tag }) : t('notes.lock.alreadyLocked', { tag });
}

// Encrypts what the tag already had (texts and files) when it gets protected
async function protectExisting(tag, key) {
    const notes = await dbAll('SELECT * FROM notes WHERE tag = ?', [tag]);
    for (const n of notes) {
        const text = isSealedText(n.text) ? n.text : PREFIX + seal(Buffer.from(n.text, 'utf8'), key).toString('base64');
        let file = n.media_path;
        let original = null;
        if (file && !file.endsWith('.enc') && await fs.pathExists(file)) {
            const out = `${file}.enc`;
            await fs.writeFile(out, seal(await fs.readFile(file), key));
            original = file;
            file = out;
        }
        // The database points to the encrypted file BEFORE the original goes: a crash in between loses nothing
        await dbRun('UPDATE notes SET text = ?, media_path = ? WHERE id = ?', [text, file, n.id]);
        if (original) await fs.remove(original);
    }
    return notes.length;
}

// What came with the -lock (/notes -v -lock #tag): runs now that the tag is unlocked
async function runThen(p) {
    if (p.then) await Promise.resolve(p.then()).catch(err => printError('/notes -lock: the command after the password failed:', err.message));
}

/*
 * The message that comes after the question. true: it was the password (the message is deleted and kept out of the
 * database) and the reply was sent; false: it was not for us (nothing pending, a command or too late).
 */
async function handlePassword(msg, chatId, body) {
    const p = pending.get(chatId);
    if (!p || !msg.fromMe) return false;
    // The bot's own question (and replies) also arrive as messages from you: they are not the password
    if (wasBotText(chatId, body)) return false;
    if (p.expires < Date.now() || body.startsWith('/')) {
        pending.delete(chatId);
        return false;
    }

    // Whatever it is, it was the password: out of the chat and out of the database
    const warn = (await eraseMessage(msg)) ? '' : `\n${t('notes.lock.deleteYourself')}`;
    // A direct message, not a reply: a reply would quote (and show in the background) the password just typed
    const reply = (text) => client.sendMessage(chatId, text + warn, { linkPreview: false });

    if (p.step === 'create') {
        if (body.length < PASSWORD_MIN) {
            pending.delete(chatId);
            await reply(t('notes.lock.tooShort', { min: PASSWORD_MIN, tag: p.tag }));
            return true;
        }
        pending.set(chatId, { ...p, step: 'confirm', first: body, expires: Date.now() + ASK_MS });
        await reply(t('notes.lock.askAgain'));
        return true;
    }

    pending.delete(chatId);
    if (p.step === 'confirm') {
        if (body !== p.first) {
            await reply(t('notes.lock.mismatch', { tag: p.tag }));
            return true;
        }
        const salt = crypto.randomBytes(16).toString('hex');
        const key = await derive(body, salt);
        if (!key) {
            pending.set(chatId, p);
            await reply(t('notes.lock.blocked', { tag: p.tag, min: 1 }));
            return true;
        }
        await dbRun('INSERT OR REPLACE INTO note_locks (tag, salt, verifier, created_at) VALUES (?, ?, ?, ?)',
            [p.tag, salt, PREFIX + seal(Buffer.from(VERIFIER), key).toString('base64'), Date.now()]);
        const n = await protectExisting(p.tag, key);
        await refresh();
        unlock(p.tag, key);
        const copies = (await oldCopies(p.tag)).length;
        await reply(t('notes.lock.created', { tag: p.tag, n, min: minutes() }) +
            (copies ? `\n${t('notes.lock.oldCopies', { n: copies, tag: p.tag })}` : ''));
        await runThen(p);
        return true;
    }

    // open
    await reply(await tryOpen(p.tag, body));
    if (isUnlocked(p.tag)) await runThen(p);
    return true;
}

/*
 * The password against the tag: unlocks it (and finishes what a failure left half done: the key is here) or counts the
 * mistake (5 wrong block the tag for 15 min). Returns the text to answer with.
 */
async function tryOpen(tag, password) {
    const row = await dbGet('SELECT salt, verifier FROM note_locks WHERE tag = ?', [tag]);
    const tent = attemptFor(attempts, tag, BLOCK_MS);
    if (!tent || tent.active || tent.until > Date.now()) {
        const min = Math.max(1, Math.ceil(((tent?.until ?? 0) - Date.now()) / 60_000));
        return t('notes.lock.blocked', { tag, min });
    }
    let key;
    tent.active = true;
    try {
        key = row ? await derive(password, row.salt) : null;
        if (row && !key) return t('notes.lock.blocked', { tag, min: 1 });
        if (key) unseal(Buffer.from(row.verifier.slice(PREFIX.length), 'base64'), key);
    } catch {
        key = null; // the verifier does not open with this key: wrong password
    } finally {
        tent.active = false;
    }
    if (!key) {
        tent.errors += 1;
        if (tent.errors >= MAX_ERRORS) {
            tent.errors = 0;
            tent.until = Date.now() + BLOCK_MS;
        }
        printInfo(`/notes -lock: wrong password for #${tag}`);
        return tent.until > Date.now() ? t('notes.lock.blocked', { tag, min: BLOCK_MS / 60000 }) : t('notes.lock.wrong');
    }
    attempts.delete(tag);
    unlock(tag, key);
    await protectExisting(tag, key).catch(err => printError('/notes -lock: could not finish encrypting:', err.message));
    return t('notes.lock.open', { tag, min: minutes() });
}

// The message with the password (or the command that carries it) leaves the chat; true if it could be deleted
async function eraseMessage(msg, { mask = true } = {}) {
    if (mask) await dbRun("UPDATE messages SET body = '🔑 ***' WHERE id = ?", [msg.id?.id]).catch(() => {});
    return Promise.resolve(msg.delete?.(true)).then(() => true, () => false);
}

/*
 * /notes -v -lock <password> #tag: the password comes in the command itself. Whatever the result, the command
 * message is deleted (it carries the password; messages.js already hid it in the logs and in the messages table).
 * Only for a tag that is already protected (creating it asks twice), only in your private chat, with the same limit
 * of mistakes. `then`: what to run once it is unlocked (the -v).
 */
async function tryInline({ msg, chatId, tag, password, then = null }) {
    const deleted = await eraseMessage(msg, { mask: false });
    const send = (text) => client.sendMessage(chatId, text + (deleted ? '' : `\n${t('notes.lock.deleteYourself')}`), { linkPreview: false });

    await refresh();
    if (!(await isOwnPrivate(chatId))) return send(t('notes.lock.onlyPrivate'));
    if (!isProtected(tag)) return send(t('notes.lock.inlineNeedsProtection', { tag }));
    const tent = attempts.get(tag);
    if (tent?.until > Date.now()) return send(t('notes.lock.blocked', { tag, min: Math.ceil((tent.until - Date.now()) / 60000) }));
    if (isUnlocked(tag)) {
        keyOf(tag);
        await send(t('notes.lock.alreadyOpen', { tag, min: minutes() }));
    } else {
        await send(await tryOpen(tag, password));
    }
    if (isUnlocked(tag) && then) await Promise.resolve(then()).catch(err => printError('/notes -lock: the command after the password failed:', err.message));
}

// Cleans the decrypted copies left behind by a crash (at startup nothing is unlocked)
async function cleanLeftovers() {
    await fs.remove(PLAIN_DIR).catch(() => {});
}

// Why a note of the tag does not show (to say it): locked, outside the private chat or being sent to others
function lockedNotice(tag) {
    if (!isUnlocked(tag)) return t('notes.lock.needUnlock', { tag });
    return t(context.getStore()?.sending ? 'notes.lock.noSend' : 'notes.lock.privateOnly', { tag });
}

// Forgets everything in memory (the keys, the attempts, the questions): the tests start from zero
function reset() {
    for (const tag of [...sessions.keys()]) lockNow(tag);
    attempts.clear();
    pending.clear();
    protectedTags.clear();
}

module.exports = {
    PREFIX, derive, seal, allowedHere, canRead, inPrivate, isSecretOutput, markSecret, isOwnPrivate, lockedNotice, runIn,
    isUnlocked, reset, cleanCopies, cleanLeftovers, ensurePlain, handlePassword, isProtected, isSealedText, lockNow, oldCopies,
    eraseMessage, open, purgeCopies, refresh, sealFile, sealText, start, stop, tryInline, unseal, unsealText
};
