/*
 * Alertas de preço do /cotacao -alerta e do /crypto -alerta.
 */

const axios = require('axios');

const { estado } = require('./estado');
const { findCommand } = require('./comandos/base');
const { COTACAO_TIMEOUT_MS, buscarCotacao, fmtPrecoCrypto, fmtReal, fmtVariacao } = require('./cotacoes');
const { dbAll, dbGet, dbPronto, dbRun } = require('./db');
const { descreverDestino, enviarAoDestino, extrairDestino, resolverOuEscolher } = require('./destinos');
const { printError, printInfo } = require('./log');
const { COTACAO_SUPORTADAS, CRYPTO_SUPPORTED } = require('./moedas');
const { GetOptFromCommand } = require('./opcoes');
const { getSetting } = require('./settings');
const { formatarData, plural } = require('./util/formatar');

/*
 * Alertas de preço: /cotacao -alerta e /crypto -alerta
 *   -alerta                 → lista os alertas do comando, numerados
 *   -alerta USD > 5.30      → avisa no seu privado quando o USD passar de R$ 5,30
 *   -alerta BTC < 90000     → (no /crypto) quando o BTC ficar abaixo de $90.000
 *   -alerta -rm 2 | all     → remove o alerta nº 2 da lista (ou todos)
 *   -alerta BTC > 90000 -to /Grupo L200/  → avisa num grupo (ou num contato,
 *                             -to /Jorge Pereira/, num número, -to +5521999999999,
 *                             ou por e-mail, -to email) em vez do seu privado
 * Cada alerta dispara UMA vez e é removido. A verificação roda a cada
 * 'alerta.intervalMin' minutos. Só o dono cria e remove.
 */
const ALERTA_TIPOS = {
    cotacao: {
        cmd: '/cotacao',
        suportada: (sym) => Boolean(COTACAO_SUPORTADAS[sym]),
        icone: (sym) => COTACAO_SUPORTADAS[sym].icone,
        par: (sym) => `${sym}/BRL`,
        fmt: fmtReal,
        exemplo: 'USD > 5.30',
        precos: async (syms) => Object.fromEntries(
            await Promise.all(syms.map(async sym => [sym, (await buscarCotacao(sym)).atual]))
        )
    },
    crypto: {
        cmd: '/crypto',
        suportada: (sym) => Boolean(CRYPTO_SUPPORTED[sym]),
        icone: (sym) => CRYPTO_SUPPORTED[sym],
        par: (sym) => `${sym}/USDT`,
        fmt: (v) => `$${fmtPrecoCrypto(v)}`,
        exemplo: 'BTC < 90000',
        precos: async (syms) => {
            const { data } = await axios.get('https://api.binance.com/api/v3/ticker/price', {
                params: { symbols: JSON.stringify(syms.map(sym => `${sym}USDT`)) },
                timeout: COTACAO_TIMEOUT_MS
            });
            return Object.fromEntries(data.map(d => [d.symbol.replace(/USDT$/, ''), Number(d.price)]));
        }
    }
};

const OPERADORES = {
    '>': { testar: (preco, alvo) => preco > alvo, texto: 'acima de', icone: '📈' },
    '<': { testar: (preco, alvo) => preco < alvo, texto: 'abaixo de', icone: '📉' }
};

