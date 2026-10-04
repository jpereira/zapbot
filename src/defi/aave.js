/*
 * Aave V3: a posição de uma carteira, lida on-chain nos contratos oficiais de
 * cada rede do setting 'defi.aave.chains' (padrão: Ethereum e Base). Só
 * leitura: eth_call pelo RPC (agrupados no Multicall3), sem chave privada.
 *
 * De onde vem cada coisa (https://aave.com/docs/aave-v3/smart-contracts):
 *   - PoolAddressesProvider (o único endereço fixo por rede) → o Pool, o
 *     AaveOracle e o PoolDataProvider daquele mercado.
 *   - Pool.getUserAccountData(carteira): o colateral, a dívida e o quanto
 *     ainda dá para pegar emprestado (na moeda base do oráculo, USD com 8
 *     casas), o liquidation threshold e o LTV máximo médios e o Health Factor
 *     (18 casas). É o valor do próprio protocolo, o mesmo do app do Aave: o
 *     bot não recalcula o HF, então eMode, isolation mode, ativos fornecidos
 *     que não são colateral e o LT de cada ativo já entram certos.
 *   - PoolDataProvider: os ativos do mercado (getAllReservesTokens), o saldo
 *     de cada um na carteira (getUserReserveData: aToken, dívida variável e
 *     estável, se é colateral), os decimals e o LT (getReserveConfigurationData),
 *     as taxas (getReserveData) e o debt ceiling (getDebtCeiling).
 *   - AaveOracle.getAssetsPrices: o preço de cada ativo na moeda base.
 *
 * Contas daqui (para exibir; o risco é o do protocolo):
 *   valor em USD = quantidade × preço / BASE_CURRENCY_UNIT
 *   posição líquida = soma do fornecido (colateral ou não) − dívida
 *   LTV atual = dívida / colateral (os dois do getUserAccountData)
 *   APY = (1 + taxa/ano em segundos)^(segundos do ano) − 1, com a taxa em ray
 *   preço de liquidação: só com UM colateral (o HF é proporcional ao preço
 *   dele): preço atual / HF. Com vários, depende do que os outros fizerem, e
 *   o bot não chuta.
 */

const { ErroEvm, listaDeEnderecosAbi, listaDeUint, multicall, textoNaPalavra } = require('./evm');
const { enderecoAbi, enderecoDe, isEnderecoEvm, uintAbi, uintDe } = require('./hyperevm');
const { printError, printInfo } = require('../log');
const { envOuSetting, getSetting } = require('../settings');

const CACHE_MS = 30000;
const SEGUNDOS_NO_ANO = 31536000;
const RAY = 10n ** 27n;
const WAD = 10n ** 18n;
const PRECISAO = 10n ** 6n;

/*
 * As redes: o PoolAddressesProvider do mercado principal (o "Core") e o RPC
 * (a variável do config/.env ou, vazia, o setting). Outra rede do Aave V3 é
 * mais uma linha aqui (e um setting de RPC), com o endereço do Aave Address
 * Book (https://github.com/bgd-labs/aave-address-book).
 */
const REDES = {
    1: {
        nome: 'Ethereum', env: 'ETHEREUM_RPC_URL', setting: 'defi.ethereum.rpc',
        provider: '0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e'
    },
    8453: {
        nome: 'Base', env: 'BASE_RPC_URL', setting: 'defi.base.rpc',
        provider: '0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D'
    }
};

// Seletores (keccak256 da assinatura, os 4 primeiros bytes)
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

const abreviar = (carteira) => `${carteira.slice(0, 6)}...${carteira.slice(-4)}`;
const decimaisValidos = (d) => Number.isInteger(d) && d >= 0 && d <= 36;
const comCasas = (bigint) => Number(bigint) / Number(PRECISAO);

// Unidades mínimas → tokens
function emTokens(bruto, decimals) {
    const escala = 10n ** BigInt(decimals);
    return Number(bruto / escala) + Number(bruto % escala) / Number(escala);
}

// quantidade × preço / BASE_CURRENCY_UNIT, em USD (null: sem preço ou decimals inválidos)
function emUsd(bruto, decimals, preco, base) {
    if (!preco || !decimaisValidos(decimals) || !base) return null;
    return comCasas((bruto * preco * PRECISAO) / (10n ** BigInt(decimals) * base));
}

// Taxa do Aave (APR em ray, 1e27) → APY, composta por segundo como na documentação
function apy(taxaRay) {
    const apr = comCasas((taxaRay * PRECISAO) / RAY);
    return Math.expm1(SEGUNDOS_NO_ANO * Math.log1p(apr / SEGUNDOS_NO_ANO));
}

