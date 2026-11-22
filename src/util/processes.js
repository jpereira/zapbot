/*
 * Running external processes (yt-dlp / ffmpeg) with a timeout.
 */

const { spawn } = require('child_process');

const { GET_TIMEOUT_MS } = require('../constants');
const { t } = require('../i18n');
const { printError, printInfo } = require('../log');

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
                ? t('processos.timeout', { bin, s: timeoutMs / 1000 })
                : `${bin} exited with code ${code}`));
        });
    });
}

const quoteArg = (a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : JSON.stringify(a));

/**
 * The output (stdout) of a short command, like a video's duration.
 * @param {object} [o]
 * @param {boolean} [o.log]  logs the command (exactly the arguments it receives) and, on failure, the end of its stderr
 */
function captureOutput(bin, args, timeoutMs = 30000, { log = false } = {}) {
    return new Promise((resolve, reject) => {
        if (log) printInfo(`> Running: ${[bin, ...args].map(quoteArg).join(' ')}`);
        const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let outputAlt = '';
        let stderrAlt = '';

        const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);

        child.stdout.on('data', (dataAlt) => { outputAlt += dataAlt; });
        child.stderr?.on('data', (dataAlt) => { stderrAlt = (stderrAlt + dataAlt).slice(-4000); });
        child.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0) return resolve(outputAlt.trim());
            // The last line of the stderr tells why (a Python traceback ends with the error)
            const why = stderrAlt.trim().split('\n').filter(Boolean).at(-1);
            if (log && stderrAlt.trim()) printError(`${bin} stderr:\n${stderrAlt.trim()}`);
            reject(new Error(`${bin} exited with code ${code}${why ? `: ${why}` : ''}`));
        });
    });
}

module.exports = {
    captureOutput,
    runCommand
};
