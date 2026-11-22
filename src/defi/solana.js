/*
 * Solana: addresses (base58), PDAs and account reading through the RPC (setting 'defi.solana.rpc').
 * No dependencies: the bot only reads accounts, it signs nothing.
 */

const crypto = require('crypto');
const axios = require('axios');

const { t } = require('../i18n');
const { getSetting } = require('../settings');

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const RPC_TIMEOUT_MS = 15000;

function base58Decode(textAlt) {
    let n = 0n;
    for (const c of textAlt) {
        const i = ALPHABET.indexOf(c);
        if (i < 0) throw new Error(`caractere inválido em base58: ${c}`);
        n = n * 58n + BigInt(i);
    }

    const bytes = [];
    while (n > 0n) {
        bytes.unshift(Number(n & 255n));
        n >>= 8n;
    }
    for (const c of textAlt) {
        if (c !== '1') break;
        bytes.unshift(0);
    }
    return Buffer.from(bytes);
}

function base58Encode(bytes) {
    let n = BigInt(`0x${Buffer.from(bytes).toString('hex') || '0'}`);
    let textAlt = '';
    while (n > 0n) {
        textAlt = ALPHABET[Number(n % 58n)] + textAlt;
        n /= 58n;
    }
    for (const b of bytes) {
        if (b !== 0) break;
        textAlt = `1${textAlt}`;
    }
    return textAlt;
}

// Account address: 32 bytes in base58
function isAddressSolana(textAlt) {
    try {
        return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(textAlt) && base58Decode(textAlt).length === 32;
    } catch {
        return false;
    }
}

/*
 * PDA (program derived address): sha256(sementes, bump, programa,
 * "ProgramDerivedAddress"), from bump 255 downward, until it falls OFF the curve
 * ed25519 (an address without a private key).
 */
const P = 2n ** 255n - 19n;
const mod = (a) => ((a % P) + P) % P;

function power(base, exp) {
    let r = 1n;
    base = mod(base);
    while (exp > 0n) {
        if (exp & 1n) r = mod(r * base);
        base = mod(base * base);
        exp >>= 1n;
    }
    return r;
}

const D = mod(-121665n * power(121666n, P - 2n));

// Are the 32 bytes a valid ed25519 point? (little-endian y; x² = (y²-1)/(d·y²+1) must have a root)
function inCurve(bytes) {
    const y = BigInt(`0x${Buffer.from(bytes).reverse().toString('hex')}`) & ((1n << 255n) - 1n);
    if (y >= P) return false;

    const y2 = mod(y * y);
    const u = mod(y2 - 1n);
    const v = mod(D * y2 + 1n);
    if (u === 0n) return true;

    const x2 = mod(u * power(v, P - 2n));
    return power(x2, (P - 1n) / 2n) === 1n;
}

function addressPda(seeds, program) {
    const prog = base58Decode(program);

    for (let bump = 255; bump >= 0; bump--) {
        const hash = crypto.createHash('sha256')
            .update(Buffer.concat([...seeds, Buffer.from([bump]), prog, Buffer.from('ProgramDerivedAddress')]))
            .digest();
        if (!inCurve(hash)) return base58Encode(hash);
    }
    throw new Error('nenhum bump gerou um endereço fora da curva');
}

/**
 * Reads several accounts at once (getMultipleAccounts).
 * @returns {Promise<Array<{ data: Buffer, owner: string }|null>>} each account and the
 * owner program of it (null: the account does not exist)
 */
async function readAccounts(addresses) {
    const { data } = await axios.post(getSetting('defi.solana.rpc'), {
        jsonrpc: '2.0', id: 1, method: 'getMultipleAccounts', params: [addresses, { encoding: 'base64' }]
    }, { timeout: RPC_TIMEOUT_MS });

    if (data.error) throw new Error(t('defi.err.solana', { reason: data.error.message }));
    return data.result.value.map(v => (v ? { data: Buffer.from(v.data[0], 'base64'), owner: v.owner } : null));
}

// Reading little-endian fields of an account
const u128 = (b, o) => b.readBigUInt64LE(o) + (b.readBigUInt64LE(o + 8) << 64n);
const i128 = (b, o) => BigInt.asIntN(128, u128(b, o));
const keyAlt = (b, o) => base58Encode(b.subarray(o, o + 32));

module.exports = {
    base58Encode,
    base58Decode,
    keyAlt,
    addressPda,
    i128,
    isAddressSolana,
    readAccounts,
    inCurve,
    u128
};
