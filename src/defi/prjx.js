/*
 * Project X (prjx.com): DEX da HyperEVM, fork do Uniswap V3. As posições são
 * NFTs do NonfungiblePositionManager; o bot cadastra a carteira e lê as dela.
 */

const { enderecoAbi, enderecoDe, ethCall, intDe, textoDe, uintAbi, uintDe } = require('./hyperevm');

const FACTORY = '0xFf7B3e8C00e57ea31477c32A5B52a58Eea47b072';
const POSICOES = '0xeaD19AE861c29bBb2101E834922B2FEee69B9091'; // o factory() dele é o FACTORY

// Seletores (4 primeiros bytes do keccak da assinatura)
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

const MAX_NFTS = 100;       // lidos da carteira, dos mais novos para os mais velhos
const MAX_POSICOES = 20;   // abertas mostradas
const UINT128_MAX = (1n << 128n) - 1n;

// Dólar: o lado estável do par (USD₮0, USDC, USDe, USDH...); sem ele, só as quantidades
const ehEstavel = (simbolo) => /USD/i.test(simbolo);

/*
 * Quantidades da posição a partir da liquidez e das raízes dos preços
 * (fórmulas do Uniswap V3, em ponto flutuante: é para exibir, não para assinar).
 */
function quantidades(L, sqrtP, sa, sb) {
    if (sqrtP <= sa) return [L * (1 / sa - 1 / sb), 0];
    if (sqrtP >= sb) return [0, L * (sb - sa)];
    return [L * (1 / sqrtP - 1 / sb), L * (sqrtP - sa)];
}

/**
 * As posições abertas (com liquidez) da carteira, já calculadas.
 * @returns {Promise<object[]>}
 */
async function posicoesDaCarteira(endereco) {
    const carteira = endereco.toLowerCase();
    const [saldo] = await ethCall([{ to: POSICOES, data: SEL.balanceOf + enderecoAbi(carteira) }]);
    const total = Number(uintDe(saldo));
    const n = Math.min(total, MAX_NFTS);
    if (!n) return [];

    // As fechadas continuam na carteira (o NFT fica): começa pelas mais novas
    const ids = (await ethCall(Array.from({ length: n }, (_, i) =>
        ({ to: POSICOES, data: SEL.tokenOfOwnerByIndex + enderecoAbi(carteira) + uintAbi(total - 1 - i) })))).map(h => uintDe(h));

    const brutas = (await ethCall(ids.map(id => ({ to: POSICOES, data: SEL.positions + uintAbi(id) }))))
        .map((h, i) => ({
            id: ids[i],
            token0: enderecoDe(h, 2),
            token1: enderecoDe(h, 3),
            taxa: Number(uintDe(h, 4)),
            tickInferior: Number(intDe(h, 5)),
            tickSuperior: Number(intDe(h, 6)),
            liquidez: uintDe(h, 7)
        }))
        .filter(p => p.liquidez > 0n)
        .slice(0, MAX_POSICOES);
    if (!brutas.length) return [];

    // Tokens, pools e as taxas a coletar (o collect simulado, como se a carteira chamasse)
    const tokens = [...new Set(brutas.flatMap(p => [p.token0, p.token1]))];
    const chavePool = (p) => `${p.token0}/${p.token1}/${p.taxa}`;
    const pools = [...new Map(brutas.map(p => [chavePool(p), p])).values()];

    const r = await ethCall([
        ...tokens.flatMap(t => [{ to: t, data: SEL.symbol }, { to: t, data: SEL.decimals }]),
        ...pools.map(p => ({ to: FACTORY, data: SEL.getPool + enderecoAbi(p.token0) + enderecoAbi(p.token1) + uintAbi(p.taxa) })),
        ...brutas.map(p => ({
            to: POSICOES,
            from: carteira,
            data: SEL.collect + uintAbi(p.id) + enderecoAbi(carteira) + uintAbi(UINT128_MAX) + uintAbi(UINT128_MAX)
        }))
    ]);

    const infoToken = new Map(tokens.map((t, i) => [t, { simbolo: textoDe(r[2 * i]), decimais: Number(uintDe(r[2 * i + 1])) }]));
    const enderecoPool = new Map(pools.map((p, i) => [chavePool(p), enderecoDe(r[2 * tokens.length + i])]));
    const coletas = r.slice(2 * tokens.length + pools.length);

    const enderecos = [...new Set(enderecoPool.values())];
    const slots = new Map((await ethCall(enderecos.map(a => ({ to: a, data: SEL.slot0 }))))
        .map((h, i) => [enderecos[i], { sqrtPriceX96: uintDe(h, 0), tick: Number(intDe(h, 1)) }]));

    return brutas.map((p, i) => {
        const pool = enderecoPool.get(chavePool(p));
        const { sqrtPriceX96, tick } = slots.get(pool);
        const t0 = infoToken.get(p.token0);
        const t1 = infoToken.get(p.token1);
        const escala = 10 ** (t0.decimais - t1.decimais);   // preço bruto → token1 por token0

        const sqrtP = Number(sqrtPriceX96) / 2 ** 96;
        const [sa, sb] = [p.tickInferior, p.tickSuperior].map(t => 1.0001 ** (t / 2));
        const [q0, q1] = quantidades(Number(p.liquidez), sqrtP, sa, sb);

        const preco = sqrtP ** 2 * escala;
        const usd1 = ehEstavel(t1.simbolo) ? 1 : ehEstavel(t0.simbolo) ? 1 / preco : null;

        return {
            id: p.id,
            pool,
            taxa: p.taxa,
            simbolo0: t0.simbolo,
            simbolo1: t1.simbolo,
            naFaixa: tick >= p.tickInferior && tick < p.tickSuperior,
            qtd0: q0 / 10 ** t0.decimais,
            qtd1: q1 / 10 ** t1.decimais,
            taxa0: Number(uintDe(coletas[i], 0)) / 10 ** t0.decimais,
            taxa1: Number(uintDe(coletas[i], 1)) / 10 ** t1.decimais,
            preco,
            inferior: sa ** 2 * escala,
            superior: sb ** 2 * escala,
            usd0: usd1 === null ? null : preco * usd1,
            usd1
        };
    });
}

module.exports = {
    FACTORY,
    MAX_NFTS,
    MAX_POSICOES,
    POSICOES,
    SEL,
    posicoesDaCarteira,
    quantidades
};
