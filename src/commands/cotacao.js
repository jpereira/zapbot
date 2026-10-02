/*
 * Comando /cotacao.
 */

const { priceHandleAlert } = require('../priceAlerts');
const { getCommandSyntax } = require('./base');
const { searchQuote, fmtReal, fmtChange } = require('../quotes');
const { dbReady } = require('../db');
const { printError } = require('../log');
const { QUOTE_SUPPORTED } = require('../currencies');
const { getSetting, setSetting } = require('../settings');

async function cmdQuote(ctx) {
    const { msg, opts } = ctx;
    await dbReady;

    if (opts.given.has('alerta')) {
        await priceHandleAlert('cotacao', ctx);
        return;
    }

    const active = getSetting('cotacao.coins');

    if (opts.opt.list) {
        const list = Object.entries(QUOTE_SUPPORTED)
            .map(([sym, { icone: iconAlt, nome: nameAlt }]) => `${active.includes(sym) ? '✅' : '▫️'} ${iconAlt} *${sym}* — ${nameAlt}`)
            .join('\n');

        await msg.reply('💱 *MOEDAS SUPORTADAS* _(contra o real)_\n\n' + list +
            '\n\n_✅ = habilitada (aparece no /cotacao)_\n💡 _/cotacao -a <MOEDA> habilita, /cotacao -d <MOEDA> desabilita._');
        return;
    }

    if (opts.given.has('add') || opts.given.has('del')) {
        // Touches the global configuration: bot owner only (and the bot.admins admins)
        if (!ctx.admin) {
            await msg.reply('⛔ Apenas o dono do bot (ou um admin) pode alterar as moedas.');
            return;
        }

        const addAlt = opts.given.has('add');
        const sym = String((addAlt ? opts.opt.add : opts.opt.del) ?? '').trim().toUpperCase();

        if (!sym) {
            await msg.reply('```' + getCommandSyntax('/cotacao') + '```');
            return;
        }

        if (!QUOTE_SUPPORTED[sym]) {
            await msg.reply(`❌ Moeda não suportada: ${sym}\n💡 _Veja as suportadas com /cotacao -l_`);
            return;
        }

        if (addAlt === active.includes(sym)) {
            await msg.reply(`ℹ️ ${sym} já está ${addAlt ? 'habilitada' : 'desabilitada'}.`);
            return;
        }

        await setSetting('cotacao.coins', addAlt ? [...active, sym] : active.filter(c => c !== sym));
        await msg.reply(addAlt
            ? `✅ ${QUOTE_SUPPORTED[sym].icone} ${sym} habilitada.`
            : `🗑️ ${sym} desabilitada.`);
        return;
    }

    // Without arguments: the enabled currencies; with arguments: only the requested ones
    const requestedAlt = opts.argv.length
        ? opts.argv.join(' ').toUpperCase().split(/[\s,]+/).filter(Boolean)
        : active;
    const invalid = requestedAlt.filter(m => !QUOTE_SUPPORTED[m]);

    if (invalid.length) {
        await msg.reply(`❌ Moeda não suportada: ${invalid.join(', ')}\n💡 _Suportadas: ${Object.keys(QUOTE_SUPPORTED).join(', ')}_`);
        return;
    }

    if (!requestedAlt.length) {
        await msg.reply('ℹ️ Nenhuma moeda habilitada.\n💡 _Habilite com /cotacao -a <MOEDA> (veja /cotacao -l)._');
        return;
    }

    const results = await Promise.allSettled(requestedAlt.map(searchQuote));
    const sourcesAlt = new Set();
    let textAlt = '💱 *COTAÇÕES* _(em reais)_\n';

    requestedAlt.forEach((currency, i) => {
        const { icone: iconAlt, nome: nameAlt } = QUOTE_SUPPORTED[currency];
        const r = results[i];

        textAlt += `\n${iconAlt} *${currency}/BRL* _(${nameAlt})_\n`;

        if (r.status === 'rejected') {
            printError(`/cotacao ${currency}:`, r.reason?.message);
            textAlt += '   ⚠️ _Cotação indisponível agora._\n';
            return;
        }

        const c = r.value;
        sourcesAlt.add(c.fonte);

        const dayAlt = fmtChange(c.atual, c.fechamento);
        const sinceOpening = fmtChange(c.atual, c.abertura);

        textAlt += `   💰 *${fmtReal(c.atual)}*${dayAlt ? `  ${dayAlt}` : ''}\n`;
        textAlt += `   🔔 Abertura: ${c.abertura ? fmtReal(c.abertura) : '—'}${sinceOpening ? ` _(${sinceOpening} desde a abertura)_` : ''}\n`;
        textAlt += `   🏁 Fechamento anterior: ${c.fechamento ? fmtReal(c.fechamento) : '—'}\n`;
        if (c.max && c.min) textAlt += `   📈 Máx: ${fmtReal(c.max)}  📉 Mín: ${fmtReal(c.min)}\n`;
    });

    const nowAlt = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
    textAlt += `\n🕐 _${nowAlt}${sourcesAlt.size ? ` · ${[...sourcesAlt].join(', ')}` : ''}_\n`;
    textAlt += '💡 _% ao lado do valor: variação desde o fechamento anterior._';

    await msg.reply(textAlt);
}

module.exports = {
    cmdQuote
};
