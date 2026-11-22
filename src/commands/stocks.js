/*
 * /stocks command (also /stock and /rates): market quotes in one place.
 * - currencies against the real (USD, EUR, GBP) and USDT: value, open, previous close, high and low;
 * - stocks, ETFs and indexes (Yahoo Finance): price, change, the day, volume and the 52 weeks.
 * /stocks                  → the enabled ones (setting stocks.symbols; default: USD, EUR, USDT and MSTR)
 * /stocks usd MSTR PETR4.SA → only those, enabled or not
 * /stocks -list            → the enabled ones      -add/-del <SYMBOL>  → turns one on or off
 * /stocks MSTR -alert < 90 → price alert (same structure as /crypto)
 * Crypto stays in /crypto.
 */

const { priceHandleAlert } = require('../priceAlerts');
const { commandUsage } = require('./base');
const { quoteAction, fmtPrice, fmtVolume, normalizeTicker } = require('../actions');
const { searchQuote, fmtReal, fmtChange } = require('../quotes');
const { dbReady } = require('../db');
const { language, t } = require('../i18n');
const { printError } = require('../log');
const { QUOTE_SUPPORTED } = require('../currencies');
const { getSetting, setSetting } = require('../settings');

const isCurrency = (sym) => Boolean(QUOTE_SUPPORTED[sym]);

// The list of requested symbols: "usd mstr", "USD,MSTR"; null for what does not look like a ticker
const readSymbols = (argv) => [...new Set(argv.join(' ').split(/[\s,]+/).filter(Boolean).map(normalizeTicker))];

// A symbol's quote: exchange rate against the real (currencies) or the stock price
const search = (sym) => (isCurrency(sym) ? searchQuote(sym).then((c) => ({ type: 'moeda', ...c })) : quoteAction(sym).then((c) => ({ type: 'acao', ...c })));

// A currency's block (the same output as the old /rates): "🇺🇸 USD/BRL (Dollar)"
function currencyBlock(sym, c) {
    const { icon: iconAlt, name: nameAlt } = QUOTE_SUPPORTED[sym];
    const dayAlt = fmtChange(c.current, c.closing);
    const sinceOpening = fmtChange(c.current, c.opening);

    let textAlt = `\n${iconAlt} *${sym}/BRL* _(${nameAlt})_\n`;
    textAlt += `   💰 *${fmtReal(c.current)}*${dayAlt ? `  ${dayAlt}` : ''}\n`;
    textAlt += `   🔔 ${t('stocks.open')}: ${c.opening ? fmtReal(c.opening) : '—'}${sinceOpening ? ` _(${t('stocks.sinceOpen', { change: sinceOpening })})_` : ''}\n`;
    textAlt += `   🏁 ${t('stocks.prevClose')}: ${c.closing ? fmtReal(c.closing) : '—'}\n`;
    if (c.max && c.min) textAlt += `   ${t('stocks.maxMin', { max: fmtReal(c.max), min: fmtReal(c.min) })}\n`;
    return textAlt;
}

// The block of a stock, ETF or index, in the asset's currency
function actionBlock(c) {
    const p = (v) => fmtPrice(v, c.currency);
    const dayAlt = fmtChange(c.current, c.closing);
    const sinceOpening = fmtChange(c.current, c.opening);
    const whereAlt = [c.name, c.exchange].filter(Boolean).join(' · ');

    let textAlt = `\n🏢 *${c.ticker}*${whereAlt ? ` _(${whereAlt})_` : ''}\n`;
    textAlt += `   💰 *${p(c.current)}*${dayAlt ? `  ${dayAlt}` : ''}\n`;
    textAlt += `   🔔 ${t('stocks.open')}: ${c.opening ? p(c.opening) : '—'}${sinceOpening ? ` _(${t('stocks.sinceOpen', { change: sinceOpening })})_` : ''}\n`;
    textAlt += `   🏁 ${t('stocks.prevClose')}: ${c.closing ? p(c.closing) : '—'}\n`;
    if (c.max && c.min) textAlt += `   ${t('stocks.maxMin', { max: p(c.max), min: p(c.min) })}\n`;
    if (c.volume) textAlt += `   📊 ${t('stocks.volume')}: ${fmtVolume(c.volume)}\n`;
    if (c.max52 && c.min52) textAlt += `   🗓️ ${t('stocks.week52', { min: p(c.min52), max: p(c.max52) })}\n`;
    return textAlt;
}

