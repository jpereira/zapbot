/*
 * A command's usage limit per user (/bot +cmd /gpt +limit 5/day).
 *
 * The rule stays in the 'bot.users.limits' setting: "item=/gpt:5/day,/tldr:3" (the item is the bot.users one:
 * phone, "phone:group" or group). Without a period, the limit is total (no renewal). The uses stay
 * in the usage_log table: counting is a COUNT over the period window, so there is no counter to forget
 * of resetting. Only what succeeded counts: the use is reserved before running the command and returned if it
 * fail (error, "❌...", help) or if the option used is free (usageFree, in definicoes).
 */

const { dbAll, dbGet, dbRun } = require('./db');
const { botConfig } = require('./botConfig');
const { t } = require('./i18n');
const { getSetting } = require('./settings');
const { collect, register } = require('./usageCollector');
const { fmtWhen, instantInBrasilia, partsInBrasilia } = require('./util/when');

const PERIODS = ['total', 'day', 'week', 'month'];
const SYNONYMS = {
    total: 'total', all: 'total', tudo: 'total',
    day: 'day', d: 'day', dia: 'day', daily: 'day', diario: 'day',
    week: 'week', w: 'week', sem: 'week', semana: 'week', weekly: 'week', semanal: 'week',
    month: 'month', m: 'month', mes: 'month', mensal: 'month', monthly: 'month'
};

const withoutAccent = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * "5", "5/day", "5/day", "5/no", "20/mês" → { max, period }; invalid: throws.
 */
function readLimit(textAlt) {
    const m = String(textAlt).trim().match(/^(\d+)(?:\/(\S+))?$/);
    if (!m) throw new Error(t('usage.badFormat', { v: textAlt }));
    const max = Number(m[1]);
    if (max < 1 || max > 100000) throw new Error(t('usage.badMax', { v: textAlt }));
    const period = m[2] ? SYNONYMS[withoutAccent(m[2])] : 'total';
    if (!period) throw new Error(t('usage.badPeriod', { v: m[2] }));
    return { max, period };
}

// The stored form: "5" (total) or "5/day"
const recordLimit = ({ max, period }) => (period === 'total' ? `${max}` : `${max}/${period}`);

// "5 per day", "5 in total"
const describeLimit = ({ max, period }) => `${max} ${t(`usage.period.${period}`)}`;

// "item=/gpt:5/day,/tldr:3" → [item, Map(cmd → { max, period })]
function readLine(line) {
    const i = line.lastIndexOf('=');
    const byCommand = new Map();
    for (const pair of line.slice(i + 1).split(',').filter(Boolean)) {
        const j = pair.indexOf(':');
        byCommand.set(pair.slice(0, j), readLimit(pair.slice(j + 1)));
    }
    return [line.slice(0, i), byCommand];
}

const allAlt2 = () => new Map(getSetting('bot.users.limits').map(readLine));

/**
 * Saves (or, with null, deletes) an item's command limit.
 * @returns {Promise<void>}
 */
async function recordLimitAlt(item, cmd, limitAlt) {
    const { setSetting } = require('./settings');
    const map = allAlt2();
    const own = map.get(item) ?? new Map();
    if (limitAlt) own.set(cmd, limitAlt);
    else own.delete(cmd);

    const other = getSetting('bot.users.limits').filter(l => readLine(l)[0] !== item);
    const line = own.size
        ? [`${item}=${[...own].map(([c, l]) => `${c}:${recordLimit(l)}`).join(',')}`]
        : [];
    await setSetting('bot.users.limits', [...other, ...line]);
}

const limitsAlt = (item) => allAlt2().get(item) ?? new Map();

/*
 * The items that apply to whoever typed, from the most specific to the broadest: the person only in this group,
 * the person and the whole group (a group limit is collective).
 */
function itemsAlt({ number: numberAlt, chatId, isGroup }) {
    return [isGroup && numberAlt && `${numberAlt}:${chatId}`, numberAlt, isGroup && chatId].filter(Boolean);
}

/**
 * The limit that applies to this command: the most specific item's that has one.
 * @returns {{ item: string, max: number, period: string, cmd: string } | null}
 */
function limitApplicable(who, cmd) {
    const map = allAlt2();
    for (const item of itemsAlt(who)) {
        const l = map.get(item)?.get(cmd);
        if (l) return { item, cmd, ...l };
    }
    return null;
}

