/*
 * Orca (Whirlpools): reading a concentrated liquidity position and the
 * "Position Details" (balance, range, price, fees and rewards to collect).
 */

const crypto = require('crypto');
const axios = require('axios');

const { base58Decode, keyAlt, addressPda, readAccounts, u128 } = require('./solana');

/*
 * Everything is read on-chain, at the same instant (position, pool and the tick arrays of the
 * range limits), and the calculations follow Orca's program:
 * - amount of each token: the position liquidity between the range prices;
 * - fees to collect: fee_owed + liquidity × (growth of the fees INSIDE the
 * range − the position's checkpoint), in Q64.64 and modulo 2^128, like the
 * the SDK's collectFeesQuote; rewards, the same way (collectRewardsQuote).
 * Orca's public API gives what is not on-chain: symbols, decimals,
 * dollar prices and the pool statistics.
 */
const WHIRLPOOL_PROGRAM = 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc';
const ORCA_API = 'https://api.orca.so/v2/solana';
const API_TIMEOUT_MS = 15000;

const TICKS_PER_ARRAY = 88;
const MOD128 = 1n << 128n;
const Q64 = 1n << 64n;

// Anchor discriminators: sha256("account:<Name>")[0..8]
const discriminator = (nameAlt) => crypto.createHash('sha256').update(`account:${nameAlt}`).digest().subarray(0, 8);
const DISC = {
    posicao: discriminator('Position'),
    pool: discriminator('Whirlpool'),
    tickArray: discriminator('TickArray'),
    tickArrayDinamico: discriminator('DynamicTickArray')
};
const typeIs = (dataAlt, type) => dataAlt.subarray(0, 8).equals(DISC[type]);

/*
 * Account layouts (bytes) of the Whirlpool program
 */
function decodePosition(b) {
    return {
        whirlpool: keyAlt(b, 8),
        mint: keyAlt(b, 40),
        liquidez: u128(b, 72),
        tickInferior: b.readInt32LE(88),
        tickSuperior: b.readInt32LE(92),
        checkpointTaxaA: u128(b, 96),
        taxaDevidaA: b.readBigUInt64LE(112),
        checkpointTaxaB: u128(b, 120),
        taxaDevidaB: b.readBigUInt64LE(136),
        recompensas: [0, 1, 2].map(i => ({
            checkpoint: u128(b, 144 + i * 24),
            devido: b.readBigUInt64LE(160 + i * 24)
        }))
    };
}

function decodePool(b) {
    return {
        tickSpacing: b.readUInt16LE(41),
        feeRate: b.readUInt16LE(45),            // in millionths: 1600 = 0.16%
        taxaProtocolo: b.readUInt16LE(47),      // in tenths of a thousandth of the rate: 1300 = 13%
        liquidez: u128(b, 49),
        sqrtPrice: u128(b, 65),
        tickAtual: b.readInt32LE(81),
        mintA: keyAlt(b, 101),
        crescimentoTaxaA: u128(b, 165),
        mintB: keyAlt(b, 181),
        crescimentoTaxaB: u128(b, 245),
        recompensaAtualizadaEm: Number(b.readBigUInt64LE(261)),
        recompensas: [0, 1, 2].map(i => {
            const o = 269 + i * 128;
            return { mint: keyAlt(b, o), emissoesX64: u128(b, o + 96), crescimentoX64: u128(b, o + 112) };
        })
    };
}

// A tick: what matters here are the "outside" growths (fees and rewards)
const decodeTick = (b, o) => ({
    foraTaxaA: u128(b, o + 32),
    foraTaxaB: u128(b, o + 48),
    foraRecompensas: [u128(b, o + 64), u128(b, o + 80), u128(b, o + 96)]
});
const TICK_EMPTY = { foraTaxaA: 0n, foraTaxaB: 0n, foraRecompensas: [0n, 0n, 0n] };

/*
 * Fixed tick array: start_tick_index (i32) and 88 ticks of 113 bytes (initialized,
 * liquidity_net, liquidity_gross, fee_growth_outside_a/b, reward_growths_outside[3]).
 * Dynamic: start_tick_index, whirlpool, bitmap (u128) and each tick with 1 byte of
 * tag (0 = empty, 1 = followed by the tick's 112 bytes).
 */
