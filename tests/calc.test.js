/*
 * /calc: the sum of lists and the calculations (src/calculator.js, src/commands/calc.js).
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OTHERAlt } = bot;
const { round, evaluate, format, paraNumber, looksAccount, totalDeclared, valuesAlt } = bot.src('calculator');

beforeEach(bot.restart);

const sum = (textAlt, o = {}) => valuesAlt(textAlt, { pt: true, ...o }).reduce((s, v) => s + v.valor, 0);

test('números: vírgula e ponto, milhar e decimal, nos dois idiomas', () => {
    assert.equal(paraNumber('1.234,56', true), 1234.56);
    assert.equal(paraNumber('1,234.56', false), 1234.56);
    assert.equal(paraNumber('1.234', true), 1234, 'pt: o ponto com 3 dígitos é milhar');
    assert.equal(paraNumber('1.234', false), 1.234, 'en: é decimal');
    assert.equal(paraNumber('1,234', true), 1.234);
    assert.equal(paraNumber('1,5', true), 1.5);
    assert.equal(paraNumber('1.5', true), 1.5);
    assert.equal(paraNumber('0.123', true), 0.123, 'começando em 0 nunca é milhar');
    assert.equal(paraNumber('1.234.567', true), 1234567);
});

test('lista: o primeiro número de cada linha, com sinais, moeda, datas e telefones ignorados', () => {
    assert.equal(sum('437 maromba\n351 corrida'), 788);
    assert.equal(sum('maromba: 437\ncorrida - 351'), 788);
    assert.equal(sum('+30 pix\n-120,50 mercado\nR$ -20 pão\n-R$ 5 bala\nR$ 1.200,00 salário'), 1084.5);
    assert.equal(sum('15/11 437 maromba\n2026-11-16 351 corrida\n12:30 almoço 45'), 833);
    assert.equal(sum('ligar 5521999999999 depois 10'), 10, 'telefone não é valor');
    assert.equal(sum('*437* maromba\n_351_ corrida'), 788, 'formatação do WhatsApp');
    assert.equal(sum('Dia 1 - 437'), 1, 'o traço solto é separador (o 1 é o primeiro número)');
    assert.equal(sum('Dia 1 - 437', { coluna: -1 }), 437);
    assert.equal(sum('10 e 20\n5 e 6', { todos: true }), 41);
    assert.equal(round(sum('0,1\n0,2')), 0.3, 'o ruído de 0,1 + 0,2 some');
});

test('contas: precedência, parênteses, potência, unários, ×, ÷ e erros', () => {
    assert.equal(evaluate('2+3*4', true), 14);
    assert.equal(evaluate('(2+3)*4', true), 20);
    assert.equal(evaluate('2^3^2', true), 512);
    assert.equal(evaluate('-3 + 5', true), 2);
    assert.equal(evaluate('10 ÷ 4', true), 2.5);
    assert.equal(evaluate('2 x 3 × 4', true), 24);
    assert.equal(evaluate('1.234,50 - 200', true), 1034.5);
    assert.equal(evaluate('100/2*6', true), 300);
    assert.equal(evaluate('((1+7)*8)/2', true), 32);
    assert.equal(evaluate('7%2', true), 1);
    assert.equal(evaluate('2*(3+4)%5', true), 4);
    assert.throws(() => evaluate('1/0', true), /divzero/);
    assert.throws(() => evaluate('7%0', true), /divzero/);
    assert.throws(() => evaluate('2 +', true), /bad/);
    assert.throws(() => evaluate('(2', true), /bad/);
    assert.equal(looksAccount('437 - 351'), true);
    assert.equal(looksAccount('2*3'), true);
    assert.equal(looksAccount('-50'), false);
    assert.equal(looksAccount('437 maromba'), false);
    assert.equal(looksAccount('15/11'), false, 'data não é divisão');
    assert.equal(looksAccount('10/12/2026'), false);
    assert.equal(looksAccount('2026-11-15'), false);
    assert.equal(looksAccount('10/4'), true, 'ambígua: no /calc é a divisão');
    assert.equal(looksAccount('5/0'), true);
    assert.equal(looksAccount('100/2*6'), true);
    assert.equal(looksAccount('((1+7)*8)/2'), true);
});

test('formatar: milhar e decimal do idioma, sem ruído de ponto flutuante', () => {
    assert.equal(format(1234.5, true), '1.234,5');
    assert.equal(format(1234.5, false), '1,234.5');
    assert.equal(format(-0.1 - 0.2, false), '-0.3');
    assert.equal(format(0.1 + 0.2, true), '0,3');
    assert.equal(format(-1234567, true), '-1.234.567');
});

test('/calc respondendo a lista: o total, a soma e as estatísticas', async () => {
    const quoted = bot.createMessage({ texto: '437 maromba\n351 corrida', de: OTHERAlt.jid });
    const [r] = await bot.replyAlt('/calc', { citada: quoted });
    assert.equal(r, '🧮 *Total: 788*\n\n```  437  Maromba\n+ 351  Corrida\n─────\n= 788```\n_2 números · média 394_');
});

test('/calc e os apelidos /math e /sum; a conta digitada e a lista no próprio texto', async () => {
    assert.deepEqual(await bot.replyAlt('/calc 437 + 351 * 2'), ['🧮 437 + 351 * 2 = *1.139*']);
    assert.deepEqual(await bot.replyAlt('/math (2+3)*4'), ['🧮 (2+3)*4 = *20*']);
    assert.match((await bot.replyAlt('/sum 1.234,50 - 200'))[0], /= \*1\.034,5\*/);
    assert.match((await bot.replyAlt('/calc 10 a\n20 b'))[0], /Total: 30\*/);
});

