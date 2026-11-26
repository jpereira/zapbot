/*
 * What the web interface can change: shortcuts (aliases), price alerts, /watch rules, monitored contacts, the schedule
 * and the settings. Every change goes through the same code the commands use (cmdAlias, priceHandleAlert, setSetting),
 * so the checks are the same as in WhatsApp. Logged without the values (they may be secrets).
 */

const fs = require('fs-extra');
const path = require('path');

const { client } = require('../client');
const { deleteAllBackups } = require('../backup');
const { cleanAll, cleanMedia, cleanRetention, cleanTemporary } = require('../cleanup');
const contactPhotos = require('../contactPhotos');
const { CACHE_DIR, MEDIA_DIR } = require('../constants');
const { chatInfo } = require('./data');
const webPush = require('../webPush');
const { registerMonitored } = require('../monitor');
const { resolveLidToPhone } = require('../contacts');
const { cmdAlias } = require('../commands/alias');
const { destinationColumns, recipientsDe } = require('../destinations');
const { dbAll, dbGet, dbRun } = require('../db');
const { printInfo } = require('../log');
const { priceHandleAlert } = require('../priceAlerts');
const webNotes = require('./notes');
const webShow = require('./show');
const { SETTINGS_SCHEMA, getSetting, setSetting } = require('../settings');
const { getDirSize } = require('../util/files');

class ManageError extends Error {}

// What only /set in WhatsApp changes: the web login itself and the /bot -login password
const PROTECTED_SETTINGS = new Set(['zapbot.web.login', 'zapbot.web.password', 'zapbot.web.totp', 'bot.login']);
const PRICE_KINDS = { crypto: 'crypto', stocks: 'acao' };
const REPEATS = new Set(['daily', 'weekly', 'monthly']);

const str = (value, name, { max = 4000, required = true } = {}) => {
    const text = String(value ?? '').trim();
    if (required && !text) throw new ManageError(`${name}: required`);
    if (text.length > max) throw new ManageError(`${name}: at most ${max} characters`);
    return text;
};

// A msg that only keeps what the command replies (the handlers answer to whoever typed)
// setSetting with the message of its check as a ManageError
async function safeSet(key, value) {
    try {
        await setSetting(key, value);
    } catch (err) {
        throw new ManageError(err.message);
    }
}

// The people a price alert or a /watch rule notifies: [{ id, name, group } | { email }]; [] is your private chat
// (the old groups have a hyphen: 558191855055-1523371679@g.us; a contact may come with the device: 5521999990001:12@c.us)
const JID = /^\d{5,}(?:[-:]\d+)?@(?:c\.us|lid|g\.us)$/;
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
function readRecipients(value) {
    if (value == null) return null;
    if (!Array.isArray(value) || value.length > 10) throw new ManageError('notifies: at most 10 destinations');
    return value.map((r) => {
        if (r?.email) {
            const emails = String(r.email).split(/[\s,;]+/).filter(Boolean);
            if (!emails.length || !emails.every(e => EMAIL.test(e))) throw new ManageError('notifies: not an email address');
            return { email: emails.join(', '), name: emails.join(', '), group: false };
        }
        const id = String(r?.id ?? '');
        if (!JID.test(id)) throw new ManageError('notifies: not a WhatsApp contact or group');
        return { id, name: str(r.name ?? id, 'name', { max: 120, required: false }) || id, group: id.endsWith('@g.us') };
    });
}

const silentMsg = (replies) => ({ fromMe: true, reply: async (content) => { replies.push(String(content)); return { body: String(content) }; } });

