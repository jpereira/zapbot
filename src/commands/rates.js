/*
 * Comando /rates.
 */

const { priceHandleAlert } = require('../priceAlerts');
const { getCommandSyntax } = require('./base');
const { searchQuote, fmtReal, fmtChange } = require('../quotes');
const { dbReady } = require('../db');
const { language, t } = require('../i18n');
const { printError } = require('../log');
const { QUOTE_SUPPORTED } = require('../currencies');
const { getSetting, setSetting } = require('../settings');

async function cmdRates(ctx) {
    const { msg, opts } = ctx;
    await dbReady;

    if (opts.given.has('alert')) {
        await priceHandleAlert('cotacao', ctx);
        return;
    }

    const active = getSetting('rates.coins');

    if (opts.opt.list) {
        const list = Object.entries(QUOTE_SUPPORTED)
            .map(([sym, { icone: iconAlt, nome: nameAlt }]) => `${active.includes(sym) ? '✅' : '▫️'} ${iconAlt} *${sym}* — ${nameAlt}`)
            .join('\n');

        await msg.reply(t('rates.supported', { list: list }));
        return;
    }

    if (opts.given.has('add') || opts.given.has('del')) {
        const addAlt = opts.given.has('add');
        const sym = String((addAlt ? opts.opt.add : opts.opt.del) ?? '').trim().toUpperCase();

        if (!sym) {
            await msg.reply('```' + getCommandSyntax('/rates') + '```');
            return;
        }

        if (!QUOTE_SUPPORTED[sym]) {
            await msg.reply(t('rates.unsupported', { sym }));
            return;
        }

        if (addAlt === active.includes(sym)) {
            await msg.reply(t(addAlt ? 'rates.alreadyEnabled' : 'rates.alreadyDisabled', { sym }));
            return;
        }

        await setSetting('rates.coins', addAlt ? [...active, sym] : active.filter(c => c !== sym));
        await msg.reply(addAlt
            ? t('rates.enabled', { icon: QUOTE_SUPPORTED[sym].icone, sym })
            : t('rates.disabled', { sym }));
        return;
    }

    // Without arguments: the enabled currencies; with arguments: only the requested ones
    const requestedAlt = opts.argv.length
        ? opts.argv.join(' ').toUpperCase().split(/[\s,]+/).filter(Boolean)
        : active;
    const invalid = requestedAlt.filter(m => !QUOTE_SUPPORTED[m]);

    if (invalid.length) {
        await msg.reply(t('rates.unsupportedList', { list: invalid.join(', '), supported: Object.keys(QUOTE_SUPPORTED).join(', ') }));
        return;
    }

    if (!requestedAlt.length) {
        await msg.reply(t('rates.noneEnabled'));
        return;
    }

    const results = await Promise.allSettled(requestedAlt.map(searchQuote));
    const sourcesAlt = new Set();
    let textAlt = t('rates.title') + '\n';

    requestedAlt.forEach((currency, i) => {
        const { icone: iconAlt, nome: nameAlt } = QUOTE_SUPPORTED[currency];
        const r = results[i];

        textAlt += `\n${iconAlt} *${currency}/BRL* _(${nameAlt})_\n`;

        if (r.status === 'rejected') {
            printError(`/rates ${currency}:`, r.reason?.message);
            textAlt += t('rates.unavailable') + '\n';
            return;
        }

        const c = r.value;
        sourcesAlt.add(c.fonte);

        const dayAlt = fmtChange(c.atual, c.fechamento);
        const sinceOpening = fmtChange(c.atual, c.abertura);

        textAlt += `   💰 *${fmtReal(c.atual)}*${dayAlt ? `  ${dayAlt}` : ''}\n`;
        textAlt += `   🔔 ${t('rates.open')}: ${c.abertura ? fmtReal(c.abertura) : '—'}${sinceOpening ? ` _(${t('rates.sinceOpen', { change: sinceOpening })})_` : ''}\n`;
        textAlt += `   🏁 ${t('rates.prevClose')}: ${c.fechamento ? fmtReal(c.fechamento) : '—'}\n`;
        if (c.max && c.min) textAlt += `   ${t('rates.maxMin', { max: fmtReal(c.max), min: fmtReal(c.min) })}\n`;
    });

    const nowAlt = new Date().toLocaleString(language() === 'pt_BR' ? 'pt-BR' : 'en-US', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
    textAlt += `\n🕐 _${nowAlt}${sourcesAlt.size ? ` · ${[...sourcesAlt].join(', ')}` : ''}_\n`;
    textAlt += t('rates.footer');

    await msg.reply(textAlt);
}

module.exports = {
    cmdRates
};