async function cmdStocks(ctx) {
    const { msg, opts } = ctx;
    await dbReady;

    if (opts.given.has('alert')) {
        await priceHandleAlert('acao', ctx);
        return;
    }

    const assets = getSetting('stocks.symbols');

    if (opts.opt.list) {
        const line = (s) => (isCurrency(s) ? `• ${QUOTE_SUPPORTED[s].icon} ${s} — ${QUOTE_SUPPORTED[s].name}` : `• 🏢 ${s}`);
        await msg.reply(assets.length
            ? t('stocks.enabledList', { list: assets.map(line).join('\n'), currencies: Object.keys(QUOTE_SUPPORTED).join(', ') })
            : t('stocks.noneEnabled'));
        return;
    }

    if (opts.given.has('add') || opts.given.has('del')) {
        const addAlt = opts.given.has('add');
        const raw = addAlt ? opts.opt.add : opts.opt.del;
        if (!String(raw ?? '').trim()) {
            await msg.reply(commandUsage('/stocks'));
            return;
        }
        const sym = normalizeTicker(raw);
        if (!sym) {
            await msg.reply(t('stocks.badTicker', { value: raw }));
            return;
        }

        if (!addAlt) {
            if (!assets.includes(sym)) {
                await msg.reply(t('stocks.notEnabled', { sym }));
                return;
            }
            await setSetting('stocks.symbols', assets.filter((s) => s !== sym));
            await msg.reply(t('stocks.removed', { sym }));
            return;
        }

        if (assets.includes(sym)) {
            await msg.reply(t('stocks.alreadyEnabled', { sym }));
            return;
        }
        // A supported currency goes straight in; a ticker only if Yahoo knows it
        if (isCurrency(sym)) {
            await setSetting('stocks.symbols', [...assets, sym]);
            await msg.reply(t('stocks.added', { sym, name: QUOTE_SUPPORTED[sym].name }));
            return;
        }
        try {
            const c = await quoteAction(sym);
            await setSetting('stocks.symbols', [...assets, sym]);
            await msg.reply(t('stocks.added', { sym, name: c.name ?? sym }));
        } catch (err) {
            if (err.message !== 'notfound') printError(`/stocks -add ${sym}:`, err.message);
            await msg.reply(t(err.message === 'notfound' ? 'stocks.notFound' : 'stocks.failed', { list: sym }));
        }
        return;
    }

    // Without arguments: the enabled ones; with arguments: only the requested ones
    const requests = opts.argv.length ? readSymbols(opts.argv) : assets;
    if (requests.includes(null)) {
        await msg.reply(t('stocks.badTicker', { value: opts.argv.join(' ') }));
        return;
    }
    if (!requests.length) {
        await msg.reply(t('stocks.noneEnabled'));
        return;
    }

    const results = await Promise.allSettled(requests.map(search));
    const notFound = requests.filter((_, i) => results[i].status === 'rejected' && results[i].reason?.message === 'notfound');
    // A ticker Yahoo does not know, alone: clear error; among others, becomes the line's own notice
    if (notFound.length === requests.length) {
        await msg.reply(t('stocks.notFound', { list: notFound.join(', ') }));
        return;
    }

    const sourcesAlt = new Set();
    let textAlt = t('stocks.title') + '\n';
    requests.forEach((sym, i) => {
        const r = results[i];
        if (r.status === 'rejected') {
            if (r.reason?.message !== 'notfound') printError(`/stocks ${sym}:`, r.reason?.message);
            textAlt += `\n${isCurrency(sym) ? `${QUOTE_SUPPORTED[sym].icon} *${sym}/BRL* _(${QUOTE_SUPPORTED[sym].name})_` : `🏢 *${sym}*`}\n   ⚠️ _${t(r.reason?.message === 'notfound' ? 'stocks.lineNotFound' : 'stocks.lineUnavailable')}_\n`;
            return;
        }
        sourcesAlt.add(r.value.source);
        textAlt += r.value.type === 'moeda' ? currencyBlock(sym, r.value) : actionBlock(r.value);
    });

    const nowAlt = new Date().toLocaleString(language() === 'pt_BR' ? 'pt-BR' : 'en-US', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
    textAlt += `\n🕐 _${nowAlt}${sourcesAlt.size ? ` · ${[...sourcesAlt].join(', ')}` : ''}_\n`;
    textAlt += t('stocks.footer');

    await msg.reply(textAlt);
}

module.exports = { cmdStocks };