/* shortcuts */
async function saveAlias(body) {
    const name = str(body.name, 'shortcut', { max: 60 });
    const command = str(body.command, 'command', { max: 3500 });
    const description = str(body.description, 'description', { max: 300, required: false });
    if (/["\n\r]/.test(description)) throw new ManageError('description: no quotes or line breaks');
    if (!name.startsWith('/')) throw new ManageError('shortcut: it starts with /');

    const previousName = str(body.oldName ?? name, 'shortcut', { max: 60 });
    const previous = await dbGet('SELECT * FROM command_aliases WHERE name = ?', [previousName]);
    if (previous) await dbRun('DELETE FROM command_aliases WHERE name = ?', [previousName]);
    if (!previous && body.oldName) throw new ManageError('shortcut: not found');

    const replies = [];
    const flags = `${body.quiet ? '-q ' : ''}${body.ownerOnly ? '-p ' : ''}`;
    await cmdAlias({ msg: silentMsg(replies), args: `${flags}${name}${description ? ` -desc "${description}"` : ''} ${command}` });
    if (await dbGet('SELECT 1 FROM command_aliases WHERE name = ?', [name])) return { ok: true, message: replies.join('\n') };

    // It was not accepted: whatever was there comes back
    if (previous) {
        await dbRun('INSERT INTO command_aliases (name, description, command, quiet, owner_only) VALUES (?, ?, ?, ?, ?)',
            [previous.name, previous.description, previous.command, previous.quiet, previous.owner_only]);
    }
    throw new ManageError(replies.join('\n') || 'not saved');
}

async function deleteAlias(body) {
    const name = str(body.id ?? body.name, 'shortcut', { max: 60 });
    const found = await dbGet('SELECT 1 FROM command_aliases WHERE name = ?', [name]);
    if (!found) throw new ManageError('shortcut: not found');
    await dbRun('DELETE FROM command_aliases WHERE name = ?', [name]);
    return { ok: true };
}

// 🔇/🔊 and 🔒/🔓 in the list: flips -q or -p of one shortcut
const ALIAS_FLAGS = { quiet: 'quiet', ownerOnly: 'owner_only' };
async function toggleAlias(body) {
    const column = ALIAS_FLAGS[body.flag];
    if (!column) throw new ManageError('flag: quiet or ownerOnly');
    const name = str(body.id, 'shortcut', { max: 60 });
    if (!await dbGet('SELECT 1 FROM command_aliases WHERE name = ?', [name])) throw new ManageError('shortcut: not found');
    await dbRun(`UPDATE command_aliases SET ${column} = 1 - COALESCE(${column}, 0) WHERE name = ?`, [name]);
    return { ok: true };
}

/* price alerts */
async function addPrice(body) {
    const kind = PRICE_KINDS[body.kind];
    if (!kind) throw new ManageError('kind: crypto or stocks');
    const rule = str(body.rule, 'rule', { max: 80 });
    const message = str(body.message, 'message', { max: 300, required: false }).replace(/\s+/g, ' ');
    const before = (await dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n;
    const replies = [];
    await priceHandleAlert(kind, { msg: silentMsg(replies), args: `-alert ${rule}${message ? ` -msg ${message}` : ''}`, admin: true });
    if ((await dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n > before) {
        const people = readRecipients(body.recipients);
        if (people?.length) await setPriceRecipients((await dbGet('SELECT MAX(id) AS id FROM price_alerts')).id, people);
        return { ok: true, message: replies.join('\n') };
    }
    throw new ManageError(replies.join('\n') || 'not created');
}

async function setPriceRecipients(id, people) {
    const c = destinationColumns(people[0] ?? null);
    await dbRun('UPDATE price_alerts SET dest_id = ?, dest_name = ?, dest_is_group = ?, dest_email = ?, recipients = ? WHERE id = ?',
        [c.dest_id, c.dest_name, c.dest_is_group, c.dest_email, recipientsDe(people), id]);
}

// Changes an alert by making it again through the command (same checks: supported symbol, the price, "already met"),
// keeping where it notifies, when it was created and the pause; if the new rule is refused, the old one comes back
async function editPrice(body) {
    const old = await dbGet('SELECT * FROM price_alerts WHERE id = ?', [Number(body.id)]);
    if (!old) throw new ManageError('alert: not found');
    const kindKey = old.kind;
    const people = readRecipients(body.recipients);
    const rule = str(body.rule, 'rule', { max: 80 });
    const message = str(body.message, 'message', { max: 300, required: false }).replace(/\s+/g, ' ');
    const columns = ['id', 'kind', 'symbol', 'op', 'target', 'price_at_creation', 'created_at', 'dest_id', 'dest_name', 'dest_is_group', 'dest_email', 'recipients', 'message', 'paused'];
    // Only a row newer than every one before the edit is the new rule: the newest of the kind may be another alert
    const { last } = await dbGet('SELECT COALESCE(MAX(id), 0) AS last FROM price_alerts');
    await dbRun('DELETE FROM price_alerts WHERE id = ?', [old.id]);
    const replies = [];
    await priceHandleAlert(kindKey, { msg: silentMsg(replies), args: `-alert ${rule}${message ? ` -msg ${message}` : ''}`, admin: true });
    const fresh = await dbGet('SELECT id FROM price_alerts WHERE kind = ? AND id > ? ORDER BY id DESC LIMIT 1', [kindKey, last]);
    if (fresh) {
        // a paused alert stays paused after the edit
        await dbRun('UPDATE price_alerts SET created_at = ?, dest_id = ?, dest_name = ?, dest_is_group = ?, dest_email = ?, recipients = ?, paused = ? WHERE id = ?',
            [old.created_at, old.dest_id, old.dest_name, old.dest_is_group, old.dest_email, old.recipients, old.paused ?? 0, fresh.id]);
        if (people) await setPriceRecipients(fresh.id, people);
        return { ok: true, message: replies.join('\n') };
    }
    await dbRun(`INSERT INTO price_alerts (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, columns.map(c => old[c]));
    throw new ManageError(replies.join('\n') || 'not changed');
}

async function deletePrice(body) {
    const row = await dbGet('SELECT id FROM price_alerts WHERE id = ?', [Number(body.id)]);
    if (!row) throw new ManageError('alert: not found');
    await dbRun('DELETE FROM price_alerts WHERE id = ?', [row.id]);
    return { ok: true };
}

/* /watch rules */
async function saveWatch(body) {
    const rule = str(body.rule, 'rule', { max: 200 });
    const rules = getSetting('watch.rules');
    const old = body.oldRule != null ? String(body.oldRule) : null;
    if (old != null && !rules.includes(old)) throw new ManageError('rule: not found');
    const next = old != null ? rules.map(r => (r === old ? rule : r)) : [...rules, rule];
    if (old == null && rules.length >= getSetting('watch.max')) throw new ManageError(`rule: the limit is ${getSetting('watch.max')} (watch.max)`);
    const people = readRecipients(body.recipients);
    await safeSet('watch.rules', next);
    if (old != null && old !== rule) {
        // The rule has a new name: its destinations and its hits follow it
        await dbRun('UPDATE OR IGNORE watch_destinations SET rule = ? WHERE rule = ?', [rule, old]);
        await dbRun('UPDATE OR IGNORE watch_hits SET rule = ? WHERE rule = ?', [rule, old]);
        await dbRun('UPDATE OR IGNORE watch_masks SET rule = ? WHERE rule = ?', [rule, old]);
        await dbRun('UPDATE OR IGNORE watch_muted SET rule = ? WHERE rule = ?', [rule, old]);
    }
    if (people) {
        if (!people.length) await dbRun('DELETE FROM watch_destinations WHERE rule = ?', [rule]);
        else {
            const c = destinationColumns(people[0]);
            await dbRun(`INSERT INTO watch_destinations (rule, dest_id, dest_name, dest_is_group, dest_email, recipients) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(rule) DO UPDATE SET dest_id = excluded.dest_id, dest_name = excluded.dest_name, dest_is_group = excluded.dest_is_group,
                    dest_email = excluded.dest_email, recipients = excluded.recipients`, [rule, c.dest_id, c.dest_name, c.dest_is_group, c.dest_email, recipientsDe(people)]);
        }
    }
    return { ok: true };
}

async function deleteWatch(body) {
    const rules = getSetting('watch.rules');
    if (!rules.includes(String(body.id))) throw new ManageError('rule: not found');
    await safeSet('watch.rules', rules.filter(r => r !== String(body.id)));
    await dbRun('DELETE FROM watch_destinations WHERE rule = ?', [String(body.id)]);
    await dbRun('DELETE FROM watch_muted WHERE rule = ?', [String(body.id)]);
    return { ok: true };
}

// The notice of a rule on/off: the occurrences keep being saved (the history of the rule), but nobody is told
async function toggleWatch(body) {
    const rule = String(body.id ?? '');
    if (!getSetting('watch.rules').includes(rule)) throw new ManageError('rule: not found');
    const muted = await dbGet('SELECT 1 AS ok FROM watch_muted WHERE rule = ?', [rule]);
    if (muted) await dbRun('DELETE FROM watch_muted WHERE rule = ?', [rule]);
    else await dbRun('INSERT INTO watch_muted (rule) VALUES (?)', [rule]);
    return { ok: true, muted: !muted };
}

/* /monitor contacts */
async function addMonitor(body) {
    const person = readRecipients([body.contact])?.[0];
    if (!person?.id || person.group) throw new ManageError('contact: pick a contact of the address book');
    const id = person.id.endsWith('@lid') ? (await resolveLidToPhone(person.id).catch(() => null)) ?? person.id : person.id;
    const name = str(body.name, 'name', { max: 120, required: false }) || person.name;
    const result = await registerMonitored({ id, name });
    if (result.existing) throw new ManageError(`contact: already monitored (#${result.existing.id})`);
    if (result.limit) throw new ManageError(`contact: the limit is ${getSetting('monitor.max')} (monitor.max)`);
    if (body.alert) await dbRun('UPDATE monitor_contacts SET alert_enabled = 1 WHERE id = ?', [result.contact.id]);
    return { ok: true };
}

async function editMonitor(body) {
    const row = await dbGet('SELECT id FROM monitor_contacts WHERE id = ?', [Number(body.id)]);
    if (!row) throw new ManageError('contact: not found');
    const name = str(body.name, 'name', { max: 120 });
    await dbRun('UPDATE monitor_contacts SET contact_name = ?, alert_enabled = ? WHERE id = ?', [name, body.alert ? 1 : 0, row.id]);
    return { ok: true };
}

// One reading of the history of a contact goes away (the other ones stay)
async function deleteMonitorReading(body) {
    const row = await dbGet('SELECT id FROM monitor_history WHERE id = ?', [Number(body.id)]);
    if (!row) throw new ManageError('reading: not found');
    await dbRun('DELETE FROM monitor_history WHERE id = ?', [row.id]);
    return { ok: true };
}

async function deleteMonitor(body) {
    const row = await dbGet('SELECT id FROM monitor_contacts WHERE id = ?', [Number(body.id)]);
    if (!row) throw new ManageError('contact: not found');
    await dbRun('DELETE FROM monitor_contacts WHERE id = ?', [row.id]);
    return { ok: true };
}

async function toggleMonitor(body) {
    const row = await dbGet('SELECT id FROM monitor_contacts WHERE id = ?', [Number(body.id)]);
    if (!row) throw new ManageError('contact: not found');
    await dbRun('UPDATE monitor_contacts SET alert_enabled = 1 - COALESCE(alert_enabled, 0) WHERE id = ?', [row.id]);
    return { ok: true };
}

// "Check now": the contact goes to the next round of the loop (every 10 s), past the monitor.pool wait; the loop
// still waits 1 to 15 s between contacts
async function checkMonitorNow(body) {
    const row = await dbGet('SELECT id FROM monitor_contacts WHERE id = ?', [Number(body.id)]);
    if (!row) throw new ManageError('contact: not found');
    await dbRun('UPDATE monitor_contacts SET last_attempt_at = 0 WHERE id = ?', [row.id]);
    return { ok: true };
}

/* the history of a chat */
// What stays when a chat is cleared: the deleted messages, the edited ones (with the text before) and the ones with reactions
const KEPT = `(revoked = 1 OR id IN (SELECT message_id FROM message_edits) OR id IN (SELECT message_id FROM reactions)
    OR id IN (SELECT message_id FROM reaction_changes))`;

// chat null: every chat
async function chatCounts(chat) {
    const where = chat == null ? '' : 'WHERE chat_id = ?';
    const row = await dbGet(`SELECT COUNT(*) AS total, SUM(CASE WHEN ${KEPT} THEN 1 ELSE 0 END) AS kept, COUNT(DISTINCT chat_id) AS chats
        FROM messages ${where}`, chat == null ? [] : [chat]);
    return { total: row.total ?? 0, kept: row.kept ?? 0, removed: (row.total ?? 0) - (row.kept ?? 0), chats: row.chats ?? 0 };
}

async function previewChat(body) {
    const chat = str(body.chat, 'chat', { max: 200 });
    const info = await chatInfo(chat);
    if (!info) throw new ManageError('chat: not found');
    return { ok: true, name: info.name, ...(await chatCounts(chat)) };
}

// Deletes the history of a chat, except the deleted, the edited and the reacted messages; with all, those too (with their
// edits and reactions). The name of the chat confirms it. The /watch hits stay: they are the history of the rules.
async function clearChat(body) {
    const chat = str(body.chat, 'chat', { max: 200 });
    const info = await chatInfo(chat);
    if (!info) throw new ManageError('chat: not found');
    if (String(body.confirm ?? '').trim().toLowerCase() !== String(info.name).trim().toLowerCase()) throw new ManageError('confirm: type the name of the chat');
    const removed = await deleteMessages(chat, body.all === true);
    return { ok: true, removed, kept: (await chatCounts(chat)).total };
}

// The messages of a chat (null: of every chat) and their media; with all, also the deleted, edited and reacted ones,
// with their edits and reactions
async function deleteMessages(chat, all) {
    const where = [chat == null ? null : 'chat_id = ?', all ? null : `NOT ${KEPT}`].filter(Boolean);
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const params = chat == null ? [] : [chat];
    const files = await dbAll(`SELECT media_path FROM messages${clause}${where.length ? ' AND' : ' WHERE'} media_path IS NOT NULL`, params);
    if (all) {
        for (const table of ['message_edits', 'reactions', 'reaction_changes']) {
            await dbRun(chat == null ? `DELETE FROM ${table}` : `DELETE FROM ${table} WHERE message_id IN (SELECT id FROM messages WHERE chat_id = ?)`, params);
        }
    }
    const removed = await dbRun(`DELETE FROM messages${clause}`, params);
    const base = await fs.realpath(MEDIA_DIR).catch(() => null);
    for (const { media_path: file } of files) {
        const real = base ? await fs.realpath(path.resolve(MEDIA_DIR, file)).catch(() => null) : null;
        if (real?.startsWith(base + path.sep)) await fs.remove(real).catch(() => {});
    }
    return removed.changes;
}

// The big flush: the history of every chat at once. The fixed confirmation keeps a stray API call from doing it
const FLUSH_CONFIRM = 'every chat';

async function previewAll() {
    return { ok: true, confirm: FLUSH_CONFIRM, ...(await chatCounts(null)) };
}

async function clearAll(body) {
    if (body.confirm !== FLUSH_CONFIRM) throw new ManageError(`confirm: "${FLUSH_CONFIRM}"`);
    const removed = await deleteMessages(null, body.all === true);
    return { ok: true, removed, kept: (await chatCounts(null)).total };
}

/* schedule */
function readSchedule(body) {
    const kind = body.kind === 'lembrete' ? 'lembrete' : 'agendar';
    const text = str(body.text, 'text', { max: 3500 });
    const dueAt = Number(body.dueAt);
    if (!Number.isFinite(dueAt) || dueAt < 1e11) throw new ManageError('when: a date and time');
    const repeat = body.repeat ? String(body.repeat) : null;
    if (repeat && !REPEATS.has(repeat)) throw new ManageError('repeat: daily, weekly or monthly');
    return { kind, text, dueAt: Math.floor(dueAt), repeat, dayOfMonth: repeat === 'monthly' ? new Date(dueAt).getDate() : null };
}

// Where a scheduled message goes: the first one is the chat, several are kept in recipients; none: your own chat
async function scheduleTarget(body, { isNew = false } = {}) {
    const people = readRecipients(body.recipients);
    if (people?.some(p => p.email)) throw new ManageError('chat: a scheduled message goes to WhatsApp contacts and groups');
    if (people?.length) {
        const [first] = people;
        return { chatId: first.id, chatName: first.name, isGroup: first.group ? 1 : 0, recipients: people.length > 1 ? JSON.stringify(people.map(p => ({ id: p.id, name: p.name, group: Boolean(p.group) }))) : null };
    }
    if (people === null && !isNew) return null; // not sent: an edit keeps where it goes
    const own = client.info?.wid?._serialized;
    if (!own) throw new ManageError('the bot is not connected to WhatsApp yet');
    return { chatId: own, chatName: 'You', isGroup: 0, recipients: null };
}

async function saveSchedule(body) {
    const s = readSchedule(body);
    const target = await scheduleTarget(body, { isNew: body.id == null });
    if (body.id != null) {
        const row = await dbGet('SELECT id FROM schedules WHERE id = ?', [Number(body.id)]);
        if (!row) throw new ManageError('schedule: not found');
        await dbRun('UPDATE schedules SET kind = ?, text = ?, due_at = ?, repeat = ?, day_of_month = ? WHERE id = ?', [s.kind, s.text, s.dueAt, s.repeat, s.dayOfMonth, row.id]);
        if (target) await dbRun('UPDATE schedules SET chat_id = ?, chat_name = ?, is_group = ?, recipients = ? WHERE id = ?', [target.chatId, target.chatName, target.isGroup, target.recipients, row.id]);
        return { ok: true };
    }
    // A new one goes to the contacts and groups picked, or to your own chat (the one with yourself), as /cron does without -to
    await dbRun('INSERT INTO schedules (kind, chat_id, chat_name, is_group, text, due_at, repeat, day_of_month, created_at, recipients) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [s.kind, target.chatId, target.chatName, target.isGroup, s.text, s.dueAt, s.repeat, s.dayOfMonth, Date.now(), target.recipients]);
    return { ok: true };
}

async function deleteSchedule(body) {
    const row = await dbGet('SELECT id FROM schedules WHERE id = ?', [Number(body.id)]);
    if (!row) throw new ManageError('schedule: not found');
    await dbRun('DELETE FROM schedules WHERE id = ?', [row.id]);
    return { ok: true };
}

// ▶️/⏸️ of a price alert: the same as /stocks or /crypto -alert -pause / -resume
async function pausePrice(body) {
    const row = await dbGet('SELECT id FROM price_alerts WHERE id = ?', [Number(body.id)]);
    if (!row) throw new ManageError('price: not found');
    await dbRun('UPDATE price_alerts SET paused = 1 - COALESCE(paused, 0) WHERE id = ?', [row.id]);
    return { ok: true };
}

async function pauseSchedule(body) {
    const row = await dbGet('SELECT id FROM schedules WHERE id = ?', [Number(body.id)]);
    if (!row) throw new ManageError('schedule: not found');
    await dbRun('UPDATE schedules SET paused = 1 - COALESCE(paused, 0) WHERE id = ?', [row.id]);
    return { ok: true };
}

/* settings */
function checkSetting(key) {
    if (!SETTINGS_SCHEMA[key]) throw new ManageError(`${key}: no such setting`);
    if (PROTECTED_SETTINGS.has(key)) throw new ManageError(`${key}: change it with /set in WhatsApp`);
}

async function editSetting(body) {
    const key = str(body.id ?? body.key, 'setting', { max: 80 });
    checkSetting(key);
    await safeSet(key, String(body.value ?? ''));
    return { ok: true };
}

async function resetSetting(body) {
    const key = str(body.id ?? body.key, 'setting', { max: 80 });
    checkSetting(key);
    await safeSet(key, SETTINGS_SCHEMA[key].default);
    return { ok: true };
}

const noteResult = (result) => {
    if (!result.ok) throw new ManageError(result.error);
    return result;
};

/* the cache (the /cache command): the parts picked, or everything */
const CACHE_PARTS = {
    retention: () => cleanRetention(),
    media: () => cleanMedia(),
    temporary: () => cleanTemporary(),
    contacts: () => contactPhotos.cleanCache(),
    backups: () => deleteAllBackups()
};
// Everything (/cache -all) also takes every message: a fixed confirmation keeps a stray API call from doing it
const CACHE_ALL_CONFIRM = 'everything';

async function cleanCachePicked(body) {
    const before = getDirSize(CACHE_DIR);
    if (body.all === true) {
        if (body.confirm !== CACHE_ALL_CONFIRM) throw new ManageError(`confirm: "${CACHE_ALL_CONFIRM}"`);
        await cleanAll();
    } else {
        const picked = Object.keys(CACHE_PARTS).filter(key => body[key] === true);
        if (!picked.length) throw new ManageError('pick: at least one');
        for (const key of picked) await CACHE_PARTS[key]();
    }
    return { ok: true, freed: Math.max(0, before - getDirSize(CACHE_DIR)) };
}

const HANDLERS = {
    alias: { add: saveAlias, edit: saveAlias, delete: deleteAlias, toggle: toggleAlias },
    price: { add: addPrice, edit: editPrice, delete: deletePrice, toggle: pausePrice },
    tag: { add: async (body, token) => noteResult(await webNotes.addTag(token, body)), edit: async (body, token) => noteResult(await webNotes.editTag(token, body)), copy: async (body, token) => noteResult(await webNotes.copyTag(token, body)), move: async (body, token) => noteResult(await webNotes.moveTag(token, body)), delete: async (body, token) => noteResult(await webNotes.deleteTag(token, body)) },
    note: { add: async (body, token) => noteResult(await webNotes.addNote(token, body)), edit: async (body, token) => noteResult(await webNotes.updateNote(token, body)), move: async (body, token) => noteResult(await webNotes.moveNote(token, body)), copy: async (body, token) => noteResult(await webNotes.copyNote(token, body)), delete: async (body, token) => noteResult(await webNotes.deleteNote(token, body.id)) },
    watch: { add: saveWatch, edit: saveWatch, delete: deleteWatch, toggle: toggleWatch },
    chat: { preview: previewChat, clear: clearChat, previewAll, clearAll },
    cache: { clean: cleanCachePicked },
    show: { delete: async (body) => noteResult(await webShow.deleteShowItem(body)), mute: async (body) => noteResult(await webShow.toggleMute(body)) },
    monitor: { add: addMonitor, edit: editMonitor, delete: deleteMonitor, toggle: toggleMonitor, check: checkMonitorNow },
    monitorReading: { delete: deleteMonitorReading },
    schedule: { add: saveSchedule, edit: saveSchedule, delete: deleteSchedule, toggle: pauseSchedule },
    setting: { edit: editSetting, delete: resetSetting },
    // The tries of the forms (nothing is saved): a shortcut's command checked or run with its replies kept, a /watch
    // rule against the last messages
    try: {
        command: async (body) => require('./tryCommand').tryLine(body.command),
        check: async (body) => ({ ...(await require('./tryCommand').checkLine(body.command)), parts: undefined }),
        watch: async (body) => require('./watchTest').tryWatchRule(body.rule)
    },
    gallery: { delete: async (body) => noteResult(await require('./gallery').deleteMedia(body)), join: async (body) => noteResult(await require('./gallery').joinCopies(body)) },
    push: {
        subscribe: async (body, token, req) => pushResult(() => webPush.subscribe({ ...body, agent: req?.agent })),
        unsubscribe: async (body) => pushResult(() => webPush.unsubscribe(body.endpoint)),
        test: async (body) => {
            const sent = await webPush.pushTo(String(body.endpoint ?? ''), { title: body.title || '🔔 ZapBot', body: body.text || 'ok', url: '/' });
            if (!sent) throw new ManageError('endpoint: this browser is not subscribed');
            return { ok: sent >= 200 && sent < 300, status: sent };
        }
    }
};

async function pushResult(run) {
    try {
        return await run();
    } catch (err) {
        throw new ManageError(err.message);
    }
}

/**
 * @param {{ section: string, op: string }} body  what to change (see HANDLERS) and its fields
 * @returns {Promise<{ ok: boolean, message?: string }>}
 * @throws {ManageError} with the message for the user
 */
async function manage(body, address = '?', token = null, agent = '') {
    const handler = HANDLERS[body?.section]?.[body?.op];
    if (!handler) throw new ManageError('not allowed');
    const result = await handler(body, token, { agent });
    printInfo(`Web: ${body.section}.${body.op}${body.id != null ? ` ${String(body.id).slice(0, 40)}` : ''} from ${address}`);
    return result;
}

module.exports = { ManageError, PROTECTED_SETTINGS, manage };
