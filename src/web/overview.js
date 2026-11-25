/*
 * The home of the web interface: what the bot keeps (the same numbers of /cache and /status), by kind.
 */

const fs = require('fs-extra');
const path = require('path');

const { listBackups } = require('../backup');
const { BACKUP_DIR, CACHE_DIR, CONTACTS_DIR, DB_PATH, MEDIA_DIR, NOTES_DIR, TMP_DIR } = require('../constants');
const { dbGet } = require('../db');
const { REAL } = require('./data');
const { getSetting } = require('../settings');

// The files and the bytes of a folder (and the ones inside it)
async function folderStats(dir) {
    let files = 0;
    let bytes = 0;
    const walk = async (current) => {
        for (const entry of await fs.readdir(current, { withFileTypes: true }).catch(() => [])) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) await walk(full);
            else if (entry.isFile()) {
                files++;
                bytes += (await fs.stat(full).catch(() => ({ size: 0 }))).size;
            }
        }
    };
    await walk(dir);
    return { files, bytes };
}

const size = async (file) => (await fs.stat(file).catch(() => ({ size: 0 }))).size;
const count = async (sql) => Number((await dbGet(sql))?.n ?? 0);

/** @returns {Promise<object>} the numbers of the home: counts, storage and retention */
async function overview() {
    const messages = await dbGet(`SELECT COUNT(*) AS total, COALESCE(SUM(revoked), 0) AS deleted, COALESCE(SUM(has_media), 0) AS withMedia,
        MIN(timestamp) AS firstAt, MAX(timestamp) AS lastAt, COUNT(DISTINCT chat_id) AS chats FROM messages WHERE ${REAL}`);

    const [media, notesDir, contacts, tmp, backupsList] = await Promise.all([
        folderStats(MEDIA_DIR), folderStats(NOTES_DIR), folderStats(CONTACTS_DIR), folderStats(TMP_DIR), listBackups().catch(() => [])
    ]);
    const backups = await folderStats(BACKUP_DIR);
    const db = (await size(DB_PATH)) + (await size(`${DB_PATH}-wal`));
    const all = await folderStats(CACHE_DIR);

    return {
        counts: {
            messages: messages.total, deleted: messages.deleted, withMedia: messages.withMedia, chats: messages.chats,
            edited: await count('SELECT COUNT(*) AS n FROM message_edits'),
            reactions: await count('SELECT COUNT(*) AS n FROM reaction_changes'),
            notes: await count('SELECT COUNT(*) AS n FROM notes'),
            tags: await count("SELECT COUNT(DISTINCT tag) AS n FROM notes WHERE tag IS NOT NULL AND tag <> ''"),
            protectedTags: await count('SELECT COUNT(*) AS n FROM note_locks')
        },
        span: { firstAt: messages.firstAt, lastAt: messages.lastAt },
        storage: {
            total: all.bytes,
            database: db,
            media: { ...media },
            notes: { ...notesDir },
            contacts: { ...contacts },
            backups: { count: backupsList.length, bytes: backups.bytes },
            temporary: { ...tmp }
        },
        retention: {
            messageDays: getSetting('cache.messageRetentionDays'),
            mediaDays: getSetting('cache.messageMediaRetentionDays'),
            deletedDays: getSetting('cache.revokedRetentionDays'),
            editedDays: getSetting('cache.editedRetentionDays'),
            reactionDays: getSetting('cache.reactionRetentionDays')
        }
    };
}

module.exports = { overview };
