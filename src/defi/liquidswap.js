/*
 * Liquidswap (liquidswap.com, da Pontem): a DEX da Aptos, um AMM (x·y = k nas
 * pools Uncorrelated e x³y + xy³ = k nas Stable), nas versões v0 e v0.5. A
 * posição é a moeda de LP (lp_coin::LP<X, Y, Curva>): a fatia dela no supply é a
 * fatia das reservas da pool. As taxas dos swaps entram nas reservas, então já
 * estão no saldo: não há faixa nem taxas a coletar.
 *
 * O LP pode estar como coin (CoinStore) ou, depois da migração da Aptos, como
 * fungible asset; o indexador acha os dois pela carteira, com o saldo. A pool,
 * o supply e os tokens vêm do fullnode.
 */

const { argumentosDoTipo, indexador, normalizarEndereco, normalizarTipo, recurso, view } = require('./aptos');

/*
 * Cada versão: o pacote (os módulos e as curvas) e a conta das pools, onde
 * ficam as LiquidityPool<X, Y, Curva> e o CoinInfo de cada LP.
 */
const VERSOES = [
    {
        nome: 'v0',
        pacote: normalizarEndereco('0x190d44266241744264b964a37b8f09863167a12d3e70cda39376cfb4e3561e12'),
        contaDasPools: normalizarEndereco('0x05a97986a9d031c4567e15b797be516910cfcb4156312482efc6a19c0a30c948')
    },
    {
        nome: 'v0.5',
        pacote: normalizarEndereco('0x163df34fccbf003ce219d3f1d9e70d140b60622cb9dd47599c25fb2f797ba6e'),
        contaDasPools: normalizarEndereco('0x61d2c22a6cb7831bee0f48363b0eec92369357aece0d1142062f7d5d85c7bef8')
    }
];

const MAX_POSICOES = 20;
const ESCALA_DA_TAXA = 10000;   // fee 30 = 0.3% (FEE_SCALE do liquidity_pool)

// Dólar: o lado estável do par (USDC, USDt, zUSDC...); sem ele, só as quantidades
const ehEstavel = (simbolo) => /USD/i.test(simbolo);

const SALDOS = `query ($dono: String) {
  current_fungible_asset_balances(where: { owner_address: { _eq: $dono }, amount: { _gt: "0" } }, limit: 500) {
    asset_type_v1
    amount
  }
}`;

// "LP<X, Y, Curva>" de uma das versões → { versao, x, y, estavel }; outro tipo: null
function lerTipoDoLp(tipo) {
    const t = normalizarTipo(tipo);
    const versao = VERSOES.find(v => t.startsWith(`${v.contaDasPools}::lp_coin::LP<`));
    if (!versao) return null;
    const [x, y, curva] = argumentosDoTipo(t);
    if (!curva?.startsWith(`${versao.pacote}::curves::`)) return null;
    return { versao, tipo: t, x, y, curva, estavel: curva.endsWith('::Stable') };
}

/*
 * Preço de X em Y (quantos Y vale 1 X). Na Uncorrelated (x·y = k), a razão das
 * reservas; na Stable (x³y + xy³ = k), a derivada da curva:
 * (3x²y + y³) / (x³ + 3xy²). Com as reservas já em unidades (sem os decimais).
 */
function precoDaPool(x, y, estavel) {
    if (!x || !y) return 0;
    return estavel ? (3 * x * x * y + y ** 3) / (x ** 3 + 3 * x * y * y) : y / x;
}

// A carteira na forma do indexador (0x e 64 hexadecimais)
async function lpsDaCarteira(carteira) {
    const r = await indexador(SALDOS, { dono: normalizarEndereco(carteira) });
    const porTipo = new Map();
    for (const b of r?.current_fungible_asset_balances ?? []) {
        const lp = b.asset_type_v1 && lerTipoDoLp(b.asset_type_v1);
        if (!lp) continue;
        const saldo = BigInt(b.amount);
        // O mesmo LP em dois lugares (coin e fungible asset): soma
        porTipo.set(lp.tipo, { ...lp, saldo: (porTipo.get(lp.tipo)?.saldo ?? 0n) + saldo });
    }
    return [...porTipo.values()].slice(0, MAX_POSICOES);
}

// symbol e decimals de um coin, uma vez só por tipo
async function infoDosTokens(tipos) {
    const unicos = [...new Set(tipos)];
    const infos = await Promise.all(unicos.map(async (t) => {
        const [[simbolo], [decimais]] = await Promise.all([view('0x1::coin::symbol', [t]), view('0x1::coin::decimals', [t])]);
        return [t, { simbolo, decimais: Number(decimais) }];
    }));
    return new Map(infos);
}

/**
 * As posições (LPs com saldo) da carteira, já calculadas.
 * @returns {Promise<object[]>}
 */
async function posicoesLiquidswap(carteira) {
    const lps = await lpsDaCarteira(carteira);
    if (!lps.length) return [];

    const tokens = await infoDosTokens(lps.flatMap(lp => [lp.x, lp.y]));
    const posicoes = await Promise.all(lps.map(async (lp) => {
        const [pool, [supply]] = await Promise.all([
            recurso(lp.versao.contaDasPools, `${lp.versao.pacote}::liquidity_pool::LiquidityPool<${lp.x}, ${lp.y}, ${lp.curva}>`),
            view('0x1::coin::supply', [lp.tipo])
        ]);
        const total = BigInt(supply?.vec?.[0] ?? 0);
        if (!pool || !total) return null;

        const tx = tokens.get(lp.x);
        const ty = tokens.get(lp.y);
        const reservaX = Number(pool.data.coin_x_reserve.value) / 10 ** tx.decimais;
        const reservaY = Number(pool.data.coin_y_reserve.value) / 10 ** ty.decimais;
        const fatia = Number(lp.saldo) / Number(total);
        const preco = precoDaPool(reservaX, reservaY, lp.estavel);
        const usdY = ehEstavel(ty.simbolo) ? 1 : ehEstavel(tx.simbolo) && preco ? 1 / preco : null;

        return {
            tipo: lp.tipo,
            versao: lp.versao.nome,
            estavel: lp.estavel,
            simboloX: tx.simbolo,
            simboloY: ty.simbolo,
            taxa: Number(pool.data.fee) / ESCALA_DA_TAXA * 100,   // em %
            fatia,
            qtdX: reservaX * fatia,
            qtdY: reservaY * fatia,
            reservaX,
            reservaY,
            preco,
            usdX: usdY === null ? null : preco * usdY,
            usdY
        };
    }));

    // Dos maiores para os menores (em dólar; sem preço, no fim)
    const valor = (p) => (p.usdY === null ? -1 : p.qtdX * p.usdX + p.qtdY * p.usdY);
    return posicoes.filter(Boolean).sort((a, b) => valor(b) - valor(a));
}

module.exports = {
    MAX_POSICOES,
    VERSOES,
    lerTipoDoLp,
    posicoesLiquidswap,
    precoDaPool
};
