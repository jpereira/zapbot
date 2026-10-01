/*
 * Solana: endereços (base58), PDAs e leitura de contas pelo RPC (setting 'defi.solana.rpc').
 * Sem dependências: o bot só lê contas, não assina nada.
 */

const crypto = require('crypto');
const axios = require('axios');

const { getSetting } = require('../settings');

const ALFABETO = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const RPC_TIMEOUT_MS = 15000;

function base58Decodificar(texto) {
    let n = 0n;
    for (const c of texto) {
        const i = ALFABETO.indexOf(c);
        if (i < 0) throw new Error(`caractere inválido em base58: ${c}`);
        n = n * 58n + BigInt(i);
    }

    const bytes = [];
    while (n > 0n) {
        bytes.unshift(Number(n & 255n));
        n >>= 8n;
    }
    for (const c of texto) {
        if (c !== '1') break;
        bytes.unshift(0);
    }
    return Buffer.from(bytes);
}

function base58Codificar(bytes) {
    let n = BigInt(`0x${Buffer.from(bytes).toString('hex') || '0'}`);
    let texto = '';
    while (n > 0n) {
        texto = ALFABETO[Number(n % 58n)] + texto;
        n /= 58n;
    }
    for (const b of bytes) {
        if (b !== 0) break;
        texto = `1${texto}`;
    }
    return texto;
}

// Endereço de conta: 32 bytes em base58
function isEnderecoSolana(texto) {
    try {
        return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(texto) && base58Decodificar(texto).length === 32;
    } catch {
        return false;
    }
}

/*
 * PDA (program derived address): sha256(sementes, bump, programa,
 * "ProgramDerivedAddress"), do bump 255 para baixo, até cair FORA da curva
 * ed25519 (um endereço sem chave privada).
 */
const P = 2n ** 255n - 19n;
const mod = (a) => ((a % P) + P) % P;

function potencia(base, exp) {
    let r = 1n;
    base = mod(base);
    while (exp > 0n) {
        if (exp & 1n) r = mod(r * base);
        base = mod(base * base);
        exp >>= 1n;
    }
    return r;
}

const D = mod(-121665n * potencia(121666n, P - 2n));

// Os 32 bytes são um ponto válido da ed25519? (y em little-endian; x² = (y²-1)/(d·y²+1) precisa ter raiz)
function naCurva(bytes) {
    const y = BigInt(`0x${Buffer.from(bytes).reverse().toString('hex')}`) & ((1n << 255n) - 1n);
    if (y >= P) return false;

    const y2 = mod(y * y);
    const u = mod(y2 - 1n);
    const v = mod(D * y2 + 1n);
    if (u === 0n) return true;

    const x2 = mod(u * potencia(v, P - 2n));
    return potencia(x2, (P - 1n) / 2n) === 1n;
}

function enderecoPda(sementes, programa) {
    const prog = base58Decodificar(programa);

    for (let bump = 255; bump >= 0; bump--) {
        const hash = crypto.createHash('sha256')
            .update(Buffer.concat([...sementes, Buffer.from([bump]), prog, Buffer.from('ProgramDerivedAddress')]))
            .digest();
        if (!naCurva(hash)) return base58Codificar(hash);
    }
    throw new Error('nenhum bump gerou um endereço fora da curva');
}

/**
 * Lê várias contas de uma vez (getMultipleAccounts).
 * @returns {Promise<Array<{ dados: Buffer, dono: string }|null>>} cada conta e o
 *   programa dono dela (null: a conta não existe)
 */
async function lerContas(enderecos) {
    const { data } = await axios.post(getSetting('defi.solana.rpc'), {
        jsonrpc: '2.0', id: 1, method: 'getMultipleAccounts', params: [enderecos, { encoding: 'base64' }]
    }, { timeout: RPC_TIMEOUT_MS });

    if (data.error) throw new Error(`RPC da Solana: ${data.error.message}`);
    return data.result.value.map(v => (v ? { dados: Buffer.from(v.data[0], 'base64'), dono: v.owner } : null));
}

// Leitura de campos little-endian de uma conta
const u128 = (b, o) => b.readBigUInt64LE(o) + (b.readBigUInt64LE(o + 8) << 64n);
const i128 = (b, o) => BigInt.asIntN(128, u128(b, o));
const chave = (b, o) => base58Codificar(b.subarray(o, o + 32));

module.exports = {
    base58Codificar,
    base58Decodificar,
    chave,
    enderecoPda,
    i128,
    isEnderecoSolana,
    lerContas,
    naCurva,
    u128
};
