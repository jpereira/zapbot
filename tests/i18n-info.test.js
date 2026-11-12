/*
 * i18n (en_US) dos comandos de informação: /rates, /crypto, alertas de preço, /bills, /whois, /me,
 * /status do /bot e /uptime. Sem rede. Os outros testes rodam em pt_BR.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { rede } = bot;
const { getSetting, setSetting } = bot.src('settings');

beforeEach(async () => {
    await bot.reiniciar();
    await setSetting('zapbot.lang', 'en_US');
});

describe('en_US: informação', () => {
    test('/rates -l e a habilitação de moedas', async () => {
        const [lista] = await bot.responder('/rates -l');
        assert.match(lista, /^💱 \*SUPPORTED CURRENCIES\* _\(against the real\)_\n\n/);
        assert.match(lista, /\*USD\* — Dollar/);

        assert.equal((await bot.responder('/rates -a GBP'))[0], '✅ 🇬🇧 GBP enabled.');
        assert.equal((await bot.responder('/rates -a GBP'))[0], 'ℹ️ GBP is already enabled.');
        assert.equal((await bot.responder('/rates -a XYZ'))[0],
            '❌ Unsupported currency: XYZ\n💡 _See the supported ones with /rates -l_');
    });

    test('/rates com cotação simulada: números no formato do idioma', async () => {
        rede.responder('get', 'query1.finance.yahoo.com', () => ({
            chart: {
                result: [{
                    meta: { regularMarketPrice: 5.2, regularMarketDayHigh: 5.3, regularMarketDayLow: 5.1 },
                    indicators: { quote: [{ open: [5, 5.1], close: [5.1, 5.2], high: [5.2, 5.3], low: [5, 5.1] }] }
                }]
            }
        }));

        const [r] = await bot.responder('/rates usd');
        assert.match(r, /^💱 \*EXCHANGE RATES\* _\(in reais\)_\n/);
        assert.match(r, /💰 \*R\$ 5\.2000\*/);
        assert.match(r, /🏁 Previous close: R\$ 5\.1000/);
        assert.match(r, /💡 _% next to the value: change since the previous close\._$/);
    });

    test('alertas de preço: criar, listar e remover', async () => {
        rede.responder('get', 'query1.finance.yahoo.com', () => ({
            chart: {
                result: [{
                    meta: { regularMarketPrice: 5.2 },
                    indicators: { quote: [{ open: [5, 5.1], close: [5.1, 5.2], high: [5.2, 5.3], low: [5, 5.1] }] }
                }]
            }
        }));

        const [criado] = await bot.responder('/rates -alerta USD > 5.30');
        assert.match(criado, /^🔔 \*Alert created\*\n/);
        assert.match(criado, /💰 Now: R\$ 5\.2000\n💡 _Notice in your private chat; checked every \d+ minutes?\._$/);

        assert.match((await bot.responder('/rates -alerta'))[0], /^🔔 \*PRICE ALERTS\* _\(\/rates\)_\n\n1\. /);
        assert.equal((await bot.responder('/rates -alerta -rm 9'))[0],
            "❌ Alert #9 doesn't exist. See the list with /rates -alerta");
        assert.match((await bot.responder('/rates -alerta -rm 1'))[0], /^🗑️ Alert removed: /);
        assert.match((await bot.responder('/rates -alerta'))[0], /^🔔 No alerts in \/rates\./);
    });

    test('/crypto -l, moeda não suportada e /uptime', async () => {
        assert.match((await bot.responder('/crypto -l'))[0], /^🪙 \*SUPPORTED COINS\*\n\n```\n[\s\S]*```\n_\* = enabled_$/);
        assert.match((await bot.responder('/crypto XYZ'))[0], /^❌ Unsupported coin: XYZ\n💡 _Supported: /);
        assert.match((await bot.responder('/uptime'))[0], /^🤖 \*ZapBot .*\*\n━+\n⚡ Online: \*.*\*\n🔐 Connected: \*.*\*$/);
    });

    test('/bills sem membros, /whois e /me', async () => {
        assert.equal((await bot.responder('/bills'))[0], 'Not enough members in the group.');
        assert.match((await bot.responder('/whois'))[0], /^\*Who is it\?\* \(1\)\n• .*owner/);
        assert.equal((await bot.responder('/me -repeat 0 oi'))[0],
            `❌ -repeat needs a number from 1 to ${getSetting('me.maxRepeat')}`);
    });
});
