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
 * - normal messages: the text leaves the database after 'cache.messageRetentionDays' and the media, after
 * 'cache.messageMediaRetentionDays' (default 3 days, over the "delete for everyone" window: after it not even
 * can no longer be deleted); the media never goes past the text;
 * - DELETED messages (revoked=1): kept for 'cache.revokedRetentionDays' (default 30),
 * so /show keeps working.
 */
async function cleanCacheOld(
    maxDeleteWin = MAX_DELETE_WINDOW,
    retentionDeleted = getSetting('cache.revokedRetentionDays') * DAY_MS,
    retentionMessages = getSetting('cache.messageRetentionDays') * DAY_MS,
    retentionMedia = getSetting('cache.messageMediaRetentionDays') * DAY_MS
) {
    await dbReady;

    const nowAlt = Date.now();
    const filter = `
        (revoked = 0 AND timestamp < ?)
        OR (revoked = 1 AND COALESCE(revoked_at, timestamp) < ?)
    `;
    const params = [nowAlt - Math.max(retentionMessages, maxDeleteWin), nowAlt - retentionDeleted];

    try {
        // A regular message's media goes out on its own schedule, even if the text stays longer (the media_path disappears)
        const deadlineOutside = 'revoked = 0 AND timestamp < ? AND media_path IS NOT NULL';
        const limitMedia = nowAlt - Math.max(retentionMedia, maxDeleteWin);
        const old = await dbAll(`SELECT media_path FROM messages WHERE ${deadlineOutside}`, [limitMedia]);
        for (const row of old) {
            if (mediaIsPath(row.media_path) && fs.existsSync(row.media_path)) {
                printInfo(`Removing ${row.media_path}`);
                fs.unlinkSync(row.media_path);
            }
        }
        if (old.length) await dbRun(`UPDATE messages SET media_path = NULL WHERE ${deadlineOutside}`, [limitMedia]);

        const rows = await dbAll(`SELECT media_path FROM messages WHERE media_path IS NOT NULL AND (${filter})`, params);

        for (const row of rows) {
            if (mediaIsPath(row.media_path) && fs.existsSync(row.media_path)) {
                printInfo(`Removing ${row.media_path}`);
                fs.unlinkSync(row.media_path);
            }
        }

        const res = await dbRun(`DELETE FROM messages WHERE ${filter}`, params);
        if (res.changes > 0) {
            printInfo(`Cleanup: ${res.changes} old records cleared.`);
        }
    } catch (err) {
        printError('Cache cleanup error:', err.message);
    }
}

/*
 * General cleanup (/cache -all): ALL messages (including the deleted ones, the
 * edited and the reactions stored for /show), all the media, all the
 * temporaries and all the /backup backups.
 * At the end, VACUUM gives the space back to the disk: DELETE alone does not shrink the .db.
 * Does not touch watch_hits, stats, polls, price_alerts
 * nor settings (configuration and history).
 */
async function cleanAll() {
    await dbReady;

    const bytesBefore = getDirSize(CACHE_DIR);
    const { total, deleted: deletedAlt } = await dbGet(
        'SELECT COUNT(*) AS total, COALESCE(SUM(revoked), 0) AS deleted FROM messages'
    );

    const { edited } = await dbGet('SELECT COUNT(*) AS edited FROM message_edits');
    const { reactions } = await dbGet('SELECT COUNT(*) AS reactions FROM reaction_changes');

    await dbRun('DELETE FROM messages');
    await dbRun('DELETE FROM message_edits');
    await dbRun('DELETE FROM reaction_changes');
    await dbRun('DELETE FROM reactions');
    cleanContentDirectory(MEDIA_DIR);
    cleanContentDirectory(TMP_DIR);
    const { backups } = await deleteAllBackups();
    await dbRun('VACUUM');

    return { total, deleted: deletedAlt, edited, reactions, backups, allowed: Math.max(0, bytesBefore - getDirSize(CACHE_DIR)) };
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
    printInfo(`/cache -media: ${files} files (${bytes} bytes) deleted from ${MEDIA_DIR}; ${changes} messages without media`);

    return { files, bytes };
}

// Edits older than 'cache.editedRetentionDays'
async function cleanEditedOld() {
    await dbReady;

    try {
        const res = await dbRun('DELETE FROM message_edits WHERE edited_at < ?',
            [Date.now() - getSetting('cache.editedRetentionDays') * DAY_MS]);

        if (res.changes > 0) {
            printInfo(`Cleanup: ${res.changes} old edits removed.`);
        }
    } catch (err) {
        printError('Edited-messages cleanup error:', err.message);
    }
}