/*
 * Health Factor (18 casas). Sem dívida, o Pool devolve o máximo do uint256:
 * aí (ou num HF absurdo de grande) é ∞, nunca um número de 78 dígitos.
 */
function healthFactor(bruto, divida) {
    if (divida === 0n || bruto >= 10n ** 36n) return Infinity;
    return comCasas((bruto * PRECISAO) / WAD);
}

// getAllReservesTokens: (string symbol, address tokenAddress)[]
function decodificarReservas(hex) {
    const h = hex.replace(/^0x/, '');
    const inicio = Number(uintDe(h, 0)) * 2;
    const n = Number(uintDe(h.slice(inicio), 0));
    const base = inicio + 64;

    return Array.from({ length: n }, (_, i) => {
        const tupla = h.slice(base + Number(uintDe(h.slice(base), i)) * 2);
        return { simbolo: textoNaPalavra(tupla, 0), endereco: enderecoDe(tupla, 1) };
    });
}

// Os contratos do mercado, lidos uma vez por rede (o provider é fixo; eles só
// mudam por votação da governança, que não acontece entre um /defi e outro)
const contratos = new Map();

async function contratosDaRede(id, url, rotulo) {
    if (contratos.has(id)) return contratos.get(id);

    const { provider } = REDES[id];
    const seletores = [SEL.getPool, SEL.getPriceOracle, SEL.getPoolDataProvider];
    const [pool, oraculo, dados] = await multicall(url, seletores.map(data => ({ to: provider, data })), rotulo);
    if (![pool, oraculo, dados].every(r => r.ok && r.data.length >= 66)) {
        throw new ErroEvm('Não achei os contratos do Aave nessa rede.',
            `PoolAddressesProvider ${provider}: resposta inválida`);
    }

    const r = {
        pool: enderecoDe(pool.data),
        oraculo: enderecoDe(oraculo.data),
        dados: enderecoDe(dados.data)
    };
    contratos.set(id, r);
    return r;
}

// Uma resposta que tem que ter vindo: senão, o contrato não é o esperado
// (ABI diferente, rede errada...)
function exigir(r, oQue) {
    if (!r?.ok || r.data.length < 66) {
        throw new ErroEvm('O contrato do Aave respondeu diferente do esperado.',
            `${oQue}: chamada falhou ou veio vazia`);
    }
    return r.data;
}

/**
 * A posição Aave V3 da carteira numa rede.
 * @returns {Promise<object|null>} null: nada fornecido nem emprestado ali
 */
