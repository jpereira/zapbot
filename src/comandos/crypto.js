/*
 * Comando /crypto.
 */

const axios = require('axios');

const { tratarAlertaDePreco } = require('../alertasPreco');
const { getCommandSyntax } = require('./base');
const { fmtPrecoCrypto } = require('../cotacoes');
const { dbPronto } = require('../db');
const { t } = require('../i18n');
const { printError } = require('../log');
const { CRYPTO_SUPPORTED } = require('../moedas');
const { getSetting, setSetting } = require('../settings');

async function cmdCrypto(ctx) {
    const { msg, opts } = ctx;
    await dbPronto;

    if (opts.given.has('alerta')) {
        await tratarAlertaDePreco('crypto', ctx);
        return;
    }

    const ativas = getSetting('crypto.coins');
    const token = (v) => String(v ?? '').trim().toUpperCase().replace(/USDT$/, '');

    if (opts.opt.list) {
        const lista = Object.entries(CRYPTO_SUPPORTED)
            .map(([sym, icon]) => `${ativas.includes(sym) ? '*' : ' '} ${icon} ${sym}`)
            .join('\n');

        await msg.reply(t('crypto.supported', { list: lista }));
        return;
    }

    // given: "-a" sem moeda também conta (senão cairia na cotação)
    if (opts.given.has('add') || opts.given.has('del')) {
        const adicionar = opts.given.has('add');
        const sym = token(adicionar ? opts.opt.add : opts.opt.del);

        if (!sym) {
            await msg.reply('```' + getCommandSyntax('/crypto') + '```');
            return;
        }

        if (adicionar) {
            if (!CRYPTO_SUPPORTED[sym]) {
                await msg.reply(t('crypto.unsupported', { sym }));
                return;
            }
            if (ativas.includes(sym)) {
                await msg.reply(t('crypto.alreadyEnabled', { sym }));
                return;
            }
            await setSetting('crypto.coins', [...ativas, sym]);
            await msg.reply(t('crypto.added', { icon: CRYPTO_SUPPORTED[sym], sym }));
            return;
        }

        if (!ativas.includes(sym)) {
            await msg.reply(t('crypto.notEnabled', { sym }));
            return;
        }
        await setSetting('crypto.coins', ativas.filter(c => c !== sym));
        await msg.reply(t('crypto.removed', { sym }));
        return;
    }

    // Sem argumentos: as moedas ativadas; com argumentos (BTC, "btc eth", "BTC,ETH"): só as pedidas, ativadas ou não
    const pedidas = opts.argv.length
        ? [...new Set(opts.argv.join(' ').split(/[\s,]+/).filter(Boolean).map(token))]
        : ativas;
    const invalidas = pedidas.filter(sym => !CRYPTO_SUPPORTED[sym]);

    if (invalidas.length) {
        await msg.reply(t(invalidas.length === 1 ? 'crypto.unsupportedOne' : 'crypto.unsupportedMany', {
            list: invalidas.join(', '),
            supported: Object.keys(CRYPTO_SUPPORTED).join(', ')
        }));
        return;
    }

    if (!pedidas.length) {
        await msg.reply(t('crypto.noneEnabled'));
        return;
    }

    try {
        const symbols = pedidas.map(c => `${c}USDT`);

        const { data } = await axios.get('https://api.binance.com/api/v3/ticker/24hr', {
            params: { symbols: JSON.stringify(symbols) },
            timeout: 10000
        });

        const fmtPrice = fmtPrecoCrypto;

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

        // Mantém a ordem pedida (ou a configurada; a Binance não garante a ordem da resposta)
        const coins = data.map(item => ({
            symbol: item.symbol.replace(/USDT$/, ''),
            icon: CRYPTO_SUPPORTED[item.symbol.replace(/USDT$/, '')] || '',
            price: Number(item.lastPrice),
            change: Number(item.priceChangePercent),
            high: Number(item.highPrice),
            low: Number(item.lowPrice),
            volume: Number(item.quoteVolume)
        })).sort((a, b) => pedidas.indexOf(a.symbol) - pedidas.indexOf(b.symbol));

        const topGainer = [...coins].sort((a, b) => b.change - a.change)[0];

        let text = t('crypto.title') + '\n```\n';

        for (const c of coins) {
            const priceLine = `💰 $${fmtPrice(c.price)}`.padEnd(14);
            const change = pct(c.change).padStart(10);

            text += `${c.icon} ${c.symbol}\n`;
            text += `    ${priceLine}${change}\n`;
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
