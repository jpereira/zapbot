/*
 * /stocks: Market quotes: currencies, stocks, ETFs and indexes
 */

const { ADMIN, USER } = require('../../roles').ROLES;
const { OPTION_ALERT_MSG, OPTION_ALERT_RM, OPTION_ALERT_TO } = require('./_options');

module.exports = {
    cmd: '/stocks',
    usage: '/stocks [OPTION] [TICKER...]  or  /stocks [TICKER] -alert [rule] [-to <target>]... [-msg <text>]  or  /stocks -alert -rm <num...|all>',
    aliases: [],
    summary: 'Quotes of currencies, stocks, ETFs and indexes',
    help: 'Market quotes in one place: the dollar, euro, pound and USDT against the real (USD, EUR, GBP, USDT) and stocks, ETFs and indexes (Yahoo Finance), with the change since the previous close, open, high and low, and, for stocks, volume and the 52-week range. Without symbols, the enabled ones (setting stocks.symbols: USD, EUR, USDT and MSTR by default); with symbols, only those (e.g. /stocks usd MSTR PETR4.SA). The ticker is the Yahoo Finance one: MSTR, NVDA, PETR4.SA (B3), BRK-B, ^GSPC (S&P 500). For crypto, /crypto.',
    ex: ['/stocks', '/stocks usd eur', '/stocks MSTR NVDA', '/stocks PETR4.SA', '/stocks USD -alert > 5.30', '/stocks MSTR -alert < 90'],
    cmd_opts: [
        {
            opts: ['quiet', 'q'],
            values: [],
            desc: 'Only the prices, one line per symbol (USD R$ 5.4321, MSTR $245.10), with no header, no details and no footer. A symbol that fails shows -.',
            ex: ['/stocks -q', '/stocks -q USD MSTR']
        },
        {
            opts: ['add', 'a'],
            values: ['<SYMBOL>'],
            desc: 'Enables a symbol: USD, EUR, GBP or USDT, or a ticker that exists on Yahoo Finance. Owner (or an admin) only.',
            cron: false,
            role: ADMIN
        },
        {
            opts: ['alert', 'al'],
            values: [],
            desc: 'Without a rule: lists the alerts. With a rule (e.g. USD > 5.30 or MSTR < 90): notifies you in your private chat (or at the -to targets) when the price crosses the value (currencies in reais, stocks in the currency of the asset). The symbol can also come first: /stocks MSTR -alert < 90. Owner (or an admin) only.',
            cron: false
        },
        {
            opts: ['del', 'd'],
            values: ['<SYMBOL>'],
            desc: 'Disables a symbol. Owner (or an admin) only.',
            cron: false,
            role: ADMIN
        },
        { opts: ['list', 'l'], values: [], desc: 'Lists everything it supports: the enabled symbols, the currencies (✅ the enabled ones) and the kinds of ticker, with examples.' },
        OPTION_ALERT_MSG,
        OPTION_ALERT_RM,
        OPTION_ALERT_TO,
        {
            opts: ['tts'],
            values: [],
            desc: 'Speaks the reply as a voice note, with the default voice of /tts. Same as /tts -q {/stocks -q ...}, with only the voice note. The /tts settings (tts.*) apply.',
            ex: ['/stocks -tts'],
            cron: false
        }
    ],
    tts: true,   // -tts: speaks the reply (it is /tts {/stocks -q ...})
    role: USER,
    cron: true
};
