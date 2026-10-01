/*
 * /bot -info: as versões do que o bot usa (Node.js, whatsapp-web.js, Chromium,
 * yt-dlp, ffmpeg, SQLite...) e o sistema onde ele roda.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const packageJson = require('../package.json');

const { estado } = require('./estado');
const { client } = require('./cliente');
const { APP_ENV, BIN_CHROMIUM, BIN_FFMPEG, BIN_YT, BOT_START_TIME } = require('./constantes');
const { dbGet, dbPronto } = require('./db');
const { getBotUptime } = require('./log');
const { humanSize } = require('./util/arquivos');

// Cada programa externo tem este tempo para responder a versão
const VERSAO_TIMEOUT_MS = 5000;
const NAO_ENCONTRADO = '_não encontrado_';

/**
 * A 1ª linha da saída de "<bin> <args>", ou null se o programa não rodar.
 */
function saidaDe(bin, args) {
    return new Promise((resolve) => {
        execFile(bin, args, { timeout: VERSAO_TIMEOUT_MS }, (err, stdout) => {
            const linha = String(stdout ?? '').split('\n').find(l => l.trim())?.trim();
            resolve(err || !linha ? null : linha);
        });
    });
}

// "ffmpeg version 7.1.1 Copyright ..." → "7.1.1"
const versaoDoFfmpeg = (linha) => linha?.match(/version\s+(\S+)/)?.[1] ?? linha;

// O commit fixado do whatsapp-web.js no package.json ("github:wwebjs/whatsapp-web.js#58ddf15...")
const commitDoWwebjs = () => String(packageJson.dependencies?.['whatsapp-web.js'] ?? '').split('#')[1]?.slice(0, 7) ?? null;

function versaoDoWwebjs() {
    try {
        const versao = require('whatsapp-web.js/package.json').version;
        const commit = commitDoWwebjs();
        return commit ? `${versao} (commit ${commit})` : versao;
    } catch {
        return NAO_ENCONTRADO;
    }
}

// Conectado, o próprio Chromium do Puppeteer responde; senão, o binário
async function versaoDoChromium() {
    const doNavegador = await client.pupBrowser?.version?.().catch(() => null);
    if (doNavegador) return doNavegador.replace(/^HeadlessChrome\//, 'Chromium ');
    return await saidaDe(BIN_CHROMIUM, ['--version']) ?? NAO_ENCONTRADO;
}

const emDocker = () => fs.existsSync('/.dockerenv');

/**
 * O texto do /bot -info.
 */
async function textoDoInfo() {
    await dbPronto;

    const [chromium, ytDlp, ffmpeg, uname, sqlite, whatsappWeb] = await Promise.all([
        versaoDoChromium(),
        saidaDe(BIN_YT, ['--version']),
        saidaDe(BIN_FFMPEG, ['-version']).then(versaoDoFfmpeg),
        saidaDe('uname', ['-a']),
        dbGet('SELECT sqlite_version() AS v').then(r => r?.v).catch(() => null),
        client.getWWebVersion?.().catch(() => null)
    ]);

    const memoria = process.memoryUsage();
    const total = os.totalmem();
    const livre = os.freemem();
    const cpus = os.cpus();
    const carga = os.loadavg().map(n => n.toFixed(2)).join(' · ');

    return `ℹ️ *ZapBot ${packageJson.version}* · informações do sistema\n\n` +
        '🤖 *Bot*\n' +
        `• ZapBot: ${packageJson.version} (APP_ENV=${APP_ENV})\n` +
        `• Node.js: ${process.version} (V8 ${process.versions.v8})\n` +
        `• whatsapp-web.js: ${versaoDoWwebjs()}\n` +
        `• WhatsApp Web: ${whatsappWeb ?? (estado.pronto ? NAO_ENCONTRADO : '_não conectado_')}\n` +
        `• SQLite: ${sqlite ?? NAO_ENCONTRADO}\n\n` +
        '🧰 *Programas*\n' +
        `• Chromium: ${chromium}\n` +
        `• yt-dlp: ${ytDlp ?? NAO_ENCONTRADO}\n` +
        `• ffmpeg: ${ffmpeg ?? NAO_ENCONTRADO}\n\n` +
        '🖥️ *Sistema*\n' +
        `• ${uname ?? `${os.type()} ${os.release()} ${os.arch()}`}\n` +
        `• Host: ${os.hostname()}${emDocker() ? ' (Docker)' : ''}\n` +
        `• CPU: ${cpus.length}× ${cpus[0]?.model?.trim() ?? os.arch()} · carga ${carga}\n` +
        `• Memória: ${humanSize(total - livre)} de ${humanSize(total)} em uso · o bot usa ${humanSize(memoria.rss)}\n` +
        `• No ar: sistema há ${getBotUptime(Date.now() - os.uptime() * 1000)} · bot há ${getBotUptime(BOT_START_TIME)} (PID ${process.pid})`;
}

module.exports = {
    textoDoInfo
};
