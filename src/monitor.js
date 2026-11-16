/*
 * /monitor: persisted contacts and distinct presence times observed.
 * Does not try to rebuild online intervals or fill in missing times.
 */
const crypto = require('node:crypto');
const { messageToSelf } = require('./client');
const { dbAll, dbGet, dbReady, dbRun } = require('./db');
const { estado: stateAlt } = require('./state');
const { getSetting } = require('./settings');
const { language, t } = require('./i18n');
const { limitHistoryMonitor } = require('./monitorHistory');
const { queryPresence } = require('./presence');
const { printError } = require('./log');

let checking = false;
let timer = null;
let wait = null;
let generation = 0;

function shuffle(contacts) {
    for (let i = contacts.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [contacts[i], contacts[j]] = [contacts[j], contacts[i]];
    }
    return contacts;
}

function waitBetweenContacts() {
    return new Promise(resolve => {
        const timeout = setTimeout(() => {
            wait = null;
            resolve();
        }, crypto.randomInt(1, 16) * 1000);
        wait = { timeout, resolve };
    });
}

const active = () => stateAlt.pronto && !stateAlt.reiniciando &&
    !getSetting('bot.paused') && getSetting('monitor.enabled') &&
    !getSetting('commands.disabled').includes('/monitor');

async function listMonitored() {
    await dbReady;
    return dbAll('SELECT * FROM monitor_contacts ORDER BY id');
}

async function registerMonitored(contactAlt) {
    await dbReady;
    const existing = await dbGet('SELECT * FROM monitor_contacts WHERE contact_id = ?',
        [contactAlt.id]);
    if (existing) return { existente: existing };
    const r = await dbRun(`INSERT OR IGNORE INTO monitor_contacts
        (contact_id, contact_name, created_at)
        SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM monitor_contacts) < ?`,
    [contactAlt.id, contactAlt.nome, Date.now(), getSetting('monitor.max')]);
    if (!r.changes) {
        const repeated = await dbGet('SELECT * FROM monitor_contacts WHERE contact_id = ?',
            [contactAlt.id]);
        return repeated ? { existente: repeated } : { limite: true };
    }
    return { contato: await dbGet('SELECT * FROM monitor_contacts WHERE id = ?', [r.lastID]) };
}

async function removeMonitored(id) {
    await dbReady;
    const contactAlt = await dbGet('SELECT * FROM monitor_contacts WHERE id = ?', [id]);
    if (!contactAlt) return null;
    await dbRun('DELETE FROM monitor_contacts WHERE id = ?', [id]);
    return contactAlt;
}

async function enableAlertMonitor(id) {
    await dbReady;
    return dbRun('UPDATE monitor_contacts SET alert_enabled = 1 WHERE id = ?', [id]);
}

async function removeAllMonitored() {
    await dbReady;
    const resultAlt = await dbRun('DELETE FROM monitor_contacts');
    return resultAlt.changes;
}

async function historyMonitored(id) {
    await dbReady;
    return dbAll(`SELECT * FROM monitor_history WHERE contact_id = ?
        ORDER BY last_seen DESC, id DESC LIMIT ?`, [id, getSetting('monitor.maxRecords')]);
}

function presenceData(dataAlt) {
    const p = dataAlt.presenceData ?? {};
    const state = p.chatstate ?? {};
    const raw = typeof p.lastSeen === 'number' ||
        (typeof p.lastSeen === 'string' && /^\d+$/.test(p.lastSeen)) ? Number(p.lastSeen) : NaN;
    const seconds = raw >= 1e12 ? Math.floor(raw / 1000) : raw;
    const lastSeen = p.isOnline !== true && p.hasData !== false && state.deny !== true &&
        Number.isSafeInteger(seconds) && seconds > 0 &&
        Number.isFinite(new Date(seconds * 1000).getTime()) ? seconds : null;
    const status = p.isOnline === true ? t('monitor.status.online')
        : p.hasData === false ? t('monitor.status.noData')
            : state.deny === true ? t('monitor.status.denied')
                : lastSeen ? t('monitor.status.offlineSeen') : t('monitor.status.noTime');
    return { lastSeen, status };
}

