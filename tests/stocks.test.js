/*
 * /stocks (stocks, ETFs and indexes through Yahoo Finance), its price alerts and XAUT in /crypto.
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OTHERAlt, network } = bot;
const { priceCheckAlerts } = bot.src('priceAlerts');
const { fmtPrice, fmtVolume, normalizeTicker } = bot.src('actions');
const { CRYPTO_SUPPORTED } = bot.src('currencies');

// Current price of each ticker (whoever is not here: Yahoo answers 404)
const market = {};

function yahoo(ticker, price) {
    return {
        chart: {
            result: [{
                meta: {
                    symbol: ticker, longName: ticker === 'MSTR' ? 'Strategy Inc' : `${ticker} Inc`, fullExchangeName: ticker.endsWith('.SA') ? 'São Paulo' : 'NasdaqGS',
                    currency: ticker.endsWith('.SA') ? 'BRL' : 'USD', regularMarketPrice: price,
                    regularMarketDayHigh: price * 1.04, regularMarketDayLow: price * 0.98, regularMarketVolume: 14_793_718,
                    fiftyTwoWeekHigh: price * 2, fiftyTwoWeekLow: price * 0.5
                },
                indicators: { quote: [{ open: [price, price * 1.01], close: [price * 1.06, price], high: [price, price], low: [price, price] }] }
            }]
        }
    };
}

beforeEach(async () => {
    await bot.restart();
    Object.keys(market).forEach((k) => delete market[k]);
    Object.assign(market, { MSTR: 100, NVDA: 140, 'PETR4.SA': 38.5 });
    // These tests are for stocks: only MSTR enabled (the default includes currencies, which have their tests in cotacoes.test.js)
    await bot.setSetting('stocks.symbols', 'MSTR');
    network.responder('get', 'query1.finance.yahoo.com', (url) => {
        const ticker = decodeURIComponent(url.match(/chart\/([^?]+)/)[1]);
        if (!(ticker in market)) throw Object.assign(new Error('Request failed with status code 404'), { response: { status: 404 } });
        return yahoo(ticker, market[ticker]);
    });
});

test('ticker: maiúsculas, ponto, hífen e ^; o resto é inválido', () => {
    assert.equal(normalizeTicker(' mstr '), 'MSTR');
    assert.equal(normalizeTicker('petr4.sa'), 'PETR4.SA');
    assert.equal(normalizeTicker('brk-b'), 'BRK-B');
    assert.equal(normalizeTicker('^gspc'), '^GSPC');
    assert.equal(normalizeTicker('MS TR'), null);
    assert.equal(normalizeTicker(''), null);
    assert.equal(normalizeTicker('a'.repeat(16)), null);
});

test('formatos: a moeda do ativo e o volume abreviado, nos dois idiomas', () => {
    assert.equal(fmtPrice(97.11, 'USD'), 'US$ 97,11');
    assert.equal(fmtPrice(38.5, 'BRL'), 'R$ 38,50');
    assert.equal(fmtPrice(12.3, 'EUR'), 'EUR 12,30');
    assert.equal(fmtVolume(14_793_718), '14,79 mi');
    assert.equal(fmtVolume(2_500_000_000), '2,50 bi');
});

test('/stocks sem nada: o MSTR (o padrão), com o preço, a variação, o dia, o volume e as 52 semanas', async () => {
    const [r] = await bot.replyAlt('/stocks');
    assert.match(r, /^📈 \*MERCADOS\*/);
    assert.match(r, /🏢 \*MSTR\* _\(Strategy Inc · NasdaqGS\)_/);
    assert.match(r, /💰 \*US\$ 100,00\*  🔴 -5,66%/, 'cai do fechamento anterior de 106');
    assert.match(r, /🔔 Abertura: US\$ 101,00/);
    assert.match(r, /🏁 Fechamento anterior: US\$ 106,00/);
    assert.match(r, /📈 Máx: US\$ 104,00  📉 Mín: US\$ 98,00/);
    assert.match(r, /📊 Volume: 14,79 mi/);
    assert.match(r, /🗓️ 52 semanas: US\$ 50,00 – US\$ 200,00/);
    assert.match(r, /Yahoo Finance/);
    assert.match((await bot.replyAlt('/stock'))[0], /^📈 \*MERCADOS\*[\s\S]*MSTR/, 'o /stock é o mesmo comando');
});

test('/stocks NVDA PETR4.SA: só esses; a ação da B3 sai em reais; um que não existe vira aviso na linha', async () => {
    const [r] = await bot.replyAlt('/stocks nvda petr4.sa xxxx');
    assert.match(r, /🏢 \*NVDA\* _\(NVDA Inc · NasdaqGS\)_[\s\S]*US\$ 140,00/);
    assert.match(r, /🏢 \*PETR4\.SA\* _\(PETR4\.SA Inc · São Paulo\)_[\s\S]*💰 \*R\$ 38,50\*/);
    assert.match(r, /🏢 \*XXXX\*\n {3}⚠️ _Ticker não encontrado no Yahoo Finance\._/);
    assert.doesNotMatch(r, /MSTR/, 'só os pedidos');

    assert.match((await bot.replyAlt('/stocks xxxx'))[0], /^❌ Ticker não encontrado no Yahoo Finance: XXXX\n💡 _Ações da B3 terminam em .SA/);
    assert.match((await bot.replyAlt('/stocks "MS TR!"'))[0], /não é um ticker válido/);
});