// Start of the period window (ms); 0 = since forever
function windowStart(period, nowAlt = Date.now()) {
    if (period === 'total') return 0;
    const p = partsInBrasilia(nowAlt);
    if (period === 'day') return instantInBrasilia(p.year, p.mes, p.day, 0, 0);
    if (period === 'week') return instantInBrasilia(p.year, p.mes, p.day - ((p.week + 6) % 7), 0, 0); // segunda
    return instantInBrasilia(p.year, p.mes, 1, 0, 0);
}

// When the current window ends (null: does not renew)
function windowEnd(period, nowAlt = Date.now()) {
    if (period === 'total') return null;
    const p = partsInBrasilia(nowAlt);
    if (period === 'day') return instantInBrasilia(p.year, p.mes, p.day + 1, 0, 0);
    if (period === 'week') return instantInBrasilia(p.year, p.mes, p.day - ((p.week + 6) % 7) + 7, 0, 0);
    return instantInBrasilia(p.year, p.mes + 1, 1, 0, 0);
}

async function countUses({ item, cmd, period }, nowAlt = Date.now()) {
    const r = await dbGet('SELECT COUNT(*) AS n FROM usage_log WHERE item = ? AND cmd = ? AND used_at >= ?',
        [item, cmd, windowStart(period, nowAlt)]);
    return r.n;
}

// Reservations and checks are serialized: two simultaneous calls do not go past the limit together
let queue = Promise.resolve();
const serialize = (fn) => {
    const r = queue.then(fn, fn);
    queue = r.catch(() => {});
    return r;
};

/**
 * Reserves a use (counts right away) if there is still one; otherwise returns how long is left to wait.
 * @returns {Promise<{ ok: true, id: number, used: number } | { ok: false, used: number, renews: number|null }>}
 */
function reserve(limitAlt, { chatId, params }, nowAlt = Date.now()) {
    return serialize(async () => {
        const used = await countUses(limitAlt, nowAlt);
        if (used >= limitAlt.max) return { ok: false, used, renews: windowEnd(limitAlt.period, nowAlt) };
        const r = await dbRun('INSERT INTO usage_log (item, cmd, used_at, chat, params) VALUES (?, ?, ?, ?, ?)',
            [limitAlt.item, limitAlt.cmd, nowAlt, chatId ?? null, String(params ?? '').slice(0, 200)]);
        return { ok: true, id: r.lastID, used: used + 1 };
    });
}

const giveBack = (id) => dbRun('DELETE FROM usage_log WHERE id = ?', [id]);

// An item's most recent uses (newest to oldest)
const lastUses = (items, cmd = null, n = 15) => dbAll(
    `SELECT item, cmd, used_at AS "when", chat, params FROM usage_log WHERE item IN (${items.map(() => '?').join(',')})` +
    `${cmd ? ' AND cmd = ?' : ''} ORDER BY used_at DESC, id DESC LIMIT ?`,
    [...items, ...(cmd ? [cmd] : []), n]);

/**
 * The limits of whoever typed, here, with each one's usage.
 * @returns {Promise<Array<{ item, cmd, max, period, used, renews }>>}
 */
async function limitsWithUsage(who, nowAlt = Date.now()) {
    const seen = new Set();
    const list = [];
    for (const item of itemsAlt(who)) {
        for (const [cmd, l] of limitsAlt(item)) {
            if (seen.has(cmd)) continue; // the most specific wins
            seen.add(cmd);
            const limitAlt = { item, cmd, ...l };
            list.push({ ...limitAlt, used: await countUses(limitAlt, nowAlt), renews: windowEnd(l.period, nowAlt) });
        }
    }
    return list.sort((a, b) => a.cmd.localeCompare(b.cmd));
}

// "3/5 per day" + when it renews
function usageLine(l) {
    const renew = l.renews ? t('usage.renews', { when: fmtWhen(l.renews) }) : '';
    return `${l.cmd}  ${l.used}/${l.max} ${t(`usage.period.${l.period}`)}${renew}`;
}

// The commands that can have a limit: the common-user ones and the delegable admin ones
const commandLimitable = (cmd) => {
    const c = botConfig.commands.find(x => x.cmd === cmd);
    return Boolean(c) && (c.role === 'user' || (c.role === 'admin' && c.isDelegable));
};

