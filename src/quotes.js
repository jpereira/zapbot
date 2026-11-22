/*
 * Quotes: Yahoo Finance, AwesomeAPI and Binance, and price formatting.
 */

const axios = require('axios');

const { language } = require('./i18n');
const { printError } = require('./log');
const { QUOTE_SUPPORTED, CRYPTO_BRL_DIRECT } = require('./currencies');

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
        current: r.meta.regularMarketPrice,
        opening: valid(q.open[n - 1]),
        closing: closingAlt,
        max: valid(r.meta.regularMarketDayHigh) ?? valid(q.high[n - 1]),
        min: valid(r.meta.regularMarketDayLow) ?? valid(q.low[n - 1]),
        source: 'Yahoo Finance'
    };
}

// Yahoo fallback: no open; the previous close comes from bid - varBid
async function quoteAwesome(currency) {
    const { data } = await axios.get(`https://economia.awesomeapi.com.br/json/last/${currency}-BRL`, { timeout: QUOTE_TIMEOUT_MS });
    const d = data?.[`${currency}BRL`];
    if (!d?.bid) throw new Error('resposta sem cotação');

    const current = Number(d.bid);
    return {
        current,
        opening: null,
        closing: current - Number(d.varBid),
        max: Number(d.high),
        min: Number(d.low),
        source: 'AwesomeAPI'
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
        current: Number(today[4]),
        opening: Number(today[1]),
        closing: Number(yesterday[4]),
        max: Number(today[2]),
        min: Number(today[3]),
        source: 'Binance'
    };
}

async function searchQuote(currency) {
    if (QUOTE_SUPPORTED[currency].source === 'binance') return quoteBinance(currency);

    try {
        return await quoteYahoo(currency);
    } catch (err) {
        printError(`/rates: Yahoo failed for ${currency} (${err.message}), using AwesomeAPI.`);
        return quoteAwesome(currency);
    }
}

/*
 * Which <TOKEN>BRL pairs are really trading now. A paused pair (BREAK status, like DOTBRL) still
 * returning the last price, frozen: the fixed list (CRYPTO_BRL_DIRECT) only says which pairs exist, and the status
 * comes from Binance's exchangeInfo, stored for 6 hours. If the query fails, the fixed list applies.
 */
const STATUS_BRL_TTL_MS = 6 * 60 * 60 * 1000;
let statusBrl = { em: 0, pairs: null };

async function pairsInBrlTradable(nowAlt = Date.now()) {
    if (statusBrl.pairs && nowAlt - statusBrl.em < STATUS_BRL_TTL_MS) return statusBrl.pairs;
    try {
        const { data } = await axios.get('https://api.binance.com/api/v3/exchangeInfo', {
            params: { symbols: JSON.stringify(CRYPTO_BRL_DIRECT.map((s) => `${s}BRL`)) },
            timeout: QUOTE_TIMEOUT_MS
        });
        const pairs = data.symbols.filter((s) => s.status === 'TRADING').map((s) => s.baseAsset);
        statusBrl = { em: nowAlt, pairs };
        return pairs;
    } catch (err) {
        printError('/crypto: status of the BRL pairs failed, using the fixed list:', err.message);
        return CRYPTO_BRL_DIRECT;
    }
}

// For the tests: forgets the stored status
const zeroStatusBrl = () => { statusBrl = { em: 0, pairs: null }; };

/**
 * The brl price of each /crypto currency: the direct Binance pair (<TOKEN>BRL) when it exists; otherwise, the price
 * in dollars × USDTBRL. If Binance fails, returns what worked ({} with nothing).
 * @param {Record<string, number>} inDollar  the price of each currency in dollars (USDT)
 * @returns {Promise<Record<string, number>>}
 */
async function pricesInBrl(inDollar) {
    const syms = Object.keys(inDollar);
    const tradable = await pairsInBrlTradable();
    const directAlt = syms.filter((s) => tradable.includes(s));
    const search = async (pairs) => {
        const { data } = await axios.get('https://api.binance.com/api/v3/ticker/price', {
            params: { symbols: JSON.stringify(pairs) },
            timeout: QUOTE_TIMEOUT_MS
        });
        return Object.fromEntries(data.map((d) => [d.symbol.replace(/BRL$/, ''), Number(d.price)]));
    };

    let table;
    try {
        table = await search([...directAlt.map((s) => `${s}BRL`), 'USDTBRL']);
    } catch (err) {
        printError('/crypto: direct BRL prices failed, using only USDTBRL:', err.message);
        try {
            table = await search(['USDTBRL']);
        } catch (err2) {
            printError('/crypto: USDTBRL failed:', err2.message);
            return {};
        }
    }

    const dollar = table.USDT;
    const brl = {};
    for (const sym of syms) {
        const direct = directAlt.includes(sym) ? table[sym] : undefined;
        const v = Number.isFinite(direct) ? direct : (Number.isFinite(dollar) ? inDollar[sym] * dollar : NaN);
        if (Number.isFinite(v)) brl[sym] = v;
    }
    return brl;
}

const localeNumbers = () => (language() === 'pt_BR' ? 'pt-BR' : 'en-US');

// "R$ 369.246,00" (pt) / "R$ 369,246.00" (en); low-priced ones (PEPE, SHIB) with more decimals
const fmtBrlCrypto = (v) => `R$ ${Number(v).toLocaleString(localeNumbers(), { minimumFractionDigits: 2, maximumFractionDigits: Number(v) < 0.01 ? 8 : Number(v) < 1 ? 6 : 2 })}`;

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
    fmtBrlCrypto,
    fmtReal,
    fmtChange,
    pairsInBrlTradable,
    pricesInBrl,
    zeroStatusBrl
};
