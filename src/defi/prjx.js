/*
 * Project X (prjx.com): HyperEVM DEX, a Uniswap V3 fork. The positions are
 * NonfungiblePositionManager NFTs; the bot registers the wallet and reads its own.
 */

const { addressAbi, addressAlt, ethCall, intDe, text, uintAbi, uintDe } = require('./hyperevm');

const FACTORY = '0xFf7B3e8C00e57ea31477c32A5B52a58Eea47b072';
const POSITIONS = '0xeaD19AE861c29bBb2101E834922B2FEee69B9091'; // its factory() is FACTORY

// Selectors (first 4 bytes of the signature's keccak)
const SEL = {
    balanceOf: '0x70a08231',
    tokenOfOwnerByIndex: '0x2f745c59',
    positions: '0x99fbab88',
    getPool: '0x1698ee82',
    slot0: '0x3850c7bd',
    symbol: '0x95d89b41',
    decimals: '0x313ce567',
    collect: '0xfc6f7865'
};

const MAX_NFTS = 100;       // read from the wallet, from newest to oldest
const MAX_POSITIONS = 20;   // abertas mostradas
const UINT128_MAX = (1n << 128n) - 1n;

// Dollar: the stable side of the pair (USD₮0, USDC, USDe, USDH...); without it, only the amounts
const isStable = (symbolAlt) => /USD/i.test(symbolAlt);

/*
 * Position amounts from the liquidity and the price roots
 * (Uniswap V3 formulas, in floating point: it is for display, not for signing).
 */
function amounts(L, sqrtP, sa, sb) {
    if (sqrtP <= sa) return [L * (1 / sa - 1 / sb), 0];
    if (sqrtP >= sb) return [0, L * (sb - sa)];
    return [L * (1 / sqrtP - 1 / sb), L * (sqrtP - sa)];
}

/**
 * The wallet's open positions (with liquidity), already calculated.
 * @returns {Promise<object[]>}
 */
async function walletPositions(address) {
    const wallet = address.toLowerCase();
    const [balance] = await ethCall([{ to: POSITIONS, data: SEL.balanceOf + addressAbi(wallet) }]);
    const total = Number(uintDe(balance));
    const n = Math.min(total, MAX_NFTS);
    if (!n) return [];

    // The closed ones stay in the wallet (the NFT stays): starts with the newest
    const ids = (await ethCall(Array.from({ length: n }, (_, i) =>
        ({ to: POSITIONS, data: SEL.tokenOfOwnerByIndex + addressAbi(wallet) + uintAbi(total - 1 - i) })))).map(h => uintDe(h));

    const raw = (await ethCall(ids.map(id => ({ to: POSITIONS, data: SEL.positions + uintAbi(id) }))))
        .map((h, i) => ({
            id: ids[i],
            token0: addressAlt(h, 2),
            token1: addressAlt(h, 3),
            taxa: Number(uintDe(h, 4)),
            tickInferior: Number(intDe(h, 5)),
            tickSuperior: Number(intDe(h, 6)),
            liquidez: uintDe(h, 7)
        }))
        .filter(p => p.liquidez > 0n)
        .slice(0, MAX_POSITIONS);
    if (!raw.length) return [];

    // Tokens, pools and the fees to collect (the simulated collect, as if the wallet called it)
    const tokens = [...new Set(raw.flatMap(p => [p.token0, p.token1]))];
    const keyPool = (p) => `${p.token0}/${p.token1}/${p.taxa}`;
    const pools = [...new Map(raw.map(p => [keyPool(p), p])).values()];

    const r = await ethCall([
        ...tokens.flatMap(t => [{ to: t, data: SEL.symbol }, { to: t, data: SEL.decimals }]),
        ...pools.map(p => ({ to: FACTORY, data: SEL.getPool + addressAbi(p.token0) + addressAbi(p.token1) + uintAbi(p.taxa) })),
        ...raw.map(p => ({
            to: POSITIONS,
            from: wallet,
            data: SEL.collect + uintAbi(p.id) + addressAbi(wallet) + uintAbi(UINT128_MAX) + uintAbi(UINT128_MAX)
        }))
    ]);

    const infoToken = new Map(tokens.map((t, i) => [t, { simbolo: text(r[2 * i]), decimais: Number(uintDe(r[2 * i + 1])) }]));
    const addressPool = new Map(pools.map((p, i) => [keyPool(p), addressAlt(r[2 * tokens.length + i])]));
    const collections = r.slice(2 * tokens.length + pools.length);

    const addresses = [...new Set(addressPool.values())];
    const slots = new Map((await ethCall(addresses.map(a => ({ to: a, data: SEL.slot0 }))))
        .map((h, i) => [addresses[i], { sqrtPriceX96: uintDe(h, 0), tick: Number(intDe(h, 1)) }]));

    return raw.map((p, i) => {
        const pool = addressPool.get(keyPool(p));
        const { sqrtPriceX96, tick } = slots.get(pool);
        const t0 = infoToken.get(p.token0);
        const t1 = infoToken.get(p.token1);
        const scale = 10 ** (t0.decimais - t1.decimais);   // raw price → token1 per token0

        const sqrtP = Number(sqrtPriceX96) / 2 ** 96;
        const [sa, sb] = [p.tickInferior, p.tickSuperior].map(t => 1.0001 ** (t / 2));
        const [q0, q1] = amounts(Number(p.liquidez), sqrtP, sa, sb);

        const price = sqrtP ** 2 * scale;
        const usd1 = isStable(t1.simbolo) ? 1 : isStable(t0.simbolo) ? 1 / price : null;

        return {
            id: p.id,
            pool,
            taxa: p.taxa,
            simbolo0: t0.simbolo,
            simbolo1: t1.simbolo,
            naFaixa: tick >= p.tickInferior && tick < p.tickSuperior,
            qtd0: q0 / 10 ** t0.decimais,
            qtd1: q1 / 10 ** t1.decimais,
            taxa0: Number(uintDe(collections[i], 0)) / 10 ** t0.decimais,
            taxa1: Number(uintDe(collections[i], 1)) / 10 ** t1.decimais,
            preco: price,
            inferior: sa ** 2 * scale,
            superior: sb ** 2 * scale,
            usd0: usd1 === null ? null : price * usd1,
            usd1
        };
    });
}

module.exports = {
    FACTORY,
    MAX_NFTS,
    MAX_POSITIONS,
    POSITIONS,
    SEL,
    walletPositions,
    amounts
};