test('em inglês: $ e os textos em inglês', async () => {
    await bot.setSetting('zapbot.lang', 'en_US');
    const [r] = await bot.replyAlt('/stocks MSTR');
    assert.match(r, /^📈 \*MARKETS\*/);
    assert.match(r, /💰 \*\$100\.00\*  🔴 -5\.66%/);
    assert.match(r, /🏁 Previous close: \$106\.00/);
    assert.match(r, /📊 Volume: 14\.79M/);
});

test('-list, -add (só ticker que o Yahoo conhece) e -del; só o dono ou um admin', async () => {
    assert.match((await bot.replyAlt('/stocks -list'))[0], /📈 \*Símbolos habilitados\*\n\n• 🏢 MSTR/);

    assert.deepEqual(await bot.replyAlt('/stocks -a nvda'), ['✅ NVDA (NVDA Inc) habilitado.']);
    assert.deepEqual(await bot.replyAlt('/stocks -a nvda'), ['ℹ️ NVDA já está habilitado.']);
    assert.match((await bot.replyAlt('/stocks'))[0], /🏢 \*MSTR\*[\s\S]*🏢 \*NVDA\*/, 'os dois habilitados');

    assert.match((await bot.replyAlt('/stocks -a xxxx'))[0], /Ticker não encontrado no Yahoo Finance: XXXX/);
    assert.match((await bot.replyAlt('/stocks -a "a b"'))[0], /não é um ticker válido/);
    assert.match((await bot.replyAlt('/stocks -a'))[0], /Usage: \/stocks/);

    assert.deepEqual(await bot.replyAlt('/stocks -d mstr'), ['🗑️ MSTR desabilitado.']);
    assert.deepEqual(await bot.replyAlt('/stocks -d mstr'), ['ℹ️ MSTR não está habilitado.']);
    assert.match((await bot.replyAlt('/stocks'))[0], /NVDA/);
    assert.doesNotMatch((await bot.replyAlt('/stocks'))[0], /MSTR/);

    await bot.setSetting('stocks.symbols', '');
    assert.match((await bot.replyAlt('/stocks'))[0], /Nada habilitado/);

    assert.deepEqual(await bot.replyAlt('/stocks -a nvda', { de: OTHERAlt.jid }), ['⛔ Apenas o dono do bot (ou um admin) pode usar o -add do /stocks.']);
});

test('o setting stocks.symbols valida o ticker', async () => {
    await bot.setSetting('stocks.symbols', 'nvda petr4.sa');
    assert.match((await bot.replyAlt('/stocks -l'))[0], /• 🏢 NVDA\n• 🏢 PETR4\.SA/);
});

test('/stocks MSTR -alert < 90: cria, lista e dispara uma vez quando o preço cai', async () => {
    assert.match((await bot.replyAlt('/stocks MSTR -alert < 90'))[0], /🏢 MSTR abaixo de \*US\$ 90,00\*\n💰 Agora: US\$ 100,00/);
    assert.match((await bot.replyAlt('/stocks -alert'))[0], /🔔 \*ALERTAS DE PREÇO\* _\(\/stocks\)_\n\n1\. 🏢 MSTR abaixo de/);

    // Still above 90: nothing
    const beforeAlt = bot.client.enviadas.length;
    await priceCheckAlerts({ forcar: true });
    assert.equal(bot.client.enviadas.length, beforeAlt);

    market.MSTR = 88;
    await priceCheckAlerts({ forcar: true });
    assert.match(bot.client.enviadas.at(-1).content, /📉 🏢 \*MSTR\* ficou abaixo de US\$ 90,00\n💰 Agora: \*US\$ 88,00\*/);
    assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n, 0);

    // A ticker with a dot also becomes an alert (PETR4.SA > 40)
    assert.match((await bot.replyAlt('/stocks PETR4.SA -alert > 40'))[0], /PETR4\.SA acima de/);
});

test('XAUT (ouro tokenizado) é suportado no /crypto, com o ícone 🥇', async () => {
    assert.equal(CRYPTO_SUPPORTED.XAUT, '🥇');
    network.responder('get', 'api.binance.com/api/v3/ticker/24hr', (url, cfg) =>
        JSON.parse(cfg.params.symbols).map((par) => ({ symbol: par, lastPrice: 3837.83, priceChangePercent: '-0.325', highPrice: 3880, lowPrice: 3820, quoteVolume: 41_000_000 })));
    const [r] = await bot.replyAlt('/crypto XAUT');
    assert.match(r, /🥇 XAUT\n {4}💰 \$3,837\.83/);
    assert.match((await bot.replyAlt('/crypto -l'))[0], /🥇 XAUT/);
});
