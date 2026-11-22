/*
 * HyperEVM (chain 999): batched eth_call through the RPC (setting 'defi.hyperevm.rpc')
 * and the minimum ABI to read contracts. No dependencies: read-only.
 */

const axios = require('axios');

const { t } = require('../i18n');
const { getSetting } = require('../settings');

const RPC_TIMEOUT_MS = 15000;
const BATCH = 10;   // calls per request: the public RPC refuses large batches

const isAddressEvm = (textAlt) => /^0x[0-9a-fA-F]{40}$/.test(String(textAlt ?? ''));

// Argument encoding: each one takes 32 bytes
const word = (hex) => hex.replace(/^0x/, '').padStart(64, '0');
const addressAbi = (address) => word(address.toLowerCase());
const uintAbi = (n) => word(BigInt(n).toString(16));

// Return decoding: the i-th word as a number, signed integer or address
const wordIn = (hex, i) => hex.replace(/^0x/, '').slice(i * 64, (i + 1) * 64);
const uintFrom = (hex, i = 0) => BigInt(`0x${wordIn(hex, i) || '0'}`);
function intFrom(hex, i = 0) {
    const n = uintFrom(hex, i);
    return n >= 1n << 255n ? n - (1n << 256n) : n;
}
const addressAlt = (hex, i = 0) => `0x${wordIn(hex, i).slice(24)}`;

// ABI string (offset, size, bytes); a raw bytes32 (old tokens) also works
function text(hex) {
    const h = hex.replace(/^0x/, '');
    if (h.length === 64) return Buffer.from(h, 'hex').toString('utf8').replace(/\0+$/, '');
    const size = Number(uintFrom(h, 1));
    return Buffer.from(h.slice(128, 128 + size * 2), 'hex').toString('utf8');
}

/**
 * Several calls in a few requests (the public RPC limits the number of requests).
 * @param {Array<{ to: string, data: string, from?: string }>} calls
 * @returns {Promise<string[]>} the return (hex) of each one, in order
 */
async function ethCall(calls) {
    const returns = [];
    for (let i = 0; i < calls.length; i += BATCH) returns.push(...await batch(calls.slice(i, i + BATCH)));
    return returns;
}

async function batch(calls) {
    const body = calls.map((c, id) => ({ jsonrpc: '2.0', id, method: 'eth_call', params: [c, 'latest'] }));
    const { data } = await axios.post(getSetting('defi.hyperevm.rpc'), body, { timeout: RPC_TIMEOUT_MS });

    // Without a batch (a general error, like "rate limited"), a single object comes
    if (!Array.isArray(data)) throw new Error(t('defi.err.hyperevm', { reason: data?.error?.message ?? t('defi.err.unexpected') }));

    const byId = new Map(data.map(r => [r.id, r]));
    return calls.map((c, id) => {
        const r = byId.get(id);
        if (!r || r.error) throw new Error(t('defi.err.hyperevm', { reason: `${r?.error?.message ?? t('defi.err.noResponse')} (${c.to})` }));
        return r.result;
    });
}

module.exports = {
    addressAbi,
    addressAlt,
    ethCall,
    intFrom,
    isAddressEvm,
    text,
    uintAbi,
    uintFrom
};
