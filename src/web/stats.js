/*
 * The numbers behind the "Stats" charts of the web interface: the counters of /stats (table `stats`) for the last
 * N days and the N before them (to compare), per day, per hour, per weekday x hour, chats and people.
 */

const { dbAll } = require('../db');
const { chatName } = require('./data');

const DAY_MS = 86_400_000;
const TIMEZONE = 'America/Sao_Paulo'; // the day and the hour of the counters (src/stats.js)

const dayOf = (ms) => new Date(ms).toLocaleString('sv-SE', { timeZone: TIMEZONE, hour12: false }).slice(0, 10);
const weekdayOf = (day) => new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = Sunday

const sum = (rows, field) => rows.reduce((n, r) => n + (r[field] ?? 0), 0);

/** The totals of a list of days ({ day, msgs, media, deleted, edited }) */
function totals(days) {
    const active = days.filter(d => d.msgs > 0);
    const busiest = days.reduce((best, d) => (d.msgs > (best?.msgs ?? 0) ? d : best), null);
    return {
        msgs: sum(days, 'msgs'), media: sum(days, 'media'), deleted: sum(days, 'deleted'), edited: sum(days, 'edited'),
        activeDays: active.length, perDay: days.length ? Math.round(sum(days, 'msgs') / days.length * 10) / 10 : 0,
        busiestDay: busiest ? { day: busiest.day, msgs: busiest.msgs } : null
    };
}

/**
 * @param {number} [days]  7, 30, 90 or 365 (anything between 1 and 365)
 * @param {number} [now]
 */
async function statsData(days = 30, now = Date.now()) {
    const span = Math.min(365, Math.max(1, Math.floor(Number(days)) || 30));
    const dayList = Array.from({ length: span }, (_, i) => dayOf(now - (span - 1 - i) * DAY_MS));
    const previousList = Array.from({ length: span }, (_, i) => dayOf(now - (2 * span - 1 - i) * DAY_MS));
    const since = dayList[0];
    const previousSince = previousList[0];

    const perDayRows = await dbAll('SELECT day, SUM(msgs) AS msgs, SUM(media) AS media, SUM(deleted) AS deleted, SUM(edited) AS edited FROM stats WHERE day >= ? GROUP BY day', [previousSince]);
    const byDay = new Map(perDayRows.map(r => [r.day, r]));
    const fill = (list) => list.map(day => ({ day, msgs: byDay.get(day)?.msgs ?? 0, media: byDay.get(day)?.media ?? 0, deleted: byDay.get(day)?.deleted ?? 0, edited: byDay.get(day)?.edited ?? 0 }));
    const current = fill(dayList);
    const previous = fill(previousList);

    // Per hour of the day, and per weekday x hour (a heatmap): from the per day-and-hour counters
    const perHour = Array.from({ length: 24 }, () => 0);
    const heatmap = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
    for (const r of await dbAll('SELECT day, hour, SUM(msgs) AS msgs FROM stats WHERE day >= ? GROUP BY day, hour', [since])) {
        perHour[r.hour] += r.msgs;
        heatmap[weekdayOf(r.day)][r.hour] += r.msgs;
    }

    const chats = await dbAll(`SELECT chat_id, MAX(chat_name) AS chat_name, MAX(is_group) AS is_group, SUM(msgs) AS msgs, SUM(media) AS media, SUM(deleted) AS deleted, SUM(edited) AS edited
        FROM stats WHERE day >= ? GROUP BY chat_id ORDER BY msgs DESC LIMIT 10`, [since]);
    const people = await dbAll('SELECT sender_id, MAX(sender_name) AS sender_name, SUM(msgs) AS msgs, SUM(media) AS media FROM stats WHERE day >= ? GROUP BY sender_id ORDER BY msgs DESC LIMIT 10', [since]);
    const now2 = totals(current);
    const peakHour = perHour.reduce((best, n, hour) => (n > perHour[best] ? hour : best), 0);

    return {
        days: span, since, until: dayList.at(-1),
        totals: { ...now2, peakHour: now2.msgs ? peakHour : null }, previous: totals(previous),
        perDay: current, perHour, heatmap,
        chats: await Promise.all(chats.map(async c => ({ id: c.chat_id, name: await chatName(c), isGroup: Boolean(c.is_group), msgs: c.msgs, media: c.media, deleted: c.deleted, edited: c.edited }))),
        people: people.map(p => ({ id: p.sender_id, name: p.sender_name || p.sender_id.split('@')[0], msgs: p.msgs, media: p.media }))
    };
}

module.exports = { statsData };