// A failure message (the command did not do what was asked): does not spend the limit
const isFailure = (content) => typeof content === 'string' &&
    /^\s*(?:[❌⚠🚫🔒⌛]|\*(?:Usage|Uso)\*\n|```\s*(?:Usage|Uso):|(?:Usage|Uso):)/u.test(content);

/**
 * Runs `execute` respecting the `cmds` limits for whoever typed. Reserves first, returns it if the command
 * fail (exception, only error messages or a free option) and, at the end, shows how much is left (usage.footer).
 * @returns {Promise<boolean>} false: blocked (the notice was already sent)
 */
async function withLimit({ msg, who, cmds, free = false, params = '' }, run) {
    const limits = free ? [] : cmds.map(c => limitApplicable(who, c)).filter(Boolean);
    if (!limits.length) {
        await run();
        return true;
    }

    const reserves = [];
    for (const l of limits) {
        const r = await reserve(l, { chatId: who.chatId, params });
        if (!r.ok) {
            for (const x of reserves) await giveBack(x.id);
            await msg.reply(t('usage.exceeded', {
                cmd: l.cmd, used: r.used, limit: describeLimit(l),
                renews: r.renews ? t('usage.renewsLong', { when: fmtWhen(r.renews) }) : t('usage.noRenew')
            }));
            return false;
        }
        reserves.push({ ...r, limit: l });
    }

    // What the command replies decides whether it was a use: the LAST reply counts (the "⏳ Processando..." is edited
    // to the result or to the error). Through msg.reply, client.sendMessage and completeNotice.
    const original = msg.reply.bind(msg);
    msg.reply = (content, ...rest) => { register(content); return original(content, ...rest); };

    let failed = false;
    let replies = [];
    try {
        ({ answers: replies } = await collect(run));
    } catch (err) {
        failed = true;
        throw err;
    } finally {
        msg.reply = original;
        failed = failed || (replies.length > 0 && isFailure(replies.at(-1)));
        if (failed) for (const r of reserves) await giveBack(r.id);
    }

    if (!failed && getSetting('usage.footer')) {
        for (const r of reserves) {
            await original(t('usage.footer', {
                cmd: r.limit.cmd, left: r.limit.max - r.used, limit: describeLimit(r.limit)
            }), undefined, { linkPreview: false }).catch(() => {});
        }
    }
    return true;
}

/**
 * Everyone's usage (/usage -all): per person (or group) and per command, in the history window
 * (usage.logDays). Only commands with a limit leave a trace in the table.
 * @returns {Promise<{ days: number, total: number, people: Array<{ key: string, group: boolean, total: number, byCmd: Map<string, number> }>, byCmd: Map<string, number> }>}
 */
async function allConsumption(nowAlt = Date.now()) {
    const daysAlt = getSetting('usage.logDays');
    const linesAlt = await dbAll(
        'SELECT item, cmd, COUNT(*) AS n FROM usage_log WHERE used_at >= ? GROUP BY item, cmd',
        [nowAlt - daysAlt * 24 * 60 * 60 * 1000]
    );

    const people = new Map();
    const byCmd = new Map();
    let total = 0;
    for (const { item, cmd, n } of linesAlt) {
        // "phone:group" is the person in that group: adds to the person
        const group = item.endsWith('@g.us') && !item.includes(':');
        const keyAlt = group ? item : item.split(':')[0];
        const p = people.get(keyAlt) ?? { key: keyAlt, group, total: 0, byCmd: new Map() };
        p.total += n;
        p.byCmd.set(cmd, (p.byCmd.get(cmd) ?? 0) + n);
        people.set(keyAlt, p);
        byCmd.set(cmd, (byCmd.get(cmd) ?? 0) + n);
        total += n;
    }

    return { days: daysAlt, total, people: [...people.values()].sort((a, b) => b.total - a.total), byCmd };
}

// Deletes the uses older than 'usage.logDays' (called in the daily cleanup)
const cleanUsesOld = (nowAlt = Date.now()) =>
    dbRun('DELETE FROM usage_log WHERE used_at < ?', [nowAlt - getSetting('usage.logDays') * 24 * 60 * 60 * 1000]);

module.exports = {
    PERIODS,
    allConsumption,
    withLimit,
    commandLimitable,
    describeLimit,
    isFailure,
    reserve,
    recordLimitAlt,
    windowStart,
    windowEnd,
    itemsAlt,
    readLimit,
    limitApplicable,
    limitsWithUsage,
    limitsAlt,
    cleanUsesOld,
    usageLine,
    recordLimit,
    all: allAlt2,
    lastUses
};
