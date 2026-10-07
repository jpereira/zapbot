/*
 * Liquidswap (liquidswap.com, by Pontem): Aptos' DEX, an AMM (x·y = k on the
 * Uncorrelated pools and x³y + xy³ = k on Stable), in versions v0 and v0.5. The
 * position is the LP coin (lp_coin::LP<X, Y, Curve>): its share of the supply is the
 * slice of the pool reserves. The swap fees go into the reserves, so it is already
 * are in the balance: there is no range nor fees to collect.
 *
 * The LP may be a coin (CoinStore) or, after Aptos' migration, as
 * fungible asset; the indexer finds both by wallet, with the balance. The pool,
 * the supply and the tokens come from the fullnode.
 */

const { typeArguments, indexer, normalizeAddress, normalizeType, resource, view } = require('./aptos');

/*
 * Each version: the package (the modules and the curves) and the pool accounting, where
 * the LiquidityPool<X, Y, Curve> and each LP's CoinInfo stay.
 */
const VERSIONS = [
    {
        nome: 'v0',
        pacote: normalizeAddress('0x190d44266241744264b964a37b8f09863167a12d3e70cda39376cfb4e3561e12'),
        contaDasPools: normalizeAddress('0x05a97986a9d031c4567e15b797be516910cfcb4156312482efc6a19c0a30c948')
    },
    {
        nome: 'v0.5',
        pacote: normalizeAddress('0x163df34fccbf003ce219d3f1d9e70d140b60622cb9dd47599c25fb2f797ba6e'),
        contaDasPools: normalizeAddress('0x61d2c22a6cb7831bee0f48363b0eec92369357aece0d1142062f7d5d85c7bef8')
    }
];

const MAX_POSITIONS = 20;
const RATE_SCALE = 10000;   // fee 30 = 0.3% (the liquidity_pool's FEE_SCALE)

// Dollar: the stable side of the pair (USDC, USDt, zUSDC...); without it, only the amounts
const isStable = (symbolAlt) => /USD/i.test(symbolAlt);

const BALANCES = `query ($dono: String) {
  current_fungible_asset_balances(where: { owner_address: { _eq: $dono }, amount: { _gt: "0" } }, limit: 500) {
    asset_type_v1
    amount
  }
}`;

// "LP<X, Y, Curve>" from one of the versions → { version, x, y, stable }; another type: null
function lpReadType(type) {
    const t = normalizeType(type);
    const version = VERSIONS.find(v => t.startsWith(`${v.contaDasPools}::lp_coin::LP<`));
    if (!version) return null;
    const [x, y, curve] = typeArguments(t);
    if (!curve?.startsWith(`${version.pacote}::curves::`)) return null;
    return { versao: version, tipo: t, x, y, curva: curve, estavel: curve.endsWith('::Stable') };
}

/*
 * Price of X in Y (how many Y 1 X is worth). In Uncorrelated (x·y = k), the ratio of the
 * reserves; on Stable (x³y + xy³ = k), the curve's derivative:
 * (3x²y + y³) / (x³ + 3xy²). With the reserves already in units (without the decimals).
 */
function poolPrice(x, y, stable) {
    if (!x || !y) return 0;
    return stable ? (3 * x * x * y + y ** 3) / (x ** 3 + 3 * x * y * y) : y / x;
}

// The wallet in the indexer form (0x and 64 hex digits)
async function walletLps(wallet) {
    const r = await indexer(BALANCES, { dono: normalizeAddress(wallet) });
    const byType = new Map();
    for (const b of r?.current_fungible_asset_balances ?? []) {
        const lp = b.asset_type_v1 && lpReadType(b.asset_type_v1);
        if (!lp) continue;
        const balance = BigInt(b.amount);
        // The same LP in two places (coin and fungible asset): sum
        byType.set(lp.tipo, { ...lp, saldo: (byType.get(lp.tipo)?.saldo ?? 0n) + balance });
    }
    return [...byType.values()].slice(0, MAX_POSITIONS);
}

// symbol and decimals of a coin, once per type
async function infoDosTokens(types) {
    const unique = [...new Set(types)];
    const infos = await Promise.all(unique.map(async (t) => {
        const [[symbolAlt], [decimals]] = await Promise.all([view('0x1::coin::symbol', [t]), view('0x1::coin::decimals', [t])]);
        return [t, { simbolo: symbolAlt, decimais: Number(decimals) }];
    }));
    return new Map(infos);
}

/**
 * The wallet's positions (LPs with a balance), already calculated.
 * @returns {Promise<object[]>}
 */
async function positionsLiquidswap(wallet) {
    const lps = await walletLps(wallet);
    if (!lps.length) return [];

    const tokens = await infoDosTokens(lps.flatMap(lp => [lp.x, lp.y]));
    const positions = await Promise.all(lps.map(async (lp) => {
        const [pool, [supply]] = await Promise.all([
            resource(lp.versao.contaDasPools, `${lp.versao.pacote}::liquidity_pool::LiquidityPool<${lp.x}, ${lp.y}, ${lp.curva}>`),
            view('0x1::coin::supply', [lp.tipo])
        ]);
        const total = BigInt(supply?.vec?.[0] ?? 0);
        if (!pool || !total) return null;

        const tx = tokens.get(lp.x);
        const ty = tokens.get(lp.y);
        const reserveX = Number(pool.data.coin_x_reserve.value) / 10 ** tx.decimais;
        const reserveY = Number(pool.data.coin_y_reserve.value) / 10 ** ty.decimais;
        const slice = Number(lp.saldo) / Number(total);
        const price = poolPrice(reserveX, reserveY, lp.estavel);
        const usdY = isStable(ty.simbolo) ? 1 : isStable(tx.simbolo) && price ? 1 / price : null;

        return {
            tipo: lp.tipo,
            versao: lp.versao.nome,
            estavel: lp.estavel,
            simboloX: tx.simbolo,
            simboloY: ty.simbolo,
            taxa: Number(pool.data.fee) / RATE_SCALE * 100,   // em %
            fatia: slice,
            qtdX: reserveX * slice,
            qtdY: reserveY * slice,
            reservaX: reserveX,
            reservaY: reserveY,
            preco: price,
            usdX: usdY === null ? null : price * usdY,
            usdY
        };
    }));

    // From largest to smallest (in dollars; without a price, at the end)
    const valueAlt = (p) => (p.usdY === null ? -1 : p.qtdX * p.usdX + p.qtdY * p.usdY);
    return positions.filter(Boolean).sort((a, b) => valueAlt(b) - valueAlt(a));
}

module.exports = {
    MAX_POSITIONS,
    VERSIONS,
    lpReadType,
    positionsLiquidswap,
    poolPrice
};
