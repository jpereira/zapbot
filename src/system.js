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

const { state: stateAlt } = require('./state');
const { client } = require('./client');
const { BIN_CHROMIUM, BIN_FFMPEG, BIN_PYTHON, BIN_YT, BOT_START_TIME, BIN_FFPROBE, BIN_TESSERACT, SCRIPT_STT, SCRIPT_TTS } = require('./constants');
const { dbGet, dbReady } = require('./db');
const { getBotUptime } = require('./log');
const { humanSize } = require('./util/files');
const { versionWithCommit, botVersion } = require('./version');
const { t } = require('./i18n');
const { getSetting } = require('./settings');

// Each external program has this long to report its version
const VERSION_TIMEOUT_MS = 5000;
const notFound = () => t('sistema.naoEncontrado');

/**
 * The 1st line of the output of "<bin> <args>", or null if the program does not run.
 */
function output(bin, args) {
    return new Promise((resolve) => {
        execFile(bin, args, { timeout: VERSION_TIMEOUT_MS }, (err, stdout, stderr) => {
            // (pdftotext -v writes the version on the stderr)
            const line = String(stdout || stderr || '').split('\n').find(l => l.trim())?.trim();
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
    if (!version) return notFound();
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
let news = { em: 0, data: null };

const fetchIt = (url) => axios.get(url, { timeout: VERSION_TIMEOUT_MS })
    .then(r => r.data)
    .catch(() => null);

async function searchNews(nowAlt = Date.now()) {
    if (news.data && nowAlt - news.em < NEWS_TTL_MS) return news.data;

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
    news = { em: nowAlt, data: dataAlt };
    return dataAlt;
}

const cleanNews = () => { news = { em: 0, data: null }; };

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
    return compareVersions(last, installed) > 0 ? t('sistema.nova', { v: last }) : t('sistema.maisRecente');
}

function wwebjsNote({ wwebjs, commitsNoMain: commitsInMain }) {
    const note = versionNote(wwebjsInstalled(), wwebjs);
    return commitsInMain ? `${note}${t('sistema.commitsNovos', { n: commitsInMain })}` : note;
}

// When connected, Puppeteer's own Chromium answers; otherwise, the binary
async function chromiumVersion() {
    const browser = await client.pupBrowser?.version?.().catch(() => null);
    if (browser) return browser.replace(/^HeadlessChrome\//, 'Chromium ');
    return await output(BIN_CHROMIUM, ['--version']) ?? notFound();
}

// The output of "stt.py --version" ({"wrapper":"1.0.0","faster_whisper":"1.2.0"}) as text; null if it failed
function describeWhisper(outputAlt, modelAlt) {
    try {
        const v = JSON.parse(outputAlt);
        return v.faster_whisper && v.wrapper
            ? t('sistema.whisper', { fw: v.faster_whisper, wrapper: v.wrapper, model: modelAlt }) : null;
    } catch {
        return null;
    }
}

// The output of "tts.py --version" ({"wrapper":"2.0.0","piper":"1.8.0"}) as text, with the default voices; null if it failed
function describePiper(outputAlt, voices) {
    try {
        const v = JSON.parse(outputAlt);
        return v.piper && v.wrapper
            ? t('sistema.piper', { piper: v.piper, pt: voices.pt, en: voices.en, wrapper: v.wrapper }) : null;
    } catch {
        return null;
    }
}

const inDocker = () => fs.existsSync('/.dockerenv');

/**
 * The /bot -info text.
 */
async function infoText() {
    await dbReady;

    const [chromium, ytDlp, ffmpeg, ffprobe, python, whisper, piper, tesseract, pdftotext, uname, sqlite, whatsappWeb, freshAlt2] = await Promise.all([
        chromiumVersion(),
        output(BIN_YT, ['--version']),
        output(BIN_FFMPEG, ['-version']).then(ffmpegVersion),
        output(BIN_FFPROBE, ['-version']).then(ffmpegVersion),
        output(BIN_PYTHON, ['--version']).then(line => line?.replace(/^Python\s+/i, '') ?? null),
        output(BIN_PYTHON, [SCRIPT_STT, '--version']),
        output(BIN_PYTHON, [SCRIPT_TTS, '--version']),
        output(BIN_TESSERACT, ['--version']).then(line => line?.replace(/^tesseract\s+/i, '') ?? null),
        output('pdftotext', ['-v']).then(line => line?.match(/version\s+(\S+)/)?.[1] ?? line),
        output('uname', ['-a']),
        dbGet('SELECT sqlite_version() AS v').then(r => r?.v).catch(() => null),
        client.getWWebVersion?.().catch(() => null),
        searchNews()
    ]);

    const memory = process.memoryUsage();
    const total = os.totalmem();
    const free = os.freemem();
    const cpus = os.cpus();
    const load = os.loadavg().map(n => n.toFixed(2)).join(' · ');

    return t('sistema.info', {
        version: botVersion(),
        zapbot: versionWithCommit(),
        node: process.version,
        v8: process.versions.v8,
        wwebjs: `${wwebjsVersion()}${wwebjsNote(freshAlt2)}`,
        whatsappWeb: whatsappWeb ?? (stateAlt.ready ? notFound() : t('sistema.naoConectado')),
        sqlite: sqlite ?? notFound(),
        chromium,
        ytDlp: `${ytDlp ?? notFound()}${versionNote(ytDlp, freshAlt2.ytDlp)}`,
        ffmpeg: ffmpeg ?? notFound(),
        ffprobe: ffprobe ?? notFound(),
        python: python ?? notFound(),
        whisper: describeWhisper(whisper, getSetting('stt.model')) ?? notFound(),
        piper: describePiper(piper, { pt: getSetting('tts.voice.pt'), en: getSetting('tts.voice.en') }) ?? notFound(),
        tesseract: tesseract ? `${tesseract} (${getSetting('ocr.language')})` : notFound(),
        pdftotext: pdftotext ?? notFound(),
        uname: uname ?? `${os.type()} ${os.release()} ${os.arch()}`,
        host: `${os.hostname()}${inDocker() ? ' (Docker)' : ''}`,
        cpu: `${cpus.length}× ${cpus[0]?.model?.trim() ?? os.arch()}`,
        load,
        memUsed: humanSize(total - free),
        memTotal: humanSize(total),
        memBot: humanSize(memory.rss),
        systemUp: getBotUptime(Date.now() - os.uptime() * 1000),
        botUp: getBotUptime(BOT_START_TIME),
        pid: process.pid
    });
}

module.exports = {
    compareVersions,
    describePiper,
    describeWhisper,
    cleanNews,
    versionNote,
    output,
    infoText,
    notFound,
    chromiumVersion
};
