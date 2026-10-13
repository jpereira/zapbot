/*
 * /bot -status: the bot report (last 24 h) and the daily send.
 */

const fs = require('fs');
const path = require('path');

const { estado: stateAlt } = require('./state');
const { listBackups } = require('./backup');
const { client } = require('./client');
const { BOT_START_TIME, CACHE_DIR, DAY_MS, MEDIA_DIR } = require('./constants');
const { dbAll, dbGet, dbReady, dbRun } = require('./db');
const { getBotUptime } = require('./log');
const { describeDestinations, destinationsForSave, destinationsSaved } = require('./destinations');
const { getSetting } = require('./settings');
const { botVersion } = require('./version');
const { getDirSize, humanSize } = require('./util/files');
const { fmtInA, plural } = require('./util/format');
const { fmtWhen, instantInBrasilia, partsInBrasilia } = require('./util/when');

/*
 * The daily send is a schedule item (`schedules` table, kind 'status',
 * repetir 'diario'): the schedule already handles the time, the repetition and the send
 * late when the bot comes back. It does not show in /cron. The -to destinations
 * (people, groups, emails) stay in the recipients column; without it, your private chat.
 */
const KIND = 'status';

// Next to the count, when the notice setting is off: how to turn it back on
const off = (keyAlt, oThat) => (getSetting(keyAlt) ? '' : ` _(${oThat}; ligue com /set ${keyAlt} on)_`);

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
    const LABELS = { apagada: 'apagadas', editada: 'editadas', status: 'status', reacao: 'reações', watch: 'watch' };
    const muted = await account('SELECT COUNT(*) AS n FROM mutes', []);

    const [lastBackup] = await listBackups();
    const connected = stateAlt.autenticadoEm ? getBotUptime(stateAlt.autenticadoEm) : 'não conectado';
    const db = size(path.join(CACHE_DIR, 'bot_database.db'));

    let textAlt = `📊 *Status do ZapBot ${botVersion()}* · últimas 24 h\n_${fmtWhen(nowAlt, nowAlt)}_\n\n` +
        (botState ? `${botState}\n\n` : '') +
        `🤖 *No ar:* ${getBotUptime(BOT_START_TIME)} · conectado: ${connected}\n` +
        `🗄️ *Cache:* ${humanSize(size(CACHE_DIR))} _(banco ${humanSize(db)} · mídias ${humanSize(size(MEDIA_DIR))})_ · ${fmtInA(messages)} ${messages === 1 ? 'mensagem' : 'mensagens'}\n` +
        `👀 *Watch:* ${fmtInA(totalWatch)} ocorrência${totalWatch === 1 ? '' : 's'}${detailWatch ? ` _(${detailWatch})_` : ''}\n` +
        `🗑️ *Apagadas:* ${fmtInA(deletedAlt)}${off('show.alert.deleted', 'aviso desligado')}\n` +
        `✏️ *Editadas:* ${fmtInA(edited)}${off('show.alert.edited', 'aviso desligado')}\n` +
        `📸 *Status apagados:* ${fmtInA(statusDeleted)}${off('show.alert.status', 'recuperação desligada')}\n` +
        `😶 *Reações removidas ou trocadas:* ${fmtInA(reactions)}${off('show.alert.reaction', 'aviso desligado')}\n` +
        `🔇 *Ignoradas (/mute):* ${fmtInA(totalIgnored)}` +
        (totalIgnored ? ` _(${ignored.map(r => `${LABELS[r.kind] ?? r.kind} ${fmtInA(r.n)}`).join(', ')})_` : '') +
        (muted ? ` · ${plural(muted, 'silenciado', 'silenciados')}` : '') + '\n' +
        `💾 *Último backup:* ${lastBackup ? `${fmtWhen(lastBackup.criadoEm, nowAlt)} (${lastBackup.motivo})` : 'nenhum'}`;

    // Below, the users (only in /bot) and, at the end, the daily send
    return `${textAlt}${usersAlt ? `\n\n${usersAlt}` : ''}\n\n${await sendingDailyText(nowAlt)}`;
}

/**
 * The daily send time and the next one, or that it is off.
 */
async function sendingDailyText(nowAlt = Date.now()) {
    const daily = await schedulingDaily();

    return daily
        ? `⏰ *Status diário:* todo dia às *${itemHour(daily)}*${whereGoes(statusDestinations(daily))}\n` +
            `📅 Próximo: ${fmtWhen(daily.due_at, nowAlt)}\n` +
            '💡 _Mude com /bot -status <hora> ou desligue com /bot -status off._'
        : '🔕 Status diário desligado.\n💡 _Ligue com /bot -status 06h (no horário que quiser)._';
}

const schedulingDaily = () => dbGet('SELECT * FROM schedules WHERE kind = ?', [KIND]);

// Where the daily send goes: the -to ones; [] = your private chat
const statusDestinations = (item) => destinationsSaved(item?.recipients, null);

// " → 📧 a@b.com, 👥 Grupo" or ", in your private chat."
const whereGoes = (destinations) => (destinations.length
    ? ` → ${describeDestinations(destinations)}`
    : ', no seu privado.');

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
         VALUES (?, ?, 'seu privado', 0, '', ?, 'diario', NULL, NULL, ?, ?)`,
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
