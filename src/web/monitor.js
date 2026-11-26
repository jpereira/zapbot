/*
 * The Monitor of the web: the /monitor contacts as cards (online or not, the last seen, the next check, the error),
 * when each one is usually seen (weekday x hour, from the readings) and the loop itself (on, paused, waiting).
 */

const { dbAll } = require('../db');
const { getSetting } = require('../settings');
const { state } = require('../state');
const { staleAfter } = require('../monitor');

const TIMEZONE = 'America/Sao_Paulo'; // the same day and hour as the times of /monitor
const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const clock = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, weekday: 'short', hour: 'numeric', hourCycle: 'h23' });

// The weekday (0 = Sunday) and the hour of a time, in the bot's timezone
function slotOf(ms) {
    const parts = Object.fromEntries(clock.formatToParts(new Date(ms)).map(p => [p.type, p.value]));
    return [WEEKDAYS[parts.weekday] ?? 0, Number(parts.hour) % 24];
}

// The loop: off (/set monitor.enabled false, /bot paused or /monitor disabled), waiting for WhatsApp, or checking
function loopState() {
    if (getSetting('commands.disabled').includes('/monitor')) return 'disabled';
    if (!getSetting('monitor.enabled') || getSetting('bot.paused')) return 'paused';
    return !state.ready || state.restarting ? 'waiting' : 'active';
}

const DAY_MS = 86_400_000;

// Midnight of today in the bot's timezone (the "today" of the online time)
function startOfToday(now) {
    const wall = new Date(now).toLocaleString('sv-SE', { timeZone: TIMEZONE, hour12: false }).replace(' ', 'T');
    const offset = Date.parse(`${wall}Z`) - now;
    return Date.parse(`${wall.slice(0, 10)}T00:00:00Z`) - offset;
}
const WEEK_MS = 7 * DAY_MS;

// The online time of the sessions inside [from, to]: an open one goes until its last check; one seen only once
// counts as one minute (it was there, for at most a check)
const span = (s) => [s.started_at, Math.max(s.ended_at ?? s.last_at, s.started_at + 60_000)];
const clip = ([a, b], from, to) => [Math.max(a, from), Math.min(b, to)];
const length = ([a, b]) => Math.max(0, b - a);

// Where two lists of intervals overlap
function overlaps(a, b) {
    const out = [];
    for (const x of a) {
        for (const y of b) {
            const both = [Math.max(x[0], y[0]), Math.min(x[1], y[1])];
            if (both[1] > both[0]) out.push(both);
        }
    }
    return out.sort((p, q) => p[0] - q[0]);
}

/*
 * "Online together": for each pair of monitored contacts, how long both were online at the same time in the last 7
 * days, the most first. It is a coincidence of times, not proof that they talked.
 */
function together(contacts, intervals, online) {
    const pairs = [];
    for (let i = 0; i < contacts.length; i++) {
        for (let j = i + 1; j < contacts.length; j++) {
            const both = overlaps(intervals.get(contacts[i].id) ?? [], intervals.get(contacts[j].id) ?? []);
            const total = both.reduce((n, x) => n + length(x), 0);
            if (!total) continue;
            pairs.push({ a: contacts[i].id, b: contacts[j].id, total, times: both.length, last: both.at(-1)[1], intervals: both.slice(-50) });
        }
    }
    // Together now: both with a session still open
    return pairs.sort((p, q) => q.total - p.total || q.last - p.last).slice(0, 20).map(p => ({ ...p, ongoing: online.has(p.a) && online.has(p.b) }));
}

/** The contacts with what the monitor read of each one, and the state of the loop */
async function monitorOverview() {
    const now = Date.now();
    const pool = getSetting('monitor.pool');
    const contacts = await dbAll('SELECT * FROM monitor_contacts ORDER BY contact_name COLLATE NOCASE, id');
    const readings = await dbAll('SELECT contact_id, last_seen FROM monitor_history ORDER BY last_seen DESC');
    const chats = new Set((await dbAll(`SELECT DISTINCT chat_id FROM messages WHERE chat_id IN (${contacts.map(() => '?').join(',') || "''"})`,
        contacts.map(c => c.contact_id))).map(r => r.chat_id));
    // An open one not checked for two rounds (the monitor paused) is shown closed at its last check
    const sessions = (await dbAll('SELECT * FROM monitor_sessions WHERE COALESCE(ended_at, last_at) >= ? ORDER BY started_at', [now - WEEK_MS]))
        .map(x => (x.ended_at == null && now - x.last_at > staleAfter() ? { ...x, ended_at: x.last_at } : x));
    const intervals = new Map();
    for (const x of sessions) {
        if (!intervals.has(x.contact_id)) intervals.set(x.contact_id, []);
        intervals.get(x.contact_id).push({ ...x, range: clip(span(x), now - WEEK_MS, now) });
    }
    const byContact = new Map();
    for (const r of readings) {
        if (!byContact.has(r.contact_id)) byContact.set(r.contact_id, []);
        byContact.get(r.contact_id).push(r.last_seen * 1000);
    }
    return {
        state: loopState(),
        enabled: Boolean(getSetting('monitor.enabled')),
        pool, max: getSetting('monitor.max'), maxRecords: getSetting('monitor.maxRecords'),
        together: together(contacts, new Map([...intervals].map(([id, list]) => [id, list.map(x => x.range)])),
            new Set(sessions.filter(x => x.ended_at == null).map(x => x.contact_id))),
        contacts: contacts.map((c) => {
            const seen = byContact.get(c.id) ?? [];
            const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0));
            const hours = Array(24).fill(0);
            for (const ms of seen) {
                const [day, hour] = slotOf(ms);
                heatmap[day][hour]++;
                hours[hour]++;
            }
            // The hours it is usually seen: up to two, each with at least 2 readings and a fifth of them
            const peaks = hours.map((n, hour) => ({ n, hour })).filter(h => h.n >= Math.max(2, seen.length / 5))
                .sort((a, b) => b.n - a.n).slice(0, 2).map(h => h.hour).sort((a, b) => a - b);
            const mine = intervals.get(c.id) ?? [];
            const activity = {
                sessions: mine.map(x => ({ start: x.range[0], end: x.range[1], open: x.ended_at == null })),
                week: mine.reduce((n, x) => n + length(x.range), 0),
                today: mine.reduce((n, x) => n + length(clip(x.range, startOfToday(now), now)), 0),
                average: mine.length ? Math.round(mine.reduce((n, x) => n + length(span(x)), 0) / mine.length) : null
            };
            return {
                id: c.id, name: c.contact_name, contactId: c.contact_id, activity,
                number: /@(c\.us|s\.whatsapp\.net)$/.test(c.contact_id) ? c.contact_id.split('@')[0].split(':')[0] : null,
                status: c.last_status ?? null,
                // 1 online, 0 offline, null not known (hidden by the privacy of the contact, or not read yet)
                online: c.online_state ?? null,
                lastSeen: c.last_seen ? c.last_seen * 1000 : null,
                lastCheckedAt: c.last_checked_at ?? null,
                // Never tried: the next round of the loop (every 10 s) takes it
                nextAt: c.last_attempt_at ? c.last_attempt_at + pool * 1000 : null,
                createdAt: c.created_at, alert: Boolean(c.alert_enabled), error: c.last_error ?? null,
                hasChat: chats.has(c.contact_id),
                readings: seen.length, seen: seen.slice(0, 200), heatmap, peaks
            };
        })
    };
}

module.exports = { monitorOverview, overlaps, slotOf, startOfToday };
