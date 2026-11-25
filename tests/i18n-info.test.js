/*
 * i18n (en_US) of the information commands: /stocks, /crypto, price alerts, /bills, /whois, /me,
 * /status of /bot and /uptime. No network. The other tests run in pt_BR.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { network } = bot;
const { getSetting, setSetting } = bot.src('settings');

beforeEach(async () => {
    await bot.restart();
    await setSetting('zapbot.lang', 'en_US');
});

describe('en_US: informação', () => {
    test('/stocks -l e a habilitação de moedas', async () => {
        const [list] = await bot.replyAlt('/stocks -l');
        assert.match(list, /^📈 \*Enabled symbols\*\n\n• 🇺🇸 USD — Dollar\n/);
        assert.match(list, /💱 \*Currencies against the real\* \(✅ enabled\)\n🇺🇸 USD — Dollar ✅\n🇪🇺 EUR — Euro ✅\n🇬🇧 GBP — Pound\n🪙 USDT — Tether ✅/);
        assert.match(list, /🏢 \*Stocks, ETFs and indexes\*[^]*PETR4\.SA[^]*\^GSPC[^]*EURUSD=X/);

        assert.equal((await bot.replyAlt('/stocks -a GBP'))[0], '✅ GBP (Pound) enabled.');
        assert.equal((await bot.replyAlt('/stocks -a GBP'))[0], 'ℹ️ GBP is already enabled.');
        network.responder('get', 'query1.finance.yahoo.com', Object.assign(new Error('404'), { response: { status: 404 } }));
        assert.match((await bot.replyAlt('/stocks -a XYZ'))[0], /^❌ Ticker not found on Yahoo Finance: XYZ/);
    });

    test('/stocks com cotação simulada: números no formato do idioma', async () => {
        network.responder('get', 'query1.finance.yahoo.com', () => ({
            chart: {
                result: [{
                    meta: { regularMarketPrice: 5.2, regularMarketDayHigh: 5.3, regularMarketDayLow: 5.1 },
                    indicators: { quote: [{ open: [5, 5.1], close: [5.1, 5.2], high: [5.2, 5.3], low: [5, 5.1] }] }
                }]
            }
        }));

        const [r] = await bot.replyAlt('/stocks usd');
        assert.match(r, /^📈 \*MARKETS\*\n/);
        assert.match(r, /💰 \*R\$ 5\.2000\*/);
        assert.match(r, /🏁 Previous close: R\$ 5\.1000/);
        assert.match(r, /💡 _% next to the value: change since the previous close\. Stock quotes can be delayed\._$/);
    });

    test('alertas de preço: criar, listar e remover', async () => {
        network.responder('get', 'query1.finance.yahoo.com', () => ({
            chart: {
                result: [{
                    meta: { regularMarketPrice: 5.2 },
                    indicators: { quote: [{ open: [5, 5.1], close: [5.1, 5.2], high: [5.2, 5.3], low: [5, 5.1] }] }
                }]
            }
        }));

        const [created] = await bot.replyAlt('/stocks -alert USD > 5.30');
        assert.match(created, /^🔔 \*Alert created\*\n/);
        assert.match(created, /\n   📨 your private chat\n💰 Now: R\$ 5\.2000\n💡 _Checked every \d+ minutes?\._$/);

        assert.match((await bot.replyAlt('/stocks -alert'))[0], /^🔔 \*PRICE ALERTS\* _\(\/stocks · every \d+ minutes?\)_\n\n1\. [^]*💡 _-alert -rm <num\.\.\.\|all> removes_$/);
        assert.equal((await bot.replyAlt('/stocks -alert -rm 9'))[0],
            "❌ Alert #9 doesn't exist. See the list with /stocks -alert");
        assert.match((await bot.replyAlt('/stocks -alert -rm 1'))[0], /^🗑️ Alert removed: /);
        assert.match((await bot.replyAlt('/stocks -alert'))[0], /^🔔 No alerts in \/stocks\./);
    });

    test('/crypto -l, moeda não suportada e /uptime', async () => {
        assert.match((await bot.replyAlt('/crypto -l'))[0], /^🪙 \*SUPPORTED COINS\*\n\n```\n[\s\S]*```\n_\* = enabled_$/);
        assert.match((await bot.replyAlt('/crypto XYZ'))[0], /^❌ Unsupported coin: XYZ\n💡 _Supported: /);
        assert.match((await bot.replyAlt('/uptime'))[0], /^🤖 \*ZapBot .*\*\n━+\n⚡ Online: \*.*\*\n🔐 Connected: \*.*\*$/);
    });

    test('/bills sem membros, /whois e /me', async () => {
        assert.equal((await bot.replyAlt('/bills'))[0], 'Not enough members in the group.');
        assert.match((await bot.replyAlt('/whois'))[0], /^\*Who is it\?\* \(1\)\n• .*owner/);
        assert.equal((await bot.replyAlt('/me -r 0 oi'))[0],
            `❌ -repeat needs a number from 1 to ${getSetting('me.maxRepeat')}`);
    });
});