async function lerRede(id, carteira) {
    const rede = REDES[id];
    const url = envOuSetting(rede.env, rede.setting);
    const rotulo = `RPC da ${rede.nome}`;
    printInfo(`[AAVE] Chain: ${rede.nome}`);

    const c = await contratosDaRede(id, url, rotulo);
    const usuario = enderecoAbi(carteira);

    const [conta, modo, reservas, unidade] = await multicall(url, [
        { to: c.pool, data: SEL.getUserAccountData + usuario },
        { to: c.pool, data: SEL.getUserEMode + usuario },
        { to: c.dados, data: SEL.getAllReservesTokens },
        { to: c.oraculo, data: SEL.BASE_CURRENCY_UNIT }
    ], rotulo);

    const dadosDaConta = exigir(conta, 'getUserAccountData');
    const tokens = decodificarReservas(exigir(reservas, 'getAllReservesTokens'));
    const base = uintDe(exigir(unidade, 'BASE_CURRENCY_UNIT'));
    const emode = modo.ok ? Number(uintDe(modo.data)) : 0;

    // O saldo da carteira em cada ativo do mercado
    const saldos = await multicall(url, tokens.map(t => ({
        to: c.dados, data: SEL.getUserReserveData + enderecoAbi(t.endereco) + usuario
    })), rotulo);

    const ativos = tokens.map((t, i) => {
        const d = exigir(saldos[i], `getUserReserveData(${t.simbolo})`);
        return {
            ...t,
            fornecido: uintDe(d, 0),
            estavel: uintDe(d, 1),
            variavel: uintDe(d, 2),
            taxaEstavel: uintDe(d, 5),
            colateral: uintDe(d, 8) === 1n
        };
    }).filter(a => a.fornecido > 0n || a.estavel > 0n || a.variavel > 0n);

    if (!ativos.length) return null;

    // Configuração, taxas, debt ceiling e preço dos ativos da carteira (e o nome do eMode)
    const detalhes = await multicall(url, [
        ...ativos.flatMap(a => [
            { to: c.dados, data: SEL.getReserveConfigurationData + enderecoAbi(a.endereco) },
            { to: c.dados, data: SEL.getReserveData + enderecoAbi(a.endereco) },
            { to: c.dados, data: SEL.getDebtCeiling + enderecoAbi(a.endereco) }
        ]),
        {
            to: c.oraculo,
            data: SEL.getAssetsPrices + listaDeEnderecosAbi(ativos.map(a => a.endereco))
        },
        ...(emode ? [{ to: c.pool, data: SEL.getEModeCategoryLabel + uintAbi(emode) }] : [])
    ], rotulo);

    const precos = listaDeUint(exigir(detalhes[ativos.length * 3], 'getAssetsPrices'));
    const doEmode = detalhes[ativos.length * 3 + 1];
    const nomeDoEmode = emode && doEmode?.ok ? textoNaPalavra(doEmode.data, 0) : '';

    const fornecidos = [];
    const dividas = [];
    const semPreco = new Set();

    ativos.forEach((a, i) => {
        const config = exigir(detalhes[i * 3], `getReserveConfigurationData(${a.simbolo})`);
        const reserva = detalhes[i * 3 + 1];
        const teto = detalhes[i * 3 + 2];
        const decimals = Number(uintDe(config, 0));
        const preco = precos[i] ?? 0n;
        const valido = decimaisValidos(decimals);
        const item = (bruto, extra) => {
            const usd = emUsd(bruto, decimals, preco, base);
            if (usd === null) semPreco.add(a.simbolo);
            const qtd = valido ? emTokens(bruto, decimals) : null;
            return { simbolo: a.simbolo, decimals, qtd, usd, ...extra };
        };

        if (!valido) {
            printError(`[AAVE] ${REDES[id].nome}: decimals inválidos em ${a.simbolo} (${decimals})`);
        }

        if (a.fornecido > 0n) {
            fornecidos.push(item(a.fornecido, {
                colateral: a.colateral,
                apy: reserva?.ok ? apy(uintDe(reserva.data, 5)) : null,
                tetoDeDivida: teto?.ok ? Number(uintDe(teto.data)) / 100 : 0,   // 2 casas, em USD
                precoUsd: preco && base ? comCasas((preco * PRECISAO) / base) : null
            }));
        }
        if (a.variavel > 0n) {
            const taxa = reserva?.ok ? apy(uintDe(reserva.data, 6)) : null;
            dividas.push(item(a.variavel, { modo: 'Variable', apy: taxa }));
        }
        if (a.estavel > 0n) dividas.push(item(a.estavel, { modo: 'Stable', apy: apy(a.taxaEstavel) }));
    });

    // Poeira (menos de $0.01, como 7e-18 WETH) não é posição; só poeira, a rede fica vazia
    const temValor = (x) => x.usd === null || x.usd >= 0.01;
    const sobra = (lista) => lista.splice(0, lista.length, ...lista.filter(temValor));
    sobra(fornecidos);
    sobra(dividas);
    if (!fornecidos.length && !dividas.length) return null;

    // A conta do protocolo (moeda base do oráculo)
    const emBase = (bruto) => comCasas((bruto * PRECISAO) / base);
    const dividaBruta = uintDe(dadosDaConta, 1);
    const colateralUsd = emBase(uintDe(dadosDaConta, 0));
    const dividaUsd = emBase(dividaBruta);
    const hf = healthFactor(uintDe(dadosDaConta, 5), dividaBruta);

    // Conferência: a soma dos ativos tem que bater com o total do protocolo (1% de folga)
    const somaDivida = dividas.reduce((s, d) => s + (d.usd ?? 0), 0);
    if (Math.abs(somaDivida - dividaUsd) > Math.max(0.01, dividaUsd * 0.01)) {
        printError(`[AAVE] ${REDES[id].nome}: dívida somada ${somaDivida} ≠ ${dividaUsd} do protocolo`);
    }

    const fornecidoUsd = fornecidos.reduce((s, f) => s + (f.usd ?? 0), 0);
    const colaterais = fornecidos.filter(f => f.colateral);

    // Preço de liquidação: só com um colateral, que não seja também a dívida
    let precoLiquidacao = null;
    const [unico] = colaterais;
    const umColateral = colaterais.length === 1 && !dividas.some(d => d.simbolo === unico.simbolo);
    const comHf = dividaBruta > 0n && Number.isFinite(hf) && hf > 0;
    if (comHf && umColateral && colaterais[0].precoUsd) {
        precoLiquidacao = { simbolo: colaterais[0].simbolo, usd: colaterais[0].precoUsd / hf };
    }

    const isolado = colaterais.find(f => f.tetoDeDivida > 0);
    return {
        rede: REDES[id].nome,
        chainId: id,
        hf,
        colateralUsd,
        dividaUsd,
        disponivelUsd: emBase(uintDe(dadosDaConta, 2)),
        liquidationThreshold: Number(uintDe(dadosDaConta, 3)) / 10000,
        ltvMaximo: Number(uintDe(dadosDaConta, 4)) / 10000,
        ltvAtual: colateralUsd > 0 ? dividaUsd / colateralUsd : null,
        fornecidoUsd,
        liquidoUsd: fornecidoUsd - dividaUsd,
        fornecidos,
        dividas,
        semPreco: [...semPreco],
        emode: emode ? { id: emode, nome: nomeDoEmode } : null,
        isolamento: isolado ? { simbolo: isolado.simbolo, tetoUsd: isolado.tetoDeDivida } : null,
        precoLiquidacao,
        liquidacaoAmbigua: dividaBruta > 0n && colaterais.length > 1
    };
}

