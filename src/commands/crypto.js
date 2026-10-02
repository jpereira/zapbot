/*
 * Comando /crypto.
 */

const axios = require('axios');

const { priceHandleAlert } = require('../priceAlerts');
const { getCommandSyntax } = require('./base');
const { fmtPriceCrypto } = require('../quotes');
const { dbReady } = require('../db');
const { printError } = require('../log');
const { CRYPTO_SUPPORTED } = require('../currencies');
const { getSetting, setSetting } = require('../settings');

async function cmdCrypto(ctx) {
    const { msg, opts } = ctx;
    await dbReady;

    if (opts.given.has('alerta')) {
        await priceHandleAlert('crypto', ctx);
        return;
    }

    const active = getSetting('crypto.coins');
    const token = (v) => String(v ?? '').trim().toUpperCase().replace(/USDT$/, '');

    if (opts.opt.list) {
        const list = Object.entries(CRYPTO_SUPPORTED)
            .map(([sym, icon]) => `${active.includes(sym) ? '*' : ' '} ${icon} ${sym}`)
            .join('\n');

        await msg.reply('🪙 *MOEDAS SUPORTADAS*\n\n```\n' + list + '\n```\n_* = ativada_');
        return;
    }

    // given: "-a" without a currency counts too (otherwise it would fall into the quote)
    if (opts.given.has('add') || opts.given.has('del')) {
        // Touches the global configuration: bot owner only (and the bot.admins admins)
        if (!ctx.admin) {
            await msg.reply('⛔ Apenas o dono do bot (ou um admin) pode alterar as moedas.');
            return;
        }

        const addAlt = opts.given.has('add');
        const sym = token(addAlt ? opts.opt.add : opts.opt.del);

        if (!sym) {
            await msg.reply('```' + getCommandSyntax('/crypto') + '```');
            return;
        }

        if (addAlt) {
            if (!CRYPTO_SUPPORTED[sym]) {
                await msg.reply(`❌ Moeda não suportada: ${sym}\n💡 _Veja as suportadas com /crypto -l_`);
                return;
            }
            if (active.includes(sym)) {
                await msg.reply(`ℹ️ ${sym} já está ativada.`);
                return;
            }
            await setSetting('crypto.coins', [...active, sym]);
            await msg.reply(`✅ ${CRYPTO_SUPPORTED[sym]} ${sym} adicionada.`);
            return;
        }

        if (!active.includes(sym)) {
            await msg.reply(`ℹ️ ${sym} não está ativada.`);
            return;
        }
        await setSetting('crypto.coins', active.filter(c => c !== sym));
        await msg.reply(`🗑️ ${sym} removida.`);
        return;
    }

    if (!active.length) {
        await msg.reply('ℹ️ Nenhuma moeda ativada.\n💡 _Adicione com /crypto -a <TOKEN>_');
        return;
    }

    try {
        const symbols = active.map(c => `${c}USDT`);

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

        // Keeps the configured order (Binance does not guarantee the response order)
        const coins = data.map(item => ({
            symbol: item.symbol.replace(/USDT$/, ''),
            icon: CRYPTO_SUPPORTED[item.symbol.replace(/USDT$/, '')] || '',
            price: Number(item.lastPrice),
            change: Number(item.priceChangePercent),
            high: Number(item.highPrice),
            low: Number(item.lowPrice),
            volume: Number(item.quoteVolume)
        })).sort((a, b) => active.indexOf(a.symbol) - active.indexOf(b.symbol));

        const topGainer = [...coins].sort((a, b) => b.change - a.change)[0];

        let text = '🚀 *CRYPTO MARKET*\n\n```\n';

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
        text += `🔥 *Top:* ${topGainer.icon} ${topGainer.symbol}\n`;
        text += '🟡 Binance\n';
        text += '⚡ Live Market Data';

        await msg.reply(text);
    } catch (error) {
        printError('/crypto:', error.message);
        await msg.reply('❌ Error fetching crypto prices.');
    }
}

module.exports = {
    cmdCrypto
};
