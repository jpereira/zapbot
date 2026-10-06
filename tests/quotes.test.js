/*
 * /cotacao (/cambio), /crypto and the price alerts (-alerta).
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
    Object.assign(prices, { USD: 5.20, EUR: 5.85, GBP: 6.85, USDT: 5.18, BTC: 95000, ETH: 3000, SOL: 150, HYPE: 40 });

    network.responder('get', 'query1.finance.yahoo.com', (url) => {
        const currency = url.match(/chart\/([A-Z]+)BRL=X/)[1];
        const v = prices[currency];
        return {
            chart: {
                result: [{
                    meta: { regularMarketPrice: v, regularMarketDayHigh: v + 0.1, regularMarketDayLow: v - 0.1 },
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
        JSON.parse(cfg.params.symbols).map(par => {
            const v = prices[par.replace(/USDT$/, '')];
            return { symbol: par, lastPrice: v, priceChangePercent: '1.5', highPrice: v * 1.02, lowPrice: v * 0.98, quoteVolume: 12_345_678 };
        }));

    network.responder('get', 'api.binance.com/api/v3/ticker/price', (url, cfg) =>
        JSON.parse(cfg.params.symbols).map(par => ({ symbol: par, price: String(prices[par.replace(/USDT$/, '')]) })));
}

beforeEach(async () => {
    await bot.restart();
    simulateMarket();
});

describe('/cotacao (/cambio)', () => {
    test('sem argumento: as habilitadas (EUR e USDT), com abertura, fechamento e variação', async () => {
        const [r] = await bot.replyAlt('/cotacao');
        assert.match(r, /💱 \*COTAÇÕES\* _\(em reais\)_/);
        assert.match(r, /🇪🇺 \*EUR\/BRL\* _\(Euro\)_\n   💰 \*R\$ 5,8500\*  🟢 \+1,74%\n   🔔 Abertura: R\$ 5,8000 _\(🟢 \+0,86% desde a abertura\)_\n   🏁 Fechamento anterior: R\$ 5,7500\n   📈 Máx: R\$ 5,9500  📉 Mín: R\$ 5,7500/);
        assert.match(r, /🪙 \*USDT\/BRL\* _\(Tether\)_\n   💰 \*R\$ 5,1800\*/);
        assert.match(r, /· Yahoo Finance, Binance_/);
        assert.doesNotMatch(r, /USD\/BRL/);
    });

    test('com argumentos: só as pedidas; /cambio é o mesmo', async () => {
        const [r] = await bot.replyAlt('/cambio usd, gbp');
        assert.match(r, /USD\/BRL[\s\S]*GBP\/BRL/);
        assert.doesNotMatch(r, /EUR\/BRL|USDT/);
    });

    test('moeda não suportada', async () => {
        assert.match((await bot.replyAlt('/cotacao xyz'))[0], /❌ Moeda não suportada: XYZ\n💡 _Suportadas: USD, EUR, GBP, USDT_/);
    });

    test('Yahoo fora do ar: usa a AwesomeAPI (sem abertura)', async () => {
        network.responder('get', 'query1.finance.yahoo.com', new Error('429'));
        const [r] = await bot.replyAlt('/cotacao eur', { erroEsperado: true });
        assert.match(r, /💰 \*R\$ 5,8500\*/);
        assert.match(r, /🔔 Abertura: —\n   🏁 Fechamento anterior: R\$ 5,8000/);
        assert.match(r, /· AwesomeAPI_/);
    });

    test('uma fonte fora do ar não derruba as outras', async () => {
        network.responder('get', 'api.binance.com/api/v3/klines', new Error('timeout'));
        const [r] = await bot.replyAlt('/cotacao', { erroEsperado: true });
        assert.match(r, /EUR\/BRL[\s\S]*💰/);
        assert.match(r, /USDT\/BRL\* _\(Tether\)_\n   ⚠️ _Cotação indisponível agora\._/);
    });

    test('-l lista as suportadas com ✅ nas habilitadas', async () => {
        const [r] = await bot.replyAlt('/cotacao -l');
        assert.match(r, /▫️ 🇺🇸 \*USD\* — Dólar\n✅ 🇪🇺 \*EUR\* — Euro\n▫️ 🇬🇧 \*GBP\* — Libra\n✅ 🪙 \*USDT\* — Tether/);
    });

    test('-a e -d habilitam e desabilitam', async () => {
        assert.deepEqual(await bot.replyAlt('/cotacao -a usd'), ['✅ 🇺🇸 USD habilitada.']);
        assert.deepEqual(await bot.replyAlt('/cotacao -a usd'), ['ℹ️ USD já está habilitada.']);
        assert.deepEqual(await bot.replyAlt('/cotacao -d eur'), ['🗑️ EUR desabilitada.']);
        assert.deepEqual(await bot.replyAlt('/cotacao -d eur'), ['ℹ️ EUR já está desabilitada.']);
        assert.deepEqual(bot.getSetting('cotacao.coins'), ['USDT', 'USD']);
    });

    test('-a/-d: moeda inválida, sem moeda e de outra pessoa', async () => {
        assert.match((await bot.replyAlt('/cotacao -a xyz'))[0], /❌ Moeda não suportada: XYZ/);
        assert.match((await bot.replyAlt('/cotacao -a'))[0], /Uso: \/cotacao/);
        assert.deepEqual(await bot.replyAlt('/cotacao -a gbp', { de: OTHERAlt.jid }), ['⛔ Apenas o dono do bot (ou um admin) pode alterar as moedas.']);
    });

    test('nenhuma habilitada', async () => {
        await bot.setSetting('cotacao.coins', '');
        assert.match((await bot.replyAlt('/cotacao'))[0], /ℹ️ Nenhuma moeda habilitada/);
    });
});