/*
 * Cache curto em memória, por carteira e rede: o comando repetido em 30 s
 * não volta ao RPC (que, sendo público, ia reclamar).
 */
const cache = new Map();
const limparCacheAave = () => {
    cache.clear();
    contratos.clear();
};

/**
 * As posições Aave V3 da carteira, em cada rede do defi.aave.chains.
 * Uma rede que falha não derruba as outras: vai em falhas.
 * @returns {Promise<{ carteira: string, redes: object[],
 *   falhas: Array<{ rede: string, motivo: string }>, quando: number }>}
 * @throws {ErroEvm} carteira inválida, ou todas as redes falharam
 */
async function posicoesAave(carteira) {
    if (!isEnderecoEvm(carteira)) {
        throw new ErroEvm(`"${carteira}" não é uma carteira EVM (0x e 40 caracteres hexadecimais).`);
    }

    const ids = getSetting('defi.aave.chains').map(Number);
    const inicio = Date.now();
    printInfo(`[AAVE] Consultando wallet ${abreviar(carteira)}`);

    const resultados = await Promise.all(ids.map(async (id) => {
        if (!REDES[id]) {
            const motivo = `Rede sem Aave V3 no bot (chain ${id}): confira o setting defi.aave.chains.`;
            return { falha: { rede: `chain ${id}`, motivo } };
        }

        const chave = `${carteira.toLowerCase()}|${id}`;
        const guardado = cache.get(chave);
        if (guardado && Date.now() - guardado.quando < CACHE_MS) return guardado;

        try {
            const posicao = await lerRede(id, carteira);
            cache.set(chave, { posicao, quando: Date.now() });
            return { posicao, quando: Date.now() };
        } catch (err) {
            const tipo = /timeout/i.test(err.message) ? 'Timeout' : 'RPC error';
            printError(`[AAVE] ${tipo} ${REDES[id].nome}: ${err.message}`);
            const motivo = err.motivo ?? 'Não foi possível obter os dados neste momento.';
            return { falha: { rede: REDES[id].nome, motivo } };
        }
    }));

    const falhas = resultados.filter(r => r.falha).map(r => r.falha);
    if (falhas.length === ids.length) {
        throw new ErroEvm(falhas.map(f => `${f.rede}: ${f.motivo}`).join('\n'), 'todas as redes falharam');
    }

    const redes = resultados.map(r => r.posicao).filter(Boolean);
    for (const r of redes) {
        const hf = Number.isFinite(r.hf) ? r.hf.toFixed(2) : '∞';
        printInfo(`[AAVE] ${r.rede}: ${r.fornecidos.length} supplied, ${r.dividas.length} borrowed`);
        printInfo(`[AAVE] ${r.rede}: Health Factor ${hf}`);
        printInfo(`[AAVE] ${r.rede}: Net position $${r.liquidoUsd.toFixed(2)}`);
    }
    printInfo(`[AAVE] Consulta concluída em ${Date.now() - inicio}ms`);

    const quando = Math.min(...resultados.filter(r => !r.falha).map(r => r.quando));
    return { carteira, redes, falhas, quando };
}

module.exports = {
    REDES,
    SEL,
    apy,
    decodificarReservas,
    healthFactor,
    limparCacheAave,
    posicoesAave
};
