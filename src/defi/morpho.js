/*
 * Morpho: as posições de uma carteira pela API oficial (GraphQL em
 * https://api.morpho.org/graphql, setting 'defi.morpho.api'), em todas as redes
 * do setting 'defi.morpho.chains' (padrão: Base, 8453). Só leitura: nada de
 * chave privada, nada de transação, só um POST com a consulta.
 *
 * Como o Morpho funciona (o que importa aqui):
 *   - Cada mercado (marketId) tem um token de empréstimo (loanAsset), um de
 *     colateral (collateralAsset), um oráculo e um LLTV fixo.
 *   - A posição guarda o colateral, o emprestado (borrowAssets) e o fornecido
 *     (supplyAssets), em unidades mínimas (BigInt).
 *   - O oráculo dá o preço de 1 unidade mínima do colateral em unidades
 *     mínimas do empréstimo, escalado por 1e36 (ORACLE_PRICE_SCALE).
 *   - O LLTV vem escalado por 1e18 (WAD): 860000000000000000 = 86%.
 *   - A posição é liquidável quando o LTV passa do LLTV.
 *
 * As fórmulas são as da documentação do Morpho
 * (https://docs.morpho.org/learn/concepts/liquidation/):
 *   valor do colateral (em token de empréstimo) = colateral × preço / 1e36
 *   Health Factor = valor do colateral × LLTV / emprestado    (< 1: liquidável)
 *   LTV = emprestado / valor do colateral
 * E o preço de liquidação: o HF é proporcional ao preço do oráculo, então ele
 * chega a 1 quando o preço cai para preço / HF, ou seja,
 *   preço de liquidação = emprestado × 1e36 / (colateral × LLTV)
 * Tudo em BigInt (nada de float com número de 30 dígitos); o Number só entra
 * no fim, para exibir. O healthFactor que a API também manda serve de
 * conferência: se a conta daqui divergir, fica o aviso no log.
 */

const axios = require('axios');

const { isEnderecoEvm } = require('./hyperevm');
const { printError, printInfo } = require('../log');
const { getSetting } = require('../settings');

const API_TIMEOUT_MS = 15000;
const CACHE_MS = 30000;

const ORACLE_PRICE_SCALE = 10n ** 36n;
const WAD = 10n ** 18n;
const PRECISAO = 10n ** 6n;   // casas guardadas nas divisões de BigInt (HF, LTV)

const ASSET = 'address symbol decimals price { usd }';

