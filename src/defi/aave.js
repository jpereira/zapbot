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
const { addressAbi, addressAlt, isAddressEvm, uintAbi, uintDe } = require('./hyperevm');
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
        nome: 'Ethereum', env: 'ETHEREUM_RPC_URL', setting: 'defi.ethereum.rpc',
        provider: '0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e'
    },
    8453: {
        nome: 'Base', env: 'BASE_RPC_URL', setting: 'defi.base.rpc',
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
    const start = Number(uintDe(h, 0)) * 2;
    const n = Number(uintDe(h.slice(start), 0));
    const base = start + 64;

    return Array.from({ length: n }, (_, i) => {
        const tuple = h.slice(base + Number(uintDe(h.slice(base), i)) * 2);
        return { simbolo: textInWord(tuple, 0), endereco: addressAlt(tuple, 1) };
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
        oraculo: addressAlt(oracle.data),
        dados: addressAlt(dataAlt.data)
    };
    contracts.set(id, r);
    return r;
}

// An answer that has to have come: otherwise, the contract is not what is expected
// (ABI diferente, rede errada...)
function requireIt(r, oThat) {
    if (!r?.ok || r.data.length < 66) {
        throw new ErrorEvm(t('defi.err.aaveDifferent'),
            `${oThat}: chamada falhou ou veio vazia`);
    }
    return r.data;
}

/**
 * The wallet's Aave V3 position on a network.
 * @returns {Promise<object|null>} null: nada fornecido nem emprestado ali
 */
async function readNetwork(id, wallet) {
    const network = NETWORKS[id];
    const url = envOuSetting(network.env, network.setting);
    const label = `RPC da ${network.nome}`;
    printInfo(`[AAVE] Chain: ${network.nome}`);

    const c = await networkContracts(id, url, label);
    const user = addressAbi(wallet);

    const [account, mode, reserves, unit] = await multicall(url, [
        { to: c.pool, data: SEL.getUserAccountData + user },
        { to: c.pool, data: SEL.getUserEMode + user },
        { to: c.dados, data: SEL.getAllReservesTokens },
        { to: c.oraculo, data: SEL.BASE_CURRENCY_UNIT }
    ], label);

    const accountData = requireIt(account, 'getUserAccountData');
    const tokens = decodeReserves(requireIt(reserves, 'getAllReservesTokens'));
    const base = uintDe(requireIt(unit, 'BASE_CURRENCY_UNIT'));
    const emode = mode.ok ? Number(uintDe(mode.data)) : 0;

    // The wallet balance in each market asset
    const balances = await multicall(url, tokens.map(t => ({
        to: c.dados, data: SEL.getUserReserveData + addressAbi(t.endereco) + user
    })), label);

    const assets = tokens.map((t, i) => {
        const d = requireIt(balances[i], `getUserReserveData(${t.simbolo})`);
        return {
            ...t,
            fornecido: uintDe(d, 0),
            estavel: uintDe(d, 1),
            variavel: uintDe(d, 2),
            taxaEstavel: uintDe(d, 5),
            colateral: uintDe(d, 8) === 1n
        };
    }).filter(a => a.fornecido > 0n || a.estavel > 0n || a.variavel > 0n);

    if (!assets.length) return null;

    // Configuration, fees, debt ceiling and price of the wallet's assets (and the eMode name)
    const details = await multicall(url, [
        ...assets.flatMap(a => [
            { to: c.dados, data: SEL.getReserveConfigurationData + addressAbi(a.endereco) },
            { to: c.dados, data: SEL.getReserveData + addressAbi(a.endereco) },
            { to: c.dados, data: SEL.getDebtCeiling + addressAbi(a.endereco) }
        ]),
        {
            to: c.oraculo,
            data: SEL.getAssetsPrices + addressesAbiList(assets.map(a => a.endereco))
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
        const config = requireIt(details[i * 3], `getReserveConfigurationData(${a.simbolo})`);
        const reserve = details[i * 3 + 1];
        const ceiling = details[i * 3 + 2];
        const decimals = Number(uintDe(config, 0));
        const price = prices[i] ?? 0n;
        const valid = decimalsValid(decimals);
        const item = (raw, extra) => {
            const usd = inUsd(raw, decimals, price, base);
            if (usd === null) withoutPrice.add(a.simbolo);
            const qtd = valid ? inTokens(raw, decimals) : null;
            return { simbolo: a.simbolo, decimals, qtd, usd, ...extra };
        };

        if (!valid) {
            printError(`[AAVE] ${NETWORKS[id].nome}: decimals inválidos em ${a.simbolo} (${decimals})`);
        }

        if (a.fornecido > 0n) {
            provided.push(item(a.fornecido, {
                colateral: a.colateral,
                apy: reserve?.ok ? apy(uintDe(reserve.data, 5)) : null,
                tetoDeDivida: ceiling?.ok ? Number(uintDe(ceiling.data)) / 100 : 0,   // 2 decimals, in USD
                precoUsd: price && base ? withPlaces((price * PRECISION) / base) : null
            }));
        }
        if (a.variavel > 0n) {
            const rate = reserve?.ok ? apy(uintDe(reserve.data, 6)) : null;
            debts.push(item(a.variavel, { modo: 'Variable', apy: rate }));
        }
        if (a.estavel > 0n) debts.push(item(a.estavel, { modo: 'Stable', apy: apy(a.taxaEstavel) }));
    });

    // Dust (under $0.01, like 7e-18 WETH) is not a position; with only dust, the network stays empty
    const hasValue = (x) => x.usd === null || x.usd >= 0.01;
    const leftOver = (list) => list.splice(0, list.length, ...list.filter(hasValue));
    leftOver(provided);
    leftOver(debts);
    if (!provided.length && !debts.length) return null;

    // The protocol account (the oracle's base currency)
    const inBase = (raw) => withPlaces((raw * PRECISION) / base);
    const debtRaw = uintDe(accountData, 1);
    const collateralUsd = inBase(uintDe(accountData, 0));
    const debtUsd = inBase(debtRaw);
    const hf = healthFactor(uintDe(accountData, 5), debtRaw);

    // Check: the sum of the assets has to match the protocol total (1% slack)
    const sumDebt = debts.reduce((s, d) => s + (d.usd ?? 0), 0);
    if (Math.abs(sumDebt - debtUsd) > Math.max(0.01, debtUsd * 0.01)) {
        printError(`[AAVE] ${NETWORKS[id].nome}: dívida somada ${sumDebt} ≠ ${debtUsd} do protocolo`);
    }

    const providedUsd = provided.reduce((s, f) => s + (f.usd ?? 0), 0);
    const collaterals = provided.filter(f => f.colateral);

    // Liquidation price: only with a single collateral, that is not also the debt
    let priceSettlement = null;
    const [single] = collaterals;
    const umCollateral = collaterals.length === 1 && !debts.some(d => d.simbolo === single.simbolo);
    const withHf = debtRaw > 0n && Number.isFinite(hf) && hf > 0;
    if (withHf && umCollateral && collaterals[0].precoUsd) {
        priceSettlement = { simbolo: collaterals[0].simbolo, usd: collaterals[0].precoUsd / hf };
    }

    const isolated = collaterals.find(f => f.tetoDeDivida > 0);
    return {
        rede: NETWORKS[id].nome,
        chainId: id,
        hf,
        colateralUsd: collateralUsd,
        dividaUsd: debtUsd,
        disponivelUsd: inBase(uintDe(accountData, 2)),
        liquidationThreshold: Number(uintDe(accountData, 3)) / 10000,
        ltvMaximo: Number(uintDe(accountData, 4)) / 10000,
        ltvAtual: collateralUsd > 0 ? debtUsd / collateralUsd : null,
        fornecidoUsd: providedUsd,
        liquidoUsd: providedUsd - debtUsd,
        fornecidos: provided,
        dividas: debts,
        semPreco: [...withoutPrice],
        emode: emode ? { id: emode, nome: emodeName } : null,
        isolamento: isolated ? { simbolo: isolated.simbolo, tetoUsd: isolated.tetoDeDivida } : null,
        precoLiquidacao: priceSettlement,
        liquidacaoAmbigua: debtRaw > 0n && collaterals.length > 1
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
 * @returns {Promise<{ carteira: string, redes: object[],
 * failures: Array<{ network: string, reason: string }>, when: number }>}
 * @throws {ErrorEvm} invalid wallet, or all the networks failed
 */
async function positionsAave(wallet) {
    if (!isAddressEvm(wallet)) {
        throw new ErrorEvm(t('defi.err.notEvm', { wallet: wallet }));
    }

    const ids = getSetting('defi.aave.chains').map(Number);
    const start = Date.now();
    printInfo(`[AAVE] Consultando wallet ${abbreviate(wallet)}`);

    const results = await Promise.all(ids.map(async (id) => {
        if (!NETWORKS[id]) {
            const reasonAlt = t('defi.err.aaveNoChain', { id });
            return { falha: { rede: `chain ${id}`, motivo: reasonAlt } };
        }

        const keyAlt = `${wallet.toLowerCase()}|${id}`;
        const saved = cache.get(keyAlt);
        if (saved && Date.now() - saved.quando < CACHE_MS) return saved;

        try {
            const position = await readNetwork(id, wallet);
            cache.set(keyAlt, { posicao: position, quando: Date.now() });
            return { posicao: position, quando: Date.now() };
        } catch (err) {
            const type = /timeout/i.test(err.message) ? 'Timeout' : 'RPC error';
            printError(`[AAVE] ${type} ${NETWORKS[id].nome}: ${err.message}`);
            const reasonAlt = err.motivo ?? t('defi.noData');
            return { falha: { rede: NETWORKS[id].nome, motivo: reasonAlt } };
        }
    }));

    const failures = results.filter(r => r.falha).map(r => r.falha);
    if (failures.length === ids.length) {
        throw new ErrorEvm(failures.map(f => `${f.rede}: ${f.motivo}`).join('\n'), 'todas as redes falharam');
    }

    const networks = results.map(r => r.posicao).filter(Boolean);
    for (const r of networks) {
        const hf = Number.isFinite(r.hf) ? r.hf.toFixed(2) : '∞';
        printInfo(`[AAVE] ${r.rede}: ${r.fornecidos.length} supplied, ${r.dividas.length} borrowed`);
        printInfo(`[AAVE] ${r.rede}: Health Factor ${hf}`);
        printInfo(`[AAVE] ${r.rede}: Net position $${r.liquidoUsd.toFixed(2)}`);
    }
    printInfo(`[AAVE] Consulta concluída em ${Date.now() - start}ms`);

    const when = Math.min(...results.filter(r => !r.falha).map(r => r.quando));
    return { carteira: wallet, redes: networks, falhas: failures, quando: when };
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
