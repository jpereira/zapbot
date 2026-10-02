/*
 * HyperEVM (chain 999): eth_call em lote pelo RPC (setting 'defi.hyperevm.rpc')
 * e o mínimo de ABI para ler contratos. Sem dependências: só leitura.
 */

const axios = require('axios');

const { getSetting } = require('../settings');

const RPC_TIMEOUT_MS = 15000;
const LOTE = 10;   // chamadas por pedido: o RPC público recusa lotes grandes

const isEnderecoEvm = (texto) => /^0x[0-9a-fA-F]{40}$/.test(String(texto ?? ''));

// Codificação dos argumentos: cada um ocupa 32 bytes
const palavra = (hex) => hex.replace(/^0x/, '').padStart(64, '0');
const enderecoAbi = (endereco) => palavra(endereco.toLowerCase());
const uintAbi = (n) => palavra(BigInt(n).toString(16));

// Decodificação do retorno: a i-ésima palavra como número, inteiro com sinal ou endereço
const palavraEm = (hex, i) => hex.replace(/^0x/, '').slice(i * 64, (i + 1) * 64);
const uintDe = (hex, i = 0) => BigInt(`0x${palavraEm(hex, i) || '0'}`);
function intDe(hex, i = 0) {
    const n = uintDe(hex, i);
    return n >= 1n << 255n ? n - (1n << 256n) : n;
}
const enderecoDe = (hex, i = 0) => `0x${palavraEm(hex, i).slice(24)}`;

// string ABI (offset, tamanho, bytes); um bytes32 cru (tokens antigos) também serve
function textoDe(hex) {
    const h = hex.replace(/^0x/, '');
    if (h.length === 64) return Buffer.from(h, 'hex').toString('utf8').replace(/\0+$/, '');
    const tamanho = Number(uintDe(h, 1));
    return Buffer.from(h.slice(128, 128 + tamanho * 2), 'hex').toString('utf8');
}

/**
 * Várias chamadas em poucos pedidos (o RPC público limita a quantidade de pedidos).
 * @param {Array<{ to: string, data: string, from?: string }>} chamadas
 * @returns {Promise<string[]>} o retorno (hex) de cada uma, na ordem
 */
async function ethCall(chamadas) {
    const retornos = [];
    for (let i = 0; i < chamadas.length; i += LOTE) retornos.push(...await lote(chamadas.slice(i, i + LOTE)));
    return retornos;
}

async function lote(chamadas) {
    const corpo = chamadas.map((c, id) => ({ jsonrpc: '2.0', id, method: 'eth_call', params: [c, 'latest'] }));
    const { data } = await axios.post(getSetting('defi.hyperevm.rpc'), corpo, { timeout: RPC_TIMEOUT_MS });

    // Sem lote (erro geral, como o "rate limited"), vem um objeto só
    if (!Array.isArray(data)) throw new Error(`RPC da HyperEVM: ${data?.error?.message ?? 'resposta inesperada'}`);

    const porId = new Map(data.map(r => [r.id, r]));
    return chamadas.map((c, id) => {
        const r = porId.get(id);
        if (!r || r.error) throw new Error(`RPC da HyperEVM: ${r?.error?.message ?? 'sem resposta'} (${c.to})`);
        return r.result;
    });
}

module.exports = {
    enderecoAbi,
    enderecoDe,
    ethCall,
    intDe,
    isEnderecoEvm,
    textoDe,
    uintAbi,
    uintDe
};
