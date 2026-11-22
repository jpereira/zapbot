/*
 * Aave V3: a wallet's position, read on-chain from the official contracts of
 * each network in the 'defi.aave.chains' setting (default: Ethereum and Base). Only
 * reading: eth_call through the RPC (grouped in Multicall3), without a private key.
 *
 * Where each thing comes from (https://aave.com/docs/aave-v3/smart-contracts):
 * - PoolAddressesProvider (the only fixed address per network) → the Pool, the
 *     AaveOracle e o PoolDataProvider daquele mercado.
 * - Pool.getUserAccountData(wallet): the collateral, the debt and how much
 * can still be borrowed (in the oracle's base currency, USD with 8
 * decimals), the average liquidation threshold and max LTV and the Health Factor
 * (18 decimals). It is the protocol's own value, the same as the Aave app's: the
 * bot does not recompute the HF, so eMode, isolation mode, supplied assets
 * that are not collateral and each asset's LT already come out right.
 * - PoolDataProvider: the market assets (getAllReservesTokens), the balance
 * of each one in the wallet (getUserReserveData: aToken, variable debt and
 * stable, if it is collateral), the decimals and the LT (getReserveConfigurationData),
 * the fees (getReserveData) and the debt ceiling (getDebtCeiling).
 * - AaveOracle.getAssetsPrices: the price of each asset in the base currency.
 *
 * Calculations from here (for display; the risk is the protocol's):
 * USD value = amount × price / BASE_CURRENCY_UNIT
 * net position = sum of supplied (collateral or not) − debt
 * Current LTV = debt / collateral (both from getUserAccountData)
 * APY = (1 + rate/year in seconds)^(seconds in the year) − 1, with the rate in ray
 * liquidation price: only with ONE collateral (the HF is proportional to the price
 * its): current price / HF. With several, it depends on what the others do, and
 * the bot does not guess.
 */

const { ErrorEvm, addressesAbiList, uintList, multicall, textInWord } = require('./evm');
const { addressAbi, addressAlt, isAddressEvm, uintAbi, uintFrom } = require('./hyperevm');
const { t } = require('../i18n');
const { printError, printInfo } = require('../log');
const { envOuSetting, getSetting } = require('../settings');

const CACHE_MS = 30000;
const SECONDS_IN_YEAR = 31536000;
const RAY = 10n ** 27n;
const WAD = 10n ** 18n;
const PRECISION = 10n ** 6n;

/*
 * The networks: the main market's PoolAddressesProvider (the "Core") and the RPC
 * (the config/.env variable or, if empty, the setting). Another Aave V3 network is
 * one more line here (and an RPC setting), with the Aave Address
 * Book (https://github.com/bgd-labs/aave-address-book).
 */
const NETWORKS = {
    1: {
        name: 'Ethereum', env: 'ETHEREUM_RPC_URL', setting: 'defi.ethereum.rpc',
        provider: '0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e'
    },
    8453: {
        name: 'Base', env: 'BASE_RPC_URL', setting: 'defi.base.rpc',
        provider: '0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D'
    }
};

// Selectors (keccak256 of the signature, the first 4 bytes)
const SEL = {
    getPool: '0x026b1d5f',
    getPriceOracle: '0xfca513a8',
    getPoolDataProvider: '0xe860accb',
    getUserAccountData: '0xbf92857c',
    getUserEMode: '0xeddf1b79',
    getEModeCategoryLabel: '0x2083e183',
    getAllReservesTokens: '0xb316ff89',
    getUserReserveData: '0x28dd2d01',
    getReserveConfigurationData: '0x3e150141',
    getReserveData: '0x35ea6a75',
    getDebtCeiling: '0x3c798109',
    getAssetsPrices: '0x9d23d9f2',
    BASE_CURRENCY_UNIT: '0x8c89b64f'
};

