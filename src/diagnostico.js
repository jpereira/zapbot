/*
 * /bot -test: roda uma bateria de testes (cache, disco, banco, WhatsApp, internet, velocidade,
 * SMTP e programas externos) e mostra ✅ ou ❌ em cada um.
 */

const axios = require('axios');
const crypto = require('crypto');
const dns = require('dns').promises;
const fs = require('fs');
const path = require('path');

const { client } = require('./cliente');
const { BIN_FFMPEG, BIN_YT, CACHE_DIR } = require('./constantes');
const { dbGet, dbPronto } = require('./db');
const { smtpParaEnviar, verificarSmtp } = require('./email');
const { estado } = require('./estado');
const { caixaConfigurada, verificar: verificarImap } = require('./imap');
const { naoEncontrado, saidaDe, versaoDoChromium } = require('./sistema');
const { t } = require('./i18n');
const { humanSize } = require('./util/arquivos');

const TESTE_TIMEOUT_MS = 20 * 1000;
const DISCO_MIN_BYTES = 500 * 1024 * 1024;
const DOWNLOAD_BYTES = 8_000_000;
const UPLOAD_BYTES = 1_000_000;
const VELOCIDADE_MIN_MBPS = 1;
const SPEED = 'https://speed.cloudflare.com';

const ms = (inicio) => `${Math.round(performance.now() - inicio)} ms`;
const mbps = (bytes, inicio) => (bytes * 8) / 1e6 / ((performance.now() - inicio) / 1000);

// Cada teste devolve { ok, detalhe }; ok null = não configurado (não conta como falha)
async function testarCache() {
    const arquivo = path.join(CACHE_DIR, `.teste-${process.pid}-${Date.now()}`);
    const dados = crypto.randomBytes(256 * 1024);
    const inicio = performance.now();

    try {
        await fs.promises.writeFile(arquivo, dados);
        const lido = await fs.promises.readFile(arquivo);
        if (!lido.equals(dados)) return { ok: false, detalhe: t('diag.leituraDifere') };
        return { ok: true, detalhe: t('diag.escritaLeitura', { tam: humanSize(dados.length), ms: ms(inicio) }) };
    } finally {
        await fs.promises.rm(arquivo, { force: true });
    }
}

async function testarDisco() {
    const { bavail, bsize, blocks } = await fs.promises.statfs(CACHE_DIR);
    const livre = bavail * bsize;
    const pct = Math.round((bavail / blocks) * 100);
    return { ok: livre >= DISCO_MIN_BYTES, detalhe: t('diag.livres', { tam: humanSize(livre), pct }) };
}

async function testarBanco() {
    await dbPronto;
    const inicio = performance.now();
    const r = await dbGet('PRAGMA quick_check');
    const resultado = Object.values(r ?? {})[0];
    return { ok: resultado === 'ok', detalhe: resultado === 'ok' ? t('diag.integro', { ms: ms(inicio) }) : String(resultado) };
}

async function testarWhatsApp() {
    if (estado.reiniciando) return { ok: false, detalhe: t('diag.reiniciando') };
    if (!estado.pronto) return { ok: false, detalhe: t('diag.semConexao') };

    const inicio = performance.now();
    const situacao = await client.getState();
    return { ok: situacao === 'CONNECTED', detalhe: `${situacao} (${ms(inicio)})` };
}

async function testarDns() {
    const inicio = performance.now();
    const r = await dns.lookup('web.whatsapp.com');
    return { ok: true, detalhe: `web.whatsapp.com → ${r.address} (${ms(inicio)})` };
}

async function testarInternet() {
    const inicio = performance.now();
    const r = await axios.get('https://web.whatsapp.com/', { timeout: 10_000, validateStatus: () => true });
    return { ok: r.status < 500, detalhe: `HTTP ${r.status} (${ms(inicio)})` };
}

async function testarSmtp() {
    if (!smtpParaEnviar()) return { ok: null, detalhe: t('diag.naoConfiguradoSmtp') };

    const inicio = performance.now();
    await verificarSmtp();
    return { ok: true, detalhe: t('diag.loginOk', { ms: ms(inicio) }) };
}

