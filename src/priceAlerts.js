/*
 * Price alerts from /stocks -alert and /crypto -alert.
 */

const axios = require('axios');

const { state: stateAlt } = require('./state');
const { findCommand } = require('./commands/base');
const { QUOTE_TIMEOUT_MS, searchQuote, fmtPriceCrypto, fmtReal, fmtChange } = require('./quotes');
const { dbAll, dbGet, dbReady, dbRun } = require('./db');
const {
    destinationColumns, describeDestinations, lineDestination, destinationsSaved, sendToDestinations, extractDestinations,
    recipientsDe, resolverDestinations
} = require('./destinations');
const { printError, printInfo } = require('./log');
const { quoteAction, fmtPrice, normalizeTicker } = require('./actions');
const { QUOTE_SUPPORTED, CRYPTO_SUPPORTED } = require('./currencies');
const { t } = require('./i18n');
const { GetOptFromCommand } = require('./options');
const { getSetting } = require('./settings');
const { formatData, plural } = require('./util/format');

/*
 * Price alerts: /stocks -alert (/rates is the same) and /crypto -alert
 * -alert                 → lists the command's alerts, numbered
 * -alert USD > 5.30      → (in /stocks) notifies your private chat when USD goes above R$ 5.30
 * -alert BTC < 90000     → (in /crypto) when BTC drops below $90,000
 * BTC -alert > 90000     → the same, with the currency before -alert
 * -alert -rm 2 | all     → removes alert no. 2 from the list (or all); -rm 1 2 3 removes several
 * -alert BTC > 90000 -to /Grupo L200/  → notifies a group (or a contact,
 * -to /Jorge Pereira/, a number, -to +5521999999999,
 * or by email, -to email) instead of your private chat;
 * repeat -to to notify several
 * -alert BTC > 90000 -msg Time to sell!  → the text goes at the start of the notice; the
 * -msg goes to the end (the text just cannot have a loose " -to ")
 * Each alert fires ONCE and is removed. The check runs every
 * '<stocks|crypto>.alert.intervalMin' minutes. Only the owner creates and removes.
 */
// The settings of each type are '<config>.alert.max' and '<config>.alert.intervalMin'
const ALERT_TYPES = {
    crypto: {
        cmd: '/crypto',
        config: 'crypto',
        supported: (sym) => Boolean(CRYPTO_SUPPORTED[sym]),
        icon: (sym) => CRYPTO_SUPPORTED[sym],
        pair: (sym) => `${sym}/USDT`,
        fmt: (v) => `$${fmtPriceCrypto(v)}`,
        example: 'BTC < 90000',
        prices: async (syms) => {
            const { data } = await axios.get('https://api.binance.com/api/v3/ticker/price', {
                params: { symbols: JSON.stringify(syms.map(sym => `${sym}USDT`)) },
                timeout: QUOTE_TIMEOUT_MS
            });
            return Object.fromEntries(data.map(d => [d.symbol.replace(/USDT$/, ''), Number(d.price)]));
        }
    },
    // Currencies against the real (USD, EUR, GBP, USDT), stocks, ETFs and indexes (/stocks): currencies in brl, the rest in
    // asset currency (brl on B3 tickers, ".SA"; dollars on the others)
    acao: {
        cmd: '/stocks',
        config: 'stocks',
        supported: (sym) => Boolean(QUOTE_SUPPORTED[sym] || normalizeTicker(sym)),
        icon: (sym) => QUOTE_SUPPORTED[sym]?.icon ?? '🏢',
        pair: (sym) => (QUOTE_SUPPORTED[sym] ? `${sym}/BRL` : sym),
        fmt: (v, sym) => (QUOTE_SUPPORTED[sym] ? fmtReal(v) : fmtPrice(v, sym?.endsWith('.SA') ? 'BRL' : 'USD')),
        example: 'USD > 5.30',
        prices: async (syms) => Object.fromEntries(
            await Promise.all(syms.map(async (sym) => [sym, (QUOTE_SUPPORTED[sym] ? await searchQuote(sym) : await quoteAction(sym)).current]))
        )
    }
};

