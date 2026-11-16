/*
 * /bot -status: the bot report (last 24 h) and the daily send.
 */

const fs = require('fs');

const { estado: stateAlt } = require('./state');
const { listBackups, reasonText } = require('./backup');
const { client } = require('./client');
const { BOT_START_TIME, CACHE_DIR, DAY_MS, DB_PATH, MEDIA_DIR } = require('./constants');
const { dbAll, dbGet, dbReady, dbRun } = require('./db');
const { t } = require('./i18n');
const { getBotUptime } = require('./log');
const { describeDestinations, destinationsForSave, destinationsSaved } = require('./destinations');
const { getSetting } = require('./settings');
const { botVersion } = require('./version');
const { getDirSize, humanSize } = require('./util/files');
const { fmtInA, plural } = require('./util/format');
const { fmtWhen, instantInBrasilia, partsInBrasilia } = require('./util/when');

/*
 * The daily send is a schedule item (`schedules` table, kind 'status',
 * repetir 'daily'): the schedule already handles the time, the repetition and the send
 * late when the bot comes back. It does not show in /cron. The -to destinations
 * (people, groups, emails) stay in the recipients column; without it, your private chat.
 */
const KIND = 'status';

// Next to the count, when the notice setting is off: how to turn it back on
const off = (keyAlt, oThat) => (getSetting(keyAlt) ? '' : ' ' + t('status.offHint', { what: oThat, key: keyAlt }));

const size = (p) => (fs.existsSync(p) ? (fs.statSync(p).isDirectory() ? getDirSize(p) : fs.statSync(p).size) : 0);

/**
 * The report of the last 24 h. /bot puts its state at the top (botState)
 * and the users list below (usuarios); the daily send goes without the list.
 */
async function statusText(nowAlt = Date.now(), { estadoDoBot: botState = '', usuarios: usersAlt = '' } = {}) {
    await dbReady;
    const since = nowAlt - DAY_MS;
    const account = async (sql, params) => (await dbGet(sql, params)).n;

    const deletedAlt = await account(
        "SELECT COUNT(*) AS n FROM messages WHERE revoked = 1 AND revoked_at >= ? AND chat_id != 'status@broadcast'", [since]);
    const statusDeleted = await account(
        "SELECT COUNT(*) AS n FROM messages WHERE revoked = 1 AND revoked_at >= ? AND chat_id = 'status@broadcast'", [since]);
    const edited = await account('SELECT COUNT(*) AS n FROM message_edits WHERE edited_at >= ?', [since]);
    const reactions = await account('SELECT COUNT(*) AS n FROM reaction_changes WHERE changed_at >= ?', [since]);
    const messages = await account('SELECT COUNT(*) AS n FROM messages', []);

    // /watch: occurrences per rule (the no. is the one from the /watch -l list)
    const rules = getSetting('watch.rules');
    const byRule = await dbAll('SELECT rule, COUNT(*) AS n FROM watch_hits WHERE timestamp >= ? GROUP BY rule ORDER BY n DESC', [since]);
    const totalWatch = byRule.reduce((s, r) => s + r.n, 0);
    const detailWatch = byRule.slice(0, 5).map(r => {
        const i = rules.indexOf(r.rule);
        return `${i >= 0 ? `#${i + 1} ` : ''}${r.rule}: ${fmtInA(r.n)}`;
    }).join(', ');

    // /mute: muted notices, by type
    const ignored = await dbAll('SELECT kind, COUNT(*) AS n FROM mute_hits WHERE at >= ? GROUP BY kind ORDER BY kind', [since]);
    const totalIgnored = ignored.reduce((s, r) => s + r.n, 0);
    const LABELS = { apagada: t('status.kind.apagada'), editada: t('status.kind.editada'), status: t('status.kind.status'), reacao: t('status.kind.reacao'), watch: t('status.kind.watch') };
    const muted = await account('SELECT COUNT(*) AS n FROM mutes', []);

    const [lastBackup] = await listBackups();
    const connected = stateAlt.autenticadoEm ? getBotUptime(stateAlt.autenticadoEm) : t('uptime.notConnected');
    const db = size(DB_PATH);

    let textAlt = t('status.title', { version: botVersion(), when: fmtWhen(nowAlt, nowAlt) }) + '\n\n' +
        (botState ? `${botState}\n\n` : '') +
        t('status.up', { up: getBotUptime(BOT_START_TIME), connected: connected }) + '\n' +
        t('status.cache', {
            size: humanSize(size(CACHE_DIR)),
            db: humanSize(db),
            media: humanSize(size(MEDIA_DIR)),
            messages: `${fmtInA(messages)} ${t(messages === 1 ? 'status.message' : 'status.messages')}`
        }) + '\n' +
        t('status.watch', {
            count: `${fmtInA(totalWatch)} ${t(totalWatch === 1 ? 'status.hit' : 'status.hits')}`,
            detail: detailWatch ? ` _(${detailWatch})_` : ''
        }) + '\n' +
        t('status.deleted', { n: fmtInA(deletedAlt), off: off('show.alert.deleted', t('status.alertOff')) }) + '\n' +
        t('status.edited', { n: fmtInA(edited), off: off('show.alert.edited', t('status.alertOff')) }) + '\n' +
        t('status.statusDeleted', { n: fmtInA(statusDeleted), off: off('show.alert.status', t('status.recoveryOff')) }) + '\n' +
        t('status.reactions', { n: fmtInA(reactions), off: off('show.alert.reaction', t('status.alertOff')) }) + '\n' +
        t('status.muted', { n: fmtInA(totalIgnored) }) +
        (totalIgnored ? ` _(${ignored.map(r => `${LABELS[r.kind] ?? r.kind} ${fmtInA(r.n)}`).join(', ')})_` : '') +
        (muted ? ` · ${plural(muted, t('status.mutedOne'), t('status.mutedMany'))}` : '') + '\n' +
        t('status.lastBackup', {
            value: lastBackup ? `${fmtWhen(lastBackup.criadoEm, nowAlt)} (${reasonText(lastBackup.motivo)})` : t('status.none')
        });

    // Below, the users (only in /bot) and, at the end, the daily send
    return `${textAlt}${usersAlt ? `\n\n${usersAlt}` : ''}\n\n${await sendingDailyText(nowAlt)}`;
}

