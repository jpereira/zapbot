/*
 * Orca (Whirlpools): leitura de uma posição de liquidez concentrada e os
 * "Position Details" (saldo, faixa, preço, taxas e recompensas a coletar).
 */

const crypto = require('crypto');
const axios = require('axios');

const { base58Decodificar, chave, enderecoPda, lerContas, u128 } = require('./solana');

/*
 * Tudo é lido on-chain, no mesmo instante (posição, pool e os tick arrays dos
 * limites da faixa), e as contas seguem o programa da Orca:
 *   - quantidade de cada token: a liquidez da posição entre os preços da faixa;
 *   - taxas a coletar: fee_owed + liquidez × (crescimento das taxas DENTRO da
 *     faixa − o checkpoint da posição), em Q64.64 e módulo 2^128, como o
 *     collectFeesQuote do SDK; recompensas, do mesmo jeito (collectRewardsQuote).
 * A API pública da Orca dá o que não está on-chain: símbolos, decimais,
 * preços em dólar e as estatísticas da pool.
 */
const WHIRLPOOL_PROGRAMA = 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc';
const ORCA_API = 'https://api.orca.so/v2/solana';
const API_TIMEOUT_MS = 15000;

const TICKS_POR_ARRAY = 88;
const MOD128 = 1n << 128n;
const Q64 = 1n << 64n;

// Discriminadores do Anchor: sha256("account:<Nome>")[0..8]
const discriminador = (nome) => crypto.createHash('sha256').update(`account:${nome}`).digest().subarray(0, 8);
const DISC = {
    posicao: discriminador('Position'),
    pool: discriminador('Whirlpool'),
    tickArray: discriminador('TickArray'),
    tickArrayDinamico: discriminador('DynamicTickArray')
};
const ehDoTipo = (dados, tipo) => dados.subarray(0, 8).equals(DISC[tipo]);

/*
 * Layouts (bytes) das contas do programa Whirlpool
 */
