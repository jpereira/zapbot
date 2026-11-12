/*
 * Price alerts from /rates -alerta and /crypto -alerta.
 */

const axios = require('axios');

const { estado: stateAlt } = require('./state');
const { findCommand } = require('./commands/base');
const { QUOTE_TIMEOUT_MS, searchQuote, fmtPriceCrypto, fmtReal, fmtChange } = require('./quotes');
const { dbAll, dbGet, dbReady, dbRun } = require('./db');
const {
    destinationColumns, describeDestinations, lineDestination, destinationsSaved, sendToDestinations, extractDestinations,
    recipientsDe, resolverDestinations
} = require('./destinations');
const { printError, printInfo } = require('./log');
const { QUOTE_SUPPORTED, CRYPTO_SUPPORTED } = require('./currencies');
const { t } = require('./i18n');
const { GetOptFromCommand } = require('./options');
const { getSetting } = require('./settings');
const { formatData, plural } = require('./util/format');

/*
 * Price alerts: /rates -alerta and /crypto -alerta
 * -alerta                 → lists the command's alerts, numbered
 * -alerta USD > 5.30      → notifies your private chat when USD goes above R$ 5.30
 * -alerta BTC < 90000     → (in /crypto) when BTC drops below $90,000
 * BTC -alerta > 90000     → the same, with the currency before -alerta
 * -alerta -rm 2 | all     → removes alert no. 2 from the list (or all); -rm 1 2 3 removes several
 * -alerta BTC > 90000 -to /Grupo L200/  → notifies a group (or a contact,
 * -to /Jorge Pereira/, a number, -to +5521999999999,
 * or by email, -to email) instead of your private chat;
 * repeat -to to notify several
 * -alerta BTC > 90000 -msg Time to sell!  → the text goes at the start of the notice; the
 * -msg goes to the end (the text just cannot have a loose " -to ")
 * Each alert fires ONCE and is removed. The check runs every
 * 'alert.intervalMin' minutes. Only the owner creates and removes.
 */
const ALERT_TYPES = {
    cotacao: {
        cmd: '/rates',
        suportada: (sym) => Boolean(QUOTE_SUPPORTED[sym]),
        icone: (sym) => QUOTE_SUPPORTED[sym].icone,
        par: (sym) => `${sym}/BRL`,
        fmt: fmtReal,
        exemplo: 'USD > 5.30',
        precos: async (syms) => Object.fromEntries(
            await Promise.all(syms.map(async sym => [sym, (await searchQuote(sym)).atual]))
        )
    },
    crypto: {
        cmd: '/crypto',
        suportada: (sym) => Boolean(CRYPTO_SUPPORTED[sym]),
        icone: (sym) => CRYPTO_SUPPORTED[sym],
        par: (sym) => `${sym}/USDT`,
        fmt: (v) => `$${fmtPriceCrypto(v)}`,
        exemplo: 'BTC < 90000',
        precos: async (syms) => {
            const { data } = await axios.get('https://api.binance.com/api/v3/ticker/price', {
                params: { symbols: JSON.stringify(syms.map(sym => `${sym}USDT`)) },
                timeout: QUOTE_TIMEOUT_MS
            });
            return Object.fromEntries(data.map(d => [d.symbol.replace(/USDT$/, ''), Number(d.price)]));
        }
    }
};

const OPERATORS = {
    '>': { testar: (price, target) => price > target, get texto() { return t('alerts.above'); }, icone: '📈' },
    '<': { testar: (price, target) => price < target, get texto() { return t('alerts.below'); }, icone: '📉' }
};