describe('/crypto (/bitcoio, /creptomoeda)', () => {
    test('preços das ativadas, na ordem configurada, com o top', async () => {
        const [r] = await bot.replyAlt('/crypto');
        assert.match(r, /^🚀 \*MERCADO CRIPTO\*\n```\n₿ BTC\n/);   // a single line between the title and the block
        assert.match(r, /₿ BTC\n    💰 \$95,000\.00 +🟢 \+1\.50%/);
        assert.ok(r.indexOf('BTC') < r.indexOf('ETH') && r.indexOf('ETH') < r.indexOf('SOL'));
        assert.match(r, /📊 \$12\.35M/);
        assert.match(r, /🔥 \*Top:\*/);
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
        const supported = /💡 _Suportadas: BTC, ETH, SOL, HYPE, BNB, .*, UNI_$/;
        const [r] = await bot.replyAlt('/crypto FOO');
        assert.match(r, /^❌ Moeda não suportada: FOO\n/);
        assert.match(r, supported);
        assert.match((await bot.replyAlt('/crypto btc foo bar'))[0], /^❌ Moedas não suportadas: FOO, BAR\n/);
    });

    test('-l lista as suportadas com * nas ativadas', async () => {
        const [r] = await bot.replyAlt('/creptomoeda -l');
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
        assert.match((await bot.replyAlt('/crypto -a'))[0], /Uso: \/crypto/);
        assert.deepEqual(await bot.replyAlt('/crypto -a sol', { de: OTHERAlt.jid }), ['⛔ Apenas o dono do bot (ou um admin) pode alterar as moedas.']);
    });

    test('/moedinha não é mais alias', async () => {
        assert.deepEqual(await bot.replyAlt('/moedinha'), ["⚠️ Comando '/moedinha' desconhecido, tente: /help"]);
    });

    test('nenhuma ativada; Binance fora do ar', async () => {
        await bot.setSetting('crypto.coins', '');
        assert.match((await bot.replyAlt('/crypto'))[0], /ℹ️ Nenhuma moeda ativada/);

        await bot.setSetting('crypto.coins', 'BTC');
        network.responder('get', 'ticker/24hr', new Error('fora do ar'));
        assert.deepEqual(await bot.replyAlt('/crypto', { erroEsperado: true }),
            ['❌ Não consegui consultar as cotações de criptomoedas. Tente de novo.']);
    });
});

describe('alertas de preço (-alerta)', () => {
    test('cria, lista e dispara uma vez no seu privado', async () => {
        const [created] = await bot.replyAlt('/cotacao -alerta USD > 5.30');
        assert.match(created, /🔔 \*Alerta criado\*\n🇺🇸 USD\/BRL acima de \*R\$ 5,3000\*\n💰 Agora: R\$ 5,2000/);

        const [list] = await bot.replyAlt('/cotacao -alerta');
        assert.match(list, /🔔 \*ALERTAS DE PREÇO\* _\(\/cotacao\)_\n\n1\. 🇺🇸 USD\/BRL acima de \*R\$ 5,3000\*/);

        // Not yet: nothing happens
        await priceCheckAlerts({ forcar: true });
        assert.equal(bot.client.enviadas.length, 2);

        prices.USD = 5.31;
        const beforeAlt = bot.client.enviadas.length;
        await priceCheckAlerts({ forcar: true });
        const [notice] = bot.client.enviadas.slice(beforeAlt);

        assert.equal(notice.chatId, OWNER.jid);
        assert.match(notice.content, /🔔 \*ALERTA DE PREÇO\*\n\n📈 🇺🇸 \*USD\/BRL\* ficou acima de R\$ 5,3000\n💰 Agora: \*R\$ 5,3100\* _\(🟢 \+2,12% desde a criação\)_/);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n, 0);

        // Removed: does not fire again
        await priceCheckAlerts({ forcar: true });
        assert.equal(bot.client.enviadas.length, beforeAlt + 1);
    });

    test('/crypto -alerta: abaixo de, em dólar', async () => {
        assert.match((await bot.replyAlt('/crypto -alerta BTC < 90000'))[0], /₿ BTC\/USDT abaixo de \*\$90,000\.00\*/);
        prices.BTC = 89000;
        const beforeAlt = bot.client.enviadas.length;
        await priceCheckAlerts({ forcar: true });
        assert.match(bot.client.enviadas[beforeAlt].content, /📉 ₿ \*BTC\/USDT\* ficou abaixo de \$90,000\.00\n💰 Agora: \*\$89,000\.00\*/);
    });

    test('formatos aceitos: sem espaços, vírgula decimal, minúsculas', async () => {
        assert.match((await bot.replyAlt('/cotacao -alerta eur<5,5'))[0], /EUR\/BRL abaixo de \*R\$ 5,5000\*/);
    });

    test('regra inválida, moeda não suportada e já cumprida', async () => {
        assert.match((await bot.replyAlt('/cotacao -alerta USD = 5'))[0], /❌ Regra inválida: "USD = 5"/);
        assert.match((await bot.replyAlt('/cotacao -alerta USD > abc'))[0], /❌ Regra inválida/);
        assert.match((await bot.replyAlt('/cotacao -alerta XYZ > 1'))[0], /❌ Moeda não suportada: XYZ/);
        assert.match((await bot.replyAlt('/crypto -alerta XYZ > 1'))[0], /❌ Moeda não suportada: XYZ\n💡 _Veja as suportadas com \/crypto -l_/);
        assert.match((await bot.replyAlt('/cotacao -alerta USD > 5'))[0], /ℹ️ USD\/BRL já está acima de R\$ 5,0000: agora está em \*R\$ 5,2000\*/);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n, 0);
    });

    test('limite do alerta.max (somando os dois comandos)', async () => {
        await bot.setSetting('alerta.max', 2);
        await bot.replyAlt('/cotacao -alerta USD > 6');
        await bot.replyAlt('/crypto -alerta BTC > 100000');
        assert.match((await bot.replyAlt('/cotacao -alerta EUR > 7'))[0], /❌ Limite de 2 alertas atingido/);
    });

    test('preço indisponível na criação', async () => {
        network.responder('get', 'ticker/price', new Error('fora do ar'));
        assert.match((await bot.replyAlt('/crypto -alerta BTC > 1', { erroEsperado: true }))[0], /⚠️ Não consegui consultar o preço de BTC/);
    });

    test('-rm N, -rm all e nº inexistente; listas separadas por comando', async () => {
        await bot.replyAlt('/cotacao -alerta USD > 6');
        await bot.replyAlt('/cotacao -alerta EUR > 7');
        await bot.replyAlt('/crypto -alerta BTC > 100000');

        assert.match((await bot.replyAlt('/cotacao -alerta -rm 1'))[0], /🗑️ Alerta removido: 🇺🇸 USD\/BRL acima de/);
        assert.match((await bot.replyAlt('/cotacao -alerta -rm 9'))[0], /❌ Alerta nº 9 não existe/);
        assert.deepEqual(await bot.replyAlt('/cotacao -alerta -rm all'), ['🗑️ 1 alerta removido.']);
        assert.match((await bot.replyAlt('/crypto -alerta'))[0], /1\. ₿ BTC\/USDT acima de/);
    });

    test('-rm com vários nºs (espaço ou vírgula); algum que não existe: nenhum sai', async () => {
        for (const v of [96000, 97000, 98000, 99000]) await bot.replyAlt(`/crypto -alerta BTC > ${v}`);

        assert.match((await bot.replyAlt('/crypto -alerta -rm 1 7 9'))[0],
            /^❌ Alertas nº 7, 9 não existem\. Nada foi removido; veja a lista com \/crypto -alerta$/);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n, 4);

        const [r] = await bot.replyAlt('/crypto -alerta -rm 3 1,3');
        assert.match(r, /^🗑️ \*Alertas removidos\* \(2\)\n• ₿ BTC\/USDT acima de \*\$96,000\.00\*\n• ₿ BTC\/USDT acima de \*\$98,000\.00\*$/);
        const [list] = await bot.replyAlt('/crypto -alerta');
        assert.match(list, /1\. ₿ BTC\/USDT acima de \*\$97,000\.00\*.*\n2\. ₿ BTC\/USDT acima de \*\$99,000\.00\*/);
    });

    test('a moeda antes do -alerta; -msg vai no início do aviso', async () => {
        const [created] = await bot.replyAlt('/crypto BTC -alerta > 96000 -to /Fulano/ -msg Isso é uma mensagem: hora de vender!');
        assert.match(created, /^🔔 \*Alerta criado\*\n₿ BTC\/USDT acima de \*\$96,000\.00\*\n   💬 Isso é uma mensagem: hora de vender!\n💰 Agora/);
        assert.match((await bot.replyAlt('/crypto -alerta'))[0], /→ 👤 Fulano _\(criado .*\)_\n   💬 Isso é uma mensagem: hora de vender!/);

        // -to can also come after -msg; and in /cotacao
        await bot.replyAlt('/cotacao USD -alerta > 6 -msg Dólar subiu! -to /Fulano/');
        assert.deepEqual(await bot.dbAll('SELECT symbol, dest_name, message FROM price_alerts ORDER BY id'), [
            { symbol: 'BTC', dest_name: 'Fulano', message: 'Isso é uma mensagem: hora de vender!' },
            { symbol: 'USD', dest_name: 'Fulano', message: 'Dólar subiu!' }
        ]);

        prices.BTC = 97000;
        const beforeAlt = bot.client.enviadas.length;
        await priceCheckAlerts({ forcar: true });
        const [notice] = bot.client.enviadas.slice(beforeAlt);
        assert.equal(notice.chatId, OTHERAlt.jid);
        assert.match(notice.content, /^Isso é uma mensagem: hora de vender!\n\n🔔 \*ALERTA DE PREÇO\*\n\n📈 ₿ \*BTC\/USDT\*/);

        assert.match((await bot.replyAlt('/crypto -alerta BTC > 99000 -msg'))[0], /❌ Informe o texto do -msg/);
        assert.match((await bot.replyAlt('/crypto -alerta -msg oi'))[0], /❌ O -msg só vale ao criar um alerta/);
    });

    test('só o dono; lista vazia', async () => {
        assert.deepEqual(await bot.replyAlt('/cotacao -alerta USD > 6', { de: OTHERAlt.jid }), ['⛔ Apenas o dono do bot (ou um admin) pode usar os alertas.']);
        assert.match((await bot.replyAlt('/crypto -alerta'))[0], /🔔 Nenhum alerta no \/crypto\.\n💡 _Crie com \/crypto -alerta BTC < 90000_/);
    });

    test('-to: grupo por parte do nome (palavras em qualquer ordem, sem acento)', async () => {
        const L200 = '120363000000000200@g.us';
        bot.createGroup(L200, 'Grupo sobre L200', [OWNER.jid]);
        bot.createGroup('120363000000000201@g.us', 'Família Ônibus', [OWNER.jid]);

        const [created] = await bot.replyAlt('/crypto -alerta BTC < 90000 -to /Grupo L200/');
        assert.match(created, /₿ BTC\/USDT abaixo de \*\$90,000\.00\*\n💰 Agora: \$95,000\.00\n💡 _Aviso em 👥 Grupo sobre L200;/);

        assert.match((await bot.replyAlt('/crypto -alerta'))[0], /1\. ₿ BTC\/USDT abaixo de \*\$90,000\.00\* → 👥 Grupo sobre L200/);

        // Other forms: quotes, one word, with @, -to before the rule
        for (const line of ['/cotacao -alerta USD > 6 -to "l200 grupo"', '/cotacao -alerta -to L200 EUR > 7', '/cotacao -alerta USD > 8 -to onibus']) {
            assert.match((await bot.replyAlt(line))[0], /🔔 \*Alerta criado\*/, line);
        }
        const destinations = await bot.dbAll("SELECT dest_name FROM price_alerts WHERE kind = 'cotacao' ORDER BY id");
        assert.deepEqual(destinations.map(d => d.dest_name), ['Grupo sobre L200', 'Grupo sobre L200', 'Família Ônibus']);

        prices.BTC = 89000;
        const beforeAlt = bot.client.enviadas.length;
        await priceCheckAlerts({ forcar: true });
        const notice = bot.client.enviadas.slice(beforeAlt).find(e => e.content.includes('BTC'));
        assert.equal(notice.chatId, L200);
        assert.match(notice.content, /🔔 \*ALERTA DE PREÇO\*/);
    });

    test('-to: contato pelo número ou pelo nome', async () => {
        await bot.replyAlt('/cotacao -alerta USD > 6 -to +5521911111111');
        await bot.replyAlt('/cotacao -alerta EUR > 7 -to fulano');

        const destinations = await bot.dbAll('SELECT dest_id, dest_name, dest_is_group FROM price_alerts ORDER BY id');
        assert.deepEqual(destinations, [
            { dest_id: OTHERAlt.jid, dest_name: 'Fulano', dest_is_group: 0 },
            { dest_id: OTHERAlt.jid, dest_name: 'Fulano', dest_is_group: 0 }
        ]);
        assert.match((await bot.replyAlt('/cotacao -alerta'))[0], /USD\/BRL acima de \*R\$ 6,0000\* → 👤 Fulano/);

        prices.USD = 6.1;
        const beforeAlt = bot.client.enviadas.length;
        await priceCheckAlerts({ forcar: true });
        assert.equal(bot.client.enviadas[beforeAlt].chatId, OTHERAlt.jid);
    });

    test('vários -to: um alerta só, que avisa em todos (o repetido conta uma vez)', async () => {
        const L200 = '120363000000000200@g.us';
        bot.createGroup(L200, 'Grupo sobre L200', [OWNER.jid]);

        const [created] = await bot.replyAlt('/cotacao -alerta USD > 6 -to /Grupo L200/ -to fulano -to +5521911111111');
        assert.match(created, /💡 _Aviso em 👥 Grupo sobre L200, 👤 Fulano;/);
        assert.match((await bot.replyAlt('/cotacao -alerta'))[0], /USD\/BRL acima de \*R\$ 6,0000\* → 👥 Grupo sobre L200, 👤 Fulano/);

        const [a] = await bot.dbAll('SELECT dest_id, recipients FROM price_alerts');
        assert.equal(a.dest_id, L200, 'as dest_* ficam com o primeiro');
        assert.deepEqual(JSON.parse(a.recipients).map(d => d.id), [L200, OTHERAlt.jid]);

        prices.USD = 6.1;
        const beforeAlt = bot.client.enviadas.length;
        await priceCheckAlerts({ forcar: true });
        assert.deepEqual(bot.client.enviadas.slice(beforeAlt).map(e => e.chatId), [L200, OTHERAlt.jid]);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n, 0);

        // A destination that fails does not hold up the others
        await bot.replyAlt('/cotacao -alerta EUR > 7 -to /Grupo L200/ -to fulano');
        const send = bot.client.sendMessage;
        bot.client.sendMessage = (chatId, ...rest) => (chatId === L200
            ? Promise.reject(new Error('fora do ar'))
            : send.call(bot.client, chatId, ...rest));
        try {
            prices.EUR = 7.1;
            const afterAlt = bot.client.enviadas.length;
            await priceCheckAlerts({ forcar: true });
            assert.deepEqual(bot.client.enviadas.slice(afterAlt).map(e => e.chatId), [OTHERAlt.jid]);
        } finally {
            bot.client.sendMessage = send;
        }

        // A -to that fails: nothing is created
        assert.match((await bot.replyAlt('/cotacao -alerta USD > 8 -to fulano -to xyz'))[0], /❌ Nenhum contato ou grupo com "xyz"/);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n, 0);
    });

    test('-to email: o aviso sai por e-mail, sem a formatação do WhatsApp', async () => {
        assert.match((await bot.replyAlt('/cotacao -alerta USD > 6 -to email'))[0], /❌ O "email" usa o QRCODE_EMAIL_SMTP_TO/);

        // QRCODE_EMAIL_SMTP_TO in the documentation format: "Name <email>"
        const env = { QRCODE_EMAIL_SMTP_HOST: 'smtp.exemplo.com', QRCODE_EMAIL_SMTP_USER: 'bot@exemplo.com', QRCODE_EMAIL_SMTP_TO: 'Eu <eu@exemplo.com>' };
        Object.assign(process.env, env);
        try {
            assert.match((await bot.replyAlt('/cotacao -alerta USD > 6 -to email'))[0], /💡 _Aviso em 📧 eu@exemplo\.com;/);
            assert.match((await bot.replyAlt('/cotacao -alerta'))[0], /USD\/BRL acima de \*R\$ 6,0000\* → 📧 eu@exemplo\.com/);

            prices.USD = 6.1;
            const beforeAlt = bot.client.enviadas.length;
            await priceCheckAlerts({ forcar: true });
            assert.equal(bot.client.enviadas.length, beforeAlt, 'nada no WhatsApp');
            const [m] = emails;
            assert.equal(m.to, 'eu@exemplo.com');
            assert.equal(m.subject, '[ZapBot] 🔔 Alerta de preço: USD/BRL acima de R$ 6,0000');
            assert.match(m.text, /^🔔 ALERTA DE PREÇO\n\n📈 🇺🇸 USD\/BRL ficou acima de R\$ 6,0000\n💰 Agora: R\$ 6,1000/);

            // -msg goes at the start of the email too, without WhatsApp formatting
            await bot.replyAlt('/cotacao -alerta EUR > 7 -to email -msg *Euro* nas alturas!');
            prices.EUR = 7.1;
            await priceCheckAlerts({ forcar: true });
            assert.match(emails.at(-1).text, /^Euro nas alturas!\n\n🔔 ALERTA DE PREÇO\n\n📈 🇪🇺 EUR\/BRL/);
        } finally {
            for (const v of Object.keys(env)) delete process.env[v];
        }
    });

    test('-to: destino inválido, ambíguo, sem valor ou sem regra', async () => {
        bot.createGroup('120363000000000300@g.us', 'Trabalho Rio', [OWNER.jid]);
        bot.createGroup('120363000000000301@g.us', 'Trabalho SP', [OWNER.jid]);

        const [list, created] = await bot.replyChoosing('/cotacao -alerta USD > 6 -to trabalho', 1);
        assert.match(list, /^🔎 "trabalho" corresponde a 2 grupos:\n\n1\. 👥 Trabalho Rio\n2\. 👥 Trabalho SP\n/);
        assert.match(created, /💡 _Aviso em 👥 Trabalho Rio;/);
        assert.match((await bot.replyAlt('/cotacao -alerta USD > 6 -to /trabalho sp/'))[0], /💡 _Aviso em 👥 Trabalho SP;/);
        assert.match((await bot.replyAlt('/cotacao -alerta USD > 6 -to xyz'))[0], /❌ Nenhum contato ou grupo com "xyz" no nome/);
        assert.match((await bot.replyAlt('/cotacao -alerta USD > 6 -to +5521988888888'))[0], /❌ O número \+5521988888888 não está no WhatsApp/);
        assert.match((await bot.replyAlt('/cotacao -alerta USD > 6 -to +123'))[0], /❌ Número inválido: \+123/);
        assert.match((await bot.replyAlt('/cotacao -alerta USD > 6 -to'))[0], /❌ Informe o destino do -to/);
        assert.match((await bot.replyAlt('/cotacao -alerta -to trabalho'))[0], /❌ O -to só vale ao criar um alerta/);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n, 2);
    });

    test('verificação: respeita o intervalo, espera a conexão e sobrevive a falhas', async () => {
        await bot.replyAlt('/cotacao -alerta USD > 5.30');
        prices.USD = 6;

        bot.estado.pronto = false;
        await priceCheckAlerts({ forcar: true });
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n, 1, 'desconectado: não verifica');

        bot.estado.pronto = true;
        network.responder('get', 'query1.finance.yahoo.com', new Error('429'));
        network.responder('get', 'economia.awesomeapi.com.br', new Error('fora'));
        const logBefore = bot.logs.length;
        await priceCheckAlerts({ forcar: true });
        assert.ok(bot.errorsInLog(logBefore).length > 0);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n, 1, 'falha na consulta: mantém');

        // Within the interval (alerta.intervalMin) the check without forcing does not query
        network.chamadas.length = 0;
        await priceCheckAlerts();
        assert.equal(network.chamadas.length, 0);
    });
});
