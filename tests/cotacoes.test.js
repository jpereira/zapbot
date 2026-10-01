/*
 * /cotacao (/cambio), /crypto e os alertas de preço (-alerta).
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { DONO, OUTRO, rede } = bot;
const { verificarAlertasDePreco } = bot.src('alertasPreco');

/*
 * Preços simulados. Yahoo: último candle é o de hoje; o anterior dá o fechamento.
 */
const precos = {};

function simularMercado() {
    Object.assign(precos, { USD: 5.20, EUR: 5.85, GBP: 6.85, USDT: 5.18, BTC: 95000, ETH: 3000, SOL: 150, HYPE: 40 });

    rede.responder('get', 'query1.finance.yahoo.com', (url) => {
        const moeda = url.match(/chart\/([A-Z]+)BRL=X/)[1];
        const v = precos[moeda];
        return {
            chart: {
                result: [{
                    meta: { regularMarketPrice: v, regularMarketDayHigh: v + 0.1, regularMarketDayLow: v - 0.1 },
                    indicators: { quote: [{ open: [v - 0.2, v - 0.05], close: [v - 0.1, v], high: [v, v], low: [v, v] }] }
                }]
            }
        };
    });

    rede.responder('get', 'economia.awesomeapi.com.br', (url) => {
        const moeda = url.match(/last\/([A-Z]+)-BRL/)[1];
        const v = precos[moeda];
        return { [`${moeda}BRL`]: { bid: String(v), varBid: '0.05', high: String(v + 0.1), low: String(v - 0.1) } };
    });

    // [abertura em, open, high, low, close]: ontem e hoje
    rede.responder('get', 'api.binance.com/api/v3/klines', (url, cfg) => {
        const v = precos[cfg.params.symbol.replace(/BRL$/, '')];
        return [[0, v - 0.2, v, v - 0.3, v - 0.1], [0, v - 0.1, v + 0.1, v - 0.1, v]];
    });

    rede.responder('get', 'api.binance.com/api/v3/ticker/24hr', (url, cfg) =>
        JSON.parse(cfg.params.symbols).map(par => {
            const v = precos[par.replace(/USDT$/, '')];
            return { symbol: par, lastPrice: v, priceChangePercent: '1.5', highPrice: v * 1.02, lowPrice: v * 0.98, quoteVolume: 12_345_678 };
        }));

    rede.responder('get', 'api.binance.com/api/v3/ticker/price', (url, cfg) =>
        JSON.parse(cfg.params.symbols).map(par => ({ symbol: par, price: String(precos[par.replace(/USDT$/, '')]) })));
}

beforeEach(async () => {
    await bot.reiniciar();
    simularMercado();
});

