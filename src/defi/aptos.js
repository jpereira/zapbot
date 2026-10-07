/*
 * Aptos: a API REST do fullnode (setting 'defi.aptos.rpc') e o indexador
 * GraphQL (setting 'defi.aptos.indexer'), só para leitura. A chave da Geomi
 * (APTOS_API_KEY ou o setting defi.aptos.apikey) é opcional: sem ela, vale o
 * limite anônimo por IP, que basta para o uso do bot.
 */

const axios = require('axios');

const { envOuSetting, getSetting } = require('../settings');

const TIMEOUT_MS = 15000;

// 0x e até 64 hexadecimais (o 0x1 do framework é o 0x000…001)
const isEnderecoAptos = (texto) => /^0x[0-9a-fA-F]{1,64}$/.test(String(texto ?? ''));
const normalizarEndereco = (endereco) => `0x${endereco.replace(/^0x/i, '').toLowerCase().padStart(64, '0')}`;

const cabecalhos = () => {
    const chave = envOuSetting('APTOS_API_KEY', 'defi.aptos.apikey');
    return chave ? { Authorization: `Bearer ${chave}` } : {};
};

// O erro legível do fullnode ({ message, error_code }) ou do axios
function erroAptos(err, onde) {
    const corpo = err.response?.data;
    const motivo = corpo?.message ?? corpo?.errors?.[0]?.message ?? err.message;
    const e = new Error(`${onde} da Aptos: ${err.response?.status === 429 ? 'limite de consultas atingido' : motivo}`);
    e.status = err.response?.status;
    return e;
}

const url = (caminho) => `${getSetting('defi.aptos.rpc').replace(/\/+$/, '')}${caminho}`;

/**
 * Um recurso pelo tipo exato, ou null se a conta não tem.
 */
async function recurso(endereco, tipo) {
    try {
        const { data } = await axios.get(url(`/accounts/${endereco}/resource/${encodeURIComponent(tipo)}`),
            { headers: cabecalhos(), timeout: TIMEOUT_MS });
        return data;
    } catch (err) {
        if (err.response?.status === 404) return null;
        throw erroAptos(err, 'RPC');
    }
}

/**
 * Uma função #[view] (ex.: 0x1::coin::balance<T>(conta)).
 * @returns {Promise<any[]>} os valores de retorno
 */
async function view(funcao, tipos = [], argumentos = []) {
    try {
        const { data } = await axios.post(url('/view'),
            { function: funcao, type_arguments: tipos, arguments: argumentos },
            { headers: cabecalhos(), timeout: TIMEOUT_MS });
        return data;
    } catch (err) {
        throw erroAptos(err, 'RPC');
    }
}

/**
 * Consulta ao indexador (GraphQL).
 */
async function indexador(query, variables) {
    try {
        const { data } = await axios.post(getSetting('defi.aptos.indexer'), { query, variables },
            { headers: cabecalhos(), timeout: TIMEOUT_MS });
        if (data?.errors?.length) throw Object.assign(new Error(data.errors[0].message), { response: { data } });
        return data.data;
    } catch (err) {
        throw erroAptos(err, 'Indexador');
    }
}

/*
 * Os tipos genéricos de um tipo Move, no primeiro nível:
 * "a::m::S<A, b::c::D<E, F>, G>" → ["A", "b::c::D<E, F>", "G"]
 */
function argumentosDoTipo(tipo) {
    const inicio = tipo.indexOf('<');
    if (inicio < 0 || !tipo.endsWith('>')) return [];
    const partes = [];
    let nivel = 0;
    let atual = '';
    for (const c of tipo.slice(inicio + 1, -1)) {
        if (c === ',' && nivel === 0) {
            partes.push(atual.trim());
            atual = '';
            continue;
        }
        if (c === '<') nivel++;
        if (c === '>') nivel--;
        atual += c;
    }
    partes.push(atual.trim());
    return partes;
}

// "0x1::aptos_coin::AptosCoin" → "0x000…001::aptos_coin::AptosCoin" (o mesmo tipo, escrito por inteiro)
const normalizarTipo = (tipo) => tipo.replace(/0x[0-9a-fA-F]{1,64}(?=::)/g, normalizarEndereco);

module.exports = {
    argumentosDoTipo,
    indexador,
    isEnderecoAptos,
    normalizarEndereco,
    normalizarTipo,
    recurso,
    view
};
