/*
 * Encerramento do processo: crash (exceção/promise sem tratamento) e sinais (docker stop, Ctrl+C), com alerta por e-mail.
 */

const { alertarAntesDeSair } = require('./email');
const { printError, printInfo } = require('./log');

/*
 * Crash: o Node já encerraria o processo numa exceção ou promise rejeitada sem
 * tratamento; aqui só avisamos antes. O Docker (restart: unless-stopped) sobe de novo.
 */
let encerrando = false;

async function encerrarPorCrash(tipo, err) {
    printError(`💥 ${tipo}:`, err);
    if (encerrando) return;
    encerrando = true;

    await alertarAntesDeSair('💥 Crash', `${tipo}\n\n${err?.stack || err}`, 10000);
    process.exit(1);
}

// Chamada no app.js, antes de tudo
function instalarEncerramento() {
    process.on('uncaughtException', err => encerrarPorCrash('uncaughtException', err));
    process.on('unhandledRejection', err => encerrarPorCrash('unhandledRejection', err));

    // docker stop / restart / Ctrl+C
    for (const sinal of ['SIGTERM', 'SIGINT']) {
        process.on(sinal, async () => {
            if (encerrando) return;
            encerrando = true;

            printInfo(`🛑 ${sinal} recebido, encerrando.`);
            await alertarAntesDeSair('🛑 Bot encerrado', `Sinal ${sinal} (docker stop/restart ou Ctrl+C).`, 5000);
            process.exit(0);
        });
    }
}

module.exports = {
    instalarEncerramento
};
