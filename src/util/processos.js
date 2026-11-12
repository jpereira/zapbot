/*
 * Execução de processos externos (yt-dlp / ffmpeg) com timeout.
 */

const { spawn } = require('child_process');

const { GET_TIMEOUT_MS } = require('../constantes');
const { t } = require('../i18n');

function runCommand(bin, args, logFd, timeoutMs = GET_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const child = spawn(bin, args, { stdio: ['ignore', logFd, logFd] });

        // Sem isto um download/conversão travado segura o /get (e o disco) para sempre
        const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);

        child.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
        child.on('close', (code, signal) => {
            clearTimeout(timer);
            if (code === 0) return resolve();
            reject(new Error(signal === 'SIGKILL'
                ? t('processos.timeout', { bin, s: timeoutMs / 1000 })
                : `${bin} exited with code ${code}`));
        });
    });
}

// A saída (stdout) de um comando curto, como a duração de um vídeo
function capturarSaida(bin, args, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'ignore'] });
        let saida = '';

        const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);

        child.stdout.on('data', (dados) => { saida += dados; });
        child.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0) return resolve(saida.trim());
            reject(new Error(`${bin} exited with code ${code}`));
        });
    });
}

module.exports = {
    capturarSaida,
    runCommand
};