/*
 * Removed or changed reactions older than 'cache.reactionRetentionDays',
 * and the current reactions at the same time (they only serve to know which was removed)
 */
async function cleanReactionsOld() {
    await dbReady;

    try {
        const limitAlt = Date.now() - getSetting('cache.reactionRetentionDays') * DAY_MS;
        const res = await dbRun('DELETE FROM reaction_changes WHERE changed_at < ?', [limitAlt]);
        await dbRun('DELETE FROM reactions WHERE reacted_at < ?', [limitAlt]);

        if (res.changes > 0) {
            printInfo(`Cleanup: ${res.changes} old reactions removed.`);
        }
    } catch (err) {
        printError('Reactions cleanup error:', err.message);
    }
}

// /stats counters older than 'stats.retentionDays'
async function cleanStatsOld() {
    await dbReady;

    try {
        const { day } = dayAndHour(Date.now() - getSetting('stats.retentionDays') * DAY_MS);
        const res = await dbRun('DELETE FROM stats WHERE day < ?', [day]);

        if (res.changes > 0) {
            printInfo(`Cleanup: ${res.changes} old /stats counters removed.`);
        }
    } catch (err) {
        printError('/stats cleanup error:', err.message);
    }
}

// Polls (and their votes) older than 'poll.retentionDays'
async function cleanPollsOld() {
    await dbReady;

    try {
        const limitAlt = Date.now() - getSetting('poll.retentionDays') * DAY_MS;
        await dbRun('DELETE FROM poll_votes WHERE poll_id IN (SELECT id FROM polls WHERE created_at < ?)', [limitAlt]);
        const res = await dbRun('DELETE FROM polls WHERE created_at < ?', [limitAlt]);

        if (res.changes > 0) {
            printInfo(`Cleanup: ${res.changes} old polls removed.`);
        }
    } catch (err) {
        printError('Polls cleanup error:', err.message);
    }
}

// Notices cut by /mute (mute_hits) and the origin of the notices sent (alerts): 30 days are enough
const MUTE_HITS_DAYS = 30;

async function cleanIgnoredOld() {
    await dbReady;

    try {
        const limitAlt = Date.now() - MUTE_HITS_DAYS * DAY_MS;
        const res = await dbRun('DELETE FROM mute_hits WHERE at < ?', [limitAlt]);
        const notices = await dbRun('DELETE FROM alerts WHERE created_at < ?', [limitAlt]);
        const total = res.changes + notices.changes;
        if (total > 0) printInfo(`Cleanup: ${total} old /mute records removed.`);
    } catch (err) {
        printError('/mute cleanup error:', err.message);
    }
}

// /watch occurrences older than 'watch.hitsRetentionDays'
async function cleanWatchOld() {
    await dbReady;

    try {
        const res = await dbRun('DELETE FROM watch_hits WHERE timestamp < ?',
            [Date.now() - getSetting('watch.hitsRetentionDays') * DAY_MS]);

        if (res.changes > 0) {
            printInfo(`Cleanup: ${res.changes} old /watch occurrences removed.`);
        }
    } catch (err) {
        printError('/watch cleanup error:', err.message);
    }
}

// <sha1>_original.mp4: the /get cached download (setting get.cache.tmp); temporary ones have the uuid
const DOWNLOAD_IN_CACHE = /^[0-9a-f]{40}_original\./;

/*
 * Deletes from cache/tmp whatever is past its age: 2 h for temporaries and, for downloads
 * in cache, get.cache.maxDays days (with the cache off they count as temporaries).
 */
async function cleanFilesOld(dir = TMP_DIR, maxAgeHours = 2) {
    const now = Date.now();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    const maxCacheMs = getSetting('get.cache.tmp') ? getSetting('get.cache.maxDays') * DAY_MS : maxAgeMs;

    try {
        for (const file of await fs.readdir(dir)) {
            const fullPath = path.join(dir, file);

            try {
                const stat = await fs.stat(fullPath);
                if (!stat.isFile()) continue;

                if (now - stat.mtimeMs > (DOWNLOAD_IN_CACHE.test(file) ? maxCacheMs : maxAgeMs)) {
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
    require('./usageLimit').cleanUsesOld().catch(() => {});
    cleanCacheOld();
    cleanFilesOld();
    cleanWatchOld();
    cleanEditedOld();
    cleanReactionsOld();
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
    cleanReactionsOld,
    cleanStatsOld,
    cleanAll,
    cleanWatchOld
};
