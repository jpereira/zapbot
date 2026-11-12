/*
 * Alertas de preço do /rates -alerta e do /crypto -alerta.
 */

const axios = require('axios');

const { estado } = require('./estado');
const { findCommand } = require('./comandos/base');
const { COTACAO_TIMEOUT_MS, buscarCotacao, fmtPrecoCrypto, fmtReal, fmtVariacao } = require('./cotacoes');
const { dbAll, dbGet, dbPronto, dbRun } = require('./db');
const {
    colunasDoDestino, descreverDestinos, destinoDaLinha, destinosSalvos, enviarAosDestinos, extrairDestinos,
    recipientsDe, resolverDestinos
} = require('./destinos');
const { printError, printInfo } = require('./log');
const { COTACAO_SUPORTADAS, CRYPTO_SUPPORTED } = require('./moedas');
const { t } = require('./i18n');
const { GetOptFromCommand } = require('./opcoes');
const { getSetting } = require('./settings');
const { formatarData, plural } = require('./util/formatar');

/*
 * Alertas de preço: /rates -alerta e /crypto -alerta
 *   -alerta                 → lista os alertas do comando, numerados
 *   -alerta USD > 5.30      → avisa no seu privado quando o USD passar de R$ 5,30
 *   -alerta BTC < 90000     → (no /crypto) quando o BTC ficar abaixo de $90.000
 *   BTC -alerta > 90000     → o mesmo, com a moeda antes do -alerta
 *   -alerta -rm 2 | all     → remove o alerta nº 2 da lista (ou todos); -rm 1 2 3 remove vários
 *   -alerta BTC > 90000 -to /Grupo L200/  → avisa num grupo (ou num contato,
 *                             -to /Jorge Pereira/, num número, -to +5521999999999,
 *                             ou por e-mail, -to email) em vez do seu privado;
 *                             repita o -to para avisar em vários
 *   -alerta BTC > 90000 -msg Hora de vender!  → o texto vai no início do aviso; o
 *                             -msg vai até o fim (o texto só não pode ter um " -to " solto)
 * Cada alerta dispara UMA vez e é removido. A verificação roda a cada
 * 'alerta.intervalMin' minutos. Só o dono cria e remove.
 */
