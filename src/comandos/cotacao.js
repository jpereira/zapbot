/*
 * Comando /cotacao.
 */

const { tratarAlertaDePreco } = require('../alertasPreco');
const { getCommandSyntax } = require('./base');
const { buscarCotacao, fmtReal, fmtVariacao } = require('../cotacoes');
const { dbPronto } = require('../db');
const { printError } = require('../log');
const { COTACAO_SUPORTADAS } = require('../moedas');
const { getSetting, setSetting } = require('../settings');

async function cmdCotacao(ctx) {
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

        await msg.reply('💱 *MOEDAS SUPORTADAS* _(contra o real)_\n\n' + lista +
            '\n\n_✅ = habilitada (aparece no /cotacao)_\n💡 _/cotacao -a <MOEDA> habilita, /cotacao -d <MOEDA> desabilita._');
        return;
    }

    if (opts.given.has('add') || opts.given.has('del')) {
        // Mexe na configuração global: só o dono do bot (e os admins do bot.admins)
        if (!ctx.admin) {
            await msg.reply('⛔ Apenas o dono do bot (ou um admin) pode alterar as moedas.');
            return;
        }

        const adicionar = opts.given.has('add');
        const sym = String((adicionar ? opts.opt.add : opts.opt.del) ?? '').trim().toUpperCase();

        if (!sym) {
            await msg.reply('```' + getCommandSyntax('/cotacao') + '```');
            return;
        }

        if (!COTACAO_SUPORTADAS[sym]) {
            await msg.reply(`❌ Moeda não suportada: ${sym}\n💡 _Veja as suportadas com /cotacao -l_`);
            return;
        }

        if (adicionar === ativas.includes(sym)) {
            await msg.reply(`ℹ️ ${sym} já está ${adicionar ? 'habilitada' : 'desabilitada'}.`);
            return;
        }

        await setSetting('cotacao.coins', adicionar ? [...ativas, sym] : ativas.filter(c => c !== sym));
        await msg.reply(adicionar
            ? `✅ ${COTACAO_SUPORTADAS[sym].icone} ${sym} habilitada.`
            : `🗑️ ${sym} desabilitada.`);
        return;
    }

    // Sem argumentos: as moedas habilitadas; com argumentos: só as pedidas
    const pedidas = opts.argv.length
        ? opts.argv.join(' ').toUpperCase().split(/[\s,]+/).filter(Boolean)
        : ativas;
    const invalidas = pedidas.filter(m => !COTACAO_SUPORTADAS[m]);

    if (invalidas.length) {
        await msg.reply(`❌ Moeda não suportada: ${invalidas.join(', ')}\n💡 _Suportadas: ${Object.keys(COTACAO_SUPORTADAS).join(', ')}_`);
        return;
    }

    if (!pedidas.length) {
        await msg.reply('ℹ️ Nenhuma moeda habilitada.\n💡 _Habilite com /cotacao -a <MOEDA> (veja /cotacao -l)._');
        return;
    }

    const resultados = await Promise.allSettled(pedidas.map(buscarCotacao));
    const fontes = new Set();
    let texto = '💱 *COTAÇÕES* _(em reais)_\n';

    pedidas.forEach((moeda, i) => {
        const { icone, nome } = COTACAO_SUPORTADAS[moeda];
        const r = resultados[i];

        texto += `\n${icone} *${moeda}/BRL* _(${nome})_\n`;

        if (r.status === 'rejected') {
            printError(`/cotacao ${moeda}:`, r.reason?.message);
            texto += '   ⚠️ _Cotação indisponível agora._\n';
            return;
        }

        const c = r.value;
        fontes.add(c.fonte);

        const doDia = fmtVariacao(c.atual, c.fechamento);
        const desdeAbertura = fmtVariacao(c.atual, c.abertura);

        texto += `   💰 *${fmtReal(c.atual)}*${doDia ? `  ${doDia}` : ''}\n`;
        texto += `   🔔 Abertura: ${c.abertura ? fmtReal(c.abertura) : '—'}${desdeAbertura ? ` _(${desdeAbertura} desde a abertura)_` : ''}\n`;
        texto += `   🏁 Fechamento anterior: ${c.fechamento ? fmtReal(c.fechamento) : '—'}\n`;
        if (c.max && c.min) texto += `   📈 Máx: ${fmtReal(c.max)}  📉 Mín: ${fmtReal(c.min)}\n`;
    });

    const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
    texto += `\n🕐 _${agora}${fontes.size ? ` · ${[...fontes].join(', ')}` : ''}_\n`;
    texto += '💡 _% ao lado do valor: variação desde o fechamento anterior._';

    await msg.reply(texto);
}

module.exports = {
    cmdCotacao
};
