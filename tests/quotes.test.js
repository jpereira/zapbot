/*
 * /stocks, /crypto and the price alerts (-alert).
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, OTHERAlt, emails, network } = bot;
const { priceCheckAlerts } = bot.src('priceAlerts');

/*
 * Simulated prices. Yahoo: last candle is today's; the previous one gives the close.
 */
const prices = {};

function simulateMarket() {
    Object.assign(prices, { MSTR: 100, USD: 5.20, EUR: 5.85, GBP: 6.85, USDT: 5.18, BTC: 95000, ETH: 3000, SOL: 150, HYPE: 40 });

    network.responder('get', 'query1.finance.yahoo.com', (url) => {
        const currency = url.match(/chart\/([A-Z]+)BRL=X/)?.[1];
        const ticker = currency ?? decodeURIComponent(url.match(/chart\/([^?]+)/)[1]);
        const v = prices[ticker];
        // Ticker that Yahoo does not know: 404
        if (v === undefined) throw Object.assign(new Error('Request failed with status code 404'), { response: { status: 404 } });
        return {
            chart: {
                result: [{
                    meta: { symbol: ticker, longName: currency ? undefined : 'Strategy Inc', fullExchangeName: 'NasdaqGS', currency: currency ? 'BRL' : 'USD', regularMarketPrice: v, regularMarketDayHigh: v + 0.1, regularMarketDayLow: v - 0.1 },
                    indicators: { quote: [{ open: [v - 0.2, v - 0.05], close: [v - 0.1, v], high: [v, v], low: [v, v] }] }
                }]
            }
        };
    });

    network.responder('get', 'economia.awesomeapi.com.br', (url) => {
        const currency = url.match(/last\/([A-Z]+)-BRL/)[1];
        const v = prices[currency];
        return { [`${currency}BRL`]: { bid: String(v), varBid: '0.05', high: String(v + 0.1), low: String(v - 0.1) } };
    });

    // [open at, open, high, low, close]: yesterday and today
    network.responder('get', 'api.binance.com/api/v3/klines', (url, cfg) => {
        const v = prices[cfg.params.symbol.replace(/BRL$/, '')];
        return [[0, v - 0.2, v, v - 0.3, v - 0.1], [0, v - 0.1, v + 0.1, v - 0.1, v]];
    });

    network.responder('get', 'api.binance.com/api/v3/ticker/24hr', (url, cfg) =>
        JSON.parse(cfg.params.symbols).map(pair => {
            const v = prices[pair.replace(/USDT$/, '')];
            return { symbol: pair, lastPrice: v, priceChangePercent: '1.5', highPrice: v * 1.02, lowPrice: v * 0.98, quoteVolume: 12_345_678 };
        }));

    // exchangeInfo of the brl pairs: all trading, except DOTBRL (paused, as on the real Binance)
    network.responder('get', 'api.binance.com/api/v3/exchangeInfo', (url, cfg) =>
        ({ symbols: JSON.parse(cfg.params.symbols).map(pair => ({ symbol: pair, baseAsset: pair.replace(/BRL$/, ''), quoteAsset: 'BRL', status: pair === 'DOTBRL' ? 'BREAK' : 'TRADING' })) }));

    // <TOKEN>USDT (the alerts) and <TOKEN>BRL (/crypto in brl): the brl pair is the dollar price × 5.2; USDTBRL is USDT itself
    network.responder('get', 'api.binance.com/api/v3/ticker/price', (url, cfg) =>
        JSON.parse(cfg.params.symbols).map(pair => ({
            symbol: pair,
            price: String(pair.endsWith('BRL') ? prices[pair.replace(/BRL$/, '')] * (pair === 'USDTBRL' ? 1 : 5.2) : prices[pair.replace(/USDT$/, '')])
        })));
}

beforeEach(async () => {
    await bot.restart();
    bot.src('quotes').zeroStatusBrl();
    simulateMarket();
});