/**
 * The daily send time and the next one, or that it is off.
 */
async function sendingDailyText(nowAlt = Date.now()) {
    const daily = await schedulingDaily();

    return daily
        ? t('status.daily', {
            time: itemHour(daily),
            where: whereGoes(statusDestinations(daily)),
            next: fmtWhen(daily.due_at, nowAlt)
        })
        : t('status.dailyOff');
}

const schedulingDaily = () => dbGet('SELECT * FROM schedules WHERE kind = ?', [KIND]);

// Where the daily send goes: the -to ones; [] = your private chat
const statusDestinations = (item) => destinationsSaved(item?.recipients, null);

// " → 📧 a@b.com, 👥 Grupo" or ", in your private chat."
const whereGoes = (destinations) => (destinations.length
    ? ` → ${describeDestinations(destinations)}`
    : t('status.wherePrivate'));

const two = (n) => String(n).padStart(2, '0');
const itemHour = (s) => {
    const p = partsInBrasilia(s.due_at);
    return `${two(p.h)}:${two(p.m)}`;
};

/**
 * Schedules the daily status at the time (Brasília). Replaces the previous one.
 * @param {object[]} [destinos]  those from -to ([] = your private chat); without them, the previous ones stay
 * @returns {Promise<number>} the next send (ms)
 */
async function scheduleStatusDaily({ h, m }, nowAlt = Date.now(), destinations) {
    await dbReady;
    const recipients = destinations
        ? destinationsForSave(destinations)
        : (await schedulingDaily())?.recipients ?? null;
    const today = partsInBrasilia(nowAlt);
    let next = instantInBrasilia(today.ano, today.mes, today.dia, h, m);
    if (next <= nowAlt) next = instantInBrasilia(today.ano, today.mes, today.dia + 1, h, m);

    await dbRun('DELETE FROM schedules WHERE kind = ?', [KIND]);
    await dbRun(
        `INSERT INTO schedules (kind, chat_id, chat_name, is_group, text, due_at, repeat, day_of_month,
            quoted_id, created_at, recipients)
         VALUES (?, ?, 'seu privado', 0, '', ?, 'daily', NULL, NULL, ?, ?)`,
        [KIND, client.info.wid._serialized, next, nowAlt, recipients]
    );
    return next;
}

async function turnOffStatusDaily() {
    await dbReady;
    return (await dbRun('DELETE FROM schedules WHERE kind = ?', [KIND])).changes > 0;
}

module.exports = {
    KIND,
    schedulingDaily,
    scheduleStatusDaily,
    turnOffStatusDaily,
    statusDestinations,
    itemHour,
    whereGoes,
    sendingDailyText,
    statusText
};
