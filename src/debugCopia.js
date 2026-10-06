/*
 * Cópia em lotes: log demais já pesa no terminal; no WhatsApp, nem se fala.
 */
const { comContextoDebug, contextoDebug } = require('./debugContexto');
const { configurarDebug } = require('./debugDados');

const PREFIXO_COPIA = '🪲 [ZapBot log]\n';
const LIMITE_FILA = 500;
const TAMANHO_LOTE = 3000;
let fila = [];
let descartados = 0;
let timer;
let envio;
let pausada = false;
let geracao = 0;

function limparCopiasDebug() {
    clearTimeout(timer);
    timer = null;
    fila = [];
    descartados = 0;
    pausada = false;
    geracao++;
}

function copiarLog(linha) {
    if (contextoDebug().semRastro || pausada || !configurarDebug().copyTo) return;
    if (fila.length >= LIMITE_FILA) { fila.shift(); descartados++; }
    // Limita também o tamanho de uma linha muito grande, preservando o resto em blocos.
    for (let i = 0; i < linha.length; i += TAMANHO_LOTE) {
        fila.push(linha.slice(i, i + TAMANHO_LOTE));
        if (fila.length > LIMITE_FILA) { fila.shift(); descartados++; }
    }
    if (!timer && !envio) {
        timer = setTimeout(() => { timer = null; void flushCopiasDebug(); }, 500);
        timer.unref?.();
    }
}

async function flushCopiasDebug() {
    if (envio) return envio;
    clearTimeout(timer);
    timer = null;
    const atual = geracao;
    envio = comContextoDebug({ semRastro: true }, async () => {
        while (fila.length && atual === geracao) {
            const cfg = configurarDebug();
            if (!cfg.enabled || !cfg.copyTo || pausada) { fila = []; return; }
            // Settings podem estar carregados antes da conexão ficar pronta no boot.
            if (!require('./estado').estado.pronto) return;
            const linhas = [];
            let tamanho = 0;
            if (descartados) {
                linhas.push(`(${descartados} blocos descartados: fila de logs cheia)`);
                descartados = 0;
            }
            while (fila.length && tamanho + fila[0].length <= TAMANHO_LOTE) {
                const linha = fila.shift();
                linhas.push(linha);
                tamanho += linha.length + 1;
            }
            try {
                const { client } = require('./cliente');
                await client.sendMessage(cfg.copyTo, PREFIXO_COPIA + linhas.join('\n'),
                    { linkPreview: false });
            } catch (err) {
                if (atual === geracao) { pausada = true; fila = []; }
                // Falha de cópia vai só ao console. Copiar a falha criaria uma novela sem fim.
                require('./log').printError('Cópia dos logs pausada:', err.message);
                return;
            }
        }
    });
    try { await envio; } finally {
        envio = null;
        if (fila.length && !timer && !pausada) {
            timer = setTimeout(() => { timer = null; void flushCopiasDebug(); }, 500);
            timer.unref?.();
        }
    }
}

const ehCopiaDeLog = (texto) => String(texto ?? '').startsWith(PREFIXO_COPIA);

module.exports = { copiarLog, ehCopiaDeLog, flushCopiasDebug, limparCopiasDebug };
