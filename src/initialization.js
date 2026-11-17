/*
 * Creation of the tables, loading of the settings and the cache folders: what needs to run before the database is used.
 */

const fs = require('fs-extra');

const { CONTACTS_DIR, MEDIA_DIR, NOTES_DIR, TMP_DIR } = require('./constants');
const { dbAll, dbRun } = require('./db');
const { printInfo } = require('./log');
const { loadSettings } = require('./settings');

/*
 * New columns on a table that already exists: CREATE TABLE IF NOT EXISTS does not
 * touches a table created by an earlier version.
 */
async function addColumns(table, columns) {
    const existingAlt = new Set((await dbAll(`PRAGMA table_info(${table})`)).map(c => c.name));
    const created = [];

    for (const [column, type] of Object.entries(columns)) {
        if (existingAlt.has(column)) continue;
        await dbRun(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
        printInfo(`Coluna ${table}.${column} criada`);
        created.push(column);
    }
    return created;
}

/*
 * /defi: the registrations. The columns have the option names: address (the -address
 * of Orca, the position) and wallet (the -wallet of Project X and Morpho, the
 * wallet); a registration has one or the other. The name is the wallet's -name.
 */
const CREATE_DEFI_POSITIONS = `
    CREATE TABLE IF NOT EXISTS defi_positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        protocol TEXT NOT NULL,
        address TEXT,
        wallet TEXT,
        name TEXT,
        nft TEXT,
        pool TEXT,
        created_at INTEGER NOT NULL,
        UNIQUE (protocol, address),
        UNIQUE (protocol, wallet)
    )
`;
const ALERT_DEFI_COLUMNS = {
    alert: 'INTEGER DEFAULT 0',
    alert_dest_id: 'TEXT',
    alert_dest_name: 'TEXT',
    alert_dest_is_group: 'INTEGER DEFAULT 0',
    alert_email: 'TEXT',
    alert_recipients: 'TEXT',           // JSON with the destinations of several -to (the alert_dest_*: the first)
    alert_fees: 'REAL',                 // -fees: notifies when the fees to collect go above that (US$)
    fees_notified: 'INTEGER DEFAULT 0', // already notified about this value (goes back to 0 when collected)
    in_range: 'INTEGER'
};

/*
 * defi_positions from an earlier version: the address in a single column
 * (position, unique across all protocols). Passes to address (Orca) and
 * wallet (the wallets); the rest goes as it was.
 */
async function migrateDefiForAddressAndWallet() {
    const columns = (await dbAll('PRAGMA table_info(defi_positions)')).map(c => c.name);
    if (!columns.includes('position')) return;

    await dbRun('ALTER TABLE defi_positions RENAME TO defi_positions_antiga');
    await dbRun(CREATE_DEFI_POSITIONS);
    await addColumns('defi_positions', ALERT_DEFI_COLUMNS);

    const freshAlt2 = new Set((await dbAll('PRAGMA table_info(defi_positions)')).map(c => c.name));
    const equal = columns.filter(c => c !== 'position' && freshAlt2.has(c)).join(', ');
    await dbRun(`
        INSERT INTO defi_positions (${equal}, address, wallet)
        SELECT ${equal},
               CASE WHEN protocol = 'orca' THEN position END,
               CASE WHEN protocol <> 'orca' THEN position END
          FROM defi_positions_antiga
    `);
    await dbRun('DROP TABLE defi_positions_antiga');
    printInfo('defi_positions: o position virou address (Orca) e wallet (carteiras)');
}

/*
 * Creation of the tables.
 * All in sequence (await): before, CREATE TABLE might not yet have
 * finished when the first query arrived.
 *
 * Handlers that use the database do `await dbReady` before querying.
 */
async function initializeDb() {
    await dbRun(`CREATE TABLE IF NOT EXISTS monitor_contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_id TEXT NOT NULL UNIQUE,
        contact_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_attempt_at INTEGER NOT NULL DEFAULT 0,
        last_checked_at INTEGER,
        last_status TEXT,
        last_seen INTEGER,
        last_error TEXT
    )`);
    await addColumns('monitor_contacts', {
        alert_enabled: 'INTEGER NOT NULL DEFAULT 0',
        online_state: 'INTEGER'
    });
    await dbRun(`CREATE TABLE IF NOT EXISTS monitor_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_id INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        observed_at INTEGER NOT NULL,
        source TEXT,
        kind TEXT,
        UNIQUE(contact_id, last_seen)
    )`);
    await dbRun(`CREATE TRIGGER IF NOT EXISTS monitor_remove_history
        AFTER DELETE ON monitor_contacts BEGIN
            DELETE FROM monitor_history WHERE contact_id = OLD.id;
        END`);
    await dbRun(`CREATE TABLE IF NOT EXISTS command_aliases (
        name TEXT PRIMARY KEY,
        description TEXT NOT NULL DEFAULT '',
        command TEXT NOT NULL
    )`);
    await addColumns('command_aliases', { quiet: 'INTEGER NOT NULL DEFAULT 0' });

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
    // transcription: the audio transcription, stored by /tldr so as not to transcribe again
    await addColumns('messages', { transcription: 'TEXT' });
    // mentions: the ids (@lid/@c.us) of the message mentions, in JSON, to swap @number for the name on display
    await addColumns('messages', { mentions: 'TEXT' });

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
     * Reactions (for /show -r). WhatsApp only notifies the NEW reaction (empty =
     * removed): reactions stores each person's current one in each message,
     * to know which was removed or changed. Each removed or changed one
     * becomes a reaction_changes row (old_reaction → new_reaction, empty =
     * removed), with the text of the reacted message (body) from when it happened.
     */
    await dbRun(`
        CREATE TABLE IF NOT EXISTS reactions (
            message_id TEXT NOT NULL,
            sender_jid TEXT NOT NULL,
            chat_id TEXT,
            reaction TEXT NOT NULL,
            reacted_at INTEGER NOT NULL,
            PRIMARY KEY (message_id, sender_jid)
        )
    `);
    await dbRun('CREATE INDEX IF NOT EXISTS idx_reactions_reacted ON reactions (reacted_at)');
    await dbRun(`
        CREATE TABLE IF NOT EXISTS reaction_changes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id TEXT NOT NULL,
            chat_id TEXT,
            chat_name TEXT,
            is_group INTEGER DEFAULT 0,
            sender_name TEXT,
            sender_number TEXT,
            sender_jid TEXT,
            old_reaction TEXT,
            new_reaction TEXT,
            body TEXT,
            msg_from_me INTEGER DEFAULT 0,
            reacted_at INTEGER,
            changed_at INTEGER,
            UNIQUE (message_id, sender_jid, changed_at)
        )
    `);
    await dbRun('CREATE INDEX IF NOT EXISTS idx_reaction_changes_chat ON reaction_changes (chat_id, changed_at)');

    /*
     * /stats statistics: counters per chat, day, hour and sender.
     * Regular messages leave the database in cache.messageRetentionHours (68 h); the counters stay
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
    // System notices counted as an "Unknown" participant (until 2.0.2): they go away
    await dbRun("DELETE FROM stats WHERE sender_id = 'UNKNOWN'");

    /*
     * Price alerts from /rates -alert and /crypto -alert (fire once
     * time and go away). dest_*: the notice chat (-to); dest_email: the emails (-to email);
     * empty = your private chat. With several -to, recipients has all of them (and the dest_*, the first).
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
    await addColumns('price_alerts', {
        dest_id: 'TEXT',
        dest_name: 'TEXT',
        dest_is_group: 'INTEGER DEFAULT 0',
        dest_email: 'TEXT',
        recipients: 'TEXT',  // JSON [{ id, name, group } | { email }]: several -to
        message: 'TEXT'      // the -msg text, at the start of the notice
    });

    /*
     * /notes notes. alert_at: when the -alert notifies (null = no alert; fires once and clears);
     * dest_* and recipients: where to (empty = your private chat), as in the price alerts.
     */
    await dbRun(`
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            alert_at INTEGER,
            dest_id TEXT,
            dest_name TEXT,
            dest_is_group INTEGER DEFAULT 0,
            dest_email TEXT,
            recipients TEXT
        )
    `);
    await dbRun(`
        CREATE TABLE IF NOT EXISTS note_tags (
            tag TEXT PRIMARY KEY,   -- minúscula e sem o "#"
            description TEXT NOT NULL
        )
    `);
    await dbRun(`
        CREATE TABLE IF NOT EXISTS forward_lists (
            list TEXT PRIMARY KEY,      -- minúscula e sem o "#"
            description TEXT,
            recipients TEXT NOT NULL    -- JSON dos destinos já resolvidos (id/nome/grupo ou e-mail)
        )
    `);
    await addColumns('notes', {
        tag: 'TEXT',        // #hashtag of the note, lowercase and without the "#"
        media_path: 'TEXT', // note image, in NOTES_DIR (outside MEDIA_DIR, which /cache -media cleans)
        media_mime: 'TEXT'
    });

    /*
     * Your account's polls (those from /poll and those that arrive with votes) and the
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
     * paused: /cron -pause takes the item out of the check until -resume.
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
    await addColumns('schedules', {
        paused: 'INTEGER DEFAULT 0',
        recipients: 'TEXT'   // JSON [{ id, name, group }]: an item with several -to (without it, the chat_id)
    });
    await dbRun('CREATE INDEX IF NOT EXISTS idx_schedules_due ON schedules (due_at)');
    // The /cron -repeat values were in Portuguese: converts what was already saved
    await dbRun("UPDATE schedules SET repeat = CASE repeat WHEN 'diario' THEN 'daily' WHEN 'semanal' THEN 'weekly' WHEN 'mensal' THEN 'monthly' END WHERE repeat IN ('diario', 'semanal', 'mensal')");

    /*
     * /defi registrations (the Orca positions and the Project X and
     * Morpho): the rest is read on the spot, on each /defi. The -alert keeps where to notify (alert_dest_*: one chat;
     * alert_email: emails; alert_recipients: several -to; none: your private chat)
     * and whether the position was in the range at the last check (in_range; NULL:
     * not read yet).
     */
    await migrateDefiForAddressAndWallet();
    await dbRun(CREATE_DEFI_POSITIONS);
    await addColumns('defi_positions', { name: 'TEXT', ...ALERT_DEFI_COLUMNS });

    /*
     * /welcome and /goodbye: each group's greeting (kind), with its own text (NULL: the language default).
     */
    await dbRun(`
        CREATE TABLE IF NOT EXISTS group_greetings (
            chat_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            text TEXT,
            PRIMARY KEY (chat_id, kind)
        )
    `);

    // /status (and /cron -status) posts: to warn about the risk of posting too much (src/commands/status.js)
    await dbRun(`
        CREATE TABLE IF NOT EXISTS status_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            posted_at INTEGER NOT NULL,
            chat TEXT
        )
    `);

    // Usage limit (/bot +limit): one row per call that counted, in the period window (src/usageLimit.js)
    await dbRun(`
        CREATE TABLE IF NOT EXISTS usage_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item TEXT NOT NULL,
            cmd TEXT NOT NULL,
            used_at INTEGER NOT NULL,
            chat TEXT,
            params TEXT
        )
    `);
    await dbRun('CREATE INDEX IF NOT EXISTS idx_usage_log ON usage_log (item, cmd, used_at)');

    /*
     * /mute: people and groups with muted notices (what: deleted, edited,
     * status, reaction) and each cut notice (mute_hits, for /bot -status; 30 days).
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
            reaction INTEGER DEFAULT 0,
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
    // is_community: the community (its announcements group), muted by /mute
    await addColumns('mutes', { is_community: 'INTEGER DEFAULT 0' });
    // expires_at: the temporary mute (/mute -for 2h) ends by itself at that instant (null: no deadline)
    await addColumns('mutes', { expires_at: 'INTEGER' });
    // reaction: /mute -r. Whoever already had everything muted (-a) stays with everything
    if ((await addColumns('mutes', { reaction: 'INTEGER DEFAULT 0' })).length) {
        await dbRun('UPDATE mutes SET reaction = 1 WHERE deleted = 1 AND edited = 1 AND status = 1');
    }

    /*
     * Where each notice the bot sent came from (deleted, edited, status, and the
     * that /show re-shows): /mute and /unmute replying to a notice know who
     * mute. The origin chat and the sender (the phone or the id).
     */
    await dbRun(`
        CREATE TABLE IF NOT EXISTS alerts (
            message_id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL,
            sender TEXT,
            created_at INTEGER NOT NULL
        )
    `);
    await dbRun('CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts (created_at)');

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

    // Destinations of each /watch rule's notices (-to); no row = your private chat
    await dbRun(`
        CREATE TABLE IF NOT EXISTS watch_destinations (
            rule TEXT PRIMARY KEY,
            dest_id TEXT,
            dest_name TEXT,
            dest_is_group INTEGER DEFAULT 0,
            dest_email TEXT
        )
    `);
    await addColumns('watch_destinations', {
        recipients: 'TEXT'   // JSON with the destinations of several -to (the dest_*: the first)
    });

    // Without an origin row, the rule applies in any chat and for any sender.
    await dbRun(`CREATE TABLE IF NOT EXISTS watch_sources (
        rule TEXT PRIMARY KEY, source_id TEXT NOT NULL, source_name TEXT NOT NULL,
        source_kind TEXT NOT NULL
    )`);

    // /watch rules with the 🔒 (-mask N): the notices and occurrences come out with obfuscated phones.
    // Without a row, the rule shows everything as it came.
    await dbRun('CREATE TABLE IF NOT EXISTS watch_masks (rule TEXT PRIMARY KEY)');

    await loadSettings();

    for (const dir of [CONTACTS_DIR, MEDIA_DIR, NOTES_DIR, TMP_DIR]) {
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
