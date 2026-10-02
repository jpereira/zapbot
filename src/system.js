/*
 * /bot -info: the versions of what the bot uses (Node.js, whatsapp-web.js, Chromium,
 * yt-dlp, ffmpeg, SQLite...), whether there is a new yt-dlp and whatsapp-web.js version,
 * and the system it runs on.
 */

const axios = require('axios');
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
const { versionWithCommit, botVersion } = require('./version');

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
const wwebjsCommitComplete = () => String(packageJson.dependencies?.['whatsapp-web.js'] ?? '').split('#')[1] ?? null;
const commitDoWwebjs = () => wwebjsCommitComplete()?.slice(0, 7) ?? null;
const wwebjsInstalled = () => {
    try {
        return require('whatsapp-web.js/package.json').version;
    } catch {
        return null;
    }
};

function wwebjsVersion() {
    const version = wwebjsInstalled();
    if (!version) return NOT_FOUND;
    const commit = commitDoWwebjs();
    return commit ? `${version} (commit ${commit})` : version;
}

/*
 * New versions: the latest yt-dlp on PyPI, the latest whatsapp-web.js release
 * on GitHub and how many commits its main has ahead of the pinned one. Stored for
 * 6 h (the GitHub API without a key gives 60 queries per hour); if it failed, it stays without a note.
 */
const NEWS_TTL_MS = 6 * 60 * 60 * 1000;
const WWEBJS_REPO = 'wwebjs/whatsapp-web.js';
let news = { em: 0, dados: null };

const fetchIt = (url) => axios.get(url, { timeout: VERSION_TIMEOUT_MS, headers: { 'User-Agent': 'zapbot' } })
    .then(r => r.data)
    .catch(() => null);

async function searchNews(nowAlt = Date.now()) {
    if (news.dados && nowAlt - news.em < NEWS_TTL_MS) return news.dados;

    const commit = wwebjsCommitComplete();
    const [pypi, release, comparison] = await Promise.all([
        fetchIt('https://pypi.org/pypi/yt-dlp/json'),
        fetchIt(`https://api.github.com/repos/${WWEBJS_REPO}/releases/latest`),
        commit ? fetchIt(`https://api.github.com/repos/${WWEBJS_REPO}/compare/${commit}...main`) : null
    ]);

    const dataAlt = {
        ytDlp: pypi?.info?.version ?? null,
        wwebjs: release?.tag_name?.replace(/^v/, '') ?? null,
        commitsNoMain: Number.isInteger(comparison?.ahead_by) ? comparison.ahead_by : null
    };
    news = { em: nowAlt, dados: dataAlt };
    return dataAlt;
}

const cleanNews = () => { news = { em: 0, dados: null }; };

// 1 (a > b), -1 or 0, number by number: "2026.08.19" and "2026.8.19" are the same
function compareVersions(a, b) {
    const pa = String(a).split(/[.-]/).map(Number);
    const pb = String(b).split(/[.-]/).map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d) return Math.sign(d);
    }
    return 0;
}

// " · ⬆️ new: X" or " · ✅ the latest"; if one of the two is unknown, nothing
function versionNote(installed, last) {
    if (!installed || !last) return '';
    return compareVersions(last, installed) > 0 ? ` · ⬆️ *nova: ${last}*` : ' · ✅ a mais recente';
}

function wwebjsNote({ wwebjs, commitsNoMain: commitsInMain }) {
    const note = versionNote(wwebjsInstalled(), wwebjs);
    return commitsInMain ? `${note} · ⬆️ ${commitsInMain} commit${commitsInMain === 1 ? '' : 's'} novo${commitsInMain === 1 ? '' : 's'} no main` : note;
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

    const [chromium, ytDlp, ffmpeg, uname, sqlite, whatsappWeb, freshAlt2] = await Promise.all([
        chromiumVersion(),
        output(BIN_YT, ['--version']),
        output(BIN_FFMPEG, ['-version']).then(ffmpegVersion),
        output('uname', ['-a']),
        dbGet('SELECT sqlite_version() AS v').then(r => r?.v).catch(() => null),
        client.getWWebVersion?.().catch(() => null),
        searchNews()
    ]);

    const memoria = process.memoryUsage();
    const total = os.totalmem();
    const livre = os.freemem();
    const cpus = os.cpus();
    const carga = os.loadavg().map(n => n.toFixed(2)).join(' · ');

    return `ℹ️ *ZapBot ${botVersion()}* · informações do sistema\n\n` +
        '🤖 *Bot*\n' +
        `• ZapBot: ${versionWithCommit()} (APP_ENV=${APP_ENV})\n` +
        `• Node.js: ${process.version} (V8 ${process.versions.v8})\n` +
        `• whatsapp-web.js: ${wwebjsVersion()}${wwebjsNote(freshAlt2)}\n` +
        `• WhatsApp Web: ${whatsappWeb ?? (stateAlt.pronto ? NOT_FOUND : '_não conectado_')}\n` +
        `• SQLite: ${sqlite ?? NOT_FOUND}\n\n` +
        '🧰 *Programas*\n' +
        `• Chromium: ${chromium}\n` +
        `• yt-dlp: ${ytDlp ?? NOT_FOUND}${versionNote(ytDlp, freshAlt2.ytDlp)}\n` +
        `• ffmpeg: ${ffmpeg ?? NOT_FOUND}\n\n` +
        '🖥️ *Sistema*\n' +
        `• ${uname ?? `${os.type()} ${os.release()} ${os.arch()}`}\n` +
        `• Host: ${os.hostname()}${inDocker() ? ' (Docker)' : ''}\n` +
        `• CPU: ${cpus.length}× ${cpus[0]?.model?.trim() ?? os.arch()} · carga ${carga}\n` +
        `• Memória: ${humanSize(total - livre)} de ${humanSize(total)} em uso · o bot usa ${humanSize(memoria.rss)}\n` +
        `• No ar: sistema há ${getBotUptime(Date.now() - os.uptime() * 1000)} · bot há ${getBotUptime(BOT_START_TIME)} (PID ${process.pid})`;
}

module.exports = {
    compareVersions,
    cleanNews,
    versionNote,
    infoText
};
