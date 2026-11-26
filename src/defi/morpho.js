/*
 * Morpho: a wallet's positions through the official API (GraphQL at
 * https://api.morpho.org/graphql, setting 'defi.morpho.api'), on all networks
 * of the 'defi.morpho.chains' setting (default: Base, 8453). Read-only: no
 * private key, no transaction, just a POST with the query.
 *
 * How Morpho works (what matters here):
 * - Each market (marketId) has a loan token (loanAsset), one of
 * collateral (collateralAsset), an oracle and a fixed LLTV.
 * - The position holds the collateral, the borrowed (borrowAssets) and the supplied
 * (supplyAssets), in minimum units (BigInt).
 * - The oracle gives the price of 1 minimum unit of the collateral in units
 * loan minimums, scaled by 1e36 (ORACLE_PRICE_SCALE).
 * - The LLTV comes scaled by 1e18 (WAD): 860000000000000000 = 86%.
 * - The position is liquidatable when the LTV passes the LLTV.
 *
 * The formulas are the ones in the Morpho documentation
 * (https://docs.morpho.org/learn/concepts/liquidation/):
 * collateral value (in loan token) = collateral × price / 1e36
 * Health Factor = collateral value × LLTV / borrowed    (< 1: liquidatable)
 * LTV = borrowed / collateral value
 * And the liquidation price: the HF is proportional to the oracle price, so it
 * reaches 1 when the price drops to price / HF, that is,
 * liquidation price = borrowed × 1e36 / (collateral × LLTV)
 * All in BigInt (no floats with a 30-digit number); Number only comes in
 * at the end, for display. The healthFactor the API also sends serves as
 * check: if the computation here diverges, the warning stays in the log.
 */

const axios = require('axios');

const { isAddressEvm } = require('./hyperevm');
const { t } = require('../i18n');
const { printError, printInfo } = require('../log');
const { getSetting } = require('../settings');

const API_TIMEOUT_MS = 15000;
const CACHE_MS = 30000;

const ORACLE_PRICE_SCALE = 10n ** 36n;
const WAD = 10n ** 18n;
const PRECISION = 10n ** 6n;   // decimals kept in BigInt divisions (HF, LTV)

const ASSET = 'address symbol decimals price { usd }';

const QUERY_PER_NETWORK = `
    address
    marketPositions {
        healthFactor
        market {
            marketId
            lltv
            chain { id network }
            collateralAsset { ${ASSET} }
            loanAsset { ${ASSET} }
            state { price utilization }
        }
        state {
            collateral collateralUsd
            borrowAssets borrowAssetsUsd
            supplyAssets supplyAssetsUsd
        }
    }
    vaultPositions {
        vault { name symbol chain { id network } asset { ${ASSET} } }
        state { assets assetsUsd }
    }
    vaultV2Positions {
        vault { name symbol chain { id network } asset { ${ASSET} } }
        assets assetsUsd
    }`;

// One alias per network ("c8453: userByAddress(...)"): all in a single call
const query = (networks) => {
    const byNetwork = networks.map(id =>
        `\n    c${id}: userByAddress(address: $wallet, chainId: ${id}) {${QUERY_PER_NETWORK}\n    }`);
    return `query ($wallet: String!) {${byNetwork.join('')}\n}`;
};

/*
 * Error with the reason for WhatsApp (no stack, no URL); the technical details
 * stay in the log.
 */
class ErrorMorpho extends Error {
    constructor(reasonAlt, detail = reasonAlt) {
        super(detail);
        this.reason = reasonAlt;
    }
}