function decodeTickArray(b) {
    const ticks = [];

    if (typeIs(b, 'tickArray')) {
        for (let i = 0; i < TICKS_PER_ARRAY; i++) {
            const o = 12 + i * 113;
            ticks.push(b[o] ? decodeTick(b, o + 1) : TICK_EMPTY);
        }
    } else if (typeIs(b, 'tickArrayDinamico')) {
        let o = 60;
        for (let i = 0; i < TICKS_PER_ARRAY; i++) {
            if (b[o] === 1) {
                ticks.push(decodeTick(b, o + 1));
                o += 113;
            } else {
                ticks.push(TICK_EMPTY);
                o += 1;
            }
        }
    } else {
        throw new Error('conta não é um tick array da Orca');
    }

    return { inicio: b.readInt32LE(8), ticks };
}

const tickArrayStart = (tick, spacing) => Math.floor(tick / (spacing * TICKS_PER_ARRAY)) * spacing * TICKS_PER_ARRAY;

const addressTickArray = (pool, start) =>
    addressPda([Buffer.from('tick_array'), base58Decode(pool), Buffer.from(String(start))], WHIRLPOOL_PROGRAM);

// The position is the PDA ["position", NFT mint]
const positionAddress = (nft) => addressPda([Buffer.from('position'), base58Decode(nft)], WHIRLPOOL_PROGRAM);

/*
 * Growth INSIDE the range = global − below(lower) − above(upper), modulo 2^128
 */
function growthInside(global, outsideInferior, outsideSuperior, tickCurrent, tickInferior, tickSuperior) {
    const below = tickCurrent >= tickInferior ? outsideInferior : global - outsideInferior;
    const above = tickCurrent < tickSuperior ? outsideSuperior : global - outsideSuperior;
    return (((global - below - above) % MOD128) + MOD128) % MOD128;
}

// devido + liquidez × (dentro − checkpoint) / 2^64
const aCollect = (due, inside, checkpoint, liquidity) =>
    due + (((((inside - checkpoint) % MOD128) + MOD128) % MOD128) * liquidity) / Q64;

/**
 * Amounts and values to collect from a position, in minimum units (BigInt).
 * Pure function: receives the accounts already decoded.
 */
function calculatePosition({ posicao: position, pool, tickInf, tickSup, agora: nowAlt = Date.now() }) {
    const L = Number(position.liquidez);
    const sa = Math.pow(1.0001, position.tickInferior / 2);
    const sb = Math.pow(1.0001, position.tickSuperior / 2);
    const sc = Number(pool.sqrtPrice) / 2 ** 64;

    let qtdA = 0;
    let qtdB = 0;
    if (sc <= sa) qtdA = L * (sb - sa) / (sa * sb);
    else if (sc >= sb) qtdB = L * (sb - sa);
    else {
        qtdA = L * (sb - sc) / (sc * sb);
        qtdB = L * (sc - sa);
    }

    const args = [pool.tickAtual, position.tickInferior, position.tickSuperior];
    const rateA = aCollect(position.taxaDevidaA,
        growthInside(pool.crescimentoTaxaA, tickInf.foraTaxaA, tickSup.foraTaxaA, ...args),
        position.checkpointTaxaA, position.liquidez);
    const rateB = aCollect(position.taxaDevidaB,
        growthInside(pool.crescimentoTaxaB, tickInf.foraTaxaB, tickSup.foraTaxaB, ...args),
        position.checkpointTaxaB, position.liquidez);

    // Rewards: the global growth moves with emissions since the pool's last update
    const elapsed = BigInt(Math.max(0, Math.floor(nowAlt / 1000) - pool.recompensaAtualizadaEm));
    const rewards = pool.recompensas.map((r, i) => {
        if (r.mint === '11111111111111111111111111111111') return null; // slot without a reward

        const global = pool.liquidez > 0n ? r.crescimentoX64 + (r.emissoesX64 * elapsed) / pool.liquidez : r.crescimentoX64;
        const inside = growthInside(global, tickInf.foraRecompensas[i], tickSup.foraRecompensas[i], ...args);
        return { mint: r.mint, quantidade: aCollect(position.recompensas[i].devido, inside, position.recompensas[i].checkpoint, position.liquidez) };
    }).filter(Boolean);

    return {
        qtdA, qtdB, taxaA: rateA, taxaB: rateB, recompensas: rewards,
        naFaixa: sc >= sa && sc < sb,
        // Raw price (B per A, without decimals) now and of the limits
        precoAtual: sc * sc, precoInferior: sa * sa, precoSuperior: sb * sb
    };
}

