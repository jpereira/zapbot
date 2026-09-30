/*
 * Execução de processos externos (yt-dlp / ffmpeg) com timeout.
 */

const { spawn } = require('child_process');

const { GET_TIMEOUT_MS } = require('../constantes');

/*
 * Execução de processos externos (yt-dlp / ffmpeg)
 */
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
                ? `${bin} excedeu ${timeoutMs / 1000}s e foi interrompido`
                : `${bin} exited with code ${code}`));
        });
    });
}

module.exports = {
    runCommand
};