// "0x1234...abcd" for the log
const abbreviate = (wallet) => `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;

/*
 * API BigInt: small ones come as a JSON number, big ones as a string.
 * Something that is not an integer (or a number already without precision) becomes null.
 */
function integer(v) {
    if (typeof v === 'bigint') return v;
    if (typeof v === 'number') return Number.isSafeInteger(v) ? BigInt(v) : null;
    if (typeof v === 'string' && /^-?\d+$/.test(v)) return BigInt(v);
    return null;
}

const decimalsValid = (d) => Number.isInteger(d) && d >= 0 && d <= 36;
const numberAlt = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// raw / 10^decimals, without losing the integer part along the way
function splitPer10(raw, places) {
    const scale = 10n ** BigInt(places);
    return Number(raw / scale) + Number(raw % scale) / Number(scale);
}

// Minimum units → tokens (null: invalid decimals)
const inTokens = (raw, decimals) =>
    (raw === null || !decimalsValid(decimals) ? null : splitPer10(raw, decimals));

// The token: symbol (or the abbreviated address, if the API does not know), decimals and USD price
const token = (a) => ({
    symbol: a?.symbol || (a?.address ? `${a.address.slice(0, 6)}…${a.address.slice(-4)}` : '?'),
    decimals: a?.decimals,
    priceUsd: numberAlt(a?.price?.usd)
});

// USD value: the API's; without it, amount × token price (also from the API); otherwise null
const inUsd = (daApi, qty, t) =>
    numberAlt(daApi) ?? (qty !== null && t.priceUsd !== null ? qty * t.priceUsd : null);

/**
 * A market's risk metrics, by the Morpho formulas (see the top).
 * @param {{ collateral: bigint, borrowed: bigint, price: bigint|null, lltv: bigint }} p
 * everything in raw units
 * @returns {{ hf: number|null, ltv: number|null, liquidationPriceRaw: bigint|null }}
 * hf: Infinity without debt; null without the oracle price (or debt without collateral)
 */
function marketRisk({ collateral, borrowed, price, lltv }) {
    if (borrowed <= 0n) return { hf: Infinity, ltv: 0, liquidationPriceRaw: null };
    // Debt with no collateral (or no price): dividing by zero is not an option
    if (!price || price <= 0n || collateral <= 0n) {
        return { hf: null, ltv: null, liquidationPriceRaw: null };
    }

    const withPlaces = (bigint) => Number(bigint) / Number(PRECISION);

    // collateral × price / 1e36 × LLTV / 1e18 / borrowed, with 6 decimals
    const hf = withPlaces((collateral * price * lltv * PRECISION) /
        (ORACLE_PRICE_SCALE * WAD * borrowed));
    // borrowed / (collateral × price / 1e36)
    const ltv = withPlaces((borrowed * ORACLE_PRICE_SCALE * PRECISION) / (collateral * price));
    // the price at which HF = 1
    const priceSettlementRaw = lltv > 0n
        ? (borrowed * ORACLE_PRICE_SCALE * WAD) / (collateral * lltv)
        : null;

    return { hf, ltv, liquidationPriceRaw: priceSettlementRaw };
}

/*
 * Oracle price (raw, 1e36) → loan tokens per 1 token of
 * collateral: price / 1e36 × 10^(collateral decimals − loan decimals).
 */
function priceInTokens(raw, collateral, loan) {
    const valid = decimalsValid(collateral.decimals) && decimalsValid(loan.decimals);
    if (raw === null || !valid) return null;
    return splitPer10(raw, 36 - collateral.decimals + loan.decimals);
}

// A position in a market; null if it is zeroed (closed)
function marketPosition(x, network) {
    const m = x?.market;
    const s = x?.state;
    if (!m || !s) {
        throw new ErrorMorpho(t('defi.err.morphoIncomplete'),
            `posição sem market/state: ${JSON.stringify(x)?.slice(0, 200)}`);
    }

    const [collateralRaw, borrowedRaw, providedRaw] =
        [s.collateral, s.borrowAssets, s.supplyAssets].map(v => integer(v ?? 0));
    const lltv = integer(m.lltv);
    if ([collateralRaw, borrowedRaw, providedRaw, lltv].includes(null)) {
        throw new ErrorMorpho(t('defi.err.morphoNumbers'),
            `valores inválidos no mercado ${m.marketId}`);
    }
    if (!collateralRaw && !borrowedRaw && !providedRaw) return null;

    const collateral = token(m.collateralAsset);
    const loan = token(m.loanAsset);
    const priceRaw = integer(m.state?.price);
    const risk = marketRisk({
        collateral: collateralRaw, borrowed: borrowedRaw, price: priceRaw, lltv
    });

    // Without the oracle price (a market without collateral, for example): the API's HF, if any
    if (risk.hf === null && numberAlt(x.healthFactor) !== null) risk.hf = x.healthFactor;

    /*
     * Check with the API's healthFactor (the same formula, but computed there).
     * If it diverges by more than 1%, someone got the math wrong: it stays in the log for us
     * finding out who (spoiler: it is usually the test).
     */
    const daApi = numberAlt(x.healthFactor);
    const diverged = daApi !== null && Math.abs(risk.hf - daApi) > Math.max(0.01, daApi * 0.01);
    if (Number.isFinite(risk.hf) && diverged) {
        printError(`[MORPHO] HF mismatch in market ${m.marketId}: computed ${risk.hf}, API ${daApi}`);
    }

    const collateralQty = inTokens(collateralRaw, collateral.decimals);
    const borrowedQty = inTokens(borrowedRaw, loan.decimals);
    const providedQty = inTokens(providedRaw, loan.decimals);
    // The side item (collateral, borrowed, supplied), with the amount and the USD value
    const item = (raw, t, qty, usd) => (raw ? { ...t, qty, usd: inUsd(usd, qty, t) } : null);

    return {
        type: 'mercado',
        network,
        marketId: m.marketId,
        collateral: item(collateralRaw, collateral, collateralQty, s.collateralUsd),
        borrowed: item(borrowedRaw, loan, borrowedQty, s.borrowAssetsUsd),
        provided: item(providedRaw, loan, providedQty, s.supplyAssetsUsd),
        collateralSymbol: collateral.symbol,
        loanSymbol: loan.symbol,
        lltv: Number((lltv * PRECISION) / WAD) / Number(PRECISION),
        hf: risk.hf,
        ltv: risk.ltv,
        oraclePrice: priceInTokens(priceRaw, collateral, loan),
        liquidationPrice: priceInTokens(risk.liquidationPriceRaw, collateral, loan),
        utilization: numberAlt(m.state?.utilization)
    };
}

// A position in a vault (v1: state.assets; v2: assets); null if it is zeroed
function vaultPosition(x, network) {
    const v = x?.vault;
    const raw = integer(x?.state?.assets ?? x?.assets ?? 0);
    if (!v || raw === null) {
        throw new ErrorMorpho(t('defi.err.morphoVault'),
            `vault inválido: ${JSON.stringify(x)?.slice(0, 200)}`);
    }
    if (!raw) return null;

    const active = token(v.asset);
    const qty = inTokens(raw, active.decimals);
    return {
        type: 'vault',
        network,
        name: v.name || v.symbol || '?',
        provided: { ...active, qty, usd: inUsd(x?.state?.assetsUsd ?? x?.assetsUsd, qty, active) }
    };
}

/*
 * The USD totals. A position without a price stays out of the sum (and in the list
 * withoutPrice): no inventing a value.
 */
function totals(positions) {
    let provided = 0;
    let borrowed = 0;
    const withoutPrice = new Set();

    for (const p of positions) {
        for (const [side, signalAlt] of [['collateral', 1], ['provided', 1], ['borrowed', -1]]) {
            const item = p[side];
            if (!item) continue;
            if (item.usd === null) {
                withoutPrice.add(item.symbol);
                continue;
            }
            if (signalAlt > 0) provided += item.usd;
            else borrowed += item.usd;
        }
    }

    return { provided, borrowed, net: provided - borrowed, noPrice: [...withoutPrice] };
}

/*
 * Short in-memory cache: the same wallet (on the same networks) for 30 s. Whoever
 * pressing the command five times in a row to see if the HF went up gets the same
 * reply (and the API, a rest).
 */
const cache = new Map();
const cleanCacheMorpho = () => cache.clear();

// axios or GraphQL error → ErrorMorpho with a readable reason
function translateError(err) {
    if (err instanceof ErrorMorpho) return err;

    const status = err.response?.status;
    const doGraphql = err.response?.data?.errors?.[0]?.message;

    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || /timeout/i.test(err.message)) {
        return new ErrorMorpho(t('defi.err.morphoTimeout', { s: API_TIMEOUT_MS / 1000 }),
            `timeout: ${err.message}`);
    }
    if (status === 429) {
        return new ErrorMorpho(t('defi.err.morphoRate'), 'HTTP 429 (rate limit)');
    }
    if (/unsupported chainId/i.test(doGraphql ?? '')) {
        const network = doGraphql.match(/\d+/)?.[0] ?? '?';
        return new ErrorMorpho(t('defi.err.morphoChain', { id: network }),
            doGraphql);
    }
    if (doGraphql) return new ErrorMorpho(t('defi.err.morphoRefused'), `GraphQL: ${doGraphql}`);
    if (status >= 500) return new ErrorMorpho(t('defi.err.morphoDown'), `HTTP ${status}`);
    if (status) return new ErrorMorpho(t('defi.err.morphoHttp'), `HTTP ${status}`);
    return new ErrorMorpho(t('defi.err.morphoCannotTalk'), err.message);
}

/**
 * The wallet's Morpho positions, on all the networks of defi.morpho.chains.
 * @param {string} wallet  0x + 40 hexadecimais
 * @returns {Promise<{ wallet: string, positions: object[], totals: object, when: number,
 *   doCache: boolean }>}
 * @throws {ErrorMorpho} with .motivo to show on WhatsApp
 */
async function positionsMorpho(wallet) {
    if (!isAddressEvm(wallet)) {
        throw new ErrorMorpho(t('defi.err.notEvm', { wallet: wallet }));
    }

    const networks = getSetting('defi.morpho.chains').map(Number);
    const keyAlt = `${wallet.toLowerCase()}|${networks.join(',')}`;
    const saved = cache.get(keyAlt);
    // The same wallet in another case (0xAb.. and 0xab..) is the same: only the display follows the request
    if (saved && Date.now() - saved.when < CACHE_MS) return { ...saved, wallet, doCache: true };

    const start = Date.now();
    printInfo(`[MORPHO] Querying wallet ${abbreviate(wallet)}`);

    let data;
    try {
        ({ data } = await axios.post(getSetting('defi.morpho.api'),
            { query: query(networks), variables: { wallet } },
            { timeout: API_TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } }));
    } catch (err) {
        const errorAlt = translateError(err);
        printError(`[MORPHO] API error: ${errorAlt.message}`);
        throw errorAlt;
    }

    if (data?.errors?.length) {
        const errorAlt = translateError({ response: { data } });
        printError(`[MORPHO] API error: ${errorAlt.message}`);
        throw errorAlt;
    }

    const positions = [];
    try {
        for (const id of networks) {
            const user = data?.data?.[`c${id}`];
            const unexpected = (detail) =>
                new ErrorMorpho('A API do Morpho mandou uma resposta inesperada.', detail);
            if (!user || typeof user !== 'object') {
                throw unexpected(`sem dados da rede ${id}`);
            }

            const { marketPositions, vaultPositions, vaultV2Positions } = user;
            const lists = [marketPositions, vaultPositions, vaultV2Positions];
            if (lists.some(l => l !== undefined && l !== null && !Array.isArray(l))) {
                throw unexpected(`listas inválidas na rede ${id}`);
            }

            const networkName = (x) => x?.chain?.network ?? `chain ${id}`;
            for (const x of marketPositions ?? []) {
                positions.push(marketPosition(x, networkName(x.market)));
            }
            for (const x of [...(vaultPositions ?? []), ...(vaultV2Positions ?? [])]) {
                positions.push(vaultPosition(x, networkName(x.vault)));
            }
        }
    } catch (err) {
        const errorAlt = translateError(err);
        printError(`[MORPHO] API error: ${errorAlt.message}`);
        throw errorAlt;
    }

    const openAlt = positions.filter(Boolean);
    const resultAlt = { wallet, positions: openAlt, totals: totals(openAlt), when: Date.now() };
    cache.set(keyAlt, resultAlt);

    const usd = (v) =>
        `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const foundAlt5 = openAlt.length === 1 ? 'posição encontrada' : 'posições encontradas';
    printInfo(`[MORPHO] ${openAlt.length} ${foundAlt5}`);
    printInfo(`[MORPHO] Total supplied: ${usd(resultAlt.totals.provided)}`);
    printInfo(`[MORPHO] Total borrowed: ${usd(resultAlt.totals.borrowed)}`);
    printInfo(`[MORPHO] Query finished in ${Date.now() - start}ms`);

    return { ...resultAlt, doCache: false };
}

module.exports = {
    ErrorMorpho,
    inTokens,
    cleanCacheMorpho,
    positionsMorpho,
    marketRisk
};