describe('/cotacao (/cambio)', () => {
    test('sem argumento: as habilitadas (EUR e USDT), com abertura, fechamento e variação', async () => {
        const [r] = await bot.responder('/cotacao');
        assert.match(r, /💱 \*COTAÇÕES\* _\(em reais\)_/);
        assert.match(r, /🇪🇺 \*EUR\/BRL\* _\(Euro\)_\n   💰 \*R\$ 5,8500\*  🟢 \+1,74%\n   🔔 Abertura: R\$ 5,8000 _\(🟢 \+0,86% desde a abertura\)_\n   🏁 Fechamento anterior: R\$ 5,7500\n   📈 Máx: R\$ 5,9500  📉 Mín: R\$ 5,7500/);
        assert.match(r, /🪙 \*USDT\/BRL\* _\(Tether\)_\n   💰 \*R\$ 5,1800\*/);
        assert.match(r, /· Yahoo Finance, Binance_/);
        assert.doesNotMatch(r, /USD\/BRL/);
    });

    test('com argumentos: só as pedidas; /cambio é o mesmo', async () => {
        const [r] = await bot.responder('/cambio usd, gbp');
        assert.match(r, /USD\/BRL[\s\S]*GBP\/BRL/);
        assert.doesNotMatch(r, /EUR\/BRL|USDT/);
    });

    test('moeda não suportada', async () => {
        assert.match((await bot.responder('/cotacao xyz'))[0], /❌ Moeda não suportada: XYZ\n💡 _Suportadas: USD, EUR, GBP, USDT_/);
    });

    test('Yahoo fora do ar: usa a AwesomeAPI (sem abertura)', async () => {
        rede.responder('get', 'query1.finance.yahoo.com', new Error('429'));
        const [r] = await bot.responder('/cotacao eur', { erroEsperado: true });
        assert.match(r, /💰 \*R\$ 5,8500\*/);
        assert.match(r, /🔔 Abertura: —\n   🏁 Fechamento anterior: R\$ 5,8000/);
        assert.match(r, /· AwesomeAPI_/);
    });

    test('uma fonte fora do ar não derruba as outras', async () => {
        rede.responder('get', 'api.binance.com/api/v3/klines', new Error('timeout'));
        const [r] = await bot.responder('/cotacao', { erroEsperado: true });
        assert.match(r, /EUR\/BRL[\s\S]*💰/);
        assert.match(r, /USDT\/BRL\* _\(Tether\)_\n   ⚠️ _Cotação indisponível agora\._/);
    });

    test('-l lista as suportadas com ✅ nas habilitadas', async () => {
        const [r] = await bot.responder('/cotacao -l');
        assert.match(r, /▫️ 🇺🇸 \*USD\* — Dólar\n✅ 🇪🇺 \*EUR\* — Euro\n▫️ 🇬🇧 \*GBP\* — Libra\n✅ 🪙 \*USDT\* — Tether/);
    });

    test('-a e -d habilitam e desabilitam', async () => {
        assert.deepEqual(await bot.responder('/cotacao -a usd'), ['✅ 🇺🇸 USD habilitada.']);
        assert.deepEqual(await bot.responder('/cotacao -a usd'), ['ℹ️ USD já está habilitada.']);
        assert.deepEqual(await bot.responder('/cotacao -d eur'), ['🗑️ EUR desabilitada.']);
        assert.deepEqual(await bot.responder('/cotacao -d eur'), ['ℹ️ EUR já está desabilitada.']);
        assert.deepEqual(bot.getSetting('cotacao.coins'), ['USDT', 'USD']);
    });

    test('-a/-d: moeda inválida, sem moeda e de outra pessoa', async () => {
        assert.match((await bot.responder('/cotacao -a xyz'))[0], /❌ Moeda não suportada: XYZ/);
        assert.match((await bot.responder('/cotacao -a'))[0], /Usage: \/cotacao/);
        assert.deepEqual(await bot.responder('/cotacao -a gbp', { de: OUTRO.jid }), ['⛔ Apenas o dono do bot pode alterar as moedas.']);
    });

    test('nenhuma habilitada', async () => {
        await bot.setSetting('cotacao.coins', '');
        assert.match((await bot.responder('/cotacao'))[0], /ℹ️ Nenhuma moeda habilitada/);
    });
});

