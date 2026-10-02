/*
 * /bot -info: as versões do que o bot usa (Node.js, whatsapp-web.js, Chromium,
 * yt-dlp, ffmpeg, SQLite...), se há versão nova do yt-dlp e do whatsapp-web.js,
 * e o sistema onde ele roda.
 */

const axios = require('axios');
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
const { versaoComCommit, versaoDoBot } = require('./versao');

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
const commitCompletoDoWwebjs = () => String(packageJson.dependencies?.['whatsapp-web.js'] ?? '').split('#')[1] ?? null;
const commitDoWwebjs = () => commitCompletoDoWwebjs()?.slice(0, 7) ?? null;
const instaladoDoWwebjs = () => {
    try {
        return require('whatsapp-web.js/package.json').version;
    } catch {
        return null;
    }
};

function versaoDoWwebjs() {
    const versao = instaladoDoWwebjs();
    if (!versao) return NAO_ENCONTRADO;
    const commit = commitDoWwebjs();
    return commit ? `${versao} (commit ${commit})` : versao;
}

/*
 * Versões novas: a última do yt-dlp no PyPI, a última release do whatsapp-web.js
 * no GitHub e quantos commits o main dele tem à frente do fixado. Guardadas por
 * 6 h (a API do GitHub sem chave dá 60 consultas por hora); falhou, fica sem nota.
 */
const NOVIDADES_TTL_MS = 6 * 60 * 60 * 1000;
const WWEBJS_REPO = 'wwebjs/whatsapp-web.js';
let novidades = { em: 0, dados: null };

const pegar = (url) => axios.get(url, { timeout: VERSAO_TIMEOUT_MS, headers: { 'User-Agent': 'zapbot' } })
    .then(r => r.data)
    .catch(() => null);

async function buscarNovidades(agora = Date.now()) {
    if (novidades.dados && agora - novidades.em < NOVIDADES_TTL_MS) return novidades.dados;

    const commit = commitCompletoDoWwebjs();
    const [pypi, release, comparacao] = await Promise.all([
        pegar('https://pypi.org/pypi/yt-dlp/json'),
        pegar(`https://api.github.com/repos/${WWEBJS_REPO}/releases/latest`),
        commit ? pegar(`https://api.github.com/repos/${WWEBJS_REPO}/compare/${commit}...main`) : null
    ]);

    const dados = {
        ytDlp: pypi?.info?.version ?? null,
        wwebjs: release?.tag_name?.replace(/^v/, '') ?? null,
        commitsNoMain: Number.isInteger(comparacao?.ahead_by) ? comparacao.ahead_by : null
    };
    novidades = { em: agora, dados };
    return dados;
}

const limparNovidades = () => { novidades = { em: 0, dados: null }; };

// 1 (a > b), -1 ou 0, número a número: "2026.08.19" e "2026.8.19" são a mesma
function compararVersoes(a, b) {
    const pa = String(a).split(/[.-]/).map(Number);
    const pb = String(b).split(/[.-]/).map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d) return Math.sign(d);
    }
    return 0;
}

// " · ⬆️ nova: X" ou " · ✅ a mais recente"; sem saber uma das duas, nada
function notaDeVersao(instalada, ultima) {
    if (!instalada || !ultima) return '';
    return compararVersoes(ultima, instalada) > 0 ? ` · ⬆️ *nova: ${ultima}*` : ' · ✅ a mais recente';
}

function notaDoWwebjs({ wwebjs, commitsNoMain }) {
    const nota = notaDeVersao(instaladoDoWwebjs(), wwebjs);
    return commitsNoMain ? `${nota} · ⬆️ ${commitsNoMain} commit${commitsNoMain === 1 ? '' : 's'} novo${commitsNoMain === 1 ? '' : 's'} no main` : nota;
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

    const [chromium, ytDlp, ffmpeg, uname, sqlite, whatsappWeb, novas] = await Promise.all([
        versaoDoChromium(),
        saidaDe(BIN_YT, ['--version']),
        saidaDe(BIN_FFMPEG, ['-version']).then(versaoDoFfmpeg),
        saidaDe('uname', ['-a']),
        dbGet('SELECT sqlite_version() AS v').then(r => r?.v).catch(() => null),
        client.getWWebVersion?.().catch(() => null),
        buscarNovidades()
    ]);

    const memoria = process.memoryUsage();
    const total = os.totalmem();
    const livre = os.freemem();
    const cpus = os.cpus();
    const carga = os.loadavg().map(n => n.toFixed(2)).join(' · ');

    return `ℹ️ *ZapBot ${versaoDoBot()}* · informações do sistema\n\n` +
        '🤖 *Bot*\n' +
        `• ZapBot: ${versaoComCommit()} (APP_ENV=${APP_ENV})\n` +
        `• Node.js: ${process.version} (V8 ${process.versions.v8})\n` +
        `• whatsapp-web.js: ${versaoDoWwebjs()}${notaDoWwebjs(novas)}\n` +
        `• WhatsApp Web: ${whatsappWeb ?? (estado.pronto ? NAO_ENCONTRADO : '_não conectado_')}\n` +
        `• SQLite: ${sqlite ?? NAO_ENCONTRADO}\n\n` +
        '🧰 *Programas*\n' +
        `• Chromium: ${chromium}\n` +
        `• yt-dlp: ${ytDlp ?? NAO_ENCONTRADO}${notaDeVersao(ytDlp, novas.ytDlp)}\n` +
        `• ffmpeg: ${ffmpeg ?? NAO_ENCONTRADO}\n\n` +
        '🖥️ *Sistema*\n' +
        `• ${uname ?? `${os.type()} ${os.release()} ${os.arch()}`}\n` +
        `• Host: ${os.hostname()}${emDocker() ? ' (Docker)' : ''}\n` +
        `• CPU: ${cpus.length}× ${cpus[0]?.model?.trim() ?? os.arch()} · carga ${carga}\n` +
        `• Memória: ${humanSize(total - livre)} de ${humanSize(total)} em uso · o bot usa ${humanSize(memoria.rss)}\n` +
        `• No ar: sistema há ${getBotUptime(Date.now() - os.uptime() * 1000)} · bot há ${getBotUptime(BOT_START_TIME)} (PID ${process.pid})`;
}

module.exports = {
    compararVersoes,
    limparNovidades,
    notaDeVersao,
    textoDoInfo
};
