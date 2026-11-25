/*
 * Database backup: compressed copy in cache/backups, the automatic daily backup and the restore.
 */

const { execFile } = require('child_process');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { promisify } = require('util');
const fs = require('fs-extra');
const { MessageMedia } = require('whatsapp-web.js');

const { client } = require('./client');
const { BACKUP_DIR, CONTACTS_DIR, NOTES_DIR, TMP_DIR } = require('./constants');
const { dbAll, dbGet, dbReady, dbRun } = require('./db');
const { describeDestination, extractDestinations, resolveDestination } = require('./destinations');
const { alertPerEmail, sendFilePerEmail } = require('./email');
const { printError, printInfo } = require('./log');
const { loadSettings, getSetting } = require('./settings');
const { fmtWhen, instantInBrasilia, partsInBrasilia } = require('./util/when');
const { versionWithCommit } = require('./version');
const { t } = require('./i18n');

/*
 * Each backup is a pair of files in BACKUP_DIR:
 * zapbot-YYYYMMDD-HHMMSS.db.gz  → the whole database (VACUUM INTO: consistent copy
 * without stopping the bot), compressed
 * zapbot-YYYYMMDD-HHMMSS.json   → date, reason, bot version and each table's entries
 * zapbot-YYYYMMDD-HHMMSS.notes.tar.gz → the /notes images (NOTES_DIR); only exists if there are
 * some image (the system tar)
 * zapbot-YYYYMMDD-HHMMSS.contacts.tar.gz → the /contacts photos (CONTACTS_DIR); likewise
 * Media (cache/media) is not included.
 *
 * Reasons: 'automático' (the daily one, setting 'backup.hour'), 'manual' (/backup -now)
 * and 'antes de restaurar' (made before a restore). The automatic ones and those from before a restore beyond the
 * 'backup.keep' most recent ones are deleted; the manual ones stay until a /backup -rm.
 */
const PREFIX = 'zapbot-';
const EXT = '.db.gz';
const EXT_NOTES = '.notes.tar.gz';
const EXT_CONTACTS = '.contacts.tar.gz';
const tar = promisify(execFile);
// An attachment above this usually bounces back from the provider before reaching the recipient.
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const REASONS = {
    automatic: 'automático',
    manual: 'manual',
    restore: 'antes de restaurar'
};

// The reason is stored in Portuguese (MOTIVOS): on screen, in the current language
const REASONS_IN_SCREEN = {
    [REASONS.automatic]: 'adm.backup.reasonAuto',
    [REASONS.manual]: 'adm.backup.reasonManual',
    [REASONS.restore]: 'adm.backup.reasonRestore'
};
const reasonText = (reasonAlt) => (REASONS_IN_SCREEN[reasonAlt] ? t(REASONS_IN_SCREEN[reasonAlt]) : reasonAlt);

const two = (n) => String(n).padStart(2, '0');

async function sendBackupPerEmail(b, emails) {
    if (b.bytes > MAX_ATTACHMENT_BYTES) {
        throw new Error(t('adm.backup.tooBigEmail'));
    }
    await sendFilePerEmail({
        to: emails,
        subject: t('adm.backup.emailSubject', { when: fmtWhen(b.createdAt) }),
        text: t('adm.backup.emailBody', {
            when: fmtWhen(b.createdAt), reason: reasonText(b.reason), version: b.version, dir: BACKUP_DIR, name: b.name
        }),
        file: b.file,
        fileName: `${b.name}.db.gz`
    });
}

async function sendBackupOnChat(b, id) {
    await client.sendMessage(id, MessageMedia.fromFilePath(b.file), {
        sendMediaAsDocument: true,
        caption: t('adm.backup.caption', { when: fmtWhen(b.createdAt), reason: reasonText(b.reason) })
    });
}

