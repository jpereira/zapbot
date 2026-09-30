/*
 * Cotações: Yahoo Finance, AwesomeAPI e Binance, e a formatação de preços.
 */

const axios = require('axios');

const { printError } = require('./log');
const { COTACAO_SUPORTADAS } = require('./moedas');

const fmtPrecoCrypto = (value) =>
    Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });

const COTACAO_TIMEOUT_MS = 10000;

async function cotacaoYahoo(moeda) {
    const { data } = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${moeda}BRL=X`, {
        params: { interval: '1d', range: '5d' },
        headers: { 'User-Agent': 'Mozilla/5.0' }, // sem ele o Yahoo responde 429
        timeout: COTACAO_TIMEOUT_MS
    });

    const r = data?.chart?.result?.[0];
    const q = r?.indicators?.quote?.[0];
    if (!r?.meta?.regularMarketPrice || !q) throw new Error('resposta sem cotação');

    const n = q.close.length;
    const valido = (v) => (Number.isFinite(v) ? v : null);

    // Fechamento anterior: último close válido antes do candle de hoje
    let fechamento = null;
    for (let i = n - 2; i >= 0 && fechamento === null; i--) fechamento = valido(q.close[i]);

    return {
        atual: r.meta.regularMarketPrice,
        abertura: valido(q.open[n - 1]),
        fechamento,
        max: valido(r.meta.regularMarketDayHigh) ?? valido(q.high[n - 1]),
        min: valido(r.meta.regularMarketDayLow) ?? valido(q.low[n - 1]),
        fonte: 'Yahoo Finance'
    };
}

// Reserva do Yahoo: sem abertura; o fechamento anterior sai de bid - varBid
async function cotacaoAwesome(moeda) {
    const { data } = await axios.get(`https://economia.awesomeapi.com.br/json/last/${moeda}-BRL`, { timeout: COTACAO_TIMEOUT_MS });
    const d = data?.[`${moeda}BRL`];
    if (!d?.bid) throw new Error('resposta sem cotação');

    const atual = Number(d.bid);
    return {
        atual,
        abertura: null,
        fechamento: atual - Number(d.varBid),
        max: Number(d.high),
        min: Number(d.low),
        fonte: 'AwesomeAPI'
    };
}

async function cotacaoBinance(moeda) {
    const { data } = await axios.get('https://api.binance.com/api/v3/klines', {
        params: { symbol: `${moeda}BRL`, interval: '1d', limit: 2 },
        timeout: COTACAO_TIMEOUT_MS
    });

    // [abertura em, open, high, low, close, ...]: ontem e hoje
    const [ontem, hoje] = data;
    if (!hoje) throw new Error('resposta sem cotação');

    return {
        atual: Number(hoje[4]),
        abertura: Number(hoje[1]),
        fechamento: Number(ontem[4]),
        max: Number(hoje[2]),
        min: Number(hoje[3]),
        fonte: 'Binance'
    };
}

async function buscarCotacao(moeda) {
    if (COTACAO_SUPORTADAS[moeda].fonte === 'binance') return cotacaoBinance(moeda);

    try {
        return await cotacaoYahoo(moeda);
    } catch (err) {
        printError(`/cotacao: Yahoo falhou para ${moeda} (${err.message}), usando a AwesomeAPI.`);
        return cotacaoAwesome(moeda);
    }
}

const fmtReal = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;

function fmtVariacao(atual, base) {
    if (!base) return null;
    const pct = ((atual - base) / base) * 100;
    const sinal = pct > 0 ? '+' : '';
    const icone = pct > 0 ? '🟢' : pct < 0 ? '🔴' : '⚪';
    return `${icone} ${sinal}${pct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

module.exports = {
    COTACAO_TIMEOUT_MS,
    buscarCotacao,
    fmtPrecoCrypto,
    fmtReal,
    fmtVariacao
};
