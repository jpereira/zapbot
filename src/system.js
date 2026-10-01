/*
 * /bot -info: the versions of what the bot uses (Node.js, whatsapp-web.js, Chromium,
 * yt-dlp, ffmpeg, SQLite...) and the system it runs on.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const packageJson = require('../package.json');

const { estado: stateAlt } = require('./state');
const { client } = require('./client');
const { APP_ENV, BIN_CHROMIUM, BIN_FFMPEG, BIN_YT, BOT_START_TIME } = require('./constants');
const { dbGet, dbReady } = require('./db');
const { getBotUptime } = require('./log');
const { humanSize } = require('./util/files');

// Each external program has this long to report its version
const VERSION_TIMEOUT_MS = 5000;
const NOT_FOUND = '_não encontrado_';

/**
 * The 1st line of the output of "<bin> <args>", or null if the program does not run.
 */
function output(bin, args) {
    return new Promise((resolve) => {
        execFile(bin, args, { timeout: VERSION_TIMEOUT_MS }, (err, stdout) => {
            const line = String(stdout ?? '').split('\n').find(l => l.trim())?.trim();
            resolve(err || !line ? null : line);
        });
    });
}

// "ffmpeg version 7.1.1 Copyright ..." → "7.1.1"
const ffmpegVersion = (line) => line?.match(/version\s+(\S+)/)?.[1] ?? line;

// The whatsapp-web.js commit pinned in package.json ("github:wwebjs/whatsapp-web.js#58ddf15...")
const commitDoWwebjs = () => String(packageJson.dependencies?.['whatsapp-web.js'] ?? '').split('#')[1]?.slice(0, 7) ?? null;

function wwebjsVersion() {
    try {
        const version = require('whatsapp-web.js/package.json').version;
        const commit = commitDoWwebjs();
        return commit ? `${version} (commit ${commit})` : version;
    } catch {
        return NOT_FOUND;
    }
}

// When connected, Puppeteer's own Chromium answers; otherwise, the binary
async function chromiumVersion() {
    const browser = await client.pupBrowser?.version?.().catch(() => null);
    if (browser) return browser.replace(/^HeadlessChrome\//, 'Chromium ');
    return await output(BIN_CHROMIUM, ['--version']) ?? NOT_FOUND;
}

const inDocker = () => fs.existsSync('/.dockerenv');

/**
 * The /bot -info text.
 */
async function infoText() {
    await dbReady;

    const [chromium, ytDlp, ffmpeg, uname, sqlite, whatsappWeb] = await Promise.all([
        chromiumVersion(),
        output(BIN_YT, ['--version']),
        output(BIN_FFMPEG, ['-version']).then(ffmpegVersion),
        output('uname', ['-a']),
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
        `• whatsapp-web.js: ${wwebjsVersion()}\n` +
        `• WhatsApp Web: ${whatsappWeb ?? (stateAlt.pronto ? NOT_FOUND : '_não conectado_')}\n` +
        `• SQLite: ${sqlite ?? NOT_FOUND}\n\n` +
        '🧰 *Programas*\n' +
        `• Chromium: ${chromium}\n` +
        `• yt-dlp: ${ytDlp ?? NOT_FOUND}\n` +
        `• ffmpeg: ${ffmpeg ?? NOT_FOUND}\n\n` +
        '🖥️ *Sistema*\n' +
        `• ${uname ?? `${os.type()} ${os.release()} ${os.arch()}`}\n` +
        `• Host: ${os.hostname()}${inDocker() ? ' (Docker)' : ''}\n` +
        `• CPU: ${cpus.length}× ${cpus[0]?.model?.trim() ?? os.arch()} · carga ${carga}\n` +
        `• Memória: ${humanSize(total - livre)} de ${humanSize(total)} em uso · o bot usa ${humanSize(memoria.rss)}\n` +
        `• No ar: sistema há ${getBotUptime(Date.now() - os.uptime() * 1000)} · bot há ${getBotUptime(BOT_START_TIME)} (PID ${process.pid})`;
}

module.exports = {
    infoText
};
