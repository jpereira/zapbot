/*
 * /bot -test: runs a battery of tests (cache, disk, database, WhatsApp, internet, speed,
 * SMTP and external programs) and shows ✅ or ❌ for each one.
 */

const axios = require('axios');
const crypto = require('crypto');
const dns = require('dns').promises;
const fs = require('fs');
const path = require('path');

const { client } = require('./client');
const { BIN_FFMPEG, BIN_YT, CACHE_DIR } = require('./constants');
const { dbGet, dbReady } = require('./db');
const { smtpForSend, checkSmtp } = require('./email');
const { estado: stateAlt } = require('./state');
const { boxConfigured, check: checkImap } = require('./imap');
const { notFound, output, chromiumVersion } = require('./system');
const { t } = require('./i18n');
const { humanSize } = require('./util/files');

const TEST_TIMEOUT_MS = 20 * 1000;
const DISK_MIN_BYTES = 500 * 1024 * 1024;
const DOWNLOAD_BYTES = 8_000_000;
const UPLOAD_BYTES = 1_000_000;
const SPEED_MIN_MBPS = 1;
const SPEED = 'https://speed.cloudflare.com';

const ms = (start) => `${Math.round(performance.now() - start)} ms`;
const mbps = (bytes, start) => (bytes * 8) / 1e6 / ((performance.now() - start) / 1000);

// Each test returns { ok, detail }; ok null = not configured (does not count as a failure)
async function testCache() {
    const fileAlt = path.join(CACHE_DIR, `.teste-${process.pid}-${Date.now()}`);
    const dataAlt = crypto.randomBytes(256 * 1024);
    const start = performance.now();

    try {
        await fs.promises.writeFile(fileAlt, dataAlt);
        const lido = await fs.promises.readFile(fileAlt);
        if (!lido.equals(dataAlt)) return { ok: false, detalhe: t('diag.leituraDifere') };
        return { ok: true, detalhe: t('diag.escritaLeitura', { tam: humanSize(dataAlt.length), ms: ms(start) }) };
    } finally {
        await fs.promises.rm(fileAlt, { force: true });
    }
}

async function testDisk() {
    const { bavail, bsize, blocks } = await fs.promises.statfs(CACHE_DIR);
    const livre = bavail * bsize;
    const pct = Math.round((bavail / blocks) * 100);
    return { ok: livre >= DISK_MIN_BYTES, detalhe: t('diag.livres', { tam: humanSize(livre), pct }) };
}

async function testDb() {
    await dbReady;
    const start = performance.now();
    const r = await dbGet('PRAGMA quick_check');
    const resultAlt = Object.values(r ?? {})[0];
    return { ok: resultAlt === 'ok', detalhe: resultAlt === 'ok' ? t('diag.integro', { ms: ms(start) }) : String(resultAlt) };
}

async function testWhatsApp() {
    if (stateAlt.reiniciando) return { ok: false, detalhe: t('diag.reiniciando') };
    if (!stateAlt.pronto) return { ok: false, detalhe: t('diag.semConexao') };

    const start = performance.now();
    const statusAlt = await client.getState();
    return { ok: statusAlt === 'CONNECTED', detalhe: `${statusAlt} (${ms(start)})` };
}

async function testDns() {
    const start = performance.now();
    const r = await dns.lookup('web.whatsapp.com');
    return { ok: true, detalhe: `web.whatsapp.com → ${r.address} (${ms(start)})` };
}

async function testInternet() {
    const start = performance.now();
    const r = await axios.get('https://web.whatsapp.com/', { timeout: 10_000, validateStatus: () => true });
    return { ok: r.status < 500, detalhe: `HTTP ${r.status} (${ms(start)})` };
}

async function testSmtp() {
    if (!smtpForSend()) return { ok: null, detalhe: t('diag.naoConfiguradoSmtp') };

    const start = performance.now();
    await checkSmtp();
    return { ok: true, detalhe: t('diag.loginOk', { ms: ms(start) }) };
}

async function testImap() {
    if (!boxConfigured()) return { ok: null, detalhe: t('diag.naoConfiguradoImap') };

    const start = performance.now();
    await checkImap();
    return { ok: true, detalhe: t('diag.loginOk', { ms: ms(start) }) };
}

const testProgram = (nameAlt, bin, args, extract = (l) => l) => async () => {
    const line = await output(bin, args);
    return line ? { ok: true, detalhe: extract(line) } : { ok: false, detalhe: t('diag.naoRodou', { nome: nameAlt }) };
};

async function testChromium() {
    const version = await chromiumVersion();
    return { ok: version !== notFound(), detalhe: version.replace(/_/g, '') };
}

// Alone at the end: nothing else uses the network while it measures
async function testSpeed() {
    let start = performance.now();
    await axios.get(`${SPEED}/__down`, {
        params: { bytes: DOWNLOAD_BYTES }, responseType: 'arraybuffer', timeout: TEST_TIMEOUT_MS
    });
    const descent = mbps(DOWNLOAD_BYTES, start);

    start = performance.now();
    await axios.post(`${SPEED}/__up`, Buffer.alloc(UPLOAD_BYTES), {
        headers: { 'Content-Type': 'application/octet-stream' }, timeout: TEST_TIMEOUT_MS
    });
    const rise = mbps(UPLOAD_BYTES, start);

    return {
        ok: descent >= SPEED_MIN_MBPS && rise >= SPEED_MIN_MBPS,
        detalhe: `↓ ${descent.toFixed(1)} Mbps · ↑ ${rise.toFixed(1)} Mbps`
    };
}

const TESTES = () => [
    [t('diag.nomeCache'), testCache],
    [t('diag.nomeDisco'), testDisk],
    [t('diag.nomeBanco'), testDb],
    ['WhatsApp', testWhatsApp],
    ['DNS', testDns],
    ['Internet', testInternet],
    [t('diag.nomeSmtp'), testSmtp],
    [t('diag.nomeImap'), testImap],
    ['Chromium', testChromium],
    ['yt-dlp', testProgram('yt-dlp', BIN_YT, ['--version'])],
    ['ffmpeg', testProgram('ffmpeg', BIN_FFMPEG, ['-version'], (l) => l.match(/version\s+(\S+)/)?.[1] ?? l)]
];
const TEST_FINAL = () => [t('diag.nomeVelocidade'), testSpeed];

// A test that hangs or throws becomes ❌ with the reason, without taking the others down
async function run([nameAlt, test]) {
    let limitAlt;

    try {
        const r = await Promise.race([
            test(),
            new Promise((_, reject) => { limitAlt = setTimeout(() => reject(new Error(t('diag.semResposta', { s: TEST_TIMEOUT_MS / 1000 }))), TEST_TIMEOUT_MS); })
        ]);
        return { nome: nameAlt, ...r };
    } catch (err) {
        return { nome: nameAlt, ok: false, detalhe: err.message };
    } finally {
        clearTimeout(limitAlt);
    }
}

const line = ({ nome: nameAlt, ok, detalhe: detail }) => `${ok === null ? '➖' : ok ? '✅' : '❌'} *${nameAlt}* — ${detail}`;

/**
 * Runs all the tests and builds the /bot -test text.
 */
async function testText() {
    const results = await Promise.all(TESTES().map(run));
    results.push(await run(TEST_FINAL()));

    const counted = results.filter(r => r.ok !== null);
    const failures = counted.filter(r => !r.ok).length;

    return t('diag.titulo', { linhas: results.map(line).join('\n') }) +
        (failures
            ? t('diag.comFalha', { falhas: failures, total: counted.length })
            : t('diag.todosOk', { total: counted.length }));
}

module.exports = {
    testText
};
