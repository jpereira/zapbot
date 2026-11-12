/*
 * Quotes: Yahoo Finance, AwesomeAPI and Binance, and price formatting.
 */

const axios = require('axios');

const { language } = require('./i18n');
const { printError } = require('./log');
const { QUOTE_SUPPORTED } = require('./currencies');

/*
 * /rates [CURRENCY...]: quote sources
 * Quote against the real: current value, open and previous close, high and
 * day low and change. Fiat currencies come from Yahoo Finance (if it fails,
 * of AwesomeAPI, which does not report the open); USDT comes from the daily candles
 * of Binance (Binance's "day" turns over at 21h Brasília).
 */
const fmtPriceCrypto = (value) =>
    Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });

const QUOTE_TIMEOUT_MS = 10000;

async function quoteYahoo(currency) {
    const { data } = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${currency}BRL=X`, {
        params: { interval: '1d', range: '5d' },
        headers: { 'User-Agent': 'Mozilla/5.0' }, // without it Yahoo answers 429
        timeout: QUOTE_TIMEOUT_MS
    });

    const r = data?.chart?.result?.[0];
    const q = r?.indicators?.quote?.[0];
    if (!r?.meta?.regularMarketPrice || !q) throw new Error('resposta sem cotação');

    const n = q.close.length;
    const valid = (v) => (Number.isFinite(v) ? v : null);

    // Previous close: last valid close before today's candle
    let closingAlt = null;
    for (let i = n - 2; i >= 0 && closingAlt === null; i--) closingAlt = valid(q.close[i]);

    return {
        atual: r.meta.regularMarketPrice,
        abertura: valid(q.open[n - 1]),
        fechamento: closingAlt,
        max: valid(r.meta.regularMarketDayHigh) ?? valid(q.high[n - 1]),
        min: valid(r.meta.regularMarketDayLow) ?? valid(q.low[n - 1]),
        fonte: 'Yahoo Finance'
    };
}

// Yahoo fallback: no open; the previous close comes from bid - varBid
async function quoteAwesome(currency) {
    const { data } = await axios.get(`https://economia.awesomeapi.com.br/json/last/${currency}-BRL`, { timeout: QUOTE_TIMEOUT_MS });
    const d = data?.[`${currency}BRL`];
    if (!d?.bid) throw new Error('resposta sem cotação');

    const current = Number(d.bid);
    return {
        atual: current,
        abertura: null,
        fechamento: current - Number(d.varBid),
        max: Number(d.high),
        min: Number(d.low),
        fonte: 'AwesomeAPI'
    };
}

async function quoteBinance(currency) {
    const { data } = await axios.get('https://api.binance.com/api/v3/klines', {
        params: { symbol: `${currency}BRL`, interval: '1d', limit: 2 },
        timeout: QUOTE_TIMEOUT_MS
    });

    // [open at, open, high, low, close, ...]: yesterday and today
    const [yesterday, today] = data;
    if (!today) throw new Error('resposta sem cotação');

    return {
        atual: Number(today[4]),
        abertura: Number(today[1]),
        fechamento: Number(yesterday[4]),
        max: Number(today[2]),
        min: Number(today[3]),
        fonte: 'Binance'
    };
}

async function searchQuote(currency) {
    if (QUOTE_SUPPORTED[currency].fonte === 'binance') return quoteBinance(currency);

    try {
        return await quoteYahoo(currency);
    } catch (err) {
        printError(`/rates: Yahoo falhou para ${currency} (${err.message}), usando a AwesomeAPI.`);
        return quoteAwesome(currency);
    }
}

const localeNumbers = () => (language() === 'pt_BR' ? 'pt-BR' : 'en-US');

const fmtReal = (v) => `R$ ${Number(v).toLocaleString(localeNumbers(), { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;

function fmtChange(current, base) {
    if (!base) return null;
    const pct = ((current - base) / base) * 100;
    const signalAlt = pct > 0 ? '+' : '';
    const iconAlt = pct > 0 ? '🟢' : pct < 0 ? '🔴' : '⚪';
    return `${iconAlt} ${signalAlt}${pct.toLocaleString(localeNumbers(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

module.exports = {
    QUOTE_TIMEOUT_MS,
    searchQuote,
    fmtPriceCrypto,
    fmtReal,
    fmtChange
};
