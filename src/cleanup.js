/*
 * Database and disk cleanup: retention windows and the periodic cleanup.
 */

const path = require('path');
const fs = require('fs-extra');

const { deleteAllBackups } = require('./backup');
const { CACHE_DIR, DAY_MS, MAX_DELETE_WINDOW, MEDIA_DIR, TMP_DIR } = require('./constants');
const { dbAll, dbGet, dbReady, dbRun } = require('./db');
const { printError, printInfo } = require('./log');
const { getSetting } = require('./settings');
const { dayAndHour } = require('./stats');
const { getDirSize, mediaIsPath, cleanContentDirectory } = require('./util/files');

/*
 * Database + media cleanup:
 * - normal messages: removed after the "delete for everyone" window (68h),
 * because after that they can no longer be deleted;
 * - DELETED messages (revoked=1): kept for 'cache.revokedRetentionDays' (default 30),
 * so /show keeps working.
 */
async function cleanCacheOld(maxDeleteWin = MAX_DELETE_WINDOW, retentionDeleted = getSetting('cache.revokedRetentionDays') * DAY_MS) {
    await dbReady;

    const nowAlt = Date.now();
    const filter = `
        (revoked = 0 AND timestamp < ?)
        OR (revoked = 1 AND COALESCE(revoked_at, timestamp) < ?)
    `;
    const params = [nowAlt - maxDeleteWin, nowAlt - retentionDeleted];

    try {
        const rows = await dbAll(`SELECT media_path FROM messages WHERE media_path IS NOT NULL AND (${filter})`, params);

        for (const row of rows) {
            if (mediaIsPath(row.media_path) && fs.existsSync(row.media_path)) {
                printInfo(`Removendo ${row.media_path}`);
                fs.unlinkSync(row.media_path);
            }
        }

        const res = await dbRun(`DELETE FROM messages WHERE ${filter}`, params);
        if (res.changes > 0) {
            printInfo(`Limpeza: ${res.changes} registros antigos limpos.`);
        }
    } catch (err) {
        printError('Erro na limpeza do cache:', err.message);
    }
}

/*
 * General cleanup (/cache -all): ALL messages (including the deleted ones and the
 * edited stored for /show), all the media, all the temporaries and
 * all the /backup backups.
 * At the end, VACUUM gives the space back to the disk: DELETE alone does not shrink the .db.
 * Does not touch monitored_numbers, presence_logs, watch_hits, stats, polls, price_alerts
 * nor settings (configuration and history).
 */
async function cleanAll() {
    await dbReady;

    const bytesBefore = getDirSize(CACHE_DIR);
    const { total, apagadas: deletedAlt } = await dbGet(
        'SELECT COUNT(*) AS total, COALESCE(SUM(revoked), 0) AS apagadas FROM messages'
    );

    const { editadas: edited } = await dbGet('SELECT COUNT(*) AS editadas FROM message_edits');

    await dbRun('DELETE FROM messages');
    await dbRun('DELETE FROM message_edits');
    cleanContentDirectory(MEDIA_DIR);
    cleanContentDirectory(TMP_DIR);
    const { backups } = await deleteAllBackups();
    await dbRun('VACUUM');

    return { total, apagadas: deletedAlt, editadas: edited, backups, liberado: Math.max(0, bytesBefore - getDirSize(CACHE_DIR)) };
}

/*
 * /cache -media: deletes the downloaded media (MEDIA_DIR). The messages stay in the
 * database without the file: a deleted one recovered later warns "file not
 * available in the cache".
 */
async function cleanMedia() {
    await dbReady;

    // Media stays in date subfolders (media/YYYY/MM/DD): counts all of it before deleting
    let files = 0;
    let bytes = 0;

    const countAlt = (dir) => {
        for (const inputAlt of fs.readdirSync(dir, { withFileTypes: true })) {
            const pathAlt = path.join(dir, inputAlt.name);
            if (inputAlt.isDirectory()) countAlt(pathAlt);
            else if (inputAlt.isFile()) {
                files++;
                bytes += fs.statSync(pathAlt).size;
            }
        }
    };

    if (fs.existsSync(MEDIA_DIR)) {
        countAlt(MEDIA_DIR);
        cleanContentDirectory(MEDIA_DIR);
    }

    const { changes } = await dbRun('UPDATE messages SET media_path = NULL WHERE media_path IS NOT NULL');
    printInfo(`/cache -media: ${files} arquivos (${bytes} bytes) apagados de ${MEDIA_DIR}; ${changes} mensagens sem mídia`);

    return { arquivos: files, bytes };
}

