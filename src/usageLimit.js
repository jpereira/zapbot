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
 * "5", "5/day", "5/dia", "5/sem", "20/mês" → { max, period }; invalid: throws.
 */
function readLimit(textAlt) {
    const m = String(textAlt).trim().match(/^(\d+)(?:\/(\S+))?$/);
    if (!m) throw new Error(t('usage.badFormat', { v: textAlt }));
    const max = Number(m[1]);
    if (max < 1 || max > 100000) throw new Error(t('usage.badMax', { v: textAlt }));
    const period = m[2] ? SYNONYMS[withoutAccent(m[2])] : 'total';
    if (!period) throw new Error(t('usage.badPeriod', { v: m[2] }));
    return { max, periodo: period };
}

// The stored form: "5" (total) or "5/day"
const recordLimit = ({ max, periodo: period }) => (period === 'total' ? `${max}` : `${max}/${period}`);

// "5 per day", "5 in total"
const describeLimit = ({ max, periodo: period }) => `${max} ${t(`usage.period.${period}`)}`;

// "item=/gpt:5/day,/tldr:3" → [item, Map(cmd → { max, periodo })]
function readLine(line) {
    const i = line.lastIndexOf('=');
    const byCommand = new Map();
    for (const par of line.slice(i + 1).split(',').filter(Boolean)) {
        const j = par.indexOf(':');
        byCommand.set(par.slice(0, j), readLimit(par.slice(j + 1)));
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
    const dele = map.get(item) ?? new Map();
    if (limitAlt) dele.set(cmd, limitAlt);
    else dele.delete(cmd);

    const other = getSetting('bot.users.limits').filter(l => readLine(l)[0] !== item);
    const line = dele.size
        ? [`${item}=${[...dele].map(([c, l]) => `${c}:${recordLimit(l)}`).join(',')}`]
        : [];
    await setSetting('bot.users.limits', [...other, ...line]);
}

const limitsAlt = (item) => allAlt2().get(item) ?? new Map();

/*
 * The items that apply to whoever typed, from the most specific to the broadest: the person only in this group,
 * the person and the whole group (a group limit is collective).
 */
function itemsAlt({ numero: numberAlt, chatId, isGroup }) {
    return [isGroup && numberAlt && `${numberAlt}:${chatId}`, numberAlt, isGroup && chatId].filter(Boolean);
}

/**
 * The limit that applies to this command: the most specific item's that has one.
 * @returns {{ item: string, max: number, periodo: string, cmd: string } | null}
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
    if (period === 'day') return instantInBrasilia(p.ano, p.mes, p.dia, 0, 0);
    if (period === 'week') return instantInBrasilia(p.ano, p.mes, p.dia - ((p.semana + 6) % 7), 0, 0); // segunda
    return instantInBrasilia(p.ano, p.mes, 1, 0, 0);
}

// When the current window ends (null: does not renew)
function windowEnd(period, nowAlt = Date.now()) {
    if (period === 'total') return null;
    const p = partsInBrasilia(nowAlt);
    if (period === 'day') return instantInBrasilia(p.ano, p.mes, p.dia + 1, 0, 0);
    if (period === 'week') return instantInBrasilia(p.ano, p.mes, p.dia - ((p.semana + 6) % 7) + 7, 0, 0);
    return instantInBrasilia(p.ano, p.mes + 1, 1, 0, 0);
}

async function countUses({ item, cmd, periodo: period }, nowAlt = Date.now()) {
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
 * @returns {Promise<{ ok: true, id: number, usados: number } | { ok: false, usados: number, renova: number|null }>}
 */
function reserve(limitAlt, { chatId, params }, nowAlt = Date.now()) {
    return serialize(async () => {
        const used = await countUses(limitAlt, nowAlt);
        if (used >= limitAlt.max) return { ok: false, usados: used, renova: windowEnd(limitAlt.periodo, nowAlt) };
        const r = await dbRun('INSERT INTO usage_log (item, cmd, used_at, chat, params) VALUES (?, ?, ?, ?, ?)',
            [limitAlt.item, limitAlt.cmd, nowAlt, chatId ?? null, String(params ?? '').slice(0, 200)]);
        return { ok: true, id: r.lastID, usados: used + 1 };
    });
}

const giveBack = (id) => dbRun('DELETE FROM usage_log WHERE id = ?', [id]);

// An item's most recent uses (newest to oldest)
const lastUses = (items, cmd = null, n = 15) => dbAll(
    `SELECT item, cmd, used_at AS quando, chat, params FROM usage_log WHERE item IN (${items.map(() => '?').join(',')})` +
    `${cmd ? ' AND cmd = ?' : ''} ORDER BY used_at DESC, id DESC LIMIT ?`,
    [...items, ...(cmd ? [cmd] : []), n]);

/**
 * The limits of whoever typed, here, with each one's usage.
 * @returns {Promise<Array<{ item, cmd, max, periodo, usados, renova }>>}
 */
async function limitsWithUsage(who, nowAlt = Date.now()) {
    const seen = new Set();
    const list = [];
    for (const item of itemsAlt(who)) {
        for (const [cmd, l] of limitsAlt(item)) {
            if (seen.has(cmd)) continue; // the most specific wins
            seen.add(cmd);
            const limitAlt = { item, cmd, ...l };
            list.push({ ...limitAlt, usados: await countUses(limitAlt, nowAlt), renova: windowEnd(l.periodo, nowAlt) });
        }
    }
    return list.sort((a, b) => a.cmd.localeCompare(b.cmd));
}

// "3/5 per day" + when it renews
function usageLine(l) {
    const renew = l.renova ? t('usage.renews', { quando: fmtWhen(l.renova) }) : '';
    return `${l.cmd}  ${l.usados}/${l.max} ${t(`usage.period.${l.periodo}`)}${renew}`;
}

// The commands that can have a limit: the common-user ones and the delegable admin ones
const commandLimitable = (cmd) => {
    const c = botConfig.commands.find(x => x.cmd === cmd);
    return Boolean(c) && (c.role === 'user' || (c.role === 'admin' && c.delegavel));
};

// A failure message (the command did not do what was asked): does not spend the limit
const isFailure = (content) => typeof content === 'string' &&
    /^\s*(?:[❌⚠🚫🔒⌛]|```\s*(?:Usage|Uso):|(?:Usage|Uso):)/u.test(content);

/**
 * Runs `executar` respecting the `cmds` limits for whoever typed. Reserves first, returns it if the command
 * fail (exception, only error messages or a free option) and, at the end, shows how much is left (usage.footer).
 * @returns {Promise<boolean>} false: blocked (the notice was already sent)
 */
async function withLimit({ msg, quem: who, cmds, gratis = false, params = '' }, run) {
    const limits = gratis ? [] : cmds.map(c => limitApplicable(who, c)).filter(Boolean);
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
                cmd: l.cmd, used: r.usados, limit: describeLimit(l),
                renews: r.renova ? t('usage.renewsLong', { quando: fmtWhen(r.renova) }) : t('usage.noRenew')
            }));
            return false;
        }
        reserves.push({ ...r, limite: l });
    }

    // What the command replies decides whether it was a use: the LAST reply counts (the "⏳ Processando..." is edited
    // to the result or to the error). Through msg.reply, client.sendMessage and completeNotice.
    const original = msg.reply.bind(msg);
    msg.reply = (content, ...rest) => { register(content); return original(content, ...rest); };

    let failed = false;
    let replies = [];
    try {
        ({ respostas: replies } = await collect(run));
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
                cmd: r.limite.cmd, left: r.limite.max - r.usados, limit: describeLimit(r.limite)
            }), undefined, { linkPreview: false }).catch(() => {});
        }
    }
    return true;
}

// Deletes the uses older than 'usage.logDays' (called in the daily cleanup)
const cleanUsesOld = (nowAlt = Date.now()) =>
    dbRun('DELETE FROM usage_log WHERE used_at < ?', [nowAlt - getSetting('usage.logDays') * 24 * 60 * 60 * 1000]);

module.exports = {
    PERIODS,
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
    todos: allAlt2,
    lastUses
};