describe('/stocks (moedas e ações)', () => {
    test('sem argumento: as habilitadas (USD, EUR, USDT e MSTR), cada uma com abertura, fechamento e variação', async () => {
        const [r] = await bot.replyAlt('/stocks');
        assert.match(r, /^📈 \*MERCADOS\*\n/);
        assert.match(r, /🇺🇸 \*USD\/BRL\* _\(Dólar\)_\n   💰 \*R\$ 5,2000\*/);
        assert.match(r, /🇪🇺 \*EUR\/BRL\* _\(Euro\)_\n   💰 \*R\$ 5,8500\*  🟢 \+1,74%\n   🔔 Abertura: R\$ 5,8000 _\(🟢 \+0,86% desde a abertura\)_\n   🏁 Fechamento anterior: R\$ 5,7500\n   📈 Máx: R\$ 5,9500  📉 Mín: R\$ 5,7500/);
        assert.match(r, /🪙 \*USDT\/BRL\* _\(Tether\)_\n   💰 \*R\$ 5,1800\*/);
        assert.match(r, /🏢 \*MSTR\* _\(Strategy Inc · NasdaqGS\)_\n   💰 \*US\$ 100,00\*/);
        assert.match(r, /· Yahoo Finance, Binance_/);
        assert.doesNotMatch(r, /GBP\/BRL/);
    });

    test('/rates não existe mais: o /stocks não tem aliases (o /stock ainda vale como abreviação única)', async () => {
        assert.deepEqual(bot.src('commands/definitions/stocks').aliases, []);
        assert.doesNotMatch((await bot.replyAlt('/rates eur')).join('\n'), /MERCADOS|USD\/BRL|EUR\/BRL/);
    });

    test('com argumentos: só os pedidos, moedas e ações misturadas', async () => {
        const [r] = await bot.replyAlt('/stocks usd, gbp mstr');
        assert.match(r, /USD\/BRL[\s\S]*GBP\/BRL[\s\S]*MSTR/);
        assert.doesNotMatch(r, /EUR\/BRL|USDT/);
    });

    test('ticker que o Yahoo não conhece', async () => {
        assert.match((await bot.replyAlt('/stocks xyz'))[0], /^❌ Ticker não encontrado no Yahoo Finance: XYZ/);
        assert.match((await bot.replyAlt('/stocks usd xyz'))[0], /USD\/BRL[\s\S]*🏢 \*XYZ\*\n   ⚠️ _Ticker não encontrado no Yahoo Finance\._/);
    });

    test('Yahoo fora do ar: as moedas usam a AwesomeAPI (sem abertura)', async () => {
        network.responder('get', 'query1.finance.yahoo.com', new Error('429'));
        const [r] = await bot.replyAlt('/stocks eur', { expectedError: true });
        assert.match(r, /💰 \*R\$ 5,8500\*/);
        assert.match(r, /🔔 Abertura: —\n   🏁 Fechamento anterior: R\$ 5,8000/);
        assert.match(r, /· AwesomeAPI_/);
    });

    test('uma fonte fora do ar não derruba as outras', async () => {
        network.responder('get', 'api.binance.com/api/v3/klines', new Error('timeout'));
        const [r] = await bot.replyAlt('/stocks', { expectedError: true });
        assert.match(r, /EUR\/BRL[\s\S]*💰/);
        assert.match(r, /USDT\/BRL\* _\(Tether\)_\n   ⚠️ _Cotação indisponível agora\._/);
    });

    test('-l lista os habilitados e as moedas suportadas', async () => {
        const [r] = await bot.replyAlt('/stocks -l');
        assert.match(r, /• 🇺🇸 USD — Dólar\n• 🇪🇺 EUR — Euro\n• 🪙 USDT — Tether\n• 🏢 MSTR/);
        assert.match(r, /💱 \*Moedas contra o real\* \(✅ habilitada\)\n🇺🇸 USD — Dólar ✅[^]*🇬🇧 GBP — Libra\n/);
    });

    test('-a e -d: moeda suportada entra direto, ticker só se o Yahoo o conhece', async () => {
        assert.deepEqual(await bot.replyAlt('/stocks -a gbp'), ['✅ GBP (Libra) habilitado.']);
        assert.deepEqual(await bot.replyAlt('/stocks -a gbp'), ['ℹ️ GBP já está habilitado.']);
        assert.deepEqual(await bot.replyAlt('/stocks -d eur'), ['🗑️ EUR desabilitado.']);
        assert.deepEqual(await bot.replyAlt('/stocks -d eur'), ['ℹ️ EUR não está habilitado.']);
        assert.deepEqual(bot.getSetting('stocks.symbols'), ['USD', 'USDT', 'MSTR', 'GBP']);
    });

    test('-a/-d: símbolo inválido, ticker desconhecido, sem símbolo e de outra pessoa', async () => {
        assert.match((await bot.replyAlt('/stocks -a "a b"'))[0], /não é um ticker válido/);
        assert.match((await bot.replyAlt('/stocks -a xyz'))[0], /Ticker não encontrado no Yahoo Finance: XYZ/);
        assert.match((await bot.replyAlt('/stocks -a'))[0], /`\/stocks/);
        assert.deepEqual(await bot.replyAlt('/stocks -a gbp', { de: OTHERAlt.jid }), ['⛔ Apenas o dono do bot (ou um admin) pode usar o -add do /stocks.']);
    });

    test('nada habilitado', async () => {
        await bot.setSetting('stocks.symbols', '');
        assert.match((await bot.replyAlt('/stocks'))[0], /ℹ️ Nada habilitado/);
    });
});

describe('/crypto', () => {
    test('preços das ativadas, na ordem configurada, com o top', async () => {
        const [r] = await bot.replyAlt('/crypto');
        assert.match(r, /^🚀 \*MERCADO CRIPTO\*\n```\n₿ BTC\n/);   // a single line between the title and the block
        assert.match(r, /₿ BTC\n    💰 \$95,000\.00 +🟢 \+1\.50%/);
        assert.ok(r.indexOf('BTC') < r.indexOf('ETH') && r.indexOf('ETH') < r.indexOf('SOL'));
        assert.match(r, /📊 \$12\.35M/);
        assert.match(r, /🔥 \*Top:\*/);
    });

    test('em reais: o par direto da Binance (BTC) e o dólar × USDTBRL nas que não têm (HYPE); o setting crypto.brl desliga', async () => {
        const [r] = await bot.replyAlt('/crypto');
        assert.match(r, /₿ BTC\n    💰 \$95,000\.00 +🟢 \+1\.50%\n    🇧🇷 R\$ 494\.000,00\n/, 'BTCBRL direto: 95000 × 5,2');
        assert.match(r, /Ⓗ HYPE\n    💰 \$40\.00 +🟢 \+1\.50%\n    🇧🇷 R\$ 207,20\n/, 'sem par direto: 40 × USDTBRL (5,18)');

        await bot.setSetting('crypto.brl', false);
        assert.doesNotMatch((await bot.replyAlt('/crypto'))[0], /🇧🇷/);
    });

    test('par em reais pausado na Binance (DOTBRL em BREAK) sai pelo dólar × USDTBRL, e a falha do status cai na lista fixa', async () => {
        await bot.setSetting('crypto.coins', 'BTC DOT');
        prices.DOT = 8;
        const [r] = await bot.replyAlt('/crypto');
        assert.match(r, /● DOT\n    💰 \$8\.00 +🟢 \+1\.50%\n    🇧🇷 R\$ 41,44\n/, 'DOT: 8 × 5,18, e não o 8 × 5,2 do par direto');
        assert.match(r, /₿ BTC\n    💰 \$95,000\.00 +🟢 \+1\.50%\n    🇧🇷 R\$ 494\.000,00\n/, 'BTC segue direto');

        bot.src('quotes').zeroStatusBrl();
        network.responder('get', 'api.binance.com/api/v3/exchangeInfo', new Error('fora do ar'));
        const [r2] = await bot.replyAlt('/crypto', { expectedError: true });
        assert.match(r2, /● DOT\n    💰 \$8\.00 +🟢 \+1\.50%\n    🇧🇷 R\$ 41,60\n/, 'sem o status vale a lista fixa: DOT direto (8 × 5,2)');
    });

    test('em inglês o real sai com o formato do idioma; a Binance fora do ar nos reais não derruba o dólar', async () => {
        await bot.setSetting('zapbot.lang', 'en_US');
        assert.match((await bot.replyAlt('/crypto BTC'))[0], /🇧🇷 R\$ 494,000\.00/);

        network.responder('get', 'api.binance.com/api/v3/ticker/price', new Error('fora do ar'));
        const [r] = await bot.replyAlt('/crypto BTC', { expectedError: true });
        assert.match(r, /₿ BTC\n    💰 \$95,000\.00/);
        assert.doesNotMatch(r, /🇧🇷/);
    });

    test('com argumentos: só as pedidas, na ordem pedida, ativadas ou não', async () => {
        const [so] = await bot.replyAlt('/crypto BTC');
        assert.match(so, /₿ BTC\n/);
        assert.doesNotMatch(so, /ETH|SOL|HYPE/);

        prices.DOGE = 0.25;
        const [two] = await bot.replyAlt('/crypto doge, eth btcusdt');
        assert.match(two, /Ð DOGE\n[\s\S]*Ξ ETH\n[\s\S]*₿ BTC\n/);
        assert.doesNotMatch(two, /SOL|HYPE/);
    });

    test('moeda não suportada: avisa e lista as suportadas (sem buscar preço)', async () => {
        const supported = /💡 _Suportadas: BTC, ETH, SOL, HYPE, BNB, .*, UNI, XAUT_$/;
        const [r] = await bot.replyAlt('/crypto FOO');
        assert.match(r, /^❌ Moeda não suportada: FOO\n/);
        assert.match(r, supported);
        assert.match((await bot.replyAlt('/crypto btc foo bar'))[0], /^❌ Moedas não suportadas: FOO, BAR\n/);
    });

    test('-l lista as suportadas com * nas ativadas', async () => {
        const [r] = await bot.replyAlt('/crypto -l');
        assert.match(r, /\* ₿ BTC/);
        assert.match(r, /\n {2}\S+ DOGE\n/);        // supported, without the mark
        assert.doesNotMatch(r, /\* \S+ DOGE/);
    });

    test('-a e -d', async () => {
        assert.match((await bot.replyAlt('/crypto -a doge'))[0], /✅ .*DOGE adicionada\./);
        assert.deepEqual(await bot.replyAlt('/crypto -a doge'), ['ℹ️ DOGE já está ativada.']);
        assert.deepEqual(await bot.replyAlt('/crypto -d hype'), ['🗑️ HYPE removida.']);
        assert.deepEqual(await bot.replyAlt('/crypto -d hype'), ['ℹ️ HYPE não está ativada.']);
        assert.match((await bot.replyAlt('/crypto -a xyz'))[0], /❌ Moeda não suportada: XYZ/);
        assert.match((await bot.replyAlt('/crypto -a'))[0], /`\/crypto/);
        assert.deepEqual(await bot.replyAlt('/crypto -a sol', { de: OTHERAlt.jid }), ['⛔ Apenas o dono do bot (ou um admin) pode usar o -add do /crypto.']);
    });

    test('/moedinha não é mais alias', async () => {
        assert.deepEqual(await bot.replyAlt('/moedinha'), ["⚠️ Comando '/moedinha' desconhecido, tente: /help"]);
    });

    test('nenhuma ativada; Binance fora do ar', async () => {
        await bot.setSetting('crypto.coins', '');
        assert.match((await bot.replyAlt('/crypto'))[0], /ℹ️ Nenhuma moeda ativada/);

        await bot.setSetting('crypto.coins', 'BTC');
        network.responder('get', 'ticker/24hr', new Error('fora do ar'));
        assert.deepEqual(await bot.replyAlt('/crypto', { expectedError: true }),
            ['❌ Não consegui consultar as cotações de criptomoedas. Tente de novo.']);
    });
});

describe('alertas de preço (-alert)', () => {
    test('msgPrepend preserva os espaços configurados no alerta', async () => {
        const { SETTINGS_SCHEMA, setSetting } = bot.src('settings');
        await setSetting('crypto.alert.msgPrepend', ' ⏰ ~> ');
        await bot.replyAlt('/crypto -alert BTC > 96000');
        prices.BTC = 97000;

        const beforeAlt = bot.client.sent.length;
        await priceCheckAlerts({ force: true });
        assert.ok(bot.client.sent[beforeAlt].content.startsWith(' ⏰ ~> *ALERTA DE PREÇO*'));
        await setSetting('crypto.alert.msgPrepend', SETTINGS_SCHEMA['crypto.alert.msgPrepend'].default);
    });

    test('cria, lista e dispara uma vez no seu privado', async () => {
        const [created] = await bot.replyAlt('/stocks -alert USD > 5.30');
        assert.match(created, /🔔 \*Alerta criado\*\n🇺🇸 USD\/BRL acima de \*R\$ 5,3000\*\n   📨 seu privado\n💰 Agora: R\$ 5,2000/);

        const [list] = await bot.replyAlt('/stocks -alert');
        assert.match(list, /🔔 \*ALERTAS DE PREÇO\* _\(\/stocks · a cada \d+ minutos?\)_\n\n1\. 🇺🇸 USD\/BRL acima de \*R\$ 5,3000\*/);

        // Not yet: nothing happens
        await priceCheckAlerts({ force: true });
        assert.equal(bot.client.sent.length, 2);

        prices.USD = 5.31;
        const beforeAlt = bot.client.sent.length;
        await priceCheckAlerts({ force: true });
        const [notice] = bot.client.sent.slice(beforeAlt);

        assert.equal(notice.chatId, OWNER.jid);
        assert.match(notice.content, /🔔 \*ALERTA DE PREÇO\*\n\n📈 🇺🇸 \*USD\/BRL\* ficou acima de R\$ 5,3000\n💰 Agora: \*R\$ 5,3100\* _\(🟢 \+2,12% desde a criação\)_/);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n, 0);

        // Removed: does not fire again
        await priceCheckAlerts({ force: true });
        assert.equal(bot.client.sent.length, beforeAlt + 1);
    });

    test('-alert -pause e -resume: o pausado fica na lista com ⏸️ e não dispara até ser retomado', async () => {
        await bot.replyAlt('/crypto -alert BTC > 96000');
        await bot.replyAlt('/crypto -alert ETH < 1000');
        const [paused] = await bot.replyAlt('/crypto -alert -pause 1');
        assert.match(paused, /^⏸️ \*Pausado\* \(1\)\n1\. ₿ BTC\/USDT acima de \*\$96,000\.00\*\n💡 \*Dicas\*\n-alert -resume <nº\.\.\.\|all> retoma$/);
        assert.match((await bot.replyAlt('/crypto -alert'))[0], /1\. ₿ BTC\/USDT acima de \*\$96,000\.00\* ⏸️ _pausado_/);
        assert.deepEqual(await bot.replyAlt('/crypto -alert -pa 1'), ['ℹ️ Nada a mudar: já estão todos pausados.']);
        assert.match((await bot.replyAlt('/crypto -alert -pause 9'))[0], /❌ Alerta nº 9 não existe/);

        // paused: the price crossed, but nothing goes out and the alert stays
        prices.BTC = 97000;
        const beforeAlt = bot.client.sent.length;
        await priceCheckAlerts({ force: true });
        assert.equal(bot.client.sent.length, beforeAlt);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n, 2);

        // resumed (all: only the paused one changes): fires on the next check
        assert.match((await bot.replyAlt('/crypto -alert -resume all'))[0], /^▶️ \*Retomado\* \(1\)\n1\. ₿ BTC/);
        assert.deepEqual(await bot.replyAlt('/crypto -alert -re all'), ['ℹ️ Nada a mudar: nenhum estava pausado.']);
        await priceCheckAlerts({ force: true });
        assert.match(bot.client.sent.at(-1).content, /ALERTA DE PREÇO[\s\S]*BTC\/USDT/);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n, 1);
    });

    test('/crypto -alert: abaixo de, em dólar', async () => {
        assert.match((await bot.replyAlt('/crypto -alert BTC < 90000'))[0], /₿ BTC\/USDT abaixo de \*\$90,000\.00\*/);
        prices.BTC = 89000;
        const beforeAlt = bot.client.sent.length;
        await priceCheckAlerts({ force: true });
        assert.match(bot.client.sent[beforeAlt].content, /📉 ₿ \*BTC\/USDT\* ficou abaixo de \$90,000\.00\n💰 Agora: \*\$89,000\.00\*/);
    });

    test('formatos aceitos: sem espaços, vírgula decimal, minúsculas', async () => {
        assert.match((await bot.replyAlt('/stocks -alert eur<5,5'))[0], /EUR\/BRL abaixo de \*R\$ 5,5000\*/);
    });

    test('regra inválida, moeda não suportada e já cumprida', async () => {
        assert.match((await bot.replyAlt('/stocks -alert USD = 5'))[0], /❌ Regra inválida: "USD = 5"/);
        assert.match((await bot.replyAlt('/stocks -alert USD > abc'))[0], /❌ Regra inválida/);
        assert.match((await bot.replyAlt('/stocks -alert XYZ > 1', { expectedError: true }))[0], /⚠️ Não consegui consultar o preço de XYZ agora/, 'ticker que o Yahoo não conhece');
        assert.match((await bot.replyAlt('/crypto -alert XYZ > 1'))[0], /❌ Moeda não suportada: XYZ\n💡 _Veja as suportadas com \/crypto -l_/);
        assert.match((await bot.replyAlt('/stocks -alert USD > 5'))[0], /ℹ️ USD\/BRL já está acima de R\$ 5,0000: agora está em \*R\$ 5,2000\*/);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n, 0);
    });

    test('limite do stocks.alert.max e do crypto.alert.max (cada comando tem o seu)', async () => {
        await bot.setSetting('stocks.alert.max', 2);
        await bot.setSetting('crypto.alert.max', 1);
        await bot.replyAlt('/stocks -alert USD > 6');
        await bot.replyAlt('/crypto -alert BTC > 100000');
        await bot.replyAlt('/stocks -alert EUR > 7');
        assert.match((await bot.replyAlt('/stocks -alert GBP > 8'))[0], /❌ Limite de 2 alertas atingido \(setting stocks\.alert\.max\)/);
        assert.match((await bot.replyAlt('/crypto -alert ETH > 5000'))[0], /❌ Limite de 1 alertas atingido \(setting crypto\.alert\.max\)/);
    });

    test('preço indisponível na criação', async () => {
        network.responder('get', 'ticker/price', new Error('fora do ar'));
        assert.match((await bot.replyAlt('/crypto -alert BTC > 1', { expectedError: true }))[0], /⚠️ Não consegui consultar o preço de BTC/);
    });

    test('-rm N, -rm all e nº inexistente; listas separadas por comando', async () => {
        await bot.replyAlt('/stocks -alert USD > 6');
        await bot.replyAlt('/stocks -alert EUR > 7');
        await bot.replyAlt('/crypto -alert BTC > 100000');

        assert.match((await bot.replyAlt('/stocks -alert -rm 1'))[0], /🗑️ Alerta removido: 🇺🇸 USD\/BRL acima de/);
        assert.match((await bot.replyAlt('/stocks -alert -rm 9'))[0], /❌ Alerta nº 9 não existe/);
        assert.deepEqual(await bot.replyAlt('/stocks -alert -rm all'), ['🗑️ 1 alerta removido.']);
        assert.match((await bot.replyAlt('/crypto -alert'))[0], /1\. ₿ BTC\/USDT acima de/);
    });

    test('-rm com vários nºs (espaço ou vírgula); algum que não existe: nenhum sai', async () => {
        for (const v of [96000, 97000, 98000, 99000]) await bot.replyAlt(`/crypto -alert BTC > ${v}`);

        assert.match((await bot.replyAlt('/crypto -alert -rm 1 7 9'))[0],
            /^❌ Alertas nº 7, 9 não existem\. Nada foi removido; veja a lista com \/crypto -alert$/);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n, 4);

        const [r] = await bot.replyAlt('/crypto -alert -rm 3 1,3');
        assert.match(r, /^🗑️ \*Alertas removidos\* \(2\)\n• ₿ BTC\/USDT acima de \*\$96,000\.00\*\n• ₿ BTC\/USDT acima de \*\$98,000\.00\*$/);
        const [list] = await bot.replyAlt('/crypto -alert');
        assert.match(list, /1\. ₿ BTC\/USDT acima de \*\$97,000\.00\*\n   🗓️ \d\d\/\d\d\/\d{4} \d\d:\d\d\n\n2\. ₿ BTC\/USDT acima de \*\$99,000\.00\*/);
    });

    test('-to me (ou eu): a sua conta junto de outros destinos; /me/ também; sem o bot conectado, avisa', async () => {
        await bot.replyAlt('/crypto BTC -alert > 96000 -to me -to /Fulano/');
        await bot.replyAlt('/stocks USD -alert > 6 -to /eu/ -to /Fulano/');
        const rows = await bot.dbAll('SELECT symbol, dest_id, recipients FROM price_alerts ORDER BY id');
        for (const row of rows) {
            const list = JSON.parse(row.recipients);
            assert.deepEqual(list.map(r => r.id), [bot.OWNER.jid, bot.OTHERAlt.jid], row.symbol);
            assert.equal(row.dest_id, bot.OWNER.jid);
            assert.equal(list[0].group, false);
        }
        // "me" twice is one destination
        await bot.replyAlt('/crypto BTC -alert > 97000 -to me -to eu');
        const only = await bot.dbGet('SELECT dest_id, recipients FROM price_alerts ORDER BY id DESC LIMIT 1');
        assert.deepEqual([only.dest_id, only.recipients], [bot.OWNER.jid, null]);

        const info = bot.client.info;
        bot.client.info = undefined;
        try {
            assert.match((await bot.replyAlt('/crypto BTC -alert > 98000 -to me'))[0], /não está conectado/);
        } finally {
            bot.client.info = info;
        }
    });

    test('-m é o atalho do -msg (no /crypto e no /stocks)', async () => {
        await bot.replyAlt('/crypto BTC -alert > 96000 -to /Fulano/ -m Hora de vender!');
        await bot.replyAlt('/stocks USD -alert > 6 -m Dólar subiu! -to /Fulano/');
        assert.deepEqual(await bot.dbAll('SELECT symbol, message FROM price_alerts ORDER BY id'), [
            { symbol: 'BTC', message: 'Hora de vender!' },
            { symbol: 'USD', message: 'Dólar subiu!' }
        ]);
    });

    test('a moeda antes do -alert; -msg vai no início do aviso', async () => {
        const [created] = await bot.replyAlt('/crypto BTC -alert > 96000 -to /Fulano/ -msg Isso é uma mensagem: hora de vender!');
        assert.match(created, /^🔔 \*Alerta criado\*\n₿ BTC\/USDT acima de \*\$96,000\.00\*\n   📨 Fulano\n   💬 🔔 Isso é uma mensagem: hora de vender!\n💰 Agora/);
        assert.match((await bot.replyAlt('/crypto -alert'))[0], /\n   📨 Fulano\n   💬 🔔 Isso é uma mensagem: hora de vender!\n   🗓️ /);

        // -to can also come after -msg; and in /stocks
        await bot.replyAlt('/stocks USD -alert > 6 -msg Dólar subiu! -to /Fulano/');
        assert.deepEqual(await bot.dbAll('SELECT symbol, dest_name, message FROM price_alerts ORDER BY id'), [
            { symbol: 'BTC', dest_name: 'Fulano', message: 'Isso é uma mensagem: hora de vender!' },
            { symbol: 'USD', dest_name: 'Fulano', message: 'Dólar subiu!' }
        ]);

        prices.BTC = 97000;
        const beforeAlt = bot.client.sent.length;
        await priceCheckAlerts({ force: true });
        const [notice] = bot.client.sent.slice(beforeAlt);
        assert.equal(notice.chatId, OTHERAlt.jid);
        assert.match(notice.content, /^🔔 Isso é uma mensagem: hora de vender!\n\n\*ALERTA DE PREÇO\*\n\n📈 ₿ \*BTC\/USDT\*/);

        assert.match((await bot.replyAlt('/crypto -alert BTC > 99000 -msg'))[0], /❌ Informe o texto do -msg/);
        assert.match((await bot.replyAlt('/crypto -alert -msg oi'))[0], /❌ O -msg só vale ao criar um alerta/);
    });

    test('só o dono; lista vazia', async () => {
        assert.deepEqual(await bot.replyAlt('/stocks -alert USD > 6', { de: OTHERAlt.jid }), ['⛔ Apenas o dono do bot (ou um admin) pode usar os alertas.']);
        assert.match((await bot.replyAlt('/crypto -alert'))[0], /🔔 Nenhum alerta no \/crypto\.\n💡 _Crie com \/crypto -alert BTC < 90000_/);
    });

    test('-to: grupo por parte do nome (palavras em qualquer ordem, sem acento)', async () => {
        const L200 = '120363000000000200@g.us';
        bot.createGroup(L200, 'Grupo sobre L200', [OWNER.jid]);
        bot.createGroup('120363000000000201@g.us', 'Família Ônibus', [OWNER.jid]);

        const [created] = await bot.replyAlt('/crypto -alert BTC < 90000 -to /Grupo L200/');
        assert.match(created, /₿ BTC\/USDT abaixo de \*\$90,000\.00\*\n   📨 Grupo sobre L200 👥\n💰 Agora: \$95,000\.00\n💡 _Verificação a cada/);

        assert.match((await bot.replyAlt('/crypto -alert'))[0], /1\. ₿ BTC\/USDT abaixo de \*\$90,000\.00\*\n   📨 Grupo sobre L200 👥\n   🗓️ /);

        // Other forms: quotes, one word, with @, -to before the rule
        for (const line of ['/stocks -alert USD > 6 -to "l200 grupo"', '/stocks -alert -to L200 EUR > 7', '/stocks -alert USD > 8 -to onibus']) {
            assert.match((await bot.replyAlt(line))[0], /🔔 \*Alerta criado\*/, line);
        }
        const destinations = await bot.dbAll("SELECT dest_name FROM price_alerts WHERE kind = 'acao' ORDER BY id");
        assert.deepEqual(destinations.map(d => d.dest_name), ['Grupo sobre L200', 'Grupo sobre L200', 'Família Ônibus']);

        prices.BTC = 89000;
        const beforeAlt = bot.client.sent.length;
        await priceCheckAlerts({ force: true });
        const notice = bot.client.sent.slice(beforeAlt).find(e => e.content.includes('BTC'));
        assert.equal(notice.chatId, L200);
        assert.match(notice.content, /🔔 \*ALERTA DE PREÇO\*/);
    });

    test('-to: contato pelo número ou pelo nome', async () => {
        await bot.replyAlt('/stocks -alert USD > 6 -to +5521911111111');
        await bot.replyAlt('/stocks -alert EUR > 7 -to fulano');

        const destinations = await bot.dbAll('SELECT dest_id, dest_name, dest_is_group FROM price_alerts ORDER BY id');
        assert.deepEqual(destinations, [
            { dest_id: OTHERAlt.jid, dest_name: 'Fulano', dest_is_group: 0 },
            { dest_id: OTHERAlt.jid, dest_name: 'Fulano', dest_is_group: 0 }
        ]);
        assert.match((await bot.replyAlt('/stocks -alert'))[0], /USD\/BRL acima de \*R\$ 6,0000\*\n   📨 Fulano\n   🗓️ /);

        prices.USD = 6.1;
        const beforeAlt = bot.client.sent.length;
        await priceCheckAlerts({ force: true });
        assert.equal(bot.client.sent[beforeAlt].chatId, OTHERAlt.jid);
    });

    test('vários -to: um alerta só, que avisa em todos (o repetido conta uma vez)', async () => {
        const L200 = '120363000000000200@g.us';
        bot.createGroup(L200, 'Grupo sobre L200', [OWNER.jid]);

        const [created] = await bot.replyAlt('/stocks -alert USD > 6 -to /Grupo L200/ -to fulano -to +5521911111111');
        assert.match(created, /\n   📨 Grupo sobre L200 👥\n      Fulano\n💰 Agora/);
        assert.match((await bot.replyAlt('/stocks -alert'))[0], /USD\/BRL acima de \*R\$ 6,0000\*\n   📨 Grupo sobre L200 👥\n      Fulano\n   🗓️ /);

        const [a] = await bot.dbAll('SELECT dest_id, recipients FROM price_alerts');
        assert.equal(a.dest_id, L200, 'as dest_* ficam com o primeiro');
        assert.deepEqual(JSON.parse(a.recipients).map(d => d.id), [L200, OTHERAlt.jid]);

        prices.USD = 6.1;
        const beforeAlt = bot.client.sent.length;
        await priceCheckAlerts({ force: true });
        assert.deepEqual(bot.client.sent.slice(beforeAlt).map(e => e.chatId), [L200, OTHERAlt.jid]);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n, 0);

        // A destination that fails does not hold up the others
        await bot.replyAlt('/stocks -alert EUR > 7 -to /Grupo L200/ -to fulano');
        const send = bot.client.sendMessage;
        bot.client.sendMessage = (chatId, ...rest) => (chatId === L200
            ? Promise.reject(new Error('fora do ar'))
            : send.call(bot.client, chatId, ...rest));
        try {
            prices.EUR = 7.1;
            const afterAlt = bot.client.sent.length;
            await priceCheckAlerts({ force: true });
            assert.deepEqual(bot.client.sent.slice(afterAlt).map(e => e.chatId), [OTHERAlt.jid]);
        } finally {
            bot.client.sendMessage = send;
        }

        // A -to that fails: nothing is created
        assert.match((await bot.replyAlt('/stocks -alert USD > 8 -to fulano -to xyz'))[0], /❌ Nenhum contato ou grupo com "xyz"/);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n, 0);
    });

    test('-to email: o aviso sai por e-mail, sem a formatação do WhatsApp', async () => {
        assert.match((await bot.replyAlt('/stocks -alert USD > 6 -to email'))[0], /❌ O "email" usa o QRCODE_EMAIL_SMTP_TO/);

        // QRCODE_EMAIL_SMTP_TO in the documentation format: "Name <email>"
        const env = { QRCODE_EMAIL_SMTP_HOST: 'smtp.exemplo.com', QRCODE_EMAIL_SMTP_USER: 'bot@exemplo.com', QRCODE_EMAIL_SMTP_TO: 'Eu <eu@exemplo.com>' };
        Object.assign(process.env, env);
        try {
            assert.match((await bot.replyAlt('/stocks -alert USD > 6 -to email'))[0], /\n   📨 eu@exemplo\.com 📧\n💰 Agora/);
            assert.match((await bot.replyAlt('/stocks -alert'))[0], /USD\/BRL acima de \*R\$ 6,0000\*\n   📨 eu@exemplo\.com 📧\n   🗓️ /);

            prices.USD = 6.1;
            const beforeAlt = bot.client.sent.length;
            await priceCheckAlerts({ force: true });
            assert.equal(bot.client.sent.length, beforeAlt, 'nada no WhatsApp');
            const [m] = emails;
            assert.equal(m.to, 'eu@exemplo.com');
            assert.equal(m.subject, '[ZapBot] 🔔 Alerta de preço: USD/BRL acima de R$ 6,0000');
            assert.match(m.text, /^🔔 ALERTA DE PREÇO\n\n📈 🇺🇸 USD\/BRL ficou acima de R\$ 6,0000\n💰 Agora: R\$ 6,1000/);

            // -msg goes at the start of the email too, without WhatsApp formatting
            await bot.replyAlt('/stocks -alert EUR > 7 -to email -msg *Euro* nas alturas!');
            prices.EUR = 7.1;
            await priceCheckAlerts({ force: true });
            assert.match(emails.at(-1).text, /^🔔 Euro nas alturas!\n\nALERTA DE PREÇO\n\n📈 🇪🇺 EUR\/BRL/);
        } finally {
            for (const v of Object.keys(env)) delete process.env[v];
        }
    });

    test('-to: destino inválido, ambíguo, sem valor ou sem regra', async () => {
        bot.createGroup('120363000000000300@g.us', 'Trabalho Rio', [OWNER.jid]);
        bot.createGroup('120363000000000301@g.us', 'Trabalho SP', [OWNER.jid]);

        const [list, created] = await bot.replyChoosing('/stocks -alert USD > 6 -to trabalho', 1);
        assert.match(list, /^🔎 "trabalho" corresponde a 2 grupos:\n\n1\. 👥 Trabalho Rio\n2\. 👥 Trabalho SP\n/);
        assert.match(created, /\n   📨 Trabalho Rio 👥\n💰 Agora/);
        assert.match((await bot.replyAlt('/stocks -alert USD > 6 -to /trabalho sp/'))[0], /\n   📨 Trabalho SP 👥\n💰 Agora/);
        assert.match((await bot.replyAlt('/stocks -alert USD > 6 -to xyz'))[0], /❌ Nenhum contato ou grupo com "xyz" no nome/);
        assert.match((await bot.replyAlt('/stocks -alert USD > 6 -to +5521988888888'))[0], /❌ O número \+5521988888888 não está no WhatsApp/);
        assert.match((await bot.replyAlt('/stocks -alert USD > 6 -to +123'))[0], /❌ Número inválido: \+123/);
        assert.match((await bot.replyAlt('/stocks -alert USD > 6 -to'))[0], /Informe o destino do -to/);
        assert.match((await bot.replyAlt('/stocks -alert -to trabalho'))[0], /❌ O -to só vale ao criar um alerta/);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n, 2);
    });

    test('verificação: respeita o intervalo, espera a conexão e sobrevive a falhas', async () => {
        await bot.replyAlt('/stocks -alert USD > 5.30');
        prices.USD = 6;

        bot.state.ready = false;
        await priceCheckAlerts({ force: true });
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n, 1, 'desconectado: não verifica');

        bot.state.ready = true;
        network.responder('get', 'query1.finance.yahoo.com', new Error('429'));
        network.responder('get', 'economia.awesomeapi.com.br', new Error('fora'));
        const logBefore = bot.logs.length;
        await priceCheckAlerts({ force: true });
        assert.ok(bot.errorsInLog(logBefore).length > 0);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n, 1, 'falha na consulta: mantém');

        // Within the interval (stocks.alert.intervalMin) the check without forcing does not query
        network.calls.length = 0;
        await priceCheckAlerts();
        assert.equal(network.calls.length, 0);
    });
});

describe('-q|-quiet: só os preços, uma linha por item', () => {
    test('/crypto -q: "BTC $preço" por moeda, sem cabeçalho, sem detalhes e sem rodapé', async () => {
        network.responder('get', 'api.binance.com/api/v3/ticker/24hr', [
            { symbol: 'BTCUSDT', lastPrice: '90123.45', priceChangePercent: '2.3', highPrice: '91000', lowPrice: '88000', quoteVolume: '1500000000' },
            { symbol: 'ETHUSDT', lastPrice: '3100.2', priceChangePercent: '-1.1', highPrice: '3200', lowPrice: '3000', quoteVolume: '900000000' }
        ]);
        const [r] = await bot.replyAlt('/crypto -q BTC ETH');
        assert.equal(r, 'BTC $90,123.45\nETH $3,100.20');
        assert.doesNotMatch(r, /MERCADO|Binance|Live Market|📈|🟢/);
    });
});

describe('/stocks -q', () => {
    test('uma linha por símbolo (moeda em R$, ação na moeda dela); o que falha vai com -; sem cabeçalho nem rodapé', async () => {
        const [r] = await bot.replyAlt('/stocks -q usd mstr xyz');
        assert.equal(r, 'USD R$ 5,2000\nMSTR US$ 100,00\nXYZ -');
        assert.doesNotMatch(r, /MERCADO|🕐|Yahoo|💰/);
    });
});

describe('/crypto -tts e /stocks -tts', () => {
    test('/crypto -tts BTC fala só o preço; /stocks -tts USD também', async () => {
        bot.processes.spoken = null;
        const replies = await bot.replyAlt('/crypto -tts BTC');
        assert.deepEqual(replies.filter(r => typeof r === 'string' && /Áudio gerado|Gerado por|Gerando/.test(r)), [], 'só o áudio, sem rodapé');
        assert.equal(bot.processes.spoken, 'BTC $95,000.00');
        await bot.execute('/stocks -tts USD');
        assert.equal(bot.processes.spoken, 'USD R$ 5,2000');
    });
});