// Edits older than 'cache.editedRetentionDays'
async function cleanEditedOld() {
    await dbReady;

    try {
        const res = await dbRun('DELETE FROM message_edits WHERE edited_at < ?',
            [Date.now() - getSetting('cache.editedRetentionDays') * DAY_MS]);

        if (res.changes > 0) {
            printInfo(`Limpeza: ${res.changes} edições antigas removidas.`);
        }
    } catch (err) {
        printError('Erro na limpeza das editadas:', err.message);
    }
}

// /stats counters older than 'stats.retentionDays'
async function cleanStatsOld() {
    await dbReady;

    try {
        const { day } = dayAndHour(Date.now() - getSetting('stats.retentionDays') * DAY_MS);
        const res = await dbRun('DELETE FROM stats WHERE day < ?', [day]);

        if (res.changes > 0) {
            printInfo(`Limpeza: ${res.changes} contadores antigos do /stats removidos.`);
        }
    } catch (err) {
        printError('Erro na limpeza do /stats:', err.message);
    }
}

// Polls (and their votes) older than 'enquete.retentionDays'
async function cleanPollsOld() {
    await dbReady;

    try {
        const limitAlt = Date.now() - getSetting('enquete.retentionDays') * DAY_MS;
        await dbRun('DELETE FROM poll_votes WHERE poll_id IN (SELECT id FROM polls WHERE created_at < ?)', [limitAlt]);
        const res = await dbRun('DELETE FROM polls WHERE created_at < ?', [limitAlt]);

        if (res.changes > 0) {
            printInfo(`Limpeza: ${res.changes} enquetes antigas removidas.`);
        }
    } catch (err) {
        printError('Erro na limpeza das enquetes:', err.message);
    }
}

// Notices cut by /mudo (mute_hits): 30 days are enough for /bot -status
const MUTE_HITS_DAYS = 30;

async function cleanIgnoredOld() {
    await dbReady;

    try {
        const res = await dbRun('DELETE FROM mute_hits WHERE at < ?', [Date.now() - MUTE_HITS_DAYS * DAY_MS]);
        if (res.changes > 0) printInfo(`Limpeza: ${res.changes} registros antigos do /mudo removidos.`);
    } catch (err) {
        printError('Erro na limpeza do /mudo:', err.message);
    }
}

// /watch occurrences older than 'watch.hitsRetentionDays'
async function cleanWatchOld() {
    await dbReady;

    try {
        const res = await dbRun('DELETE FROM watch_hits WHERE timestamp < ?',
            [Date.now() - getSetting('watch.hitsRetentionDays') * DAY_MS]);

        if (res.changes > 0) {
            printInfo(`Limpeza: ${res.changes} ocorrências antigas do /watch removidas.`);
        }
    } catch (err) {
        printError('Erro na limpeza do /watch:', err.message);
    }
}

async function cleanFilesOld(dir = TMP_DIR, maxAgeHours = 2) {
    const now = Date.now();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

    try {
        for (const file of await fs.readdir(dir)) {
            const fullPath = path.join(dir, file);

            try {
                const stat = await fs.stat(fullPath);
                if (!stat.isFile()) continue;

                if (now - stat.mtimeMs > maxAgeMs) {
                    await fs.unlink(fullPath);
                    printInfo(`[cleanup] Deleted: ${fullPath}`);
                }
            } catch (err) {
                printError(`[cleanup] Error processing ${fullPath}:`, err.message);
            }
        }
    } catch (err) {
        printError(`[cleanup] Error reading directory ${dir}:`, err.message);
    }
}

/*
 * Periodic cleanup. It used to run on EVERY received message
 * (a DELETE in SQLite + a folder sweep per message).
 */
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

function runCleanup() {
    cleanCacheOld();
    cleanFilesOld();
    cleanWatchOld();
    cleanEditedOld();
    cleanStatsOld();
    cleanPollsOld();
    cleanIgnoredOld();
}

// Called in app.js. First run postponed: on the first boot the tables are still being created.
function startCleanupPeriodic() {
    setTimeout(runCleanup, 60 * 1000);
    setInterval(runCleanup, CLEANUP_INTERVAL_MS);
}

module.exports = {
    startCleanupPeriodic,
    cleanFilesOld,
    cleanCacheOld,
    cleanEditedOld,
    cleanPollsOld,
    cleanIgnoredOld,
    cleanMedia,
    cleanStatsOld,
    cleanAll,
    cleanWatchOld
};
