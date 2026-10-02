/*
 * Price alerts from /cotacao -alerta and /crypto -alerta.
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
const { GetOptFromCommand } = require('./options');
const { getSetting } = require('./settings');
const { formatData, plural } = require('./util/format');

/*
 * Price alerts: /cotacao -alerta and /crypto -alerta
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
        cmd: '/cotacao',
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
    '>': { testar: (price, target) => price > target, texto: 'acima de', icone: '📈' },
    '<': { testar: (price, target) => price < target, texto: 'abaixo de', icone: '📉' }
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
    const t = ALERT_TYPES[kind];
    const destinations = alertDestinations(a);
    return `${t.icone(a.symbol)} ${t.par(a.symbol)} ${OPERATORS[a.op].texto} *${t.fmt(a.target)}*` +
        (destinations.length ? ` → ${describeDestinations(destinations)}` : '');
}

async function priceHandleAlert(kind, { msg, args, admin }) {
    const t = ALERT_TYPES[kind];

    /*
     * -to accepts spaces (/Grupo L200/), which the option parser would split:
     * goes out of the text first, and the rest is read again.
     */
    const { destinos: destinationsText, informado: withDestination, resto: withoutDestination } =
        extractDestinations(args);
    const { mensagem: messageAlt, informado: withMessage, resto: rest } = extractMessage(withoutDestination);
    const opts = GetOptFromCommand(rest, findCommand(t.cmd));

    // The notices use your account (in your private chat or in the -to chats): owner and admins only
    if (!admin) {
        await msg.reply('⛔ Apenas o dono do bot (ou um admin) pode usar os alertas.');
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
            await msg.reply(`🗑️ ${plural(alerts.length, 'alerta removido', 'alertas removidos')}.`);
            return;
        }

        const numbers = [...new Set(partsAlt)].sort((a, b) => a - b);
        const missing = numbers.filter(n => !/^\d+$/.test(n) || !alerts[Number(n) - 1]);

        if (!numbers.length || missing.length) {
            await msg.reply(missing.length > 1
                ? `❌ Alertas nº ${missing.join(', ')} não existem. Nada foi removido; veja a lista com ${t.cmd} -alerta`
                : `❌ Alerta nº ${missing[0] ?? '?'} não existe. Veja a lista com ${t.cmd} -alerta`);
            return;
        }

        const removed = numbers.map(n => alerts[Number(n) - 1]);
        for (const a of removed) await dbRun('DELETE FROM price_alerts WHERE id = ?', [a.id]);
        await msg.reply(removed.length === 1
            ? `🗑️ Alerta removido: ${describeAlert(kind, removed[0])}`
            : `🗑️ *Alertas removidos* (${removed.length})\n` +
              removed.map(a => `• ${describeAlert(kind, a)}`).join('\n'));
        return;
    }

    const ruleText = opts.argv.join(' ').trim();

    if (!ruleText && withDestination) {
        await msg.reply(`❌ O -to só vale ao criar um alerta: ${t.cmd} -alerta ${t.exemplo} -to /Grupo L200/`);
        return;
    }

    if (!ruleText && withMessage) {
        await msg.reply(`❌ O -msg só vale ao criar um alerta: ${t.cmd} -alerta ${t.exemplo} -msg <texto>`);
        return;
    }

    if (withMessage && !messageAlt) {
        await msg.reply(`❌ Informe o texto do -msg: ${t.cmd} -alerta ${t.exemplo} -msg <texto>`);
        return;
    }

    // Without a rule: lists
    if (!ruleText) {
        if (!alerts.length) {
            await msg.reply(`🔔 Nenhum alerta no ${t.cmd}.\n💡 _Crie com ${t.cmd} -alerta ${t.exemplo}_`);
            return;
        }

        const linesAlt = alerts.map((a, i) => `${i + 1}. ${describeAlert(kind, a)} _(criado ${formatData(a.created_at)})_` +
            messageLine(a));
        await msg.reply(`🔔 *ALERTAS DE PREÇO* _(${t.cmd})_\n\n${linesAlt.join('\n')}\n\n` +
            `💡 _Verificados a cada ${plural(getSetting('alerta.intervalMin'), 'minuto', 'minutos')}. Remova com ${t.cmd} -alerta -rm <nº...|all>._`);
        return;
    }

    const rule = readRuleAlert(ruleText);

    if (!rule) {
        await msg.reply(`❌ Regra inválida: "${ruleText}"\n💡 _Formato: ${t.cmd} -alerta ${t.exemplo} (use > ou <; sem separador de milhar)_`);
        return;
    }

    if (!t.suportada(rule.sym)) {
        await msg.reply(`❌ Moeda não suportada: ${rule.sym}\n💡 _Veja as suportadas com ${t.cmd} -l_`);
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
        await msg.reply(`❌ Limite de ${max} alertas atingido (setting alerta.max). Remova algum antes.`);
        return;
    }

    let price;
    try {
        price = (await t.precos([rule.sym]))[rule.sym];
        if (!Number.isFinite(price)) throw new Error('sem preço');
    } catch (err) {
        printError(`${t.cmd} -alerta: preço de ${rule.sym}:`, err.message);
        await msg.reply(`⚠️ Não consegui consultar o preço de ${rule.sym} agora. Tente de novo em instantes.`);
        return;
    }

    const op = OPERATORS[rule.op];

    // Already fulfilled: it would fire right away, which is not what you want from an alert
    if (op.testar(price, rule.alvo)) {
        await msg.reply(`ℹ️ ${t.par(rule.sym)} já está ${op.texto} ${t.fmt(rule.alvo)}: agora está em *${t.fmt(price)}*.`);
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

    await msg.reply(`🔔 *Alerta criado*\n${describeAlert(kind, { symbol: rule.sym, op: rule.op, target: rule.alvo })}` +
        `${messageLine({ message: messageAlt })}\n` +
        `💰 Agora: ${t.fmt(price)}\n` +
        `💡 _Aviso ${destinations.length ? `em ${describeDestinations(destinations)}` : 'no seu privado'}; ` +
        `verificação a cada ${plural(getSetting('alerta.intervalMin'), 'minuto', 'minutos')}._`);
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

        for (const [kind, t] of Object.entries(ALERT_TYPES)) {
            const typeAlt = alerts.filter(a => a.kind === kind);
            if (!typeAlt.length) continue;

            let prices;
            try {
                prices = await t.precos([...new Set(typeAlt.map(a => a.symbol))]);
            } catch (err) {
                printError(`Alertas ${t.cmd}: falha ao consultar preços:`, err.message);
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
                    `🔔 *ALERTA DE PREÇO*\n\n` +
                    `${OPERATORS[a.op].icone} ${t.icone(a.symbol)} *${t.par(a.symbol)}* ficou ${OPERATORS[a.op].texto} ${t.fmt(a.target)}\n` +
                    `💰 Agora: *${t.fmt(price)}*${changeAlt ? ` _(${changeAlt} desde a criação)_` : ''}\n` +
                    `📅 Alerta criado em ${formatData(a.created_at)}`,
                    { assunto: `🔔 Alerta de preço: ${t.par(a.symbol)} ${OPERATORS[a.op].texto} ${t.fmt(a.target)}` }
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
    priceStartAlerts,
    priceHandleAlert,
    priceCheckAlerts
};
