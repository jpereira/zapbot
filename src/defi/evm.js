/*
 * Leitura de contratos em qualquer rede EVM (Ethereum, Base...): um eth_call
 * pelo RPC e o Multicall3, que junta dezenas de chamadas num eth_call só (o
 * RPC público agradece, e o rate limit também). Só leitura, sem dependências.
 */

const axios = require('axios');

const { enderecoAbi, uintAbi, uintDe } = require('./hyperevm');

const RPC_TIMEOUT_MS = 15000;

// O mesmo endereço em todas as redes (https://www.multicall3.com)
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
const SEL_AGGREGATE3 = '0x82ad56cb';   // aggregate3((address,bool,bytes)[])
const POR_MULTICALL = 100;             // chamadas por eth_call: o limite de gas do RPC fica longe

/*
 * Erro com o motivo para o WhatsApp; o detalhe técnico fica no log. O
 * rotulo diz de onde veio ("RPC da Base").
 */
class ErroEvm extends Error {
    constructor(motivo, detalhe = motivo) {
        super(detalhe);
        this.motivo = motivo;
    }
}

const bytesHex = (hex) => hex.replace(/^0x/, '');
const preencher = (hex) => hex.padEnd(Math.ceil(hex.length / 64) * 64, '0');

/**
 * Um eth_call.
 * @param {string} url  o RPC
 * @param {string} rotulo  "RPC da Base", para as mensagens
 * @returns {Promise<string>} o retorno, em hex
 */
async function ethCall(url, { to, data }, rotulo) {
    let resposta;
    try {
        const corpo = { jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] };
        resposta = await axios.post(url, corpo, {
            timeout: RPC_TIMEOUT_MS,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        const status = err.response?.status;
        const estourou = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || /timeout/i.test(err.message);
        if (estourou) {
            throw new ErroEvm(`O ${rotulo} não respondeu em ${RPC_TIMEOUT_MS / 1000} segundos.`,
                `timeout: ${err.message}`);
        }
        if (status === 429) {
            throw new ErroEvm(`Muitas consultas seguidas: o ${rotulo} pediu um tempo.`, 'HTTP 429 (rate limit)');
        }
        if (status >= 500) throw new ErroEvm(`O ${rotulo} está fora do ar.`, `HTTP ${status}`);
        if (status) throw new ErroEvm(`O ${rotulo} respondeu com erro.`, `HTTP ${status}`);
        throw new ErroEvm(`Não consegui falar com o ${rotulo}.`, err.message);
    }

    const { data: corpo } = resposta;
    if (corpo?.error) {
        const limite = /rate|limit|too many/i.test(corpo.error.message ?? '');
        const motivo = limite
            ? `Muitas consultas seguidas: o ${rotulo} pediu um tempo.`
            : `O ${rotulo} recusou a consulta.`;
        throw new ErroEvm(motivo, `${rotulo}: ${corpo.error.message ?? JSON.stringify(corpo.error)}`);
    }
    if (typeof corpo?.result !== 'string' || !/^0x[0-9a-f]*$/i.test(corpo.result)) {
        throw new ErroEvm(`O ${rotulo} mandou uma resposta inesperada.`,
            `resultado inválido: ${JSON.stringify(corpo)?.slice(0, 200)}`);
    }
    // Endereço sem contrato: o eth_call "funciona" e devolve vazio
    if (corpo.result === '0x') {
        throw new ErroEvm('Contrato não encontrado na rede.', `${to}: eth_call vazio (sem contrato?)`);
    }
    return corpo.result;
}

/*
 * aggregate3((address target, bool allowFailure, bytes callData)[]): a lista
 * dinâmica de tuplas dinâmicas, no formato da ABI (offsets em bytes, cada
 * campo em 32).
 */
function codificarAggregate3(chamadas) {
    const elementos = chamadas.map(({ to, data }) => {
        const dados = bytesHex(data);
        // target, allowFailure (true), offset do bytes (3 palavras), tamanho e os bytes
        return enderecoAbi(to) + uintAbi(1) + uintAbi(0x60) +
            uintAbi(dados.length / 2) + preencher(dados);
    });

    let offset = chamadas.length * 32;
    const offsets = elementos.map(e => {
        const atual = offset;
        offset += e.length / 2;
        return uintAbi(atual);
    });

    return SEL_AGGREGATE3 + uintAbi(0x20) + uintAbi(chamadas.length) +
        offsets.join('') + elementos.join('');
}

// O retorno: (bool success, bytes returnData)[]
function decodificarAggregate3(hex) {
    const h = bytesHex(hex);
    const inicio = Number(uintDe(h, 0)) * 2;                 // onde está a lista
    const n = Number(uintDe(h.slice(inicio), 0));
    const base = inicio + 64;                                // depois do tamanho

    return Array.from({ length: n }, (_, i) => {
        const elemento = base + Number(uintDe(h.slice(base), i)) * 2;
        const ok = uintDe(h.slice(elemento), 0) === 1n;
        const dados = elemento + Number(uintDe(h.slice(elemento), 1)) * 2;
        const tamanho = Number(uintDe(h.slice(dados), 0));
        return { ok, data: `0x${h.slice(dados + 64, dados + 64 + tamanho * 2)}` };
    });
}

/**
 * Várias chamadas de leitura em poucos eth_call (o Multicall3). Uma que
 * falha não derruba as outras: vem com ok = false.
 * @param {Array<{ to: string, data: string }>} chamadas
 * @returns {Promise<Array<{ ok: boolean, data: string }>>}
 */
async function multicall(url, chamadas, rotulo) {
    const resultados = [];
    for (let i = 0; i < chamadas.length; i += POR_MULTICALL) {
        const lote = chamadas.slice(i, i + POR_MULTICALL);
        const hex = await ethCall(url, { to: MULTICALL3, data: codificarAggregate3(lote) }, rotulo);

        let lidos;
        try {
            lidos = decodificarAggregate3(hex);
        } catch (err) {
            throw new ErroEvm(`O ${rotulo} mandou uma resposta inesperada.`,
                `aggregate3 ilegível: ${err.message}`);
        }
        if (lidos.length !== lote.length) {
            throw new ErroEvm(`O ${rotulo} mandou uma resposta inesperada.`,
                `aggregate3: ${lidos.length} de ${lote.length} resultados`);
        }
        resultados.push(...lidos);
    }
    return resultados;
}

/*
 * Decodificação dos retornos que o Aave usa e o hyperevm.js não tem.
 */

// string ABI na palavra i (offset) de um retorno
function textoNaPalavra(hex, i) {
    const h = bytesHex(hex);
    const inicio = Number(uintDe(h, i)) * 2;
    const tamanho = Number(uintDe(h.slice(inicio), 0));
    return Buffer.from(h.slice(inicio + 64, inicio + 64 + tamanho * 2), 'hex').toString('utf8');
}

// Uma lista de endereços (address[]) na palavra i
function listaDeUint(hex, i = 0) {
    const h = bytesHex(hex);
    const inicio = Number(uintDe(h, i)) * 2;
    const n = Number(uintDe(h.slice(inicio), 0));
    return Array.from({ length: n }, (_, k) => uintDe(h.slice(inicio + 64), k));
}

// Codifica um address[] como único argumento
const listaDeEnderecosAbi = (enderecos) =>
    uintAbi(0x20) + uintAbi(enderecos.length) + enderecos.map(enderecoAbi).join('');

module.exports = {
    ErroEvm,
    MULTICALL3,
    codificarAggregate3,
    decodificarAggregate3,
    ethCall,
    listaDeEnderecosAbi,
    listaDeUint,
    multicall,
    textoNaPalavra
};
