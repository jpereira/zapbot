/*
 * Reading contracts on any EVM network (Ethereum, Base...): an eth_call
 * through the RPC and Multicall3, which joins dozens of calls into a single eth_call (the
 * The public RPC thanks you, and so does the rate limit). Read-only, no dependencies.
 */

const axios = require('axios');

const { t } = require('../i18n');
const { addressAbi, uintAbi, uintFrom } = require('./hyperevm');

const RPC_TIMEOUT_MS = 15000;

// The same address on all networks (https://www.multicall3.com)
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
const SEL_AGGREGATE3 = '0x82ad56cb';   // aggregate3((address,bool,bytes)[])
const BY_MULTICALL = 100;             // calls per eth_call: the RPC gas limit is far away

/*
 * Error with the reason for WhatsApp; the technical detail stays in the log. The
 * label says where it came from ("RPC da Base").
 */
class ErrorEvm extends Error {
    constructor(reasonAlt, detail = reasonAlt) {
        super(detail);
        this.reason = reasonAlt;
    }
}

const bytesHex = (hex) => hex.replace(/^0x/, '');
const fill = (hex) => hex.padEnd(Math.ceil(hex.length / 64) * 64, '0');

/**
 * An eth_call.
 * @param {string} url  o RPC
 * @param {string} label  "RPC da Base", for the messages
 * @returns {Promise<string>} the return, in hex
 */
async function ethCall(url, { to, data }, label) {
    let reply;
    try {
        const body = { jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] };
        reply = await axios.post(url, body, {
            timeout: RPC_TIMEOUT_MS,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        const status = err.response?.status;
        const exceeded = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || /timeout/i.test(err.message);
        if (exceeded) {
            throw new ErrorEvm(t('defi.err.evmTimeout', { label: label, s: RPC_TIMEOUT_MS / 1000 }),
                `timeout: ${err.message}`);
        }
        if (status === 429) {
            throw new ErrorEvm(t('defi.err.evmRate', { label: label }), 'HTTP 429 (rate limit)');
        }
        if (status >= 500) throw new ErrorEvm(t('defi.err.evmDown', { label: label }), `HTTP ${status}`);
        if (status) throw new ErrorEvm(t('defi.err.evmHttp', { label: label }), `HTTP ${status}`);
        throw new ErrorEvm(t('defi.err.evmCannotTalk', { label: label }), err.message);
    }

    const { data: body } = reply;
    if (body?.error) {
        const limitAlt = /usage|limit|too many/i.test(body.error.message ?? '');
        const reasonAlt = limitAlt
            ? t('defi.err.evmRate', { label: label })
            : t('defi.err.evmRefused', { label: label });
        throw new ErrorEvm(reasonAlt, `${label}: ${body.error.message ?? JSON.stringify(body.error)}`);
    }
    if (typeof body?.result !== 'string' || !/^0x[0-9a-f]*$/i.test(body.result)) {
        throw new ErrorEvm(t('defi.err.evmUnexpected', { label: label }),
            `resultado inválido: ${JSON.stringify(body)?.slice(0, 200)}`);
    }
    // Address with no contract: the eth_call "works" and returns empty
    if (body.result === '0x') {
        throw new ErrorEvm(t('defi.err.evmNoContract'), `${to}: eth_call vazio (sem contrato?)`);
    }
    return body.result;
}

/*
 * aggregate3((address target, bool allowFailure, bytes callData)[]): a list
 * dynamic of dynamic tuples, in the ABI format (offsets in bytes, each
 * field in 32).
 */
function encodeAggregate3(calls) {
    const elements = calls.map(({ to, data }) => {
        const dataAlt = bytesHex(data);
        // target, allowFailure (true), offset of the bytes (3 words), size and the bytes
        return addressAbi(to) + uintAbi(1) + uintAbi(0x60) +
            uintAbi(dataAlt.length / 2) + fill(dataAlt);
    });

    let offset = calls.length * 32;
    const offsets = elements.map(e => {
        const current = offset;
        offset += e.length / 2;
        return uintAbi(current);
    });

    return SEL_AGGREGATE3 + uintAbi(0x20) + uintAbi(calls.length) +
        offsets.join('') + elements.join('');
}

// O retorno: (bool success, bytes returnData)[]
function decodeAggregate3(hex) {
    const h = bytesHex(hex);
    const start = Number(uintFrom(h, 0)) * 2;                 // where the list is
    const n = Number(uintFrom(h.slice(start), 0));
    const base = start + 64;                                // after the size

    return Array.from({ length: n }, (_, i) => {
        const element = base + Number(uintFrom(h.slice(base), i)) * 2;
        const ok = uintFrom(h.slice(element), 0) === 1n;
        const dataAlt = element + Number(uintFrom(h.slice(element), 1)) * 2;
        const size = Number(uintFrom(h.slice(dataAlt), 0));
        return { ok, data: `0x${h.slice(dataAlt + 64, dataAlt + 64 + size * 2)}` };
    });
}

/**
 * Several read calls in a few eth_calls (Multicall3). One that
 * a failure does not take down the others: it comes with ok = false.
 * @param {Array<{ to: string, data: string }>} calls
 * @returns {Promise<Array<{ ok: boolean, data: string }>>}
 */
async function multicall(url, calls, label) {
    const results = [];
    for (let i = 0; i < calls.length; i += BY_MULTICALL) {
        const batch = calls.slice(i, i + BY_MULTICALL);
        const hex = await ethCall(url, { to: MULTICALL3, data: encodeAggregate3(batch) }, label);

        let read;
        try {
            read = decodeAggregate3(hex);
        } catch (err) {
            throw new ErrorEvm(t('defi.err.evmUnexpected', { label: label }),
                `aggregate3 ilegível: ${err.message}`);
        }
        if (read.length !== batch.length) {
            throw new ErrorEvm(t('defi.err.evmUnexpected', { label: label }),
                `aggregate3: ${read.length} de ${batch.length} resultados`);
        }
        results.push(...read);
    }
    return results;
}

/*
 * Decoding of the returns that Aave uses and hyperevm.js does not have.
 */

// ABI string at word i (offset) of a return
function textInWord(hex, i) {
    const h = bytesHex(hex);
    const start = Number(uintFrom(h, i)) * 2;
    const size = Number(uintFrom(h.slice(start), 0));
    return Buffer.from(h.slice(start + 64, start + 64 + size * 2), 'hex').toString('utf8');
}

// A list of addresses (address[]) at word i
function uintList(hex, i = 0) {
    const h = bytesHex(hex);
    const start = Number(uintFrom(h, i)) * 2;
    const n = Number(uintFrom(h.slice(start), 0));
    return Array.from({ length: n }, (_, k) => uintFrom(h.slice(start + 64), k));
}

// Encodes an address[] as a single argument
const addressesAbiList = (addresses) =>
    uintAbi(0x20) + uintAbi(addresses.length) + addresses.map(addressAbi).join('');

module.exports = {
    ErrorEvm,
    MULTICALL3,
    encodeAggregate3,
    decodeAggregate3,
    ethCall,
    addressesAbiList,
    uintList,
    multicall,
    textInWord
};
