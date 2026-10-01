/*
 * /defi -alerta: avisa sempre que uma posição sai da faixa.
 */

const { estado } = require('../estado');
const { descreverDestinoDoAlerta, destinoDoAlerta, textoDaPosicao } = require('../comandos/defi');
const { dbAll, dbPronto, dbRun } = require('../db');
const { enviarAoDestino } = require('../destinos');
const { printError, printInfo } = require('../log');
const { getSetting } = require('../settings');
const { detalhesDaPosicao } = require('./orca');

/*
 * Cada posição com o alerta ligado é lida a cada 'defi.alerta.intervalMin'
 * minutos. A coluna in_range guarda o estado da última leitura: o aviso sai
 * quando ela passa de dentro (ou de desconhecido) para fora da faixa. Fora
 * dela, não avisa de novo; quando volta para a faixa e sai outra vez, avisa.
 * Se a leitura falhar (RPC com limite), nada muda e tenta na próxima.
 */
const curto = (endereco) => `${endereco.slice(0, 4)}…${endereco.slice(-4)}`;

async function avisar(p, n, d) {
    const titulo = `🚨 *DeFi: a posição ${curto(p.position)} saiu da faixa*`;
    const texto = `${titulo}\n\n${textoDaPosicao(d)}\n\n💡 _Desligue com /defi -alerta -rm ${n}._`;

    await enviarAoDestino(destinoDoAlerta(p), texto, { assunto: `DeFi: a posição ${curto(p.position)} saiu da faixa` });
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

            let d;
            try {
                d = await detalhesDaPosicao(p.position, p.pool);
            } catch (err) {
                printError(`/defi -alerta: não consegui ler a posição ${p.position}:`, err.message);
                continue;
            }

            const naFaixa = d.calculo.naFaixa ? 1 : 0;
            if (naFaixa === p.in_range) continue;

            await dbRun('UPDATE defi_positions SET in_range = ? WHERE id = ?', [naFaixa, p.id]);
            if (naFaixa) {
                printInfo(`/defi -alerta: a posição ${p.position} está na faixa`);
                continue;
            }

            // Grava ANTES de avisar: se o envio falhar, não repete a cada verificação
            await avisar(p, i + 1, d)
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