const ALERTA_TIPOS = {
    cotacao: {
        cmd: '/rates',
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
    '>': { testar: (preco, alvo) => preco > alvo, get texto() { return t('alerts.above'); }, icone: '📈' },
    '<': { testar: (preco, alvo) => preco < alvo, get texto() { return t('alerts.below'); }, icone: '📉' }
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

// Para onde vai o aviso: os chats ou os e-mails dos -to; sem eles ([]), o seu privado
const destinosDoAlerta = (a) => destinosSalvos(a.recipients, destinoDaLinha(a));

/*
 * "-msg <texto>": do -msg até o fim, com espaços e o que mais vier (o -to já
 * saiu antes, então ele pode vir depois do -msg).
 */
const MENSAGEM = /(^|\s)-msg(?=\s|$)([\s\S]*)$/;

function extrairMensagem(texto) {
    const m = texto.match(MENSAGEM);
    if (!m) return { mensagem: null, informado: false, resto: texto };
    const resto = texto.slice(0, m.index).trim();
    return { mensagem: m[2].trim() || null, informado: true, resto };
}

// A mensagem do -msg, recuada embaixo do alerta (na lista e na confirmação)
const linhaDaMensagem = (a) => (a.message ? `\n   💬 ${a.message.replace(/\n/g, '\n   ')}` : '');

function descreverAlerta(kind, a) {
    const tipo = ALERTA_TIPOS[kind];
    const destinos = destinosDoAlerta(a);
    return `${tipo.icone(a.symbol)} ${tipo.par(a.symbol)} ${OPERADORES[a.op].texto} *${tipo.fmt(a.target)}*` +
        (destinos.length ? ` → ${descreverDestinos(destinos)}` : '');
}

async function tratarAlertaDePreco(kind, { msg, args, admin }) {
    const tipo = ALERTA_TIPOS[kind];

    /*
     * Destinos e mensagem são extraídos antes da regra de preço, preservando
     * todos os -to e o texto livre do -msg.
     */
    const { destinos: destinosTexto, informado: comDestino, resto: semDestino } =
        extrairDestinos(args);
    const { mensagem, informado: comMensagem, resto } = extrairMensagem(semDestino);
    const opts = GetOptFromCommand(resto, findCommand(tipo.cmd));

    // Os avisos usam a sua conta (no seu privado ou nos chats do -to): só o dono e os admins
    if (!admin) {
        await msg.reply(t('alerts.ownerOnly'));
        return;
    }

    const alertas = await listarAlertas(kind);

    // -rm <nº...|all>: -rm 2, -rm 1 2 3 ou -rm 1,3 (os nºs da lista). Algum não existe? Nenhum sai,
    // que remover pela metade é pior que não remover
    if (opts.given.has('rm')) {
        const partes = [opts.opt.rm, ...opts.argv].join(' ').toLowerCase()
            .split(/[\s,]+/).filter(Boolean);

        if (partes.includes('all')) {
            await dbRun('DELETE FROM price_alerts WHERE kind = ?', [kind]);
            await msg.reply(t('alerts.removedAll', { count: plural(alertas.length, t('alerts.removedOne'), t('alerts.removedMany')) }));
            return;
        }

        const numeros = [...new Set(partes)].sort((a, b) => a - b);
        const faltando = numeros.filter(n => !/^\d+$/.test(n) || !alertas[Number(n) - 1]);

        if (!numeros.length || faltando.length) {
            await msg.reply(faltando.length > 1
                ? t('alerts.notFoundMany', { list: faltando.join(', '), cmd: tipo.cmd })
                : t('alerts.notFoundOne', { n: faltando[0] ?? '?', cmd: tipo.cmd }));
            return;
        }

        const removidos = numeros.map(n => alertas[Number(n) - 1]);
        for (const a of removidos) await dbRun('DELETE FROM price_alerts WHERE id = ?', [a.id]);
        await msg.reply(removidos.length === 1
            ? t('alerts.removedOneDone', { alert: descreverAlerta(kind, removidos[0]) })
            : t('alerts.removedManyDone', { n: removidos.length }) + '\n' +
              removidos.map(a => `• ${descreverAlerta(kind, a)}`).join('\n'));
        return;
    }

    const regraTexto = opts.argv.join(' ').trim();

    if (!regraTexto && comDestino) {
        await msg.reply(t('alerts.toOnlyCreate', { cmd: tipo.cmd, example: tipo.exemplo }));
        return;
    }

    if (!regraTexto && comMensagem) {
        await msg.reply(t('alerts.msgOnlyCreate', { cmd: tipo.cmd, example: tipo.exemplo }));
        return;
    }

    if (comMensagem && !mensagem) {
        await msg.reply(t('alerts.msgEmpty', { cmd: tipo.cmd, example: tipo.exemplo }));
        return;
    }

    // Sem regra: lista
    if (!regraTexto) {
        if (!alertas.length) {
            await msg.reply(t('alerts.none', { cmd: tipo.cmd, example: tipo.exemplo }));
            return;
        }

        const linhas = alertas.map((a, i) => t('alerts.listItem', { n: i + 1, alert: descreverAlerta(kind, a), date: formatarData(a.created_at) }) +
            linhaDaMensagem(a));
        await msg.reply(t('alerts.list', {
            cmd: tipo.cmd,
            items: linhas.join('\n'),
            every: plural(getSetting('alerta.intervalMin'), t('alerts.minute'), t('alerts.minutes'))
        }));
        return;
    }

    const regra = lerRegraAlerta(regraTexto);

    if (!regra) {
        await msg.reply(t('alerts.invalidRule', { rule: regraTexto, cmd: tipo.cmd, example: tipo.exemplo }));
        return;
    }

    if (!tipo.suportada(regra.sym)) {
        await msg.reply(t('alerts.unsupported', { sym: regra.sym, cmd: tipo.cmd }));
        return;
    }

    // Vários -to: um alerta só, que avisa em todos
    let destinos = [];

    if (comDestino) {
        destinos = await resolverDestinos(msg, destinosTexto, { aceitaEmail: true });
        if (!destinos) return;
    }

    const max = getSetting('alerta.max');
    const total = (await dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n;

    if (total >= max) {
        await msg.reply(t('alerts.limit', { max }));
        return;
    }

    let preco;
    try {
        preco = (await tipo.precos([regra.sym]))[regra.sym];
        if (!Number.isFinite(preco)) throw new Error('sem preço');
    } catch (err) {
        printError(`${tipo.cmd} -alerta: preço de ${regra.sym}:`, err.message);
        await msg.reply(t('alerts.priceFailed', { sym: regra.sym }));
        return;
    }

    const op = OPERADORES[regra.op];

    // Já cumprido: dispararia na hora, o que não é o que se quer de um alerta
    if (op.testar(preco, regra.alvo)) {
        await msg.reply(t('alerts.alreadyMet', { pair: tipo.par(regra.sym), op: op.texto, target: tipo.fmt(regra.alvo), price: tipo.fmt(preco) }));
        return;
    }

    const c = colunasDoDestino(destinos[0]);
    await dbRun(
        `INSERT INTO price_alerts (kind, symbol, op, target, price_at_creation, created_at, dest_id, dest_name, dest_is_group, dest_email,
            recipients, message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [kind, regra.sym, regra.op, regra.alvo, preco, Date.now(), c.dest_id, c.dest_name, c.dest_is_group, c.dest_email,
            recipientsDe(destinos), mensagem]
    );

    await msg.reply(t('alerts.created', {
        alert: descreverAlerta(kind, { symbol: regra.sym, op: regra.op, target: regra.alvo }) +
            linhaDaMensagem({ message: mensagem }),
        price: tipo.fmt(preco),
        where: destinos.length ? t('alerts.whereIn', { dest: descreverDestinos(destinos) }) : t('alerts.wherePrivate'),
        every: plural(getSetting('alerta.intervalMin'), t('alerts.minute'), t('alerts.minutes'))
    }));
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

        for (const [kind, tipo] of Object.entries(ALERTA_TIPOS)) {
            const doTipo = alertas.filter(a => a.kind === kind);
            if (!doTipo.length) continue;

            let precos;
            try {
                precos = await tipo.precos([...new Set(doTipo.map(a => a.symbol))]);
            } catch (err) {
                printError(`Alertas ${tipo.cmd}: falha ao consultar preços:`, err.message);
                continue;
            }

            for (const a of doTipo) {
                const preco = precos[a.symbol];
                if (!Number.isFinite(preco) || !OPERADORES[a.op].testar(preco, a.target)) continue;

                // Remove ANTES de avisar: se o envio falhar, não repete o aviso a cada verificação
                await dbRun('DELETE FROM price_alerts WHERE id = ?', [a.id]);

                const variacao = fmtVariacao(preco, a.price_at_creation);
                const destinos = destinosDoAlerta(a);
                // A mensagem do -msg vem antes de tudo
                await enviarAosDestinos(destinos,
                    (a.message ? `${a.message}\n\n` : '') +
                    t('alerts.fired', {
                        opIcon: OPERADORES[a.op].icone,
                        icon: tipo.icone(a.symbol),
                        pair: tipo.par(a.symbol),
                        op: OPERADORES[a.op].texto,
                        target: tipo.fmt(a.target),
                        price: tipo.fmt(preco),
                        change: variacao ? t('alerts.sinceCreation', { change: variacao }) : '',
                        date: formatarData(a.created_at)
                    }),
                    { assunto: t('alerts.subject', { pair: tipo.par(a.symbol), op: OPERADORES[a.op].texto, target: tipo.fmt(a.target) }) }
                ).catch(err => printError('Alerta de preço: falha ao avisar:', err.message));

                printInfo(`Alerta de preço disparado: ${a.symbol} ${a.op} ${a.target} (agora ${preco})` +
                    (destinos.length ? ` → ${destinos.map(d => d.email ?? d.id).join(', ')}` : ''));
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
    extrairMensagem,
    iniciarAlertasDePreco,
    tratarAlertaDePreco,
    verificarAlertasDePreco
};
