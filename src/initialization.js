/*
 * Creation of the tables, loading of the settings and the cache folders: what needs to run before the database is used.
 */

const fs = require('fs-extra');

const { MEDIA_DIR, TMP_DIR } = require('./constants');
const { dbAll, dbRun } = require('./db');
const { printInfo } = require('./log');
const { loadSettings } = require('./settings');

/*
 * New columns on a table that already exists: CREATE TABLE IF NOT EXISTS does not
 * touches a table created by an earlier version.
 */
async function addColumns(table, columns) {
    const existingAlt = new Set((await dbAll(`PRAGMA table_info(${table})`)).map(c => c.name));

    for (const [column, type] of Object.entries(columns)) {
        if (existingAlt.has(column)) continue;
        await dbRun(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
        printInfo(`Coluna ${table}.${column} criada`);
    }
}

/*
 * Creation of the tables.
 * All in sequence (await): before, CREATE TABLE might not yet have
 * finished when the first query arrived.
 *
 * Handlers that use the database do `await dbReady` before querying.
 */
async function initializeDb() {
    // History of when the monitored contacts come online
    await dbRun(`
        CREATE TABLE IF NOT EXISTS presence_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone_number TEXT,
            display_name TEXT,
            status TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Numbers monitored via /monitor
    await dbRun(`
        CREATE TABLE IF NOT EXISTS monitored_numbers (
            phone_number TEXT PRIMARY KEY,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Received messages (to recover the deleted ones)
    await dbRun(`
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,

            sender_name TEXT,
            sender_jid TEXT,
            sender_number TEXT,

            chat_id TEXT,
            chat_name TEXT,
            is_group INTEGER DEFAULT 0,

            body TEXT,
            type TEXT,

            timestamp INTEGER,

            has_media INTEGER DEFAULT 0,
            media_path TEXT,

            location_lat REAL,
            location_lng REAL,

            raw_json TEXT,

            revoked INTEGER DEFAULT 0,
            revoked_at INTEGER,

            from_me INTEGER DEFAULT 0
        )
    `);
    // from_me: sent by your account (in private, sender_* is the other participant)
    await addColumns('messages', { from_me: 'INTEGER DEFAULT 0' });

    // /show query: a chat's deleted messages, from most recent to oldest
    await dbRun('CREATE INDEX IF NOT EXISTS idx_messages_chat_revoked ON messages (chat_id, revoked, revoked_at)');

    /*
     * Edited messages (for /show -e): one row per edit, with the text of
     * before and the after. UNIQUE(message_id, edited_at): WhatsApp Web notifies
     * the same edit more than once (body and caption), but it is stored only once.
     */
    await dbRun(`
        CREATE TABLE IF NOT EXISTS message_edits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id TEXT NOT NULL,
            chat_id TEXT,
            chat_name TEXT,
            is_group INTEGER DEFAULT 0,
            sender_name TEXT,
            sender_number TEXT,
            type TEXT,
            old_body TEXT,
            new_body TEXT,
            timestamp INTEGER,
            edited_at INTEGER,
            UNIQUE (message_id, edited_at)
        )
    `);
    await dbRun('CREATE INDEX IF NOT EXISTS idx_message_edits_chat ON message_edits (chat_id, edited_at)');

    /*
     * /stats statistics: counters per chat, day, hour and sender.
     * Regular messages leave the database in 68 h; the counters stay
     * 'stats.retentionDays' dias.
     */
    await dbRun(`
        CREATE TABLE IF NOT EXISTS stats (
            chat_id TEXT NOT NULL,
            chat_name TEXT,
            is_group INTEGER DEFAULT 0,
            day TEXT NOT NULL,
            hour INTEGER NOT NULL,
            sender_id TEXT NOT NULL,
            sender_name TEXT,
            msgs INTEGER DEFAULT 0,
            media INTEGER DEFAULT 0,
            deleted INTEGER DEFAULT 0,
            edited INTEGER DEFAULT 0,
            PRIMARY KEY (chat_id, day, hour, sender_id)
        )
    `);
    await dbRun('CREATE INDEX IF NOT EXISTS idx_stats_chat_day ON stats (chat_id, day)');

    /*
     * Price alerts from /cotacao -alerta and /crypto -alerta (fire once
     * time and go away). dest_*: the notice chat (-to); dest_email: the emails (-to email);
     * empty = your private chat.
     */
    await dbRun(`
        CREATE TABLE IF NOT EXISTS price_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL,
            symbol TEXT NOT NULL,
            op TEXT NOT NULL,
            target REAL NOT NULL,
            price_at_creation REAL,
            created_at INTEGER NOT NULL,
            dest_id TEXT,
            dest_name TEXT,
            dest_is_group INTEGER DEFAULT 0
        )
    `);
    await addColumns('price_alerts', { dest_id: 'TEXT', dest_name: 'TEXT', dest_is_group: 'INTEGER DEFAULT 0', dest_email: 'TEXT' });

    /*
     * Your account's polls (those from /enquete and those that arrive with votes) and the
     * votes, one per person: 'vote_update' brings the current choice of whoever voted.
     */
    await dbRun(`
        CREATE TABLE IF NOT EXISTS polls (
            id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL,
            chat_name TEXT,
            question TEXT,
            options TEXT,
            multi INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL
        )
    `);
    await dbRun('CREATE INDEX IF NOT EXISTS idx_polls_chat ON polls (chat_id, created_at)');

    await dbRun(`
        CREATE TABLE IF NOT EXISTS poll_votes (
            poll_id TEXT NOT NULL,
            voter TEXT NOT NULL,
            voter_name TEXT,
            options TEXT,
            voted_at INTEGER,
            PRIMARY KEY (poll_id, voter)
        )
    `);

    /*
     * /cron schedule: messages and reminders (kind). due_at is
     * the next send; with repeat, it advances on each send (day_of_month stores
     * the monthly's original day, so a 31 goes back to 31 after February).
     */
    await dbRun(`
        CREATE TABLE IF NOT EXISTS schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL,
            chat_id TEXT NOT NULL,
            chat_name TEXT,
            is_group INTEGER DEFAULT 0,
            text TEXT NOT NULL,
            due_at INTEGER NOT NULL,
            repeat TEXT,
            day_of_month INTEGER,
            quoted_id TEXT,
            created_at INTEGER NOT NULL
        )
    `);
    await dbRun('CREATE INDEX IF NOT EXISTS idx_schedules_due ON schedules (due_at)');

    /*
     * /defi DeFi positions (for now, from Orca): the rest is read on-chain on
     * each -show. -alerta keeps where to notify (alert_dest_*: one chat;
     * alert_email: emails; none: your private chat) and whether the position was in the
     * range at the last check (in_range; NULL: not read yet).
     */
    await dbRun(`
        CREATE TABLE IF NOT EXISTS defi_positions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            protocol TEXT NOT NULL,
            position TEXT NOT NULL UNIQUE,
            nft TEXT,
            pool TEXT,
            created_at INTEGER NOT NULL
        )
    `);
    await addColumns('defi_positions', {
        alert: 'INTEGER DEFAULT 0',
        alert_dest_id: 'TEXT',
        alert_dest_name: 'TEXT',
        alert_dest_is_group: 'INTEGER DEFAULT 0',
        alert_email: 'TEXT',
        in_range: 'INTEGER'
    });

    /*
     * /mudo: people and groups with muted notices (what: deleted, edited,
     * status) and each cut notice (mute_hits, for /bot -status; 30 days).
     */
    await dbRun(`
        CREATE TABLE IF NOT EXISTS mutes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_id TEXT NOT NULL UNIQUE,
            target_name TEXT,
            is_group INTEGER DEFAULT 0,
            deleted INTEGER DEFAULT 0,
            edited INTEGER DEFAULT 0,
            status INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL
        )
    `);
    await dbRun(`
        CREATE TABLE IF NOT EXISTS mute_hits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            at INTEGER NOT NULL
        )
    `);
    await dbRun('CREATE INDEX IF NOT EXISTS idx_mute_hits_at ON mute_hits (at)');

    // General bot settings (key -> value in JSON)
    await dbRun(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // /watch occurrences: messages that matched some rule in the 'watch.rules' setting.
    // UNIQUE(rule, message_id): the same message does not generate two notices for the same rule.
    await dbRun(`
        CREATE TABLE IF NOT EXISTS watch_hits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rule TEXT NOT NULL,
            message_id TEXT NOT NULL,
            chat_id TEXT,
            chat_name TEXT,
            is_group INTEGER DEFAULT 0,
            sender_name TEXT,
            sender_number TEXT,
            body TEXT,
            timestamp INTEGER,
            UNIQUE (rule, message_id)
        )
    `);
    await dbRun('CREATE INDEX IF NOT EXISTS idx_watch_hits_rule ON watch_hits (rule, timestamp)');

    await loadSettings();

    for (const dir of [MEDIA_DIR, TMP_DIR]) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            printInfo(`Creating ${dir}`);
        }
    }
}

module.exports = {
    addColumns,
    initializeDb
};