async function checkMonitor() {
    if (checking || !active()) return;
    checking = true;
    const current = generation;
    try {
        const contacts = shuffle((await listMonitored()).filter(c =>
            Date.now() - c.last_attempt_at >= getSetting('monitor.pool') * 1000));
        let queried = false;
        for (const candidateAlt of contacts) {
            if (!active() || current !== generation) break;
            if (queried) await waitBetweenContacts();
            if (!active() || current !== generation) break;
            const contactAlt = await dbGet('SELECT * FROM monitor_contacts WHERE id = ?',
                [candidateAlt.id]);
            if (!contactAlt) continue;
            const nowAlt = Date.now();
            if (nowAlt - contactAlt.last_attempt_at < getSetting('monitor.pool') * 1000) continue;
            const r = await dbRun(`UPDATE monitor_contacts SET last_attempt_at = ?
                WHERE id = ? AND last_attempt_at = ?`,
            [nowAlt, contactAlt.id, contactAlt.last_attempt_at]);
            if (!r.changes) continue;
            try {
                const dataAlt = await queryPresence(contactAlt.contact_id, { monitor: true });
                if (!dataAlt) {
                    await dbRun(`UPDATE monitor_contacts SET last_attempt_at = ?
                        WHERE id = ? AND last_attempt_at = ?`,
                    [contactAlt.last_attempt_at, contactAlt.id, nowAlt]);
                    break;
                }
                queried = true;
                const { lastSeen, status } = presenceData(dataAlt);
                const at = Date.now();
                if (lastSeen) {
                    await dbRun(`INSERT OR IGNORE INTO monitor_history
                        (contact_id, last_seen, observed_at, source, kind)
                        SELECT id, ?, ?, ?, ? FROM monitor_contacts WHERE id = ?`,
                    [lastSeen, at, dataAlt.lastSeenSource ?? null, dataAlt.lastSeenKind ?? null,
                        contactAlt.id]);
                    await limitHistoryMonitor(getSetting('monitor.maxRecords'), contactAlt.id);
                }
                const p = dataAlt.presenceData ?? {};
                const online = p.hasData === true && p.chatstate?.deny !== true
                    ? (p.isOnline === true ? 1 : p.isOnline === false ? 0 : null) : null;
                const salvo = await dbGet('SELECT * FROM monitor_contacts WHERE id = ?',
                    [contactAlt.id]);
                const resultAlt = await dbRun(`UPDATE monitor_contacts
                    SET online_state = COALESCE(?, online_state) WHERE id = ?`,
                [online, contactAlt.id]);
                if (active() && current === generation && resultAlt.changes &&
                    salvo?.alert_enabled && online === 1 &&
                    salvo.online_state !== 1) {
                    const when = new Date(at).toLocaleString(language() === 'pt_BR' ? 'pt-BR' : 'en-US',
                        { timeZone: 'America/Sao_Paulo' });
                    await messageToSelf(t('monitor.alert.fired', { name: salvo.contact_name, when: when }));
                }
                await dbRun(`UPDATE monitor_contacts SET last_checked_at = ?, last_status = ?,
                    last_seen = CASE WHEN ? IS NULL THEN last_seen
                        ELSE MAX(COALESCE(last_seen, 0), ?) END,
                    last_error = NULL WHERE id = ?`,
                [at, status, lastSeen, lastSeen, contactAlt.id]);
            } catch (err) {
                queried = true;
                await dbRun(`UPDATE monitor_contacts SET last_checked_at = ?, last_status = ?,
                    last_error = ? WHERE id = ?`,
                [Date.now(), t('monitor.status.failed'), String(err.message ?? err).slice(0, 300),
                    contactAlt.id]);
            }
        }
    } catch (err) {
        printError('Monitor: check failed:', err.message);
    } finally {
        checking = false;
    }
}

function startMonitor() {
    if (!timer) timer = setInterval(checkMonitor, 10000);
    timer.unref?.();
}

function stopMonitor() {
    generation++;
    if (wait) {
        clearTimeout(wait.timeout);
        wait.resolve();
        wait = null;
    }
    clearInterval(timer);
    timer = null;
}

module.exports = {
    enableAlertMonitor, registerMonitored, presenceData, historyMonitored, startMonitor,
    listMonitored, stopMonitor, removeMonitored, removeAllMonitored, checkMonitor
};