test('-group soma por nome; -list mostra cada linha; -all e -col escolhem os números', async () => {
    const quoted = bot.createMessage({ texto: '437 maromba\n351 corrida\n200 maromba\n80 corrida', de: OTHERAlt.jid });
    assert.equal((await bot.replyAlt('/calc -group', { citada: quoted }))[0],
        '🧮 *Total: 1.068*\n\n```    637  Maromba\n+   431  Corrida\n───────\n= 1.068```\n_4 números · média 267_');
    assert.equal((await bot.replyAlt('/calc -short', { citada: quoted }))[0], '🧮 *Total: 1.068*\n_4 números · média 267_');
    assert.match((await bot.replyAlt('/calc', { citada: quoted }))[0], /```    437  Maromba\n\+   351  Corrida\n\+   200  Maromba\n\+    80  Corrida\n───────\n= 1\.068```/);

    const daysAlt = bot.createMessage({ texto: 'Dia 1 - 437\nDia 2 - 351', de: OTHERAlt.jid });
    assert.match((await bot.replyAlt('/calc -col -1', { citada: daysAlt }))[0], /Total: 788\*/);
    assert.match((await bot.replyAlt('/calc -all', { citada: daysAlt }))[0], /Total: 791\*/);
    assert.match((await bot.replyAlt('/calc -col 0', { citada: daysAlt }))[0], /O -col precisa de um número inteiro/);
});

test('sem nada, com texto sem números ou conta quebrada: avisa', async () => {
    assert.match((await bot.replyAlt('/calc'))[0], /Use|calc/i);
    assert.deepEqual(await bot.replyAlt('/calc bom dia'), ['🤷 Não achei números no texto.']);
    assert.match((await bot.replyAlt('/calc 5/0'))[0], /Divisão por zero/);
});

test('no idioma inglês: 1,234.56 e os textos em inglês', async () => {
    await bot.setSetting('zapbot.lang', 'en_US');
    const quoted = bot.createMessage({ texto: '1,234.56 gym\n100 running', de: OTHERAlt.jid });
    assert.equal((await bot.replyAlt('/calc', { citada: quoted }))[0], '🧮 *Total: 1,334.56*\n\n```  1,234.56  Gym\n+   100.00  Running\n──────────\n= 1,334.56```\n_2 numbers · average 667.28_');
});

