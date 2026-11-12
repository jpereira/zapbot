/*
 * Comando /rates.
 */

const { tratarAlertaDePreco } = require('../alertasPreco');
const { getCommandSyntax } = require('./base');
const { buscarCotacao, fmtReal, fmtVariacao } = require('../cotacoes');
const { dbPronto } = require('../db');
const { idioma, t } = require('../i18n');
const { printError } = require('../log');
const { COTACAO_SUPORTADAS } = require('../moedas');
const { getSetting, setSetting } = require('../settings');

async function cmdRates(ctx) {
    const { msg, opts } = ctx;
    await dbPronto;

    if (opts.given.has('alerta')) {
        await tratarAlertaDePreco('cotacao', ctx);
        return;
    }

    const ativas = getSetting('cotacao.coins');

    if (opts.opt.list) {
        const lista = Object.entries(COTACAO_SUPORTADAS)
            .map(([sym, { icone, nome }]) => `${ativas.includes(sym) ? '✅' : '▫️'} ${icone} *${sym}* — ${nome}`)
            .join('\n');

        await msg.reply(t('rates.supported', { list: lista }));
        return;
    }

    if (opts.given.has('add') || opts.given.has('del')) {
        const adicionar = opts.given.has('add');
        const sym = String((adicionar ? opts.opt.add : opts.opt.del) ?? '').trim().toUpperCase();

        if (!sym) {
            await msg.reply('```' + getCommandSyntax('/rates') + '```');
            return;
        }

        if (!COTACAO_SUPORTADAS[sym]) {
            await msg.reply(t('rates.unsupported', { sym }));
            return;
        }

        if (adicionar === ativas.includes(sym)) {
            await msg.reply(t(adicionar ? 'rates.alreadyEnabled' : 'rates.alreadyDisabled', { sym }));
            return;
        }

        await setSetting('cotacao.coins', adicionar ? [...ativas, sym] : ativas.filter(c => c !== sym));
        await msg.reply(adicionar
            ? t('rates.enabled', { icon: COTACAO_SUPORTADAS[sym].icone, sym })
            : t('rates.disabled', { sym }));
        return;
    }

    // Sem argumentos: as moedas habilitadas; com argumentos: só as pedidas
    const pedidas = opts.argv.length
        ? opts.argv.join(' ').toUpperCase().split(/[\s,]+/).filter(Boolean)
        : ativas;
    const invalidas = pedidas.filter(m => !COTACAO_SUPORTADAS[m]);

    if (invalidas.length) {
        await msg.reply(t('rates.unsupportedList', { list: invalidas.join(', '), supported: Object.keys(COTACAO_SUPORTADAS).join(', ') }));
        return;
    }

    if (!pedidas.length) {
        await msg.reply(t('rates.noneEnabled'));
        return;
    }

    const resultados = await Promise.allSettled(pedidas.map(buscarCotacao));
    const fontes = new Set();
    let texto = t('rates.title') + '\n';

    pedidas.forEach((moeda, i) => {
        const { icone, nome } = COTACAO_SUPORTADAS[moeda];
        const r = resultados[i];

        texto += `\n${icone} *${moeda}/BRL* _(${nome})_\n`;

        if (r.status === 'rejected') {
            printError(`/rates ${moeda}:`, r.reason?.message);
            texto += t('rates.unavailable') + '\n';
            return;
        }

        const c = r.value;
        fontes.add(c.fonte);

        const doDia = fmtVariacao(c.atual, c.fechamento);
        const desdeAbertura = fmtVariacao(c.atual, c.abertura);

        texto += `   💰 *${fmtReal(c.atual)}*${doDia ? `  ${doDia}` : ''}\n`;
        texto += `   🔔 ${t('rates.open')}: ${c.abertura ? fmtReal(c.abertura) : '—'}${desdeAbertura ? ` _(${t('rates.sinceOpen', { change: desdeAbertura })})_` : ''}\n`;
        texto += `   🏁 ${t('rates.prevClose')}: ${c.fechamento ? fmtReal(c.fechamento) : '—'}\n`;
        if (c.max && c.min) texto += `   ${t('rates.maxMin', { max: fmtReal(c.max), min: fmtReal(c.min) })}\n`;
    });

    const agora = new Date().toLocaleString(idioma() === 'pt_BR' ? 'pt-BR' : 'en-US', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
    texto += `\n🕐 _${agora}${fontes.size ? ` · ${[...fontes].join(', ')}` : ''}_\n`;
    texto += t('rates.footer');

    await msg.reply(texto);
}

module.exports = {
    cmdRates
};
