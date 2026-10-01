/*
 * Database backup: compressed copy in cache/backups, the automatic daily backup and the restore.
 */

const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const fs = require('fs-extra');
const packageJson = require('../package.json');

const { BACKUP_DIR, TMP_DIR } = require('./constants');
const { dbAll, dbGet, dbReady, dbRun } = require('./db');
const { alertPerEmail } = require('./email');
const { printError, printInfo } = require('./log');
const { loadSettings, getSetting } = require('./settings');
const { instantInBrasilia, partsInBrasilia } = require('./util/when');

/*
 * Each backup is a pair of files in BACKUP_DIR:
 * zapbot-YYYYMMDD-HHMMSS.db.gz  → the whole database (VACUUM INTO: consistent copy
 * without stopping the bot), compressed
 * zapbot-YYYYMMDD-HHMMSS.json   → date, reason, bot version and each table's entries
 * Media (cache/media) is not included: only the database.
 *
 * Reasons: 'automático' (the daily one, setting 'backup.hour'), 'manual' (/backup -now)
 * and 'antes de restaurar'. The automatic ones and those from before a restore beyond the
 * 'backup.keep' most recent ones are deleted; the manual ones stay until a /backup -rm.
 */
const PREFIX = 'zapbot-';
const EXT = '.db.gz';

const REASONS = {
    automatico: 'automático',
    manual: 'manual',
    restaurar: 'antes de restaurar'
};

const two = (n) => String(n).padStart(2, '0');

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

// Free name for a backup created now (Brasília time in the name)
function nameNew(nowAlt) {
    const p = partsInBrasilia(nowAlt);
    const base = `${PREFIX}${p.ano}${two(p.mes)}${two(p.dia)}-${two(p.h)}${two(p.m)}${two(p.s)}`;

    let nameAlt = base;
    for (let i = 2; fs.existsSync(path.join(BACKUP_DIR, nameAlt + EXT)); i++) nameAlt = `${base}-${i}`;
    return nameAlt;
}

/**
 * The backups, from newest to oldest.
 * @returns {Promise<Array<{nome, arquivo, bytes, criadoEm, motivo, versao, entradas}>>}
 */
async function listBackups() {
    if (!fs.existsSync(BACKUP_DIR)) return [];

    const list = [];
    for (const f of await fs.readdir(BACKUP_DIR)) {
        if (!f.startsWith(PREFIX) || !f.endsWith(EXT)) continue;

        const nameAlt = f.slice(0, -EXT.length);
        const fileAlt = path.join(BACKUP_DIR, f);
        const stat = await fs.stat(fileAlt);
        const meta = await fs.readJson(path.join(BACKUP_DIR, `${nameAlt}.json`)).catch(() => ({}));

        list.push({
            nome: nameAlt,
            arquivo: fileAlt,
            bytes: stat.size,
            criadoEm: meta.criadoEm ?? stat.mtimeMs,
            motivo: meta.motivo ?? '?',
            versao: meta.versao ?? '?',
            entradas: meta.entradas ?? null
        });
    }

    return list.sort((a, b) => b.criadoEm - a.criadoEm || b.nome.localeCompare(a.nome));
}

/**
 * Creates a backup now.
 * @param {string} motivo  one of the MOTIVOS
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
        await fs.writeJson(path.join(BACKUP_DIR, `${nameAlt}.json`),
            { criadoEm: nowAlt, motivo: reasonAlt, versao: packageJson.version, bytesBanco: bytesDb, entradas: inputs }, { spaces: 2 });

        printInfo(`Backup ${nameAlt} criado (${reasonAlt})`);
    } finally {
        await fs.remove(copy);
    }

    await applyRetention();
    return (await listBackups()).find(b => b.nome === nameAlt);
}

// Deletes the automatic ones and those from before a restore beyond the 'backup.keep' most recent
async function applyRetention() {
    const keep = getSetting('backup.keep');
    const disposable = (await listBackups()).filter(b => b.motivo !== REASONS.manual);

    for (const b of disposable.slice(keep)) {
        await removeBackup(b);
        printInfo(`Backup ${b.nome} removido (retenção: ${keep})`);
    }
}

async function removeBackup(b) {
    await fs.remove(b.arquivo);
    await fs.remove(path.join(BACKUP_DIR, `${b.nome}.json`));
}

/**
 * Restores a backup over the current database. First, makes a backup of the state
 * current ('antes de restaurar'). Copies table by table, only the columns that
 * exist in both databases (a backup from an earlier version works too), and
 * reloads the settings.
 * @returns {Promise<{ seguranca: object, entradas: object }>}
 */
async function restoreBackup(b) {
    await dbReady;
    const security = await createBackup(REASONS.restaurar);
    const copy = path.join(TMP_DIR, `restaurar-${b.nome}.db`);

    await pipeline(fs.createReadStream(b.arquivo), zlib.createGunzip(), fs.createWriteStream(copy));
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

    await loadSettings();
    printInfo(`Backup ${b.nome} restaurado (o estado anterior ficou em ${security.nome})`);

    return { seguranca: security, entradas: await countInputs() };
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
        return p.ano === today.ano && p.mes === today.mes && p.dia === today.dia;
    };

    doingBackup = true;
    try {
        const jaDone = (await listBackups()).some(b => b.motivo === REASONS.automatico && sameDay(b.criadoEm));
        if (jaDone) return null;

        return await createBackup(REASONS.automatico, nowAlt);
    } catch (err) {
        printError('Backup diário falhou:', err.message);
        alertPerEmail('💾 Backup falhou', `O backup diário do banco falhou: ${err.message}`);
        return null;
    } finally {
        doingBackup = false;
    }
}

// Next automatic backup (for /backup)
function nextBackupDaily(nowAlt = Date.now(), doneToday = false) {
    const p = partsInBrasilia(nowAlt);
    const hour = getSetting('backup.hour');
    const today = instantInBrasilia(p.ano, p.mes, p.dia, hour, 0);

    if (!doneToday && nowAlt < today) return today;
    if (!doneToday) return nowAlt; // already past the time: goes out on the next check
    return instantInBrasilia(p.ano, p.mes, p.dia + 1, hour, 0);
}

// Called in app.js
function startBackup() {
    setInterval(() => checkBackupDaily(), 10 * 60 * 1000);
}

module.exports = {
    REASONS,
    countInputs,
    createBackup,
    startBackup,
    listBackups,
    nextBackupDaily,
    removeBackup,
    restoreBackup,
    checkBackupDaily
};