// The debt list, as it came from WhatsApp: bullets, invisibles (U+2060), "R$." and the total at the end
const DEBT = [
    'Saldo da Divida', '',
    '•\u2060  \u2060\u2060+ R$3.375,00 = 15 kit x 225',
    '•\u2060  \u2060- R$1.055,00 = Casaco',
    '•\u2060  \u2060- R$   144,93 = Verdana 17/Agos',
    '•\u2060  \u2060- R$     55,02 = Almoço PF 18/Agos',
    '•\u2060  \u2060- R$  430,62 = Assador Rio',
    '•\u2060  \u2060\u2060- R$  462,70 = Ressola TC-Pro',
    '•\u2060  \u2060- R$.   80,00 = Encarnado Burguer',
    '•\u2060  \u2060- R$  231.84= 24 BARRINHAS WINSTAGE',
    '•\u2060  \u2060- R$  250.00 = Hospedagem 2x em Bariloche chegada',
    '', '————-', 'R$664,89 = Total Divida'
].join('\n');

test('moedas: R$, US$, USD$, EUR$, $, € e os códigos USD e EUR (maiúsculas ou não), com sinal', () => {
    const cases = [['EUR 50', 'EUR'], ['EUR$ 50', 'EUR'], ['eur 50', 'EUR'], ['USD$ 50', 'USD'], ['USD 50', 'USD'], ['usd$50', 'USD'],
        ['US$ 50', 'US$'], ['$ 50', '$'], ['€ 50', '€'], ['R$ 50', 'R$'], ['- EUR$ 50', 'EUR']];
    for (const [line, currency] of cases) {
        const [v] = valuesAlt(`${line} item`, { pt: true });
        assert.equal(v.moeda, currency, line);
        assert.equal(Math.abs(v.valor), 50, line);
    }
    assert.equal(valuesAlt('- EUR$ 50 item', { pt: true })[0].valor, -50);
    // EUR$ and EUR are the same currency: the whole list comes out with it
    const list = valuesAlt('EUR$ 10 a\nEUR 5 b\nUSD 3 c', { pt: true });
    assert.deepEqual(list.map(v => v.moeda), ['EUR', 'EUR', 'USD']);
    // Words that only start similarly are not a currency
    assert.equal(valuesAlt('EURO 50 item', { pt: true })[0].moeda, null);
});

test('lista da dívida: sinal antes do R$ (com espaço), invisíveis, R$. e a linha de total fora da soma', () => {
    const values = valuesAlt(DEBT, { pt: true });
    assert.deepEqual(values.map(v => v.valor), [3375, -1055, -144.93, -55.02, -430.62, -462.7, -80, -231.84, -250]);
    assert.equal(round(values.reduce((s, v) => s + v.valor, 0)), 664.89);
    assert.ok(values.every(v => v.moeda === 'R$'));
    assert.equal(totalDeclared(DEBT, true), 664.89);
    assert.equal(values[1].rotulo, 'Casaco', 'o nome como foi digitado');
    assert.equal(values[5].rotulo, 'Ressola TC-Pro', 'hífen no meio fica');
});