const alertSetting = (type, name) => getSetting(`${type.config}.alert.${name}`);

const OPERATORS = {
    '>': { test: (price, target) => price > target, get text() { return t('alerts.above'); }, icon: '📈' },
    '<': { test: (price, target) => price < target, get text() { return t('alerts.below'); }, icon: '📉' }
};

// "5.30", "5,30" or "90000" (without a thousands separator)
function readValueAlert(textAlt) {
    const v = Number(String(textAlt).replace(',', '.'));
    return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Reads "USD > 5.30", "USD>5,30" or "btc < 90000".
 * @returns {{sym: string, op: string, target: number} | null}
 */
function readRuleAlert(textAlt) {
    const m = String(textAlt).trim().match(/^([a-z0-9.^=-]+?)\s*([<>])\s*([\d.,]+)$/i);
    if (!m) return null;

    const target = readValueAlert(m[3]);
    return target ? { sym: m[1].toUpperCase(), op: m[2], target } : null;
}

const listAlerts = (kind) =>
    dbAll('SELECT * FROM price_alerts WHERE kind = ? ORDER BY id', [kind]);

// Where the notice goes: the -to chats or emails; without them ([]), your private chat
const alertDestinations = (a) => destinationsSaved(a.recipients, lineDestination(a));

/*
 * "-msg <text>": from -msg to the end, with spaces and whatever else comes (the -to already
 * went out first, so it can come after -msg).
 */
const MESSAGE = /(^|\s)-msg(?=\s|$)([\s\S]*)$/;

function extractMessage(textAlt) {
    const m = textAlt.match(MESSAGE);
    if (!m) return { message: null, given: false, rest: textAlt };
    const rest = textAlt.slice(0, m.index).trim();
    return { message: m[2].trim() || null, given: true, rest };
}

// The -msg message, indented below the alert (in the list and in the confirmation)
const messageLine = (a) => (a.message ? `\n   💬 ${a.message.replace(/\n/g, '\n   ')}` : '');

function describeAlert(kind, a) {
    const type = ALERT_TYPES[kind];
    const destinations = alertDestinations(a);
    return `${type.icon(a.symbol)} ${type.pair(a.symbol)} ${OPERATORS[a.op].text} *${type.fmt(a.target, a.symbol)}*` +
        (destinations.length ? ` → ${describeDestinations(destinations)}` : '');
}

async function priceHandleAlert(kind, { msg, args, admin }) {
    const type = ALERT_TYPES[kind];

    /*
     * Destinations and message are extracted before the price rule, preserving
     * all the -to and the -msg free text.
     */
    const { destinations: destinationsText, given: withDestination, rest: withoutDestination } =
        extractDestinations(args);
    const { message: messageAlt, given: withMessage, rest } = extractMessage(withoutDestination);
    const opts = GetOptFromCommand(rest, findCommand(type.cmd));

    // The notices use your account (in your private chat or in the -to chats): owner and admins only
    if (!admin) {
        await msg.reply(t('alerts.ownerOnly'));
        return;
    }

    const alerts = await listAlerts(kind);

    // -rm <no....|all>: -rm 2, -rm 1 2 3 or -rm 1,3 (the list numbers). Does any not exist? None is removed,
    // because removing halfway is worse than not removing
    if (opts.given.has('rm')) {
        const partsAlt = [opts.opt.rm, ...opts.argv].join(' ').toLowerCase()
            .split(/[\s,]+/).filter(Boolean);

        if (partsAlt.includes('all')) {
            await dbRun('DELETE FROM price_alerts WHERE kind = ?', [kind]);
            await msg.reply(t('alerts.removedAll', { count: plural(alerts.length, t('alerts.removedOne'), t('alerts.removedMany')) }));
            return;
        }

        const numbers = [...new Set(partsAlt)].sort((a, b) => a - b);
        const missing = numbers.filter(n => !/^\d+$/.test(n) || !alerts[Number(n) - 1]);

        if (!numbers.length || missing.length) {
            await msg.reply(missing.length > 1
                ? t('alerts.notFoundMany', { list: missing.join(', '), cmd: type.cmd })
                : t('alerts.notFoundOne', { n: missing[0] ?? '?', cmd: type.cmd }));
            return;
        }

        const removed = numbers.map(n => alerts[Number(n) - 1]);
        for (const a of removed) await dbRun('DELETE FROM price_alerts WHERE id = ?', [a.id]);
        await msg.reply(removed.length === 1
            ? t('alerts.removedOneDone', { alert: describeAlert(kind, removed[0]) })
            : t('alerts.removedManyDone', { n: removed.length }) + '\n' +
              removed.map(a => `• ${describeAlert(kind, a)}`).join('\n'));
        return;
    }

    const ruleText = opts.argv.join(' ').trim();

    if (!ruleText && withDestination) {
        await msg.reply(t('alerts.toOnlyCreate', { cmd: type.cmd, example: type.example }));
        return;
    }

    if (!ruleText && withMessage) {
        await msg.reply(t('alerts.msgOnlyCreate', { cmd: type.cmd, example: type.example }));
        return;
    }

    if (withMessage && !messageAlt) {
        await msg.reply(t('alerts.msgEmpty', { cmd: type.cmd, example: type.example }));
        return;
    }

    // Without a rule: lists
    if (!ruleText) {
        if (!alerts.length) {
            await msg.reply(t('alerts.none', { cmd: type.cmd, example: type.example }));
            return;
        }

        const linesAlt = alerts.map((a, i) => t('alerts.listItem', { n: i + 1, alert: describeAlert(kind, a), date: formatData(a.created_at) }) +
            messageLine(a));
        await msg.reply(t('alerts.list', {
            cmd: type.cmd,
            items: linesAlt.join('\n'),
            every: plural(alertSetting(type, 'intervalMin'), t('alerts.minute'), t('alerts.minutes'))
        }));
        return;
    }

    const rule = readRuleAlert(ruleText);

    if (!rule) {
        await msg.reply(t('alerts.invalidRule', { rule: ruleText, cmd: type.cmd, example: type.example }));
        return;
    }

    if (!type.supported(rule.sym)) {
        await msg.reply(t('alerts.unsupported', { sym: rule.sym, cmd: type.cmd }));
        return;
    }

    // Several -to: a single alert, which notifies all of them
    let destinations = [];

    if (withDestination) {
        destinations = await resolverDestinations(msg, destinationsText, { acceptsEmail: true });
        if (!destinations) return;
    }

    const max = alertSetting(type, 'max');
    const total = (await dbGet('SELECT COUNT(*) AS n FROM price_alerts WHERE kind = ?', [kind])).n;

    if (total >= max) {
        await msg.reply(t('alerts.limit', { max, setting: `${type.config}.alert.max` }));
        return;
    }

    let price;
    try {
        price = (await type.prices([rule.sym]))[rule.sym];
        if (!Number.isFinite(price)) throw new Error('sem preço');
    } catch (err) {
        printError(`${type.cmd} -alert: price of ${rule.sym}:`, err.message);
        await msg.reply(t('alerts.priceFailed', { sym: rule.sym }));
        return;
    }

    const op = OPERATORS[rule.op];

    // Already fulfilled: it would fire right away, which is not what you want from an alert
    if (op.test(price, rule.target)) {
        await msg.reply(t('alerts.alreadyMet', { pair: type.pair(rule.sym), op: op.text, target: type.fmt(rule.target, rule.sym), price: type.fmt(price, rule.sym) }));
        return;
    }

    const c = destinationColumns(destinations[0]);
    await dbRun(
        `INSERT INTO price_alerts (kind, symbol, op, target, price_at_creation, created_at, dest_id, dest_name, dest_is_group, dest_email,
            recipients, message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [kind, rule.sym, rule.op, rule.target, price, Date.now(), c.dest_id, c.dest_name, c.dest_is_group, c.dest_email,
            recipientsDe(destinations), messageAlt]
    );

    await msg.reply(t('alerts.created', {
        alert: describeAlert(kind, { symbol: rule.sym, op: rule.op, target: rule.target }) +
            messageLine({ message: messageAlt }),
        price: type.fmt(price, rule.sym),
        where: destinations.length ? t('alerts.whereIn', { dest: describeDestinations(destinations) }) : t('alerts.wherePrivate'),
        every: plural(alertSetting(type, 'intervalMin'), t('alerts.minute'), t('alerts.minutes'))
    }));
}

/*
 * Periodic check: one tick per minute, which only queries the prices of a type
 * when its '<stocks|crypto>.alert.intervalMin' has passed since the last time. One query per
 * currency, even with several alerts on it.
 */
const lastCheckAlerts = {};
let checkingAlerts = false;

async function priceCheckAlerts({ force = false } = {}) {
    if (checkingAlerts || !stateAlt.ready) return;
    const now = Date.now();
    const due = Object.entries(ALERT_TYPES).filter(([kind, type]) =>
        force || now - (lastCheckAlerts[kind] ?? 0) >= alertSetting(type, 'intervalMin') * 60 * 1000);
    if (!due.length) return;

    checkingAlerts = true;
    for (const [kind] of due) lastCheckAlerts[kind] = now;

    try {
        await dbReady;
        const alerts = await dbAll('SELECT * FROM price_alerts ORDER BY id');

        for (const [kind, type] of due) {
            const typeAlt = alerts.filter(a => a.kind === kind);
            if (!typeAlt.length) continue;

            let prices;
            try {
                prices = await type.prices([...new Set(typeAlt.map(a => a.symbol))]);
            } catch (err) {
                printError(`${type.cmd} alerts: failed to fetch prices:`, err.message);
                continue;
            }

            for (const a of typeAlt) {
                const price = prices[a.symbol];
                if (!Number.isFinite(price) || !OPERATORS[a.op].test(price, a.target)) continue;

                // Removes BEFORE notifying: if the send fails, the notice does not repeat on every check
                await dbRun('DELETE FROM price_alerts WHERE id = ?', [a.id]);

                const changeAlt = fmtChange(price, a.price_at_creation);
                const destinations = alertDestinations(a);
                // The -msg message comes before everything
                await sendToDestinations(destinations,
                    (a.message ? `${a.message}\n\n` : '') +
                    t('alerts.fired', {
                        opIcon: OPERATORS[a.op].icon,
                        icon: type.icon(a.symbol),
                        pair: type.pair(a.symbol),
                        op: OPERATORS[a.op].text,
                        target: type.fmt(a.target, a.symbol),
                        price: type.fmt(price, a.symbol),
                        change: changeAlt ? t('alerts.sinceCreation', { change: changeAlt }) : '',
                        date: formatData(a.created_at)
                    }),
                    { subject: t('alerts.subject', { pair: type.pair(a.symbol), op: OPERATORS[a.op].text, target: type.fmt(a.target, a.symbol) }) }
                ).catch(err => printError('Price alert: failed to notify:', err.message));

                printInfo(`Price alert triggered: ${a.symbol} ${a.op} ${a.target} (now ${price})` +
                    (destinations.length ? ` → ${destinations.map(d => d.email ?? d.id).join(', ')}` : ''));
            }
        }
    } catch (err) {
        printError('Error checking price alerts:', err.message);
    } finally {
        checkingAlerts = false;
    }
}

// Called in app.js
function priceStartAlerts() {
    setInterval(priceCheckAlerts, 60 * 1000);
}

module.exports = {
    extractMessage,
    priceStartAlerts,
    priceHandleAlert,
    priceCheckAlerts
};
