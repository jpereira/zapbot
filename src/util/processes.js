/*
 * Running external processes (yt-dlp / ffmpeg) with a timeout.
 */

const { spawn } = require('child_process');

const { GET_TIMEOUT_MS } = require('../constants');

function runCommand(bin, args, logFd, timeoutMs = GET_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const child = spawn(bin, args, { stdio: ['ignore', logFd, logFd] });

        // Without this, a stuck download/conversion holds /get (and the disk) forever
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

// The output (stdout) of a short command, like a video's duration
function captureOutput(bin, args, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'ignore'] });
        let outputAlt = '';

        const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);

        child.stdout.on('data', (dataAlt) => { outputAlt += dataAlt; });
        child.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0) return resolve(outputAlt.trim());
            reject(new Error(`${bin} exited with code ${code}`));
        });
    });
}

module.exports = {
    captureOutput,
    runCommand
};