function decodificarPosicao(b) {
    return {
        whirlpool: chave(b, 8),
        mint: chave(b, 40),
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

function decodificarPool(b) {
    return {
        tickSpacing: b.readUInt16LE(41),
        feeRate: b.readUInt16LE(45),            // em milionésimos: 1600 = 0,16%
        taxaProtocolo: b.readUInt16LE(47),      // em décimos de milésimo da taxa: 1300 = 13%
        liquidez: u128(b, 49),
        sqrtPrice: u128(b, 65),
        tickAtual: b.readInt32LE(81),
        mintA: chave(b, 101),
        crescimentoTaxaA: u128(b, 165),
        mintB: chave(b, 181),
        crescimentoTaxaB: u128(b, 245),
        recompensaAtualizadaEm: Number(b.readBigUInt64LE(261)),
        recompensas: [0, 1, 2].map(i => {
            const o = 269 + i * 128;
            return { mint: chave(b, o), emissoesX64: u128(b, o + 96), crescimentoX64: u128(b, o + 112) };
        })
    };
}

// Um tick: o que importa aqui são os crescimentos "do lado de fora" (taxas e recompensas)
const decodificarTick = (b, o) => ({
    foraTaxaA: u128(b, o + 32),
    foraTaxaB: u128(b, o + 48),
    foraRecompensas: [u128(b, o + 64), u128(b, o + 80), u128(b, o + 96)]
});
const TICK_VAZIO = { foraTaxaA: 0n, foraTaxaB: 0n, foraRecompensas: [0n, 0n, 0n] };

/*
 * Tick array fixo: start_tick_index (i32) e 88 ticks de 113 bytes (initialized,
 * liquidity_net, liquidity_gross, fee_growth_outside_a/b, reward_growths_outside[3]).
 * Dinâmico: start_tick_index, whirlpool, bitmap (u128) e cada tick com 1 byte de
 * tag (0 = vazio, 1 = seguido dos 112 bytes do tick).
 */
function decodificarTickArray(b) {
    const ticks = [];

    if (ehDoTipo(b, 'tickArray')) {
        for (let i = 0; i < TICKS_POR_ARRAY; i++) {
            const o = 12 + i * 113;
            ticks.push(b[o] ? decodificarTick(b, o + 1) : TICK_VAZIO);
        }
    } else if (ehDoTipo(b, 'tickArrayDinamico')) {
        let o = 60;
        for (let i = 0; i < TICKS_POR_ARRAY; i++) {
            if (b[o] === 1) {
                ticks.push(decodificarTick(b, o + 1));
                o += 113;
            } else {
                ticks.push(TICK_VAZIO);
                o += 1;
            }
        }
    } else {
        throw new Error('conta não é um tick array da Orca');
    }

    return { inicio: b.readInt32LE(8), ticks };
}

const inicioDoTickArray = (tick, spacing) => Math.floor(tick / (spacing * TICKS_POR_ARRAY)) * spacing * TICKS_POR_ARRAY;

const enderecoTickArray = (pool, inicio) =>
    enderecoPda([Buffer.from('tick_array'), base58Decodificar(pool), Buffer.from(String(inicio))], WHIRLPOOL_PROGRAMA);

// A posição é a PDA ["position", mint do NFT]
const enderecoDaPosicao = (nft) => enderecoPda([Buffer.from('position'), base58Decodificar(nft)], WHIRLPOOL_PROGRAMA);

/*
 * Crescimento DENTRO da faixa = global − abaixo(inferior) − acima(superior), módulo 2^128
 */
function crescimentoDentro(global, foraInferior, foraSuperior, tickAtual, tickInferior, tickSuperior) {
    const abaixo = tickAtual >= tickInferior ? foraInferior : global - foraInferior;
    const acima = tickAtual < tickSuperior ? foraSuperior : global - foraSuperior;
    return (((global - abaixo - acima) % MOD128) + MOD128) % MOD128;
}

// devido + liquidez × (dentro − checkpoint) / 2^64
const aColetar = (devido, dentro, checkpoint, liquidez) =>
    devido + (((((dentro - checkpoint) % MOD128) + MOD128) % MOD128) * liquidez) / Q64;

/**
 * Quantidades e valores a coletar de uma posição, em unidades mínimas (BigInt).
 * Função pura: recebe as contas já decodificadas.
 */
function calcularPosicao({ posicao, pool, tickInf, tickSup, agora = Date.now() }) {
    const L = Number(posicao.liquidez);
    const sa = Math.pow(1.0001, posicao.tickInferior / 2);
    const sb = Math.pow(1.0001, posicao.tickSuperior / 2);
    const sc = Number(pool.sqrtPrice) / 2 ** 64;

    let qtdA = 0;
    let qtdB = 0;
    if (sc <= sa) qtdA = L * (sb - sa) / (sa * sb);
    else if (sc >= sb) qtdB = L * (sb - sa);
    else {
        qtdA = L * (sb - sc) / (sc * sb);
        qtdB = L * (sc - sa);
    }

    const args = [pool.tickAtual, posicao.tickInferior, posicao.tickSuperior];
    const taxaA = aColetar(posicao.taxaDevidaA,
        crescimentoDentro(pool.crescimentoTaxaA, tickInf.foraTaxaA, tickSup.foraTaxaA, ...args),
        posicao.checkpointTaxaA, posicao.liquidez);
    const taxaB = aColetar(posicao.taxaDevidaB,
        crescimentoDentro(pool.crescimentoTaxaB, tickInf.foraTaxaB, tickSup.foraTaxaB, ...args),
        posicao.checkpointTaxaB, posicao.liquidez);

    // Recompensas: o crescimento global anda com as emissões desde a última atualização da pool
    const decorrido = BigInt(Math.max(0, Math.floor(agora / 1000) - pool.recompensaAtualizadaEm));
    const recompensas = pool.recompensas.map((r, i) => {
        if (r.mint === '11111111111111111111111111111111') return null; // slot sem recompensa

        const global = pool.liquidez > 0n ? r.crescimentoX64 + (r.emissoesX64 * decorrido) / pool.liquidez : r.crescimentoX64;
        const dentro = crescimentoDentro(global, tickInf.foraRecompensas[i], tickSup.foraRecompensas[i], ...args);
        return { mint: r.mint, quantidade: aColetar(posicao.recompensas[i].devido, dentro, posicao.recompensas[i].checkpoint, posicao.liquidez) };
    }).filter(Boolean);

    return {
        qtdA, qtdB, taxaA, taxaB, recompensas,
        naFaixa: sc >= sa && sc < sb,
        // Preço bruto (B por A, sem os decimais) atual e dos limites
        precoAtual: sc * sc, precoInferior: sa * sa, precoSuperior: sb * sb
    };
}

/**
 * Lê a posição on-chain e confere se é mesmo uma posição da Orca (e, se
 * informados, o NFT e a pool).
 * @returns {Promise<{ posicao } | { erro }>}
 */
async function validarPosicao({ endereco, nft = null, pool = null }) {
    const [conta] = await lerContas([endereco]);

    if (!conta) return { erro: `❌ A conta ${endereco} não existe na Solana.` };
    if (conta.dono !== WHIRLPOOL_PROGRAMA || !ehDoTipo(conta.dados, 'posicao')) {
        return { erro: `❌ ${endereco} não é uma posição da Orca (Whirlpool).` };
    }

    const posicao = decodificarPosicao(conta.dados);

    if (pool && pool !== posicao.whirlpool) {
        return { erro: `❌ A posição é da pool ${posicao.whirlpool}, não da ${pool}.` };
    }
    if (nft && (nft !== posicao.mint || enderecoDaPosicao(nft) !== endereco)) {
        return { erro: `❌ O NFT ${nft} não é o desta posição (o dela é ${posicao.mint}).` };
    }

    return { posicao };
}

const orcaApi = async (caminho) => (await axios.get(`${ORCA_API}/${caminho}`, { timeout: API_TIMEOUT_MS })).data.data;

/**
 * Tudo o que o /defi -s mostra de uma posição. Duas leituras no RPC: a
 * posição com a pool (guardada no cadastro) e os tick arrays dos limites.
 */
async function detalhesDaPosicao(endereco, enderecoPool, agora = Date.now()) {
    const [contaPosicao, contaPool] = await lerContas([endereco, enderecoPool]);
    if (!contaPosicao || !ehDoTipo(contaPosicao.dados, 'posicao')) throw new Error('a posição não existe mais (foi fechada?)');
    if (!contaPool || !ehDoTipo(contaPool.dados, 'pool')) throw new Error('a pool da posição não foi encontrada');

    const posicao = decodificarPosicao(contaPosicao.dados);
    const pool = decodificarPool(contaPool.dados);

    // Os tick arrays dos dois limites da faixa (podem ser o mesmo)
    const inicios = [posicao.tickInferior, posicao.tickSuperior].map(t => inicioDoTickArray(t, pool.tickSpacing));
    const enderecos = [...new Set(inicios)].map(i => enderecoTickArray(posicao.whirlpool, i));
    const arrays = (await lerContas(enderecos)).map(c => (c ? decodificarTickArray(c.dados) : null));

    const tickDe = (tick) => {
        const arr = arrays.find(a => a && a.inicio === inicioDoTickArray(tick, pool.tickSpacing));
        return arr ? arr.ticks[(tick - arr.inicio) / pool.tickSpacing] : TICK_VAZIO;
    };

    const calculo = calcularPosicao({ posicao, pool, tickInf: tickDe(posicao.tickInferior), tickSup: tickDe(posicao.tickSuperior), agora });

    // Metadados e preços: API da Orca
    const [infoPool, tokenA, tokenB, ...tokensRecompensa] = await Promise.all([
        orcaApi(`pools/${posicao.whirlpool}`),
        orcaApi(`tokens/${pool.mintA}`),
        orcaApi(`tokens/${pool.mintB}`),
        ...calculo.recompensas.map(r => orcaApi(`tokens/${r.mint}`).catch(() => null))
    ]);

    return { endereco, posicao, pool, calculo, infoPool, tokenA, tokenB, tokensRecompensa };
}

module.exports = {
    WHIRLPOOL_PROGRAMA,
    calcularPosicao,
    decodificarPool,
    decodificarPosicao,
    decodificarTickArray,
    detalhesDaPosicao,
    enderecoDaPosicao,
    enderecoTickArray,
    inicioDoTickArray,
    validarPosicao
};
