/*
 * /defi -alerta: avisa sempre que uma posição sai da faixa.
 */

const { estado } = require('../estado');
const { descrever, descreverDestinoDoAlerta, destinoDoAlerta, lerCadastro } = require('../comandos/defi');
const { dbAll, dbPronto, dbRun } = require('../db');
const { enviarAoDestino } = require('../destinos');
const { printError, printInfo } = require('../log');
const { getSetting } = require('../settings');

/*
 * Cada posição com o alerta ligado é lida a cada 'defi.alerta.intervalMin'
 * minutos. A coluna in_range guarda o estado da última leitura: o aviso sai
 * quando ela passa de dentro (ou de desconhecido) para fora da faixa. Fora
 * dela, não avisa de novo; quando volta para a faixa e sai outra vez, avisa.
 * Se a leitura falhar (RPC com limite), nada muda e tenta na próxima.
 * Numa carteira do Project X, "na faixa" é todas as posições abertas na faixa.
 */
async function avisar(p, n, lido) {
    const titulo = `DeFi: ${descrever(p)} saiu da faixa`;
    const texto = `🚨 *${titulo}*\n\n${lido.foraDaFaixa.join('\n\n')}\n\n💡 _Desligue com /defi -alerta -rm ${n}._`;

    await enviarAoDestino(destinoDoAlerta(p), texto, { assunto: titulo });
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

            // Carteira sem posição aberta: não há faixa para vigiar
            if (lido.naFaixa === null) continue;
            const naFaixa = lido.naFaixa ? 1 : 0;
            if (naFaixa === p.in_range) continue;

            await dbRun('UPDATE defi_positions SET in_range = ? WHERE id = ?', [naFaixa, p.id]);
            if (naFaixa) {
                printInfo(`/defi -alerta: a posição ${p.position} está na faixa`);
                continue;
            }

            // Grava ANTES de avisar: se o envio falhar, não repete a cada verificação
            await avisar(p, i + 1, lido)
                .then(() => printInfo(`/defi -alerta: a posição ${p.position} saiu da faixa → ${descreverDestinoDoAlerta(p)}`))
                .catch(err => printError(`/defi -alerta: falha ao avisar (${p.position}):`, err.message));
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
