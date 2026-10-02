/*
 * /defi -alerta: avisa quando uma posição sai da faixa, quando volta e (com -taxas)
 * quando as taxas a coletar passam de um valor.
 */

const { estado } = require('../estado');
const { descrever, descreverDestinoDoAlerta, destinoDoAlerta, fmtUsd, lerCadastro } = require('../comandos/defi');
const { dbAll, dbPronto, dbRun } = require('../db');
const { enviarAoDestino } = require('../destinos');
const { printError, printInfo } = require('../log');
const { getSetting } = require('../settings');

/*
 * Cada posição com o alerta ligado é lida a cada 'defi.alerta.intervalMin'
 * minutos. A coluna in_range guarda o estado da última leitura: avisa quando
 * passa de dentro (ou de desconhecido) para fora, e de fora para dentro. A
 * fees_notified segura o aviso das taxas: uma vez por "encheu", até coletar.
 * Leitura falhou (RPC com limite)? Nada muda; tenta na próxima.
 * Numa carteira do Project X, "na faixa" é todas as posições abertas na faixa.
 */
async function avisar(p, n, emoji, titulo, textos) {
    const texto = `${emoji} *${titulo}*\n\n${textos.join('\n\n')}\n\n💡 _Desligue com /defi -alerta -rm ${n}._`;
    await enviarAoDestino(destinoDoAlerta(p), texto, { assunto: titulo })
        .then(() => printInfo(`/defi -alerta: ${titulo} → ${descreverDestinoDoAlerta(p)}`))
        .catch(err => printError(`/defi -alerta: falha ao avisar (${p.position}):`, err.message));
}

// Grava ANTES de avisar: se o envio falhar, não repete a cada verificação
async function verificarFaixa(p, n, lido) {
    if (lido.naFaixa === null) return;   // carteira sem posição aberta: nada a vigiar
    const naFaixa = lido.naFaixa ? 1 : 0;
    if (naFaixa === p.in_range) return;

    await dbRun('UPDATE defi_positions SET in_range = ? WHERE id = ?', [naFaixa, p.id]);
    if (naFaixa && p.in_range === null) return;   // primeira leitura, já na faixa: só registra

    if (naFaixa) await avisar(p, n, '✅', `DeFi: ${descrever(p)} voltou para a faixa`, lido.textos);
    else await avisar(p, n, '🚨', `DeFi: ${descrever(p)} saiu da faixa`, lido.foraDaFaixa);
}

async function verificarTaxas(p, n, lido) {
    if (!p.alert_fees || lido.taxasUsd === null) return;
    const passou = lido.taxasUsd >= p.alert_fees ? 1 : 0;
    if (passou === p.fees_notified) return;

    await dbRun('UPDATE defi_positions SET fees_notified = ? WHERE id = ?', [passou, p.id]);
    if (passou) {
        await avisar(p, n, '💸', `DeFi: ${descrever(p)} tem ${fmtUsd(lido.taxasUsd)} em taxas a coletar (passou de ${fmtUsd(p.alert_fees)})`, lido.textos);
    }
}

let ultimaVerificacao = 0;
let verificando = false;

async function verificarAlertasDefi({ forcar = false } = {}) {
    if (verificando || !estado.pronto) return;
    if (!forcar && Date.now() - ultimaVerificacao < getSetting('defi.alerta.intervalMin') * 60 * 1000) return;

    verificando = true;
    ultimaVerificacao = Date.now();

    try {
        await dbPronto;
        // O nº de cada posição é o da lista do /defi (todas, por id)
        const posicoes = await dbAll('SELECT * FROM defi_positions ORDER BY id');

        for (const [i, p] of posicoes.entries()) {
            if (!p.alert) continue;

            let lido;
            try {
                lido = await lerCadastro(p);
            } catch (err) {
                printError(`/defi -alerta: não consegui ler ${p.position}:`, err.message);
                continue;
            }

            await verificarFaixa(p, i + 1, lido);
            await verificarTaxas(p, i + 1, lido);
        }
    } catch (err) {
        printError('Erro ao verificar os alertas do /defi:', err.message);
    } finally {
        verificando = false;
    }
}

// Chamada no app.js: um tique por minuto, que só lê as posições no intervalo do setting
function iniciarAlertasDefi() {
    setInterval(verificarAlertasDefi, 60 * 1000);
}

module.exports = {
    iniciarAlertasDefi,
    verificarAlertasDefi
};