const abbreviate = (wallet) => `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
const decimalsValid = (d) => Number.isInteger(d) && d >= 0 && d <= 36;
const withPlaces = (bigint) => Number(bigint) / Number(PRECISION);

// Minimum units → tokens
function inTokens(raw, decimals) {
    const scale = 10n ** BigInt(decimals);
    return Number(raw / scale) + Number(raw % scale) / Number(scale);
}

// amount × price / BASE_CURRENCY_UNIT, in USD (null: no price or invalid decimals)
function inUsd(raw, decimals, price, base) {
    if (!price || !decimalsValid(decimals) || !base) return null;
    return withPlaces((raw * price * PRECISION) / (10n ** BigInt(decimals) * base));
}

// Aave rate (APR in ray, 1e27) → APY, compounded per second as in the documentation
function apy(rateRay) {
    const apr = withPlaces((rateRay * PRECISION) / RAY);
    return Math.expm1(SECONDS_IN_YEAR * Math.log1p(apr / SECONDS_IN_YEAR));
}

/*
 * Health Factor (18 decimals). Without debt, the Pool returns the uint256 maximum:
 * there (or at an absurdly large HF) it is ∞, never a 78-digit number.
 */
function healthFactor(raw, debt) {
    if (debt === 0n || raw >= 10n ** 36n) return Infinity;
    return withPlaces((raw * PRECISION) / WAD);
}

// getAllReservesTokens: (string symbol, address tokenAddress)[]
function decodeReserves(hex) {
    const h = hex.replace(/^0x/, '');
    const start = Number(uintFrom(h, 0)) * 2;
    const n = Number(uintFrom(h.slice(start), 0));
    const base = start + 64;

    return Array.from({ length: n }, (_, i) => {
        const tuple = h.slice(base + Number(uintFrom(h.slice(base), i)) * 2);
        return { symbol: textInWord(tuple, 0), address: addressAlt(tuple, 1) };
    });
}

// The market contracts, read once per network (the provider is fixed; they only
// change by governance vote, which does not happen between one /defi and another)
const contracts = new Map();

async function networkContracts(id, url, label) {
    if (contracts.has(id)) return contracts.get(id);

    const { provider } = NETWORKS[id];
    const selectors = [SEL.getPool, SEL.getPriceOracle, SEL.getPoolDataProvider];
    const [pool, oracle, dataAlt] = await multicall(url, selectors.map(data => ({ to: provider, data })), label);
    if (![pool, oracle, dataAlt].every(r => r.ok && r.data.length >= 66)) {
        throw new ErrorEvm(t('defi.err.aaveNoContracts'),
            `PoolAddressesProvider ${provider}: resposta inválida`);
    }

    const r = {
        pool: addressAlt(pool.data),
        oracle: addressAlt(oracle.data),
        data: addressAlt(dataAlt.data)
    };
    contracts.set(id, r);
    return r;
}

// An answer that has to have come: otherwise, the contract is not what is expected
// (ABI diferente, network errada...)
function requireIt(r, oThat) {
    if (!r?.ok || r.data.length < 66) {
        throw new ErrorEvm(t('defi.err.aaveDifferent'),
            `${oThat}: chamada falhou ou veio vazia`);
    }
    return r.data;
}

/**
 * The wallet's Aave V3 position on a network.
 * @returns {Promise<object|null>} null: nada provided nem borrowed ali
 */
async function readNetwork(id, wallet) {
    const network = NETWORKS[id];
    const url = envOuSetting(network.env, network.setting);
    const label = `RPC da ${network.name}`;
    printInfo(`[AAVE] Chain: ${network.name}`);

    const c = await networkContracts(id, url, label);
    const user = addressAbi(wallet);

    const [account, mode, reserves, unit] = await multicall(url, [
        { to: c.pool, data: SEL.getUserAccountData + user },
        { to: c.pool, data: SEL.getUserEMode + user },
        { to: c.data, data: SEL.getAllReservesTokens },
        { to: c.oracle, data: SEL.BASE_CURRENCY_UNIT }
    ], label);

    const accountData = requireIt(account, 'getUserAccountData');
    const tokens = decodeReserves(requireIt(reserves, 'getAllReservesTokens'));
    const base = uintFrom(requireIt(unit, 'BASE_CURRENCY_UNIT'));
    const emode = mode.ok ? Number(uintFrom(mode.data)) : 0;

    // The wallet balance in each market asset
    const balances = await multicall(url, tokens.map(t => ({
        to: c.data, data: SEL.getUserReserveData + addressAbi(t.address) + user
    })), label);

    const assets = tokens.map((t, i) => {
        const d = requireIt(balances[i], `getUserReserveData(${t.symbol})`);
        return {
            ...t,
            provided: uintFrom(d, 0),
            stable: uintFrom(d, 1),
            variable: uintFrom(d, 2),
            stableRate: uintFrom(d, 5),
            collateral: uintFrom(d, 8) === 1n
        };
    }).filter(a => a.provided > 0n || a.stable > 0n || a.variable > 0n);

    if (!assets.length) return null;

    // Configuration, fees, debt ceiling and price of the wallet's assets (and the eMode name)
    const details = await multicall(url, [
        ...assets.flatMap(a => [
            { to: c.data, data: SEL.getReserveConfigurationData + addressAbi(a.address) },
            { to: c.data, data: SEL.getReserveData + addressAbi(a.address) },
            { to: c.data, data: SEL.getDebtCeiling + addressAbi(a.address) }
        ]),
        {
            to: c.oracle,
            data: SEL.getAssetsPrices + addressesAbiList(assets.map(a => a.address))
        },
        ...(emode ? [{ to: c.pool, data: SEL.getEModeCategoryLabel + uintAbi(emode) }] : [])
    ], label);

    const prices = uintList(requireIt(details[assets.length * 3], 'getAssetsPrices'));
    const doEmode = details[assets.length * 3 + 1];
    const emodeName = emode && doEmode?.ok ? textInWord(doEmode.data, 0) : '';

    const provided = [];
    const debts = [];
    const withoutPrice = new Set();

    assets.forEach((a, i) => {
        const config = requireIt(details[i * 3], `getReserveConfigurationData(${a.symbol})`);
        const reserve = details[i * 3 + 1];
        const ceiling = details[i * 3 + 2];
        const decimals = Number(uintFrom(config, 0));
        const price = prices[i] ?? 0n;
        const valid = decimalsValid(decimals);
        const item = (raw, extra) => {
            const usd = inUsd(raw, decimals, price, base);
            if (usd === null) withoutPrice.add(a.symbol);
            const qty = valid ? inTokens(raw, decimals) : null;
            return { symbol: a.symbol, decimals, qty, usd, ...extra };
        };

        if (!valid) {
            printError(`[AAVE] ${NETWORKS[id].name}: invalid decimals in ${a.symbol} (${decimals})`);
        }

        if (a.provided > 0n) {
            provided.push(item(a.provided, {
                collateral: a.collateral,
                apy: reserve?.ok ? apy(uintFrom(reserve.data, 5)) : null,
                debtCap: ceiling?.ok ? Number(uintFrom(ceiling.data)) / 100 : 0,   // 2 decimals, in USD
                priceUsd: price && base ? withPlaces((price * PRECISION) / base) : null
            }));
        }
        if (a.variable > 0n) {
            const rate = reserve?.ok ? apy(uintFrom(reserve.data, 6)) : null;
            debts.push(item(a.variable, { mode: 'Variable', apy: rate }));
        }
        if (a.stable > 0n) debts.push(item(a.stable, { mode: 'Stable', apy: apy(a.stableRate) }));
    });

    // Dust (under $0.01, like 7e-18 WETH) is not a position; with only dust, the network stays empty
    const hasValue = (x) => x.usd === null || x.usd >= 0.01;
    const leftOver = (list) => list.splice(0, list.length, ...list.filter(hasValue));
    leftOver(provided);
    leftOver(debts);
    if (!provided.length && !debts.length) return null;

    // The protocol account (the oracle's base currency)
    const inBase = (raw) => withPlaces((raw * PRECISION) / base);
    const debtRaw = uintFrom(accountData, 1);
    const collateralUsd = inBase(uintFrom(accountData, 0));
    const debtUsd = inBase(debtRaw);
    const hf = healthFactor(uintFrom(accountData, 5), debtRaw);

    // Check: the sum of the assets has to match the protocol total (1% slack)
    const sumDebt = debts.reduce((s, d) => s + (d.usd ?? 0), 0);
    if (Math.abs(sumDebt - debtUsd) > Math.max(0.01, debtUsd * 0.01)) {
        printError(`[AAVE] ${NETWORKS[id].name}: summed debt ${sumDebt} ≠ ${debtUsd} from the protocol`);
    }

    const providedUsd = provided.reduce((s, f) => s + (f.usd ?? 0), 0);
    const collaterals = provided.filter(f => f.collateral);

    // Liquidation price: only with a single collateral, that is not also the debt
    let priceSettlement = null;
    const [single] = collaterals;
    const umCollateral = collaterals.length === 1 && !debts.some(d => d.symbol === single.symbol);
    const withHf = debtRaw > 0n && Number.isFinite(hf) && hf > 0;
    if (withHf && umCollateral && collaterals[0].priceUsd) {
        priceSettlement = { symbol: collaterals[0].symbol, usd: collaterals[0].priceUsd / hf };
    }

    const isolated = collaterals.find(f => f.debtCap > 0);
    return {
        network: NETWORKS[id].name,
        chainId: id,
        hf,
        collateralUsd,
        debtUsd,
        availableUsd: inBase(uintFrom(accountData, 2)),
        liquidationThreshold: Number(uintFrom(accountData, 3)) / 10000,
        ltvMax: Number(uintFrom(accountData, 4)) / 10000,
        currentLtv: collateralUsd > 0 ? debtUsd / collateralUsd : null,
        providedUsd,
        netUsd: providedUsd - debtUsd,
        provided,
        debts,
        noPrice: [...withoutPrice],
        emode: emode ? { id: emode, name: emodeName } : null,
        isolation: isolated ? { symbol: isolated.symbol, capUsd: isolated.debtCap } : null,
        liquidationPrice: priceSettlement,
        liquidationAmbiguous: debtRaw > 0n && collaterals.length > 1
    };
}

/*
 * Short in-memory cache, per wallet and network: the command repeated within 30 s
 * does not go back to the RPC (which, being public, would complain).
 */
const cache = new Map();
const cleanCacheAave = () => {
    cache.clear();
    contracts.clear();
};

/**
 * The wallet's Aave V3 positions, on each network of defi.aave.chains.
 * A network that fails does not take down the others: it goes in failures.
 * @returns {Promise<{ wallet: string, networks: object[],
 * failures: Array<{ network: string, reason: string }>, when: number }>}
 * @throws {ErrorEvm} invalid wallet, or all the networks failed
 */
async function positionsAave(wallet) {
    if (!isAddressEvm(wallet)) {
        throw new ErrorEvm(t('defi.err.notEvm', { wallet: wallet }));
    }

    const ids = getSetting('defi.aave.chains').map(Number);
    const start = Date.now();
    printInfo(`[AAVE] Querying wallet ${abbreviate(wallet)}`);

    const results = await Promise.all(ids.map(async (id) => {
        if (!NETWORKS[id]) {
            const reasonAlt = t('defi.err.aaveNoChain', { id });
            return { failure: { network: `chain ${id}`, reason: reasonAlt } };
        }

        const keyAlt = `${wallet.toLowerCase()}|${id}`;
        const saved = cache.get(keyAlt);
        if (saved && Date.now() - saved.when < CACHE_MS) return saved;

        try {
            const position = await readNetwork(id, wallet);
            cache.set(keyAlt, { position, when: Date.now() });
            return { position, when: Date.now() };
        } catch (err) {
            const type = /timeout/i.test(err.message) ? 'Timeout' : 'RPC error';
            printError(`[AAVE] ${type} ${NETWORKS[id].name}: ${err.message}`);
            const reasonAlt = err.reason ?? t('defi.noData');
            return { failure: { network: NETWORKS[id].name, reason: reasonAlt } };
        }
    }));

    const failures = results.filter(r => r.failure).map(r => r.failure);
    if (failures.length === ids.length) {
        throw new ErrorEvm(failures.map(f => `${f.network}: ${f.reason}`).join('\n'), 'todas as redes falharam');
    }

    const networks = results.map(r => r.position).filter(Boolean);
    for (const r of networks) {
        const hf = Number.isFinite(r.hf) ? r.hf.toFixed(2) : '∞';
        printInfo(`[AAVE] ${r.network}: ${r.provided.length} supplied, ${r.debts.length} borrowed`);
        printInfo(`[AAVE] ${r.network}: Health Factor ${hf}`);
        printInfo(`[AAVE] ${r.network}: Net position $${r.netUsd.toFixed(2)}`);
    }
    printInfo(`[AAVE] Query finished in ${Date.now() - start}ms`);

    const when = Math.min(...results.filter(r => !r.failure).map(r => r.when));
    return { wallet, networks, failures, when };
}

module.exports = {
    NETWORKS,
    SEL,
    apy,
    decodeReserves,
    healthFactor,
    cleanCacheAave,
    positionsAave
};