describe('/crypto (/bitcoio, /creptomoeda)', () => {
    test('preços das ativadas, na ordem configurada, com o top', async () => {
        const [r] = await bot.responder('/crypto');
        assert.match(r, /🚀 \*CRYPTO MARKET\*/);
        assert.match(r, /₿ BTC\n    💰 \$95,000\.00 +🟢 \+1\.50%/);
        assert.ok(r.indexOf('BTC') < r.indexOf('ETH') && r.indexOf('ETH') < r.indexOf('SOL'));
        assert.match(r, /📊 \$12\.35M/);
        assert.match(r, /🔥 \*Top:\*/);
    });

    test('-l lista as suportadas com * nas ativadas', async () => {
        const [r] = await bot.responder('/creptomoeda -l');
        assert.match(r, /\* ₿ BTC/);
        assert.match(r, /\n {2}\S+ DOGE\n/);        // suportada, sem a marca
        assert.doesNotMatch(r, /\* \S+ DOGE/);
    });

    test('-a e -d', async () => {
        assert.match((await bot.responder('/crypto -a doge'))[0], /✅ .*DOGE adicionada\./);
        assert.deepEqual(await bot.responder('/crypto -a doge'), ['ℹ️ DOGE já está ativada.']);
        assert.deepEqual(await bot.responder('/crypto -d hype'), ['🗑️ HYPE removida.']);
        assert.deepEqual(await bot.responder('/crypto -d hype'), ['ℹ️ HYPE não está ativada.']);
        assert.match((await bot.responder('/crypto -a xyz'))[0], /❌ Moeda não suportada: XYZ/);
        assert.match((await bot.responder('/crypto -a'))[0], /Usage: \/crypto/);
        assert.deepEqual(await bot.responder('/crypto -a sol', { de: OUTRO.jid }), ['⛔ Apenas o dono do bot pode alterar as moedas.']);
    });

    test('/moedinha não é mais alias', async () => {
        assert.deepEqual(await bot.responder('/moedinha'), []);
    });

    test('nenhuma ativada; Binance fora do ar', async () => {
        await bot.setSetting('crypto.coins', '');
        assert.match((await bot.responder('/crypto'))[0], /ℹ️ Nenhuma moeda ativada/);

        await bot.setSetting('crypto.coins', 'BTC');
        rede.responder('get', 'ticker/24hr', new Error('fora do ar'));
        assert.deepEqual(await bot.responder('/crypto', { erroEsperado: true }), ['❌ Error fetching crypto prices.']);
    });
});

