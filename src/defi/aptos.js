/*
 * Aptos: the fullnode REST API (setting 'defi.aptos.rpc') and the indexer
 * GraphQL (setting 'defi.aptos.indexer'), read-only. The Geomi key
 * (APTOS_API_KEY or the defi.aptos.apikey setting) is optional: without it, the
 * anonymous per-IP limit, which is enough for the bot's use.
 */

const axios = require('axios');

const { envOuSetting, getSetting } = require('../settings');

const TIMEOUT_MS = 15000;

// 0x and up to 64 hex digits (the framework's 0x1 is 0x000…001)
const isAddressAptos = (textAlt) => /^0x[0-9a-fA-F]{1,64}$/.test(String(textAlt ?? ''));
const normalizeAddress = (address) => `0x${address.replace(/^0x/i, '').toLowerCase().padStart(64, '0')}`;

const headers = () => {
    const keyAlt = envOuSetting('APTOS_API_KEY', 'defi.aptos.apikey');
    return keyAlt ? { Authorization: `Bearer ${keyAlt}` } : {};
};

// The readable error from the fullnode ({ message, error_code }) or from axios
function errorAptos(err, whereAlt) {
    const body = err.response?.data;
    const reasonAlt = body?.message ?? body?.errors?.[0]?.message ?? err.message;
    const e = new Error(`${whereAlt} da Aptos: ${err.response?.status === 429 ? 'limite de consultas atingido' : reasonAlt}`);
    e.status = err.response?.status;
    return e;
}

const url = (pathAlt) => `${getSetting('defi.aptos.rpc').replace(/\/+$/, '')}${pathAlt}`;

/**
 * A resource by exact type, or null if the account does not have it.
 */
async function resource(address, type) {
    try {
        const { data } = await axios.get(url(`/accounts/${address}/resource/${encodeURIComponent(type)}`),
            { headers: headers(), timeout: TIMEOUT_MS });
        return data;
    } catch (err) {
        if (err.response?.status === 404) return null;
        throw errorAptos(err, 'RPC');
    }
}

/**
 * A #[view] function (e.g.: 0x1::coin::balance<T>(account)).
 * @returns {Promise<any[]>} the return values
 */
async function view(fn, types = [], args = []) {
    try {
        const { data } = await axios.post(url('/view'),
            { function: fn, type_arguments: types, arguments: args },
            { headers: headers(), timeout: TIMEOUT_MS });
        return data;
    } catch (err) {
        throw errorAptos(err, 'RPC');
    }
}

/**
 * Query to the indexer (GraphQL).
 */
async function indexer(query, variables) {
    try {
        const { data } = await axios.post(getSetting('defi.aptos.indexer'), { query, variables },
            { headers: headers(), timeout: TIMEOUT_MS });
        if (data?.errors?.length) throw Object.assign(new Error(data.errors[0].message), { response: { data } });
        return data.data;
    } catch (err) {
        throw errorAptos(err, 'Indexador');
    }
}

/*
 * The generic types of a Move type, at the first level:
 * "a::m::S<A, b::c::D<E, F>, G>" → ["A", "b::c::D<E, F>", "G"]
 */
function typeArguments(type) {
    const start = type.indexOf('<');
    if (start < 0 || !type.endsWith('>')) return [];
    const partsAlt = [];
    let level = 0;
    let current = '';
    for (const c of type.slice(start + 1, -1)) {
        if (c === ',' && level === 0) {
            partsAlt.push(current.trim());
            current = '';
            continue;
        }
        if (c === '<') level++;
        if (c === '>') level--;
        current += c;
    }
    partsAlt.push(current.trim());
    return partsAlt;
}

// "0x1::aptos_coin::AptosCoin" → "0x000…001::aptos_coin::AptosCoin" (the same type, written in full)
const normalizeType = (type) => type.replace(/0x[0-9a-fA-F]{1,64}(?=::)/g, normalizeAddress);

module.exports = {
    typeArguments,
    indexer,
    isAddressAptos,
    normalizeAddress,
    normalizeType,
    resource,
    view
};