test('/calc na dívida: o total com R$, a conferência com o total do texto, entradas e saídas', async () => {
    const quoted = bot.createMessage({ texto: DEBT, de: OTHERAlt.jid });
    assert.equal((await bot.replyAlt('/calc', { citada: quoted }))[0], [
        '🧮 *Saldo: R$ 664,89*',
        '✅ _Confere com o total do texto_',
        '',
        '```+ R$ 3.375,00  15 kit x 225',
        '- R$ 1.055,00  Casaco',
        '- R$   144,93  Verdana 17/Agos',
        '- R$    55,02  Almoço PF 18/Agos',
        '- R$   430,62  Assador Rio',
        '- R$   462,70  Ressola TC-Pro',
        '- R$    80,00  Encarnado Burguer',
        '- R$   231,84  24 BARRINHAS WINSTAGE',
        '- R$   250,00  Hospedagem 2x em Barilo…',
        '─────────────',
        '= R$   664,89```',
        '',
        '➕ *Entradas:* R$ 3.375,00 _(1)_',
        '➖ *Saídas:* R$ 2.710,11 _(8)_',
        '🔻 *Maior saída:* Casaco (R$ 1.055,00)'
    ].join('\n'));

    // The wrong text's total: warns about the difference
    const wrong = bot.createMessage({ texto: DEBT.replace('R$664,89', 'R$600,00'), de: OTHERAlt.jid });
    assert.match((await bot.replyAlt('/calc', { citada: wrong }))[0], /⚠️ _O texto diz R\$ 600,00: diferença de R\$ 64,89_/);

    assert.match((await bot.replyAlt('/calc -group', { citada: quoted }))[0], /```\+ R\$ 3\.375,00  15 kit x 225\n- R\$ 1\.055,00  Casaco/);
});

test('sem moeda os números saem simples, e "total" sozinho numa lista sem número não atrapalha', () => {
    assert.deepEqual(valuesAlt('Total de gastos\n10 a\n20 b', { pt: true }).map(v => v.valor), [10, 20]);
    assert.equal(totalDeclared('10 a\n20 b', true), null);
    assert.equal(totalDeclared('10 a\n20 b\nTotal: 30', true), 30);
});

test('o sinal no começo da linha vale, mesmo solto; lista toda de "-" é de marcadores', () => {
    assert.deepEqual(valuesAlt('+ 100 salário\n- 30 mercado\n-  20,5 uber', { pt: true }).map(v => v.valor), [100, -30, -20.5]);
    assert.deepEqual(valuesAlt('•\u2060 - 144,93 Verdana\n437 maromba', { pt: true }).map(v => v.valor), [-144.93, 437]);
    assert.deepEqual(valuesAlt('- 437 maromba\n- 351 corrida', { pt: true }).map(v => v.valor), [437, 351], 'todas com "-": marcadores');
    assert.equal(valuesAlt('+ 100 salário', { pt: true })[0].rotulo, 'salário', 'o + sai do nome');
    assert.deepEqual(valuesAlt('Dia 1 - 437', { pt: true }).map(v => v.valor), [1], 'o traço depois do texto não é sinal');
});

test('contas encadeadas e com parênteses; conta mal escrita dá erro; numa lista a conta aparece na fita', async () => {
    assert.deepEqual(await bot.replyAlt('/calc 100/2*6'), ['🧮 100/2*6 = *300*']);
    assert.deepEqual(await bot.replyAlt('/calc ((1+7)*8)/2'), ['🧮 ((1+7)*8)/2 = *32*']);
    assert.deepEqual(await bot.replyAlt('/calc 7%2'), ['🧮 7%2 = *1*']);
    assert.match((await bot.replyAlt('/calc (1+2'))[0], /Não entendi a conta: \(1\+2/);

    const quoted = bot.createMessage({ texto: '100/2*6\n((1+7)*8)/2\n10 pizza\n15/11', de: OTHERAlt.jid });
    assert.equal((await bot.replyAlt('/calc', { citada: quoted }))[0],
        '🧮 *Total: 342*\n\n```  300  100/2*6\n+  32  ((1+7)*8)/2\n+  10  Pizza\n─────\n= 342```\n_3 números · média 114_');
});

test('as casas decimais são as mesmas na lista toda, e o nome da linha não se repete no -all', async () => {
    const market = bot.createMessage({ texto: 'arroz 22,90\nfeijão 8,50\ncarne 54,30', de: OTHERAlt.jid });
    assert.equal((await bot.replyAlt('/calc', { citada: market }))[0],
        '🧮 *Total: 85,70*\n\n```  22,90  Arroz\n+  8,50  Feijão\n+ 54,30  Carne\n───────\n= 85,70```\n_3 números · média 28,57_');

    const ida = bot.createMessage({ texto: 'ida 45 volta 38\nalmoço 52 gorjeta 5', de: OTHERAlt.jid });
    assert.equal((await bot.replyAlt('/calc -all', { citada: ida }))[0],
        '🧮 *Total: 140*\n\n```   45  Ida volta\n+  38\n+  52  Almoço gorjeta\n+   5\n─────\n= 140```\n_4 números · média 35_');
});