async function sendBackupAutomatic(b, valueAlt) {
    const list = /^-to(?:\s|$)/.test(valueAlt) ? extractDestinations(valueAlt) : null;
    if (list?.rest) throw new Error(t('adm.backup.toUsage'));
    const texts = list ? list.destinations : [valueAlt.replace(/^(["'/])(.*)\1$/, '$2')];
    const destinations = [];
    const failures = [];

    for (const textAlt of texts) {
        try {
            const d = await resolveDestination(textAlt, { acceptsEmail: true });
            if (d.error) throw new Error(d.error);
            // Without someone to pick a number: an ambiguous name does not win a coin toss.
            if (d.options) throw new Error(t('adm.backup.ambiguous'));
            if (!destinations.some(x => d.email ? x.email === d.email : x.id === d.id)) destinations.push(d);
        } catch (err) {
            failures.push(`${textAlt ?? t('adm.backup.emptyTo')}: ${err.message}`);
        }
    }

    const emails = [...new Set(destinations.filter(d => d.email)
        .flatMap(d => d.email.split(/\s*,\s*/)))];
    if (emails.length) {
        await sendBackupPerEmail(b, emails)
            .catch(err => failures.push(`${t('adm.backup.emailWord')}: ${err.message}`));
    }
    for (const d of destinations.filter(d => d.id)) {
        await sendBackupOnChat(b, d.id)
            .catch(err => failures.push(`${describeDestination(d)}: ${err.message}`));
    }
    if (failures.length) throw new Error(failures.join('; '));
    printInfo(`Daily backup ${b.name} sent to ${valueAlt}`);
}

// Database tables (without SQLite's internal ones)
async function tables(schema = 'main') {
    const rows = await dbAll(`SELECT name FROM ${schema}.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`);
    return rows.map(r => r.name);
}

// Entries (rows) of each table: { table: n }
async function countInputs(schema = 'main') {
    const count = {};
    for (const t of await tables(schema)) {
        count[t] = (await dbGet(`SELECT COUNT(*) AS n FROM ${schema}."${t}"`)).n;
    }
    return count;
}

// How many images are in NOTES_DIR (without entering subfolders)
async function notesImages() {
    if (!fs.existsSync(NOTES_DIR)) return [];
    const items = await fs.readdir(NOTES_DIR, { withFileTypes: true });
    return items.filter(i => i.isFile()).map(i => i.name);
}

// How many photos are in CONTACTS_DIR (the .jpg; the .none are just "no photo" marks)
async function contactsPhotos() {
    if (!fs.existsSync(CONTACTS_DIR)) return [];
    return (await fs.readdir(CONTACTS_DIR)).filter(f => f.endsWith('.jpg'));
}

// Free name for a backup created now (Brasília time in the name)
function nameNew(nowAlt) {
    const p = partsInBrasilia(nowAlt);
    const base = `${PREFIX}${p.year}${two(p.mes)}${two(p.day)}-${two(p.h)}${two(p.m)}${two(p.s)}`;

    let nameAlt = base;
    for (let i = 2; fs.existsSync(path.join(BACKUP_DIR, nameAlt + EXT)); i++) nameAlt = `${base}-${i}`;
    return nameAlt;
}

/**
 * The backups, from newest to oldest.
 * @returns {Promise<Array<{name, file, bytes, createdAt, reason, version, inputs}>>}
 */
async function listBackups() {
    if (!fs.existsSync(BACKUP_DIR)) return [];

    const list = [];
    for (const f of await fs.readdir(BACKUP_DIR)) {
        if (!f.startsWith(PREFIX) || !f.endsWith(EXT)) continue;

        const nameAlt = f.slice(0, -EXT.length);
        const fileAlt = path.join(BACKUP_DIR, f);
        const fileNotes = path.join(BACKUP_DIR, nameAlt + EXT_NOTES);
        const fileContacts = path.join(BACKUP_DIR, nameAlt + EXT_CONTACTS);
        const stat = await fs.stat(fileAlt);
        const meta = await fs.readJson(path.join(BACKUP_DIR, `${nameAlt}.json`)).catch(() => ({}));

        list.push({
            name: nameAlt,
            file: fileAlt,
            bytes: stat.size,
            createdAt: meta.createdAt ?? stat.mtimeMs,
            reason: meta.reason ?? '?',
            version: meta.version ?? '?',
            inputs: meta.inputs ?? null,
            ...(fs.existsSync(fileNotes)
                ? { notesFile: fileNotes, notesBytes: (await fs.stat(fileNotes)).size, images: meta.images ?? null }
                : {}),
            ...(fs.existsSync(fileContacts)
                ? { contactsFile: fileContacts, contactsBytes: (await fs.stat(fileContacts)).size, photos: meta.photos ?? null }
                : {})
        });
    }

    return list.sort((a, b) => b.createdAt - a.createdAt || b.name.localeCompare(a.name));
}

/**
 * Creates a backup now.
 * @param {string} reason  one of the MOTIVOS
 */
async function createBackup(reasonAlt = REASONS.manual, nowAlt = Date.now()) {
    await dbReady;
    await fs.ensureDir(BACKUP_DIR);
    await fs.ensureDir(TMP_DIR);

    const nameAlt = nameNew(nowAlt);
    const copy = path.join(TMP_DIR, `${nameAlt}.db`);
    const fileAlt = path.join(BACKUP_DIR, nameAlt + EXT);

    try {
        await dbRun('VACUUM INTO ?', [copy]);
        const inputs = await countInputs();
        const bytesDb = (await fs.stat(copy)).size;

        await pipeline(fs.createReadStream(copy), zlib.createGzip(), fs.createWriteStream(fileAlt));
        const images = await notesImages();
        if (images.length) {
            await tar('tar', ['-czf', path.join(BACKUP_DIR, nameAlt + EXT_NOTES), '-C', NOTES_DIR, '.']);
        }
        const photos = await contactsPhotos();
        if (photos.length) {
            await tar('tar', ['-czf', path.join(BACKUP_DIR, nameAlt + EXT_CONTACTS), '-C', CONTACTS_DIR, '.']);
        }
        await fs.writeJson(path.join(BACKUP_DIR, `${nameAlt}.json`),
            { createdAt: nowAlt, reason: reasonAlt, version: versionWithCommit(), bytesDatabase: bytesDb, inputs, images: images.length, photos: photos.length },
            { spaces: 2 });

        printInfo(`Backup ${nameAlt} created (${reasonAlt})`);
    } finally {
        await fs.remove(copy);
    }

    await applyRetention();
    return (await listBackups()).find(b => b.name === nameAlt);
}

// Deletes the automatic ones and those from before a restore beyond the 'backup.keep' most recent
async function applyRetention() {
    const keep = getSetting('backup.keep');
    const disposable = (await listBackups()).filter(b => b.reason !== REASONS.manual);

    for (const b of disposable.slice(keep)) {
        await removeBackup(b);
        printInfo(`Backup ${b.name} removed (retention: ${keep})`);
    }
}

async function removeBackup(b) {
    await fs.remove(b.file);
    await fs.remove(path.join(BACKUP_DIR, b.name + EXT_NOTES));
    await fs.remove(path.join(BACKUP_DIR, b.name + EXT_CONTACTS));
    await fs.remove(path.join(BACKUP_DIR, `${b.name}.json`));
}

// Deletes all the backups (/cache -backup and /cache -all)
async function deleteAllBackups() {
    const list = await listBackups();
    for (const b of list) await removeBackup(b);
    return { backups: list.length, bytes: list.reduce((s, b) => s + b.bytes + (b.notesBytes ?? 0) + (b.contactsBytes ?? 0), 0) };
}

/**
 * Restores a backup over the current database. First, makes a backup of the state
 * current ('antes de restaurar'). Copies table by table, only the columns that
 * exist in both databases (a backup from an earlier version works too), and
 * reloads the settings.
 * @returns {Promise<{ security: object, inputs: object }>}
 */
async function restoreBackup(b) {
    await dbReady;
    const security = await createBackup(REASONS.restore);
    const copy = path.join(TMP_DIR, `restore-${b.name}.db`);

    await pipeline(fs.createReadStream(b.file), zlib.createGunzip(), fs.createWriteStream(copy));
    await dbRun('ATTACH DATABASE ? AS bk', [copy]);

    try {
        const doBackup = new Set(await tables('bk'));
        await dbRun('BEGIN');

        try {
            for (const t of await tables('main')) {
                await dbRun(`DELETE FROM main."${t}"`);
                if (!doBackup.has(t)) continue;

                const columns = (c) => dbAll(`PRAGMA ${c}.table_info("${t}")`).then(r => r.map(x => x.name));
                const inBackup = new Set(await columns('bk'));
                const common = (await columns('main')).filter(c => inBackup.has(c)).map(c => `"${c}"`).join(', ');

                await dbRun(`INSERT INTO main."${t}" (${common}) SELECT ${common} FROM bk."${t}"`);
            }
            await dbRun('COMMIT');
        } catch (err) {
            await dbRun('ROLLBACK').catch(() => {});
            throw err;
        }
    } finally {
        await dbRun('DETACH DATABASE bk').catch(() => {});
        await fs.remove(copy);
    }

    // The backup images go back to NOTES_DIR (those already there that did not come stay)
    if (b.notesFile) {
        await fs.ensureDir(NOTES_DIR);
        await tar('tar', ['-xzf', b.notesFile, '-C', NOTES_DIR]);
    }

    // The /contacts photos too (those already there that did not come stay)
    if (b.contactsFile) {
        await fs.ensureDir(CONTACTS_DIR);
        await tar('tar', ['-xzf', b.contactsFile, '-C', CONTACTS_DIR]);
    }

    await loadSettings();
    printInfo(`Backup ${b.name} restored (the previous state is in ${security.name})`);

    return { security, inputs: await countInputs() };
}

/*
 * Daily backup: every 10 minutes, if 'backup.hour' (Brasília) has passed
 * and there is no automatic one for today yet, creates one. Bot down at the time:
 * the backup goes out as soon as it returns, on the same day.
 */
let doingBackup = false;

async function checkBackupDaily(nowAlt = Date.now()) {
    if (doingBackup || !getSetting('backup.enabled')) return null;

    const today = partsInBrasilia(nowAlt);
    if (today.h < getSetting('backup.hour')) return null;

    const sameDay = (ms) => {
        const p = partsInBrasilia(ms);
        return p.year === today.year && p.mes === today.mes && p.day === today.day;
    };

    doingBackup = true;
    try {
        const jaDone = (await listBackups()).some(b => b.reason === REASONS.automatic && sameDay(b.createdAt));
        if (jaDone) return null;

        const b = await createBackup(REASONS.automatic, nowAlt);
        const destination = getSetting('backup.to').trim();
        if (destination) {
            try {
                await sendBackupAutomatic(b, destination);
            } catch (err) {
                printError('Sending the daily backup failed:', err.message);
                await alertPerEmail(t('adm.backup.sendFailAlertSubject'),
                    t('adm.backup.sendFailAlert', { name: b.name, error: err.message }));
            }
        }
        return b;
    } catch (err) {
        printError('Daily backup failed:', err.message);
        alertPerEmail(t('adm.backup.failAlertSubject'), t('adm.backup.failAlert', { error: err.message }));
        return null;
    } finally {
        doingBackup = false;
    }
}

// Next automatic backup (for /backup)
function nextBackupDaily(nowAlt = Date.now(), doneToday = false) {
    const p = partsInBrasilia(nowAlt);
    const hour = getSetting('backup.hour');
    const today = instantInBrasilia(p.year, p.mes, p.day, hour, 0);

    if (!doneToday && nowAlt < today) return today;
    if (!doneToday) return nowAlt; // already past the time: goes out on the next check
    return instantInBrasilia(p.year, p.mes, p.day + 1, hour, 0);
}

// Called in app.js
function startBackup() {
    setInterval(() => checkBackupDaily(), 10 * 60 * 1000);
}

module.exports = {
    MAX_ATTACHMENT_BYTES,
    REASONS,
    deleteAllBackups,
    countInputs,
    createBackup,
    sendBackupOnChat,
    sendBackupPerEmail,
    startBackup,
    listBackups,
    reasonText,
    nextBackupDaily,
    removeBackup,
    restoreBackup,
    checkBackupDaily
};
