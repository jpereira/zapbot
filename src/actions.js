/*
 * /stocks: quotes for stocks, ETFs, indexes and exchange rates through Yahoo Finance (the same as /rates).
 * The ticker is Yahoo's: MSTR, NVDA, PETR4.SA (B3), BRK-B, ^GSPC (S&P 500), BTC-USD...
 */

const axios = require('axios');

const { language } = require('./i18n');

const TICKER = /^[A-Z0-9.^=-]{1,15}$/;
const QUOTE_TIMEOUT_MS = 10000;

// "mstr", " petr4.sa " → "MSTR", "PETR4.SA"; invalid ticker: null
function normalizeTicker(textAlt) {
    const t = String(textAlt ?? '').trim().toUpperCase();
    return TICKER.test(t) ? t : null;
}

const valid = (v) => (Number.isFinite(v) ? v : null);

/**
 * A ticker's quote: price, open, previous close, day high and low, volume and the 52-week range.
 * @throws {Error} 'notfound' if Yahoo does not know the ticker; another error if the query fails
 */
async function quoteAction(ticker) {
    let data;
    try {
        ({ data } = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`, {
            params: { interval: '1d', range: '5d' },
            headers: { 'User-Agent': 'Mozilla/5.0' }, // without it Yahoo answers 429
            timeout: QUOTE_TIMEOUT_MS
        }));
    } catch (err) {
        if (err.response?.status === 404) throw new Error('notfound', { cause: err });
        throw err;
    }

    const r = data?.chart?.result?.[0];
    const q = r?.indicators?.quote?.[0];
    if (!r?.meta?.regularMarketPrice || !q) throw new Error('notfound');

    const n = q.close.length;
    // Previous close: the last valid close before today's candle
    let closingAlt = null;
    for (let i = n - 2; i >= 0 && closingAlt === null; i--) closingAlt = valid(q.close[i]);
    closingAlt ??= valid(r.meta.chartPreviousClose);

    return {
        ticker: r.meta.symbol ?? ticker,
        name: r.meta.longName ?? r.meta.shortName ?? null,
        exchange: r.meta.fullExchangeName ?? r.meta.exchangeName ?? null,
        currency: r.meta.currency ?? 'USD',
        current: r.meta.regularMarketPrice,
        opening: valid(q.open[n - 1]),
        closing: closingAlt,
        max: valid(r.meta.regularMarketDayHigh) ?? valid(q.high[n - 1]),
        min: valid(r.meta.regularMarketDayLow) ?? valid(q.low[n - 1]),
        volume: valid(r.meta.regularMarketVolume),
        max52: valid(r.meta.fiftyTwoWeekHigh),
        min52: valid(r.meta.fiftyTwoWeekLow),
        source: 'Yahoo Finance'
    };
}

const locale = () => (language() === 'pt_BR' ? 'pt-BR' : 'en-US');

// "$97.11", "US$ 97,11" (pt), "R$ 38,50", "EUR 12.30": the ticker currency
function fmtPrice(valueAlt, currency = 'USD') {
    const numberAlt = Number(valueAlt).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: Number(valueAlt) < 1 ? 6 : 2 });
    if (currency === 'USD') return language() === 'pt_BR' ? `US$ ${numberAlt}` : `$${numberAlt}`;
    if (currency === 'BRL') return `R$ ${numberAlt}`;
    return `${currency} ${numberAlt}`;
}

// 14793718 → "14.79M" (en) / "14,79 mi" (pt)
function fmtVolume(valueAlt) {
    const n = Number(valueAlt);
    const pt = language() === 'pt_BR';
    const two = (x) => x.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (n >= 1e9) return pt ? `${two(n / 1e9)} bi` : `${two(n / 1e9)}B`;
    if (n >= 1e6) return pt ? `${two(n / 1e6)} mi` : `${two(n / 1e6)}M`;
    if (n >= 1e3) return pt ? `${two(n / 1e3)} mil` : `${two(n / 1e3)}K`;
    return String(n);
}

module.exports = { TICKER, quoteAction, fmtPrice, fmtVolume, normalizeTicker };