/**
 * Reads the position on-chain and checks that it really is an Orca position (and, if
 * informados, o NFT e a pool).
 * @returns {Promise<{ posicao } | { erro }>}
 */
async function validatePosition({ endereco: address, nft = null, pool = null }) {
    const [account] = await readAccounts([address]);

    if (!account) return { erro: `❌ A conta ${address} não existe na Solana.` };
    if (account.dono !== WHIRLPOOL_PROGRAM || !typeIs(account.dados, 'posicao')) {
        return { erro: `❌ ${address} não é uma posição da Orca (Whirlpool).` };
    }

    const position = decodePosition(account.dados);

    if (pool && pool !== position.whirlpool) {
        return { erro: `❌ A posição é da pool ${position.whirlpool}, não da ${pool}.` };
    }
    if (nft && (nft !== position.mint || positionAddress(nft) !== address)) {
        return { erro: `❌ O NFT ${nft} não é o desta posição (o dela é ${position.mint}).` };
    }

    return { posicao: position };
}

const orcaApi = async (pathAlt) => (await axios.get(`${ORCA_API}/${pathAlt}`, { timeout: API_TIMEOUT_MS })).data.data;

/**
 * Everything /defi -s shows about a position. Two RPC reads: the
 * position with the pool (stored in the registration) and the limit tick arrays.
 */
async function positionDetails(address, addressPool, nowAlt = Date.now()) {
    const [accountPosition, accountPool] = await readAccounts([address, addressPool]);
    if (!accountPosition || !typeIs(accountPosition.dados, 'posicao')) throw new Error('a posição não existe mais (foi fechada?)');
    if (!accountPool || !typeIs(accountPool.dados, 'pool')) throw new Error('a pool da posição não foi encontrada');

    const position = decodePosition(accountPosition.dados);
    const pool = decodePool(accountPool.dados);

    // The tick arrays of the two range limits (they may be the same)
    const starts = [position.tickInferior, position.tickSuperior].map(t => tickArrayStart(t, pool.tickSpacing));
    const addresses = [...new Set(starts)].map(i => addressTickArray(position.whirlpool, i));
    const arrays = (await readAccounts(addresses)).map(c => (c ? decodeTickArray(c.dados) : null));

    const tickDe = (tick) => {
        const arr = arrays.find(a => a && a.inicio === tickArrayStart(tick, pool.tickSpacing));
        return arr ? arr.ticks[(tick - arr.inicio) / pool.tickSpacing] : TICK_EMPTY;
    };

    const calculation = calculatePosition({ posicao: position, pool, tickInf: tickDe(position.tickInferior), tickSup: tickDe(position.tickSuperior), agora: nowAlt });

    // Metadata and prices: Orca API
    const [infoPool, tokenA, tokenB, ...tokensReward] = await Promise.all([
        orcaApi(`pools/${position.whirlpool}`),
        orcaApi(`tokens/${pool.mintA}`),
        orcaApi(`tokens/${pool.mintB}`),
        ...calculation.recompensas.map(r => orcaApi(`tokens/${r.mint}`).catch(() => null))
    ]);

    return { endereco: address, posicao: position, pool, calculo: calculation, infoPool, tokenA, tokenB, tokensRecompensa: tokensReward };
}

module.exports = {
    WHIRLPOOL_PROGRAM,
    calculatePosition,
    decodePool,
    decodePosition,
    decodeTickArray,
    positionDetails,
    positionAddress,
    addressTickArray,
    tickArrayStart,
    validatePosition
};