describe('alertas de preço (-alerta)', () => {
    test('cria, lista e dispara uma vez no seu privado', async () => {
        const [criado] = await bot.responder('/cotacao -alerta USD > 5.30');
        assert.match(criado, /🔔 \*Alerta criado\*\n🇺🇸 USD\/BRL acima de \*R\$ 5,3000\*\n💰 Agora: R\$ 5,2000/);

        const [lista] = await bot.responder('/cotacao -alerta');
        assert.match(lista, /🔔 \*ALERTAS DE PREÇO\* _\(\/cotacao\)_\n\n1\. 🇺🇸 USD\/BRL acima de \*R\$ 5,3000\*/);

        // Ainda não: nada acontece
        await verificarAlertasDePreco({ forcar: true });
        assert.equal(bot.client.enviadas.length, 2);

        precos.USD = 5.31;
        const antes = bot.client.enviadas.length;
        await verificarAlertasDePreco({ forcar: true });
        const [aviso] = bot.client.enviadas.slice(antes);

        assert.equal(aviso.chatId, DONO.jid);
        assert.match(aviso.content, /🔔 \*ALERTA DE PREÇO\*\n\n📈 🇺🇸 \*USD\/BRL\* ficou acima de R\$ 5,3000\n💰 Agora: \*R\$ 5,3100\* _\(🟢 \+2,12% desde a criação\)_/);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n, 0);

        // Removido: não dispara de novo
        await verificarAlertasDePreco({ forcar: true });
        assert.equal(bot.client.enviadas.length, antes + 1);
    });

    test('/crypto -alerta: abaixo de, em dólar', async () => {
        assert.match((await bot.responder('/crypto -alerta BTC < 90000'))[0], /₿ BTC\/USDT abaixo de \*\$90,000\.00\*/);
        precos.BTC = 89000;
        const antes = bot.client.enviadas.length;
        await verificarAlertasDePreco({ forcar: true });
        assert.match(bot.client.enviadas[antes].content, /📉 ₿ \*BTC\/USDT\* ficou abaixo de \$90,000\.00\n💰 Agora: \*\$89,000\.00\*/);
    });

    test('formatos aceitos: sem espaços, vírgula decimal, minúsculas', async () => {
        assert.match((await bot.responder('/cotacao -alerta eur<5,5'))[0], /EUR\/BRL abaixo de \*R\$ 5,5000\*/);
    });

    test('regra inválida, moeda não suportada e já cumprida', async () => {
        assert.match((await bot.responder('/cotacao -alerta USD = 5'))[0], /❌ Regra inválida: "USD = 5"/);
        assert.match((await bot.responder('/cotacao -alerta USD > abc'))[0], /❌ Regra inválida/);
        assert.match((await bot.responder('/cotacao -alerta XYZ > 1'))[0], /❌ Moeda não suportada: XYZ/);
        assert.match((await bot.responder('/crypto -alerta XYZ > 1'))[0], /❌ Moeda não suportada: XYZ\n💡 _Veja as suportadas com \/crypto -l_/);
        assert.match((await bot.responder('/cotacao -alerta USD > 5'))[0], /ℹ️ USD\/BRL já está acima de R\$ 5,0000: agora está em \*R\$ 5,2000\*/);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n, 0);
    });

    test('limite do alerta.max (somando os dois comandos)', async () => {
        await bot.setSetting('alerta.max', 2);
        await bot.responder('/cotacao -alerta USD > 6');
        await bot.responder('/crypto -alerta BTC > 100000');
        assert.match((await bot.responder('/cotacao -alerta EUR > 7'))[0], /❌ Limite de 2 alertas atingido/);
    });

    test('preço indisponível na criação', async () => {
        rede.responder('get', 'ticker/price', new Error('fora do ar'));
        assert.match((await bot.responder('/crypto -alerta BTC > 1', { erroEsperado: true }))[0], /⚠️ Não consegui consultar o preço de BTC/);
    });

    test('-rm N, -rm all e nº inexistente; listas separadas por comando', async () => {
        await bot.responder('/cotacao -alerta USD > 6');
        await bot.responder('/cotacao -alerta EUR > 7');
        await bot.responder('/crypto -alerta BTC > 100000');

        assert.match((await bot.responder('/cotacao -alerta -rm 1'))[0], /🗑️ Alerta removido: 🇺🇸 USD\/BRL acima de/);
        assert.match((await bot.responder('/cotacao -alerta -rm 9'))[0], /❌ Alerta nº 9 não existe/);
        assert.deepEqual(await bot.responder('/cotacao -alerta -rm all'), ['🗑️ 1 alerta removido.']);
        assert.match((await bot.responder('/crypto -alerta'))[0], /1\. ₿ BTC\/USDT acima de/);
    });

    test('só o dono; lista vazia', async () => {
        assert.deepEqual(await bot.responder('/cotacao -alerta USD > 6', { de: OUTRO.jid }), ['⛔ Apenas o dono do bot pode usar os alertas.']);
        assert.match((await bot.responder('/crypto -alerta'))[0], /🔔 Nenhum alerta no \/crypto\.\n💡 _Crie com \/crypto -alerta BTC < 90000_/);
    });

    test('-to: grupo por parte do nome (palavras em qualquer ordem, sem acento)', async () => {
        const L200 = '120363000000000200@g.us';
        bot.criarGrupo(L200, 'Grupo sobre L200', [DONO.jid]);
        bot.criarGrupo('120363000000000201@g.us', 'Família Ônibus', [DONO.jid]);

        const [criado] = await bot.responder('/crypto -alerta BTC < 90000 -to /Grupo L200/');
        assert.match(criado, /₿ BTC\/USDT abaixo de \*\$90,000\.00\*\n💰 Agora: \$95,000\.00\n💡 _Aviso em 👥 Grupo sobre L200;/);

        assert.match((await bot.responder('/crypto -alerta'))[0], /1\. ₿ BTC\/USDT abaixo de \*\$90,000\.00\* → 👥 Grupo sobre L200/);

        // Outras formas: aspas, uma palavra, com @, -to antes da regra
        for (const linha of ['/cotacao -alerta USD > 6 -to "l200 grupo"', '/cotacao -alerta -to @L200 EUR > 7', '/cotacao -alerta USD > 8 -to onibus']) {
            assert.match((await bot.responder(linha))[0], /🔔 \*Alerta criado\*/, linha);
        }
        const destinos = await bot.dbAll("SELECT dest_name FROM price_alerts WHERE kind = 'cotacao' ORDER BY id");
        assert.deepEqual(destinos.map(d => d.dest_name), ['Grupo sobre L200', 'Grupo sobre L200', 'Família Ônibus']);

        precos.BTC = 89000;
        const antes = bot.client.enviadas.length;
        await verificarAlertasDePreco({ forcar: true });
        const aviso = bot.client.enviadas.slice(antes).find(e => e.content.includes('BTC'));
        assert.equal(aviso.chatId, L200);
        assert.match(aviso.content, /🔔 \*ALERTA DE PREÇO\*/);
    });

    test('-to: pessoa pelo número ou pela menção', async () => {
        await bot.responder('/cotacao -alerta USD > 6 -to @5521911111111');
        await bot.responder('/cotacao -alerta EUR > 7 -to @100000000000001', { mencoes: ['100000000000001@lid'] });

        const destinos = await bot.dbAll('SELECT dest_id, dest_name, dest_is_group FROM price_alerts ORDER BY id');
        assert.deepEqual(destinos, [
            { dest_id: OUTRO.jid, dest_name: 'Fulano', dest_is_group: 0 },
            { dest_id: '100000000000001@lid', dest_name: '100000000000001', dest_is_group: 0 }
        ]);
        assert.match((await bot.responder('/cotacao -alerta'))[0], /USD\/BRL acima de \*R\$ 6,0000\* → 👤 Fulano/);

        precos.USD = 6.1;
        const antes = bot.client.enviadas.length;
        await verificarAlertasDePreco({ forcar: true });
        assert.equal(bot.client.enviadas[antes].chatId, OUTRO.jid);
    });

    test('-to: destino inválido, ambíguo, sem valor ou sem regra', async () => {
        bot.criarGrupo('120363000000000300@g.us', 'Trabalho Rio', [DONO.jid]);
        bot.criarGrupo('120363000000000301@g.us', 'Trabalho SP', [DONO.jid]);

        assert.match((await bot.responder('/cotacao -alerta USD > 6 -to trabalho'))[0], /🔎 "trabalho" corresponde a 2 grupos:\n• Trabalho Rio\n• Trabalho SP/);
        assert.match((await bot.responder('/cotacao -alerta USD > 6 -to /trabalho sp/'))[0], /💡 _Aviso em 👥 Trabalho SP;/);
        assert.match((await bot.responder('/cotacao -alerta USD > 6 -to xyz'))[0], /❌ Nenhum grupo com "xyz" no nome/);
        assert.match((await bot.responder('/cotacao -alerta USD > 6 -to @5521988888888'))[0], /❌ O número 5521988888888 não está no WhatsApp/);
        assert.match((await bot.responder('/cotacao -alerta USD > 6 -to @123'))[0], /❌ Número inválido: 123/);
        assert.match((await bot.responder('/cotacao -alerta USD > 6 -to'))[0], /❌ Informe o destino do -to/);
        assert.match((await bot.responder('/cotacao -alerta -to trabalho'))[0], /❌ O -to só vale ao criar um alerta/);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n, 1);
    });

    test('verificação: respeita o intervalo, espera a conexão e sobrevive a falhas', async () => {
        await bot.responder('/cotacao -alerta USD > 5.30');
        precos.USD = 6;

        bot.estado.pronto = false;
        await verificarAlertasDePreco({ forcar: true });
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n, 1, 'desconectado: não verifica');

        bot.estado.pronto = true;
        rede.responder('get', 'query1.finance.yahoo.com', new Error('429'));
        rede.responder('get', 'economia.awesomeapi.com.br', new Error('fora'));
        const logAntes = bot.logs.length;
        await verificarAlertasDePreco({ forcar: true });
        assert.ok(bot.errosNoLog(logAntes).length > 0);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n, 1, 'falha na consulta: mantém');

        // Dentro do intervalo (alerta.intervalMin) a verificação sem forcar não consulta
        rede.chamadas.length = 0;
        await verificarAlertasDePreco();
        assert.equal(rede.chamadas.length, 0);
    });
});