const CONSULTA_POR_REDE = `
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

// Um apelido por rede ("c8453: userByAddress(...)"): todas numa chamada só
const consulta = (redes) => {
    const porRede = redes.map(id =>
        `\n    c${id}: userByAddress(address: $carteira, chainId: ${id}) {${CONSULTA_POR_REDE}\n    }`);
    return `query ($carteira: String!) {${porRede.join('')}\n}`;
};

/*
 * Erro com o motivo para o WhatsApp (sem stack, sem URL); os detalhes técnicos
 * ficam no log.
 */
class ErroMorpho extends Error {
    constructor(motivo, detalhe = motivo) {
        super(detalhe);
        this.motivo = motivo;
    }
}

// "0x1234...abcd" para o log
const abreviar = (carteira) => `${carteira.slice(0, 6)}...${carteira.slice(-4)}`;

/*
 * BigInt da API: os pequenos vêm como número JSON, os grandes como string.
 * Algo que não é inteiro (ou um número já sem precisão) vira null.
 */
function inteiro(v) {
    if (typeof v === 'bigint') return v;
    if (typeof v === 'number') return Number.isSafeInteger(v) ? BigInt(v) : null;
    if (typeof v === 'string' && /^-?\d+$/.test(v)) return BigInt(v);
    return null;
}

const decimaisValidos = (d) => Number.isInteger(d) && d >= 0 && d <= 36;
const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// bruto / 10^casas, sem perder a parte inteira no caminho
function dividirPor10(bruto, casas) {
    const escala = 10n ** BigInt(casas);
    return Number(bruto / escala) + Number(bruto % escala) / Number(escala);
}

// Unidades mínimas → tokens (null: decimals inválidos)
const emTokens = (bruto, decimals) =>
    (bruto === null || !decimaisValidos(decimals) ? null : dividirPor10(bruto, decimals));

// O token: símbolo (ou o endereço abreviado, se a API não souber), decimals e preço em USD
const token = (a) => ({
    simbolo: a?.symbol || (a?.address ? `${a.address.slice(0, 6)}…${a.address.slice(-4)}` : '?'),
    decimals: a?.decimals,
    precoUsd: numero(a?.price?.usd)
});

// Valor em USD: o da API; sem ele, quantidade × preço do token (também da API); senão null
const emUsd = (daApi, qtd, t) =>
    numero(daApi) ?? (qtd !== null && t.precoUsd !== null ? qtd * t.precoUsd : null);

/**
 * As métricas de risco de um mercado, pelas fórmulas do Morpho (veja o topo).
 * @param {{ colateral: bigint, emprestado: bigint, preco: bigint|null, lltv: bigint }} p
 *   tudo em unidades brutas
 * @returns {{ hf: number|null, ltv: number|null, precoLiquidacaoBruto: bigint|null }}
 *   hf: Infinity sem dívida; null sem preço do oráculo (ou dívida sem colateral)
 */
function riscoDoMercado({ colateral, emprestado, preco, lltv }) {
    if (emprestado <= 0n) return { hf: Infinity, ltv: 0, precoLiquidacaoBruto: null };
    // Dívida sem colateral (ou sem preço): dividir por zero não é uma opção
    if (!preco || preco <= 0n || colateral <= 0n) {
        return { hf: null, ltv: null, precoLiquidacaoBruto: null };
    }

    const comCasas = (bigint) => Number(bigint) / Number(PRECISAO);

    // colateral × preço / 1e36 × LLTV / 1e18 / emprestado, com 6 casas
    const hf = comCasas((colateral * preco * lltv * PRECISAO) /
        (ORACLE_PRICE_SCALE * WAD * emprestado));
    // emprestado / (colateral × preço / 1e36)
    const ltv = comCasas((emprestado * ORACLE_PRICE_SCALE * PRECISAO) / (colateral * preco));
    // o preço em que HF = 1
    const precoLiquidacaoBruto = lltv > 0n
        ? (emprestado * ORACLE_PRICE_SCALE * WAD) / (colateral * lltv)
        : null;

    return { hf, ltv, precoLiquidacaoBruto };
}

/*
 * Preço do oráculo (bruto, 1e36) → tokens de empréstimo por 1 token de
 * colateral: preço / 1e36 × 10^(decimais do colateral − decimais do empréstimo).
 */
function precoEmTokens(bruto, colateral, emprestimo) {
    const validos = decimaisValidos(colateral.decimals) && decimaisValidos(emprestimo.decimals);
    if (bruto === null || !validos) return null;
    return dividirPor10(bruto, 36 - colateral.decimals + emprestimo.decimals);
}

// Uma posição num mercado; null se está zerada (fechada)
function posicaoDeMercado(x, rede) {
    const m = x?.market;
    const s = x?.state;
    if (!m || !s) {
        throw new ErroMorpho('A API do Morpho mandou uma posição incompleta.',
            `posição sem market/state: ${JSON.stringify(x)?.slice(0, 200)}`);
    }

    const [colateralBruto, emprestadoBruto, fornecidoBruto] =
        [s.collateral, s.borrowAssets, s.supplyAssets].map(v => inteiro(v ?? 0));
    const lltv = inteiro(m.lltv);
    if ([colateralBruto, emprestadoBruto, fornecidoBruto, lltv].includes(null)) {
        throw new ErroMorpho('A API do Morpho mandou números que não consegui ler.',
            `valores inválidos no mercado ${m.marketId}`);
    }
    if (!colateralBruto && !emprestadoBruto && !fornecidoBruto) return null;

    const colateral = token(m.collateralAsset);
    const emprestimo = token(m.loanAsset);
    const precoBruto = inteiro(m.state?.price);
    const risco = riscoDoMercado({
        colateral: colateralBruto, emprestado: emprestadoBruto, preco: precoBruto, lltv
    });

    // Sem preço do oráculo (mercado sem colateral, por exemplo): o HF da API, se tiver
    if (risco.hf === null && numero(x.healthFactor) !== null) risco.hf = x.healthFactor;

    /*
     * Conferência com o healthFactor da API (a mesma fórmula, mas calculada lá).
     * Se divergir mais de 1%, alguém errou a conta: fica no log para a gente
     * descobrir quem (spoiler: geralmente é o teste).
     */
    const daApi = numero(x.healthFactor);
    const divergiu = daApi !== null && Math.abs(risco.hf - daApi) > Math.max(0.01, daApi * 0.01);
    if (Number.isFinite(risco.hf) && divergiu) {
        printError(`[MORPHO] HF divergente no mercado ${m.marketId}: calculado ${risco.hf}, API ${daApi}`);
    }

    const qtdColateral = emTokens(colateralBruto, colateral.decimals);
    const qtdEmprestada = emTokens(emprestadoBruto, emprestimo.decimals);
    const qtdFornecida = emTokens(fornecidoBruto, emprestimo.decimals);
    // O item do lado (colateral, emprestado, fornecido), com a quantidade e o valor em USD
    const item = (bruto, t, qtd, usd) => (bruto ? { ...t, qtd, usd: emUsd(usd, qtd, t) } : null);

    return {
        tipo: 'mercado',
        rede,
        marketId: m.marketId,
        colateral: item(colateralBruto, colateral, qtdColateral, s.collateralUsd),
        emprestado: item(emprestadoBruto, emprestimo, qtdEmprestada, s.borrowAssetsUsd),
        fornecido: item(fornecidoBruto, emprestimo, qtdFornecida, s.supplyAssetsUsd),
        simboloColateral: colateral.simbolo,
        simboloEmprestimo: emprestimo.simbolo,
        lltv: Number((lltv * PRECISAO) / WAD) / Number(PRECISAO),
        hf: risco.hf,
        ltv: risco.ltv,
        precoOraculo: precoEmTokens(precoBruto, colateral, emprestimo),
        precoLiquidacao: precoEmTokens(risco.precoLiquidacaoBruto, colateral, emprestimo),
        utilizacao: numero(m.state?.utilization)
    };
}

// Uma posição num vault (v1: state.assets; v2: assets); null se está zerada
function posicaoDeVault(x, rede) {
    const v = x?.vault;
    const bruto = inteiro(x?.state?.assets ?? x?.assets ?? 0);
    if (!v || bruto === null) {
        throw new ErroMorpho('A API do Morpho mandou um vault que não consegui ler.',
            `vault inválido: ${JSON.stringify(x)?.slice(0, 200)}`);
    }
    if (!bruto) return null;

    const ativo = token(v.asset);
    const qtd = emTokens(bruto, ativo.decimals);
    return {
        tipo: 'vault',
        rede,
        nome: v.name || v.symbol || '?',
        fornecido: { ...ativo, qtd, usd: emUsd(x?.state?.assetsUsd ?? x?.assetsUsd, qtd, ativo) }
    };
}

/*
 * Os totais em USD. Uma posição sem preço fica fora da soma (e na lista
 * semPreco): nada de inventar valor.
 */
function totais(posicoes) {
    let fornecido = 0;
    let emprestado = 0;
    const semPreco = new Set();

    for (const p of posicoes) {
        for (const [lado, sinal] of [['colateral', 1], ['fornecido', 1], ['emprestado', -1]]) {
            const item = p[lado];
            if (!item) continue;
            if (item.usd === null) {
                semPreco.add(item.simbolo);
                continue;
            }
            if (sinal > 0) fornecido += item.usd;
            else emprestado += item.usd;
        }
    }

    return { fornecido, emprestado, liquido: fornecido - emprestado, semPreco: [...semPreco] };
}

/*
 * Cache curto em memória: a mesma carteira (nas mesmas redes) por 30 s. Quem
 * aperta o comando cinco vezes seguidas pra ver se o HF subiu ganha a mesma
 * resposta (e a API, um descanso).
 */
const cache = new Map();
const limparCacheMorpho = () => cache.clear();

// Erro do axios ou do GraphQL → ErroMorpho com um motivo legível
function traduzirErro(err) {
    if (err instanceof ErroMorpho) return err;

    const status = err.response?.status;
    const doGraphql = err.response?.data?.errors?.[0]?.message;

    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || /timeout/i.test(err.message)) {
        return new ErroMorpho(`A API do Morpho não respondeu em ${API_TIMEOUT_MS / 1000} segundos.`,
            `timeout: ${err.message}`);
    }
    if (status === 429) {
        return new ErroMorpho('Muitas consultas seguidas: a API do Morpho pediu um tempo.', 'HTTP 429 (rate limit)');
    }
    if (/unsupported chainId/i.test(doGraphql ?? '')) {
        const rede = doGraphql.match(/\d+/)?.[0] ?? '?';
        return new ErroMorpho(`Rede não suportada pelo Morpho (${rede}): confira o setting defi.morpho.chains.`,
            doGraphql);
    }
    if (doGraphql) return new ErroMorpho('A API do Morpho recusou a consulta.', `GraphQL: ${doGraphql}`);
    if (status >= 500) return new ErroMorpho('A API do Morpho está fora do ar.', `HTTP ${status}`);
    if (status) return new ErroMorpho('A API do Morpho respondeu com erro.', `HTTP ${status}`);
    return new ErroMorpho('Não consegui falar com a API do Morpho.', err.message);
}

/**
 * As posições Morpho da carteira, em todas as redes do defi.morpho.chains.
 * @param {string} carteira  0x + 40 hexadecimais
 * @returns {Promise<{ carteira: string, posicoes: object[], totais: object, quando: number,
 *   doCache: boolean }>}
 * @throws {ErroMorpho} com .motivo para mostrar no WhatsApp
 */
async function posicoesMorpho(carteira) {
    if (!isEnderecoEvm(carteira)) {
        throw new ErroMorpho(`"${carteira}" não é uma carteira EVM (0x e 40 caracteres hexadecimais).`);
    }

    const redes = getSetting('defi.morpho.chains').map(Number);
    const chave = `${carteira.toLowerCase()}|${redes.join(',')}`;
    const guardado = cache.get(chave);
    if (guardado && Date.now() - guardado.quando < CACHE_MS) return { ...guardado, doCache: true };

    const inicio = Date.now();
    printInfo(`[MORPHO] Consultando carteira ${abreviar(carteira)}`);

    let data;
    try {
        ({ data } = await axios.post(getSetting('defi.morpho.api'),
            { query: consulta(redes), variables: { carteira } },
            { timeout: API_TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } }));
    } catch (err) {
        const erro = traduzirErro(err);
        printError(`[MORPHO] Erro na API: ${erro.message}`);
        throw erro;
    }

    if (data?.errors?.length) {
        const erro = traduzirErro({ response: { data } });
        printError(`[MORPHO] Erro na API: ${erro.message}`);
        throw erro;
    }

    const posicoes = [];
    try {
        for (const id of redes) {
            const usuario = data?.data?.[`c${id}`];
            const inesperada = (detalhe) =>
                new ErroMorpho('A API do Morpho mandou uma resposta inesperada.', detalhe);
            if (!usuario || typeof usuario !== 'object') {
                throw inesperada(`sem dados da rede ${id}`);
            }

            const { marketPositions, vaultPositions, vaultV2Positions } = usuario;
            const listas = [marketPositions, vaultPositions, vaultV2Positions];
            if (listas.some(l => l !== undefined && l !== null && !Array.isArray(l))) {
                throw inesperada(`listas inválidas na rede ${id}`);
            }

            const nomeDaRede = (x) => x?.chain?.network ?? `chain ${id}`;
            for (const x of marketPositions ?? []) {
                posicoes.push(posicaoDeMercado(x, nomeDaRede(x.market)));
            }
            for (const x of [...(vaultPositions ?? []), ...(vaultV2Positions ?? [])]) {
                posicoes.push(posicaoDeVault(x, nomeDaRede(x.vault)));
            }
        }
    } catch (err) {
        const erro = traduzirErro(err);
        printError(`[MORPHO] Erro na API: ${erro.message}`);
        throw erro;
    }

    const abertas = posicoes.filter(Boolean);
    const resultado = { carteira, posicoes: abertas, totais: totais(abertas), quando: Date.now() };
    cache.set(chave, resultado);

    const usd = (v) =>
        `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const encontradas = abertas.length === 1 ? 'posição encontrada' : 'posições encontradas';
    printInfo(`[MORPHO] ${abertas.length} ${encontradas}`);
    printInfo(`[MORPHO] Total supplied: ${usd(resultado.totais.fornecido)}`);
    printInfo(`[MORPHO] Total borrowed: ${usd(resultado.totais.emprestado)}`);
    printInfo(`[MORPHO] Consulta concluída em ${Date.now() - inicio}ms`);

    return { ...resultado, doCache: false };
}

module.exports = {
    ErroMorpho,
    emTokens,
    limparCacheMorpho,
    posicoesMorpho,
    riscoDoMercado
};