// "5.30", "5,30" ou "90000" (sem separador de milhar)
function lerValorAlerta(texto) {
    const v = Number(String(texto).replace(',', '.'));
    return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Lê "USD > 5.30", "USD>5,30" ou "btc < 90000".
 * @returns {{sym: string, op: string, alvo: number} | null}
 */
function lerRegraAlerta(texto) {
    const m = String(texto).trim().match(/^([a-z0-9]+)\s*([<>])\s*([\d.,]+)$/i);
    if (!m) return null;

    const alvo = lerValorAlerta(m[3]);
    return alvo ? { sym: m[1].toUpperCase(), op: m[2], alvo } : null;
}

const listarAlertas = (kind) =>
    dbAll('SELECT * FROM price_alerts WHERE kind = ? ORDER BY id', [kind]);

// Para onde vai o aviso: o chat ou os e-mails do -to; sem ele (null), o seu privado
function destinoDoAlerta(a) {
    if (a.dest_email) return { email: a.dest_email, nome: a.dest_email, grupo: false };
    return a.dest_id ? { id: a.dest_id, nome: a.dest_name, grupo: Boolean(a.dest_is_group) } : null;
}

function descreverAlerta(kind, a) {
    const t = ALERTA_TIPOS[kind];
    const destino = destinoDoAlerta(a);
    return `${t.icone(a.symbol)} ${t.par(a.symbol)} ${OPERADORES[a.op].texto} *${t.fmt(a.target)}*` +
        (destino ? ` → ${descreverDestino(destino)}` : '');
}

async function tratarAlertaDePreco(kind, { msg, args, admin }) {
    const t = ALERTA_TIPOS[kind];

    /*
     * O -to aceita espaços (/Grupo L200/), que o parser de opções separaria:
     * sai do texto antes, e o resto é lido de novo.
     */
    const { destino: destinoTexto, informado: comDestino, resto } = extrairDestino(args);
    const opts = GetOptFromCommand(resto, findCommand(t.cmd));

    // Os avisos usam a sua conta (no seu privado ou no chat do -to): só o dono (e os admins do bot.admins)
    if (!admin) {
        await msg.reply('⛔ Apenas o dono do bot (ou um admin) pode usar os alertas.');
        return;
    }

    const alertas = await listarAlertas(kind);

    // -rm <nº|all>
    if (opts.given.has('rm')) {
        const alvo = String(opts.opt.rm ?? '').trim().toLowerCase();

        if (alvo === 'all') {
            await dbRun('DELETE FROM price_alerts WHERE kind = ?', [kind]);
            await msg.reply(`🗑️ ${plural(alertas.length, 'alerta removido', 'alertas removidos')}.`);
            return;
        }

        const alerta = /^\d+$/.test(alvo) ? alertas[Number(alvo) - 1] : null;

        if (!alerta) {
            await msg.reply(`❌ Alerta nº ${alvo || '?'} não existe. Veja a lista com ${t.cmd} -alerta`);
            return;
        }

        await dbRun('DELETE FROM price_alerts WHERE id = ?', [alerta.id]);
        await msg.reply(`🗑️ Alerta removido: ${descreverAlerta(kind, alerta)}`);
        return;
    }

    const regraTexto = opts.argv.join(' ').trim();

    if (!regraTexto && comDestino) {
        await msg.reply(`❌ O -to só vale ao criar um alerta: ${t.cmd} -alerta ${t.exemplo} -to /Grupo L200/`);
        return;
    }

    // Sem regra: lista
    if (!regraTexto) {
        if (!alertas.length) {
            await msg.reply(`🔔 Nenhum alerta no ${t.cmd}.\n💡 _Crie com ${t.cmd} -alerta ${t.exemplo}_`);
            return;
        }

        const linhas = alertas.map((a, i) => `${i + 1}. ${descreverAlerta(kind, a)} _(criado ${formatarData(a.created_at)})_`);
        await msg.reply(`🔔 *ALERTAS DE PREÇO* _(${t.cmd})_\n\n${linhas.join('\n')}\n\n` +
            `💡 _Verificados a cada ${plural(getSetting('alerta.intervalMin'), 'minuto', 'minutos')}. Remova com ${t.cmd} -alerta -rm <nº|all>._`);
        return;
    }

    const regra = lerRegraAlerta(regraTexto);

    if (!regra) {
        await msg.reply(`❌ Regra inválida: "${regraTexto}"\n💡 _Formato: ${t.cmd} -alerta ${t.exemplo} (use > ou <; sem separador de milhar)_`);
        return;
    }

    if (!t.suportada(regra.sym)) {
        await msg.reply(`❌ Moeda não suportada: ${regra.sym}\n💡 _Veja as suportadas com ${t.cmd} -l_`);
        return;
    }

    let destino = null;

    if (comDestino) {
        destino = await resolverOuEscolher(msg, destinoTexto, { aceitaEmail: true });
        if (!destino) return;
    }

    const max = getSetting('alerta.max');
    const total = (await dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n;

    if (total >= max) {
        await msg.reply(`❌ Limite de ${max} alertas atingido (setting alerta.max). Remova algum antes.`);
        return;
    }

    let preco;
    try {
        preco = (await t.precos([regra.sym]))[regra.sym];
        if (!Number.isFinite(preco)) throw new Error('sem preço');
    } catch (err) {
        printError(`${t.cmd} -alerta: preço de ${regra.sym}:`, err.message);
        await msg.reply(`⚠️ Não consegui consultar o preço de ${regra.sym} agora. Tente de novo em instantes.`);
        return;
    }

    const op = OPERADORES[regra.op];

    // Já cumprido: dispararia na hora, o que não é o que se quer de um alerta
    if (op.testar(preco, regra.alvo)) {
        await msg.reply(`ℹ️ ${t.par(regra.sym)} já está ${op.texto} ${t.fmt(regra.alvo)}: agora está em *${t.fmt(preco)}*.`);
        return;
    }

    await dbRun(
        `INSERT INTO price_alerts (kind, symbol, op, target, price_at_creation, created_at, dest_id, dest_name, dest_is_group, dest_email)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [kind, regra.sym, regra.op, regra.alvo, preco, Date.now(), destino?.id ?? null, destino?.email ? null : destino?.nome ?? null,
            destino?.grupo ? 1 : 0, destino?.email ?? null]
    );

    await msg.reply(`🔔 *Alerta criado*\n${descreverAlerta(kind, { symbol: regra.sym, op: regra.op, target: regra.alvo })}\n` +
        `💰 Agora: ${t.fmt(preco)}\n` +
        `💡 _Aviso ${destino ? `em ${descreverDestino(destino)}` : 'no seu privado'}; ` +
        `verificação a cada ${plural(getSetting('alerta.intervalMin'), 'minuto', 'minutos')}._`);
}

/*
 * Verificação periódica: um tique por minuto, que só consulta os preços
 * quando passou 'alerta.intervalMin' desde a última vez. Uma consulta por
 * moeda, mesmo com vários alertas nela.
 */
let ultimaVerificacaoAlertas = 0;
let verificandoAlertas = false;

async function verificarAlertasDePreco({ forcar = false } = {}) {
    if (verificandoAlertas || !estado.pronto) return;
    if (!forcar && Date.now() - ultimaVerificacaoAlertas < getSetting('alerta.intervalMin') * 60 * 1000) return;

    verificandoAlertas = true;
    ultimaVerificacaoAlertas = Date.now();

    try {
        await dbPronto;
        const alertas = await dbAll('SELECT * FROM price_alerts ORDER BY id');

        for (const [kind, t] of Object.entries(ALERTA_TIPOS)) {
            const doTipo = alertas.filter(a => a.kind === kind);
            if (!doTipo.length) continue;

            let precos;
            try {
                precos = await t.precos([...new Set(doTipo.map(a => a.symbol))]);
            } catch (err) {
                printError(`Alertas ${t.cmd}: falha ao consultar preços:`, err.message);
                continue;
            }

            for (const a of doTipo) {
                const preco = precos[a.symbol];
                if (!Number.isFinite(preco) || !OPERADORES[a.op].testar(preco, a.target)) continue;

                // Remove ANTES de avisar: se o envio falhar, não repete o aviso a cada verificação
                await dbRun('DELETE FROM price_alerts WHERE id = ?', [a.id]);

                const variacao = fmtVariacao(preco, a.price_at_creation);
                const destino = destinoDoAlerta(a);
                await enviarAoDestino(destino,
                    `🔔 *ALERTA DE PREÇO*\n\n` +
                    `${OPERADORES[a.op].icone} ${t.icone(a.symbol)} *${t.par(a.symbol)}* ficou ${OPERADORES[a.op].texto} ${t.fmt(a.target)}\n` +
                    `💰 Agora: *${t.fmt(preco)}*${variacao ? ` _(${variacao} desde a criação)_` : ''}\n` +
                    `📅 Alerta criado em ${formatarData(a.created_at)}`,
                    { assunto: `🔔 Alerta de preço: ${t.par(a.symbol)} ${OPERADORES[a.op].texto} ${t.fmt(a.target)}` }
                ).catch(err => printError('Alerta de preço: falha ao avisar:', err.message));

                printInfo(`Alerta de preço disparado: ${a.symbol} ${a.op} ${a.target} (agora ${preco})${destino ? ` → ${destino.email ?? destino.id}` : ''}`);
            }
        }
    } catch (err) {
        printError('Erro ao verificar alertas de preço:', err.message);
    } finally {
        verificandoAlertas = false;
    }
}

// Chamada no app.js
function iniciarAlertasDePreco() {
    setInterval(verificarAlertasDePreco, 60 * 1000);
}

module.exports = {
    iniciarAlertasDePreco,
    tratarAlertaDePreco,
    verificarAlertasDePreco
};