// "5.30", "5,30" or "90000" (without a thousands separator)
function readValueAlert(textAlt) {
    const v = Number(String(textAlt).replace(',', '.'));
    return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Reads "USD > 5.30", "USD>5,30" or "btc < 90000".
 * @returns {{sym: string, op: string, alvo: number} | null}
 */
function readRuleAlert(textAlt) {
    const m = String(textAlt).trim().match(/^([a-z0-9]+)\s*([<>])\s*([\d.,]+)$/i);
    if (!m) return null;

    const target = readValueAlert(m[3]);
    return target ? { sym: m[1].toUpperCase(), op: m[2], alvo: target } : null;
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
    if (!m) return { mensagem: null, informado: false, resto: textAlt };
    const rest = textAlt.slice(0, m.index).trim();
    return { mensagem: m[2].trim() || null, informado: true, resto: rest };
}

// The -msg message, indented below the alert (in the list and in the confirmation)
const messageLine = (a) => (a.message ? `\n   💬 ${a.message.replace(/\n/g, '\n   ')}` : '');

function describeAlert(kind, a) {
    const type = ALERT_TYPES[kind];
    const destinations = alertDestinations(a);
    return `${type.icone(a.symbol)} ${type.par(a.symbol)} ${OPERATORS[a.op].texto} *${type.fmt(a.target)}*` +
        (destinations.length ? ` → ${describeDestinations(destinations)}` : '');
}

async function priceHandleAlert(kind, { msg, args, admin }) {
    const type = ALERT_TYPES[kind];

    /*
     * Destinations and message are extracted before the price rule, preserving
     * all the -to and the -msg free text.
     */
    const { destinos: destinationsText, informado: withDestination, resto: withoutDestination } =
        extractDestinations(args);
    const { mensagem: messageAlt, informado: withMessage, resto: rest } = extractMessage(withoutDestination);
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
        await msg.reply(t('alerts.toOnlyCreate', { cmd: type.cmd, example: type.exemplo }));
        return;
    }

    if (!ruleText && withMessage) {
        await msg.reply(t('alerts.msgOnlyCreate', { cmd: type.cmd, example: type.exemplo }));
        return;
    }

    if (withMessage && !messageAlt) {
        await msg.reply(t('alerts.msgEmpty', { cmd: type.cmd, example: type.exemplo }));
        return;
    }

    // Without a rule: lists
    if (!ruleText) {
        if (!alerts.length) {
            await msg.reply(t('alerts.none', { cmd: type.cmd, example: type.exemplo }));
            return;
        }

        const linesAlt = alerts.map((a, i) => t('alerts.listItem', { n: i + 1, alert: describeAlert(kind, a), date: formatData(a.created_at) }) +
            messageLine(a));
        await msg.reply(t('alerts.list', {
            cmd: type.cmd,
            items: linesAlt.join('\n'),
            every: plural(getSetting('alerta.intervalMin'), t('alerts.minute'), t('alerts.minutes'))
        }));
        return;
    }

    const rule = readRuleAlert(ruleText);

    if (!rule) {
        await msg.reply(t('alerts.invalidRule', { rule: ruleText, cmd: type.cmd, example: type.exemplo }));
        return;
    }

    if (!type.suportada(rule.sym)) {
        await msg.reply(t('alerts.unsupported', { sym: rule.sym, cmd: type.cmd }));
        return;
    }

    // Several -to: a single alert, which notifies all of them
    let destinations = [];

    if (withDestination) {
        destinations = await resolverDestinations(msg, destinationsText, { aceitaEmail: true });
        if (!destinations) return;
    }

    const max = getSetting('alerta.max');
    const total = (await dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n;

    if (total >= max) {
        await msg.reply(t('alerts.limit', { max }));
        return;
    }

    let price;
    try {
        price = (await type.precos([rule.sym]))[rule.sym];
        if (!Number.isFinite(price)) throw new Error('sem preço');
    } catch (err) {
        printError(`${type.cmd} -alerta: preço de ${rule.sym}:`, err.message);
        await msg.reply(t('alerts.priceFailed', { sym: rule.sym }));
        return;
    }

    const op = OPERATORS[rule.op];

    // Already fulfilled: it would fire right away, which is not what you want from an alert
    if (op.testar(price, rule.alvo)) {
        await msg.reply(t('alerts.alreadyMet', { pair: type.par(rule.sym), op: op.texto, target: type.fmt(rule.alvo), price: type.fmt(price) }));
        return;
    }

    const c = destinationColumns(destinations[0]);
    await dbRun(
        `INSERT INTO price_alerts (kind, symbol, op, target, price_at_creation, created_at, dest_id, dest_name, dest_is_group, dest_email,
            recipients, message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [kind, rule.sym, rule.op, rule.alvo, price, Date.now(), c.dest_id, c.dest_name, c.dest_is_group, c.dest_email,
            recipientsDe(destinations), messageAlt]
    );

    await msg.reply(t('alerts.created', {
        alert: describeAlert(kind, { symbol: rule.sym, op: rule.op, target: rule.alvo }) +
            messageLine({ message: messageAlt }),
        price: type.fmt(price),
        where: destinations.length ? t('alerts.whereIn', { dest: describeDestinations(destinations) }) : t('alerts.wherePrivate'),
        every: plural(getSetting('alerta.intervalMin'), t('alerts.minute'), t('alerts.minutes'))
    }));
}

/*
 * Periodic check: one tick per minute, which only queries the prices
 * when 'alerta.intervalMin' has passed since the last time. One query per
 * currency, even with several alerts on it.
 */
let lastCheckAlerts = 0;
let checkingAlerts = false;

async function priceCheckAlerts({ forcar: force = false } = {}) {
    if (checkingAlerts || !stateAlt.pronto) return;
    if (!force && Date.now() - lastCheckAlerts < getSetting('alerta.intervalMin') * 60 * 1000) return;

    checkingAlerts = true;
    lastCheckAlerts = Date.now();

    try {
        await dbReady;
        const alerts = await dbAll('SELECT * FROM price_alerts ORDER BY id');

        for (const [kind, type] of Object.entries(ALERT_TYPES)) {
            const typeAlt = alerts.filter(a => a.kind === kind);
            if (!typeAlt.length) continue;

            let prices;
            try {
                prices = await type.precos([...new Set(typeAlt.map(a => a.symbol))]);
            } catch (err) {
                printError(`Alertas ${type.cmd}: falha ao consultar preços:`, err.message);
                continue;
            }

            for (const a of typeAlt) {
                const price = prices[a.symbol];
                if (!Number.isFinite(price) || !OPERATORS[a.op].testar(price, a.target)) continue;

                // Removes BEFORE notifying: if the send fails, the notice does not repeat on every check
                await dbRun('DELETE FROM price_alerts WHERE id = ?', [a.id]);

                const changeAlt = fmtChange(price, a.price_at_creation);
                const destinations = alertDestinations(a);
                // The -msg message comes before everything
                await sendToDestinations(destinations,
                    (a.message ? `${a.message}\n\n` : '') +
                    t('alerts.fired', {
                        opIcon: OPERATORS[a.op].icone,
                        icon: type.icone(a.symbol),
                        pair: type.par(a.symbol),
                        op: OPERATORS[a.op].texto,
                        target: type.fmt(a.target),
                        price: type.fmt(price),
                        change: changeAlt ? t('alerts.sinceCreation', { change: changeAlt }) : '',
                        date: formatData(a.created_at)
                    }),
                    { assunto: t('alerts.subject', { pair: type.par(a.symbol), op: OPERATORS[a.op].texto, target: type.fmt(a.target) }) }
                ).catch(err => printError('Alerta de preço: falha ao avisar:', err.message));

                printInfo(`Alerta de preço disparado: ${a.symbol} ${a.op} ${a.target} (agora ${price})` +
                    (destinations.length ? ` → ${destinations.map(d => d.email ?? d.id).join(', ')}` : ''));
            }
        }
    } catch (err) {
        printError('Erro ao verificar alertas de preço:', err.message);
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