async function testarImap() {
    if (!caixaConfigurada()) return { ok: null, detalhe: t('diag.naoConfiguradoImap') };

    const inicio = performance.now();
    await verificarImap();
    return { ok: true, detalhe: t('diag.loginOk', { ms: ms(inicio) }) };
}

const testarPrograma = (nome, bin, args, extrair = (l) => l) => async () => {
    const linha = await saidaDe(bin, args);
    return linha ? { ok: true, detalhe: extrair(linha) } : { ok: false, detalhe: t('diag.naoRodou', { nome }) };
};

async function testarChromium() {
    const versao = await versaoDoChromium();
    return { ok: versao !== naoEncontrado(), detalhe: versao.replace(/_/g, '') };
}

// Sozinho no fim: nada mais usa a rede enquanto mede
async function testarVelocidade() {
    let inicio = performance.now();
    await axios.get(`${SPEED}/__down`, {
        params: { bytes: DOWNLOAD_BYTES }, responseType: 'arraybuffer', timeout: TESTE_TIMEOUT_MS
    });
    const descida = mbps(DOWNLOAD_BYTES, inicio);

    inicio = performance.now();
    await axios.post(`${SPEED}/__up`, Buffer.alloc(UPLOAD_BYTES), {
        headers: { 'Content-Type': 'application/octet-stream' }, timeout: TESTE_TIMEOUT_MS
    });
    const subida = mbps(UPLOAD_BYTES, inicio);

    return {
        ok: descida >= VELOCIDADE_MIN_MBPS && subida >= VELOCIDADE_MIN_MBPS,
        detalhe: `↓ ${descida.toFixed(1)} Mbps · ↑ ${subida.toFixed(1)} Mbps`
    };
}

const TESTES = () => [
    [t('diag.nomeCache'), testarCache],
    [t('diag.nomeDisco'), testarDisco],
    [t('diag.nomeBanco'), testarBanco],
    ['WhatsApp', testarWhatsApp],
    ['DNS', testarDns],
    ['Internet', testarInternet],
    [t('diag.nomeSmtp'), testarSmtp],
    [t('diag.nomeImap'), testarImap],
    ['Chromium', testarChromium],
    ['yt-dlp', testarPrograma('yt-dlp', BIN_YT, ['--version'])],
    ['ffmpeg', testarPrograma('ffmpeg', BIN_FFMPEG, ['-version'], (l) => l.match(/version\s+(\S+)/)?.[1] ?? l)]
];
const TESTE_FINAL = () => [t('diag.nomeVelocidade'), testarVelocidade];

// Um teste que trava ou lança vira ❌ com o motivo, sem derrubar os outros
async function executar([nome, teste]) {
    let limite;

    try {
        const r = await Promise.race([
            teste(),
            new Promise((_, rejeitar) => { limite = setTimeout(() => rejeitar(new Error(t('diag.semResposta', { s: TESTE_TIMEOUT_MS / 1000 }))), TESTE_TIMEOUT_MS); })
        ]);
        return { nome, ...r };
    } catch (err) {
        return { nome, ok: false, detalhe: err.message };
    } finally {
        clearTimeout(limite);
    }
}

const linha = ({ nome, ok, detalhe }) => `${ok === null ? '➖' : ok ? '✅' : '❌'} *${nome}* — ${detalhe}`;

/**
 * Roda todos os testes e monta o texto do /bot -test.
 */
async function textoDoTeste() {
    const resultados = await Promise.all(TESTES().map(executar));
    resultados.push(await executar(TESTE_FINAL()));

    const contados = resultados.filter(r => r.ok !== null);
    const falhas = contados.filter(r => !r.ok).length;

    return t('diag.titulo', { linhas: resultados.map(linha).join('\n') }) +
        (falhas
            ? t('diag.comFalha', { falhas, total: contados.length })
            : t('diag.todosOk', { total: contados.length }));
}

module.exports = {
    textoDoTeste
};
