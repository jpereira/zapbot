/*
 * Comando /crypto.
 */

const axios = require('axios');

const { priceHandleAlert } = require('../priceAlerts');
const { commandUsage } = require('./base');
const { fmtPriceCrypto, fmtBrlCrypto, pricesInBrl } = require('../quotes');
const { dbReady } = require('../db');
const { t } = require('../i18n');
const { printError } = require('../log');
const { CRYPTO_SUPPORTED } = require('../currencies');
const { getSetting, setSetting } = require('../settings');

async function cmdCrypto(ctx) {
    const { msg, opts } = ctx;
    await dbReady;

    if (opts.given.has('alert')) {
        await priceHandleAlert('crypto', ctx);
        return;
    }

    const active = getSetting('crypto.coins');
    const token = (v) => String(v ?? '').trim().toUpperCase().replace(/USDT$/, '');

    if (opts.opt.list) {
        const list = Object.entries(CRYPTO_SUPPORTED)
            .map(([sym, icon]) => `${active.includes(sym) ? '*' : ' '} ${icon} ${sym}`)
            .join('\n');

        await msg.reply(t('crypto.supported', { list: list }));
        return;
    }

    // given: "-a" without a currency counts too (otherwise it would fall into the quote)
    if (opts.given.has('add') || opts.given.has('del')) {
        const addAlt = opts.given.has('add');
        const sym = token(addAlt ? opts.opt.add : opts.opt.del);

        if (!sym) {
            await msg.reply(commandUsage('/crypto'));
            return;
        }

        if (addAlt) {
            if (!CRYPTO_SUPPORTED[sym]) {
                await msg.reply(t('crypto.unsupported', { sym }));
                return;
            }
            if (active.includes(sym)) {
                await msg.reply(t('crypto.alreadyEnabled', { sym }));
                return;
            }
            await setSetting('crypto.coins', [...active, sym]);
            await msg.reply(t('crypto.added', { icon: CRYPTO_SUPPORTED[sym], sym }));
            return;
        }

        if (!active.includes(sym)) {
            await msg.reply(t('crypto.notEnabled', { sym }));
            return;
        }
        await setSetting('crypto.coins', active.filter(c => c !== sym));
        await msg.reply(t('crypto.removed', { sym }));
        return;
    }

    // Without arguments: the enabled currencies; with arguments (BTC, "btc eth", "BTC,ETH"): only the requested ones, enabled or not
    const requestedAlt = opts.argv.length
        ? [...new Set(opts.argv.join(' ').split(/[\s,]+/).filter(Boolean).map(token))]
        : active;
    const invalid = requestedAlt.filter(sym => !CRYPTO_SUPPORTED[sym]);

    if (invalid.length) {
        await msg.reply(t(invalid.length === 1 ? 'crypto.unsupportedOne' : 'crypto.unsupportedMany', {
            list: invalid.join(', '),
            supported: Object.keys(CRYPTO_SUPPORTED).join(', ')
        }));
        return;
    }

    if (!requestedAlt.length) {
        await msg.reply(t('crypto.noneEnabled'));
        return;
    }

    try {
        const symbols = requestedAlt.map(c => `${c}USDT`);

        const { data } = await axios.get('https://api.binance.com/api/v3/ticker/24hr', {
            params: { symbols: JSON.stringify(symbols) },
            timeout: 10000
        });

        const fmtPrice = fmtPriceCrypto;

        const fmtVolume = (value) => {
            const n = Number(value);
            if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
            if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
            if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
            return `$${n.toFixed(2)}`;
        };

        const pct = (value) => {
            const n = Number(value);
            return `${n >= 0 ? '🟢' : '🔴'} ${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
        };

        // Keeps the requested order (or the configured one; Binance does not guarantee the response order)
        const coins = data.map(item => ({
            symbol: item.symbol.replace(/USDT$/, ''),
            icon: CRYPTO_SUPPORTED[item.symbol.replace(/USDT$/, '')] || '',
            price: Number(item.lastPrice),
            change: Number(item.priceChangePercent),
            high: Number(item.highPrice),
            low: Number(item.lowPrice),
            volume: Number(item.quoteVolume)
        })).sort((a, b) => requestedAlt.indexOf(a.symbol) - requestedAlt.indexOf(b.symbol));

        const topGainer = [...coins].sort((a, b) => b.change - a.change)[0];

        // In brl: one line per currency (the crypto.brl setting turns it off); if Binance fails, the dollar comes out alone
        const brl = getSetting('crypto.brl') ? await pricesInBrl(Object.fromEntries(coins.map((c) => [c.symbol, c.price]))) : {};

        let text = t('crypto.title') + '\n```\n';

        for (const c of coins) {
            const priceLine = `💰 $${fmtPrice(c.price)}`.padEnd(14);
            const change = pct(c.change).padStart(10);

            text += `${c.icon} ${c.symbol}\n`;
            text += `    ${priceLine}${change}\n`;
            if (brl[c.symbol]) text += `    🇧🇷 ${fmtBrlCrypto(brl[c.symbol])}\n`;
            text += `    📈 $${fmtPrice(c.high)}\n`;
            text += `    📉 $${fmtPrice(c.low)}\n`;
            text += `    📊 ${fmtVolume(c.volume)}\n\n`;
        }

        text += '```';
        text += t('crypto.top', { icon: topGainer.icon, symbol: topGainer.symbol }) + '\n';
        text += '🟡 Binance\n';
        text += '⚡ Live Market Data';

        await msg.reply(text);
    } catch (error) {
        printError('/crypto:', error.message);
        await msg.reply(t('crypto.failed'));
    }
}

module.exports = {
    cmdCrypto
};
