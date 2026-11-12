/*
 * Comando /defi.
 */

const { findCommand, getCommandSyntax } = require('./base');
const { client } = require('../cliente');
const { idsDoChatAtual } = require('../contatos');
const { dbAll, dbGet, dbPronto, dbRun } = require('../db');
const { posicoesAave } = require('../defi/aave');
const { isEnderecoAptos, normalizarEndereco } = require('../defi/aptos');
const { isEnderecoEvm } = require('../defi/hyperevm');
const { posicoesLiquidswap } = require('../defi/liquidswap');
const { posicoesMorpho } = require('../defi/morpho');
const { detalhesDaPosicao, validarPosicao } = require('../defi/orca');
const { posicoesDaCarteira } = require('../defi/prjx');
const { isEnderecoSolana } = require('../defi/solana');
const { descreverDestinos, destinosSalvos, extrairDestinos, recipientsDe, resolverDestinos } = require('../destinos');
const { idioma, t } = require('../i18n');
const { printError } = require('../log');
const { GetOptFromCommand } = require('../opcoes');
const { envOuSetting, getSetting } = require('../settings');
const { formatarData, plural } = require('../util/formatar');

/*
 * /defi: posições cadastradas da Orca (Solana), do Project X (HyperEVM), da
 * Liquidswap (Aptos) e do Morpho (empréstimos, na Base e nas redes do defi.morpho.chains).
 *   /defi                      → o "Position Details" de todas
 *   /defi orca|prjx|liquidswap|morpho  → só das daquele protocolo (morpho sem cadastro:
 *                                a carteira do MORPHO_WALLET_ADDRESS ou do defi.morpho.wallet)
 *   /defi -l                   → lista os cadastros
 *   /defi -rm <nº...|all>      → remove
 *   /defi orca -address <endereço> [-pool <endereço>] [-nft <mint>]  → cadastra uma posição
 *   /defi prjx|liquidswap|morpho -wallet <0x...>  → cadastra a carteira (o bot lê as posições dela)
 *   /defi <protocolo> -help    → a ajuda só daquele protocolo
 *   /defi [protocolo] -taxas [-alerta]  → o resumo das taxas a coletar (com o alerta de cada um)
 * O -nft e o -pool são opcionais: se vierem, o bot confere se batem com a posição.
 * No seu privado, os endereços vêm inteiros; fora dele, abreviados (0x92…0444).
 *
 * E o alerta de saída da faixa (a verificação fica em src/defi/alertas.js):
 *   /defi -alerta                         → lista os alertas
 *   /defi -alerta <nº|all> [-to <dest>]... → avisa quando a posição sai da faixa e quando
 *                                           volta: no seu privado ou nos -to (email, e-mails,
 *                                           contato, grupo ou número; repita para vários)
 *   /defi -alerta <nº|all> -taxas <US$>   → e quando as taxas a coletar passam do valor
 *   /defi -alerta -rm <nº|all>            → desliga
 */
const MAX_POSICOES = 20;

const curto = (endereco) => `${endereco.slice(0, 4)}…${endereco.slice(-4)}`;

// Números em dólar no padrão do /crypto (en-US)
const fmtUsd = (v) => (v > 0 && v < 0.01 ? '<$0.01' : `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const fmtCompacto = (v) => `$${Number(v).toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 2 })}`;
const fmtQtd = (v) => {
    if (v === 0) return '0';
    if (Math.abs(v) >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (Math.abs(v) >= 1) return v.toLocaleString('en-US', { maximumFractionDigits: 4 });
    return v.toLocaleString('en-US', { maximumSignificantDigits: 4 });
};
const fmtPreco = (v) => v.toLocaleString('en-US', { maximumSignificantDigits: 6 });

// ▕──●───────▏: onde o preço está dentro da faixa
function barraDaFaixa(atual, inferior, superior) {
    const N = 10;
    if (atual < inferior) return `● ▕${'─'.repeat(N)}▏`;
    if (atual >= superior) return `▕${'─'.repeat(N)}▏ ●`;

    const k = Math.min(N, Math.round(((atual - inferior) / (superior - inferior)) * N));
    return `▕${'─'.repeat(k)}●${'─'.repeat(N - k)}▏ ${t('defi.rangePct', { pct: Math.round(((atual - inferior) / (superior - inferior)) * 100) })}`;
}

const PROTOCOLOS = { aave: 'Aave', liquidswap: 'Liquidswap', morpho: 'Morpho', orca: 'Orca', prjx: 'Project X' };
// Variáveis do protocolo nas mensagens: {protocol}, {of} (da Orca), {in} (na Orca), {In} e {the} (a Orca)
const doProtocolo = (p) => ({
    protocol: PROTOCOLOS[p],
    of: t(`defi.of.${p}`),
    in: t(`defi.in.${p}`),
    In: t(`defi.In.${p}`),
    the: t(`defi.the.${p}`)
});
// Os que cadastram uma carteira (-wallet), e não uma posição (-address)
const DE_CARTEIRA = ['aave', 'liquidswap', 'morpho', 'prjx'];
// Os que têm faixa (o -alerta)
const COM_FAIXA = ['orca', 'prjx'];

// O endereço do cadastro: a posição (address, da Orca) ou a carteira (wallet)
const enderecoDo = (p) => p.address ?? p.wallet;

/*
 * "Orca · Hz15…RaPZ", "Project X · carteira 0x92…0444" ou, com o -name,
 * "Orca · Posição TAL (Hz15…RaPZ)" e "Project X · Carteira Hare (0x92…0444)".
 * O end diz como o endereço aparece: abreviado (o padrão) ou inteiro (no seu
 * privado).
 */
const carteiraComNome = (p, end) => (p.name ? `${p.name} (${end(p.wallet)})` : t('defi.walletLower', { addr: end(p.wallet) }));
const posicaoComNome = (p, end) => (p.name ? `${p.name} (${end(p.address)})` : end(p.address));
const descrever = (p, end = curto) => (DE_CARTEIRA.includes(p.protocol)
    ? `${PROTOCOLOS[p.protocol]} · ${carteiraComNome(p, end)}`
    : `${PROTOCOLOS[p.protocol] ?? p.protocol} · ${posicaoComNome(p, end)}`);

/*
 * -mask: saldos, quantidades e valores da carteira viram * mantendo o
 * formato ($**,***.**); taxas a coletar e os números do mercado (preço,
 * faixa, pool, HF, LTV, APY) continuam. Bom para mandar print sem mostrar o
 * tamanho do bolso.
 */
const MOSTRAR = (t) => t;
const ESCONDER = (t) => String(t).replace(/\d/g, '*');

// O nome da posição ou da carteira (-name): até 40 caracteres, numa linha
const MAX_NOME = 40;

/**
 * Texto do "Position Details" de uma posição do Project X (de posicoesDaCarteira).
 */
function textoDaPosicaoPrjx(x, nome = null, m = MOSTRAR) {
    const usd = (q, preco, exibir = m) =>
        (preco === null ? '' : ` (${exibir(fmtUsd(q * preco))})`);
    const total = (a, b, exibir = m) =>
        (x.usd1 === null ? '' : ` ${exibir(fmtUsd(a * x.usd0 + b * x.usd1))}`);
    const qtd = (q) => m(fmtQtd(q));
    const status = x.naFaixa
        ? t('defi.inRange')
        : t('defi.outOfRange', { dir: t(x.preco < x.inferior ? 'defi.below' : 'defi.above') });

    return `🌊 *Project X · ${x.simbolo0}/${x.simbolo1}* · ${t('defi.fee', { fee: (x.taxa / 10000).toLocaleString('en-US', { maximumFractionDigits: 2 }) })}\n` +
        `📍 #${x.id}${nome ? ` · 👛 ${nome}` : ''} · ${status}\n\n` +
        `${t('defi.l.balance')}${total(x.qtd0, x.qtd1)}\n` +
        `   • ${qtd(x.qtd0)} ${x.simbolo0}${usd(x.qtd0, x.usd0)}\n` +
        `   • ${qtd(x.qtd1)} ${x.simbolo1}${usd(x.qtd1, x.usd1)}\n\n` +
        `${t('defi.l.range')} ${fmtPreco(x.inferior)} – ${fmtPreco(x.superior)} ${t('defi.per', { q: x.simbolo1, b: x.simbolo0 })}\n` +
        `${t('defi.l.price')} ${fmtPreco(x.preco)} ${t('defi.per', { q: x.simbolo1, b: x.simbolo0 })}\n` +
        `   ${barraDaFaixa(x.preco, x.inferior, x.superior)}\n\n` +
        `${t('defi.l.fees')}${total(x.taxa0, x.taxa1, MOSTRAR)}\n` +
        `   • ${fmtQtd(x.taxa0)} ${x.simbolo0}${usd(x.taxa0, x.usd0, MOSTRAR)}\n` +
        `   • ${fmtQtd(x.taxa1)} ${x.simbolo1}${usd(x.taxa1, x.usd1, MOSTRAR)}`;
}

/**
 * Texto de uma posição da Liquidswap (de posicoesLiquidswap). Num AMM, as taxas
 * entram na pool: não há faixa nem taxas a coletar.
 */
function textoDaPosicaoLiquidswap(x, nome = null, m = MOSTRAR) {
    const usd = (q, preco) => (preco === null ? '' : ` (${m(fmtUsd(q * preco))})`);
    const total = x.usdY === null ? '' : ` ${m(fmtUsd(x.qtdX * x.usdX + x.qtdY * x.usdY))}`;
    const tvl = x.usdY === null ? '' : `TVL ${fmtCompacto(x.reservaX * x.usdX + x.reservaY * x.usdY)} · `;
    const fatia = (x.fatia * 100).toLocaleString('en-US', { maximumSignificantDigits: 3 });

    return `🌊 *Liquidswap · ${x.simboloX}/${x.simboloY}* · ${t('defi.fee', { fee: x.taxa.toLocaleString('en-US', { maximumFractionDigits: 2 }) })}` +
        ` · ${x.versao} ${t(x.estavel ? 'defi.stable' : 'defi.uncorrelated')}\n` +
        `📍 ${nome ? `👛 ${nome} · ` : ''}${t('defi.poolShare', { pct: m(fatia) })}\n\n` +
        `${t('defi.l.balance')}${total}\n` +
        `   • ${m(fmtQtd(x.qtdX))} ${x.simboloX}${usd(x.qtdX, x.usdX)}\n` +
        `   • ${m(fmtQtd(x.qtdY))} ${x.simboloY}${usd(x.qtdY, x.usdY)}\n\n` +
        `${t('defi.l.price')} ${fmtPreco(x.preco)} ${t('defi.per', { q: x.simboloY, b: x.simboloX })}\n` +
        (x.preco ? `   _(1 ${x.simboloY} = ${fmtPreco(1 / x.preco)} ${x.simboloX})_\n\n` : '\n') +
        `${t('defi.l.pool')} ${tvl}${fmtQtd(x.reservaX)} ${x.simboloX} + ${fmtQtd(x.reservaY)} ${x.simboloY}\n` +
        t('defi.ammFeesNote');
}

/**
 * Lê um cadastro, de qualquer protocolo.
 * @returns {Promise<{ naFaixa: boolean|null, textos: string[], foraDaFaixa: string[], taxasUsd: number|null }>}
 *   naFaixa: todas as posições na faixa (null: a carteira não tem nenhuma aberta)
 *   taxasUsd: as taxas a coletar em dólar (null: sem preço, num par sem stablecoin)
 */
async function lerCadastro(p, end = curto, { full = false, m = MOSTRAR } = {}) {
    if (p.protocol === 'aave') {
        const r = await posicoesAave(p.wallet);
        const algo = r.redes.length || r.falhas.length;
        return { naFaixa: null, textos: algo ? [textoAave(r, end, p.name, { full, m })] : [], foraDaFaixa: [], taxasUsd: null };
    }

    if (p.protocol === 'morpho') {
        const r = await posicoesMorpho(p.wallet);
        return { naFaixa: null, textos: r.posicoes.length ? [textoMorpho(r, end, p.name, m)] : [], foraDaFaixa: [], taxasUsd: null };
    }

    if (p.protocol === 'liquidswap') {
        const posicoes = await posicoesLiquidswap(p.wallet);
        return { naFaixa: null, textos: posicoes.map(x => textoDaPosicaoLiquidswap(x, p.name, m)), foraDaFaixa: [], taxasUsd: null };
    }

    if (p.protocol === 'prjx') {
        const posicoes = await posicoesDaCarteira(p.wallet);
        const comPreco = posicoes.filter(x => x.usd1 !== null);
        return {
            naFaixa: posicoes.length ? posicoes.every(x => x.naFaixa) : null,
            textos: posicoes.map(x => textoDaPosicaoPrjx(x, p.name, m)),
            foraDaFaixa: posicoes.filter(x => !x.naFaixa).map(x => textoDaPosicaoPrjx(x, p.name, m)),
            taxasUsd: comPreco.length ? comPreco.reduce((s, x) => s + x.taxa0 * x.usd0 + x.taxa1 * x.usd1, 0) : null
        };
    }

    const d = await detalhesDaPosicao(p.address, p.pool);
    const texto = textoDaPosicao(d, end, p.name, m);
    const emUsd = (qtd, token) => (Number(qtd) / 10 ** token.decimals) * Number(token.priceUsdc ?? 0);
    return {
        naFaixa: d.calculo.naFaixa,
        textos: [texto],
        foraDaFaixa: d.calculo.naFaixa ? [] : [texto],
        taxasUsd: emUsd(d.calculo.taxaA, d.tokenA) + emUsd(d.calculo.taxaB, d.tokenB)
    };
}

/*
 * Os números de uma posição da Orca: unidades mínimas → tokens e o preço
 * bruto → B por A (o Position Details e o resumo do -taxas).
 */
function numerosDaOrca(d) {
    const { calculo: c, tokenA, tokenB, infoPool } = d;
    const emA = (v) => Number(v) / 10 ** tokenA.decimals;
    const emB = (v) => Number(v) / 10 ** tokenB.decimals;
    const ajuste = 10 ** (tokenA.decimals - tokenB.decimals);
    const [atual, inferior, superior] = [c.precoAtual, c.precoInferior, c.precoSuperior].map(p => p * ajuste);

    return {
        simA: tokenA.metadata?.symbol ?? infoPool.tokenA?.symbol ?? 'A',
        simB: tokenB.metadata?.symbol ?? infoPool.tokenB?.symbol ?? 'B',
        usdA: Number(tokenA.priceUsdc ?? 0),
        usdB: Number(tokenB.priceUsdc ?? 0),
        atual,
        inferior,
        superior,
        qtdA: emA(c.qtdA),
        qtdB: emB(c.qtdB),
        taxaA: emA(c.taxaA),
        taxaB: emB(c.taxaB)
    };
}

/**
 * Texto do "Position Details" de uma posição da Orca.
 */
function textoDaPosicao(d, end = curto, nome = null, m = MOSTRAR) {
    const { calculo: c, infoPool } = d;
    const { simA, simB, usdA, usdB, atual, inferior, superior, qtdA, qtdB, taxaA, taxaB } = numerosDaOrca(d);

    const status = c.naFaixa
        ? t('defi.inRange')
        : t('defi.outOfRange', { dir: t(atual < inferior ? 'defi.below' : 'defi.above') });

    let texto = `🌊 *Orca · ${simA}/${simB}* · ${t('defi.fee', { fee: (d.pool.feeRate / 10000).toLocaleString('en-US', { maximumFractionDigits: 2 }) })}\n` +
        `📍 ${nome ? `${nome} (${end(d.endereco)})` : end(d.endereco)} · ${status}\n\n` +
        `${t('defi.l.balance')} ${m(fmtUsd(qtdA * usdA + qtdB * usdB))}\n` +
        `   • ${m(fmtQtd(qtdA))} ${simA} (${m(fmtUsd(qtdA * usdA))})\n` +
        `   • ${m(fmtQtd(qtdB))} ${simB} (${m(fmtUsd(qtdB * usdB))})\n\n` +
        `${t('defi.l.range')} ${fmtPreco(inferior)} – ${fmtPreco(superior)} ${t('defi.per', { q: simB, b: simA })}\n` +
        `${t('defi.l.price')} ${fmtPreco(atual)} ${t('defi.per', { q: simB, b: simA })}\n` +
        `   ${barraDaFaixa(atual, inferior, superior)}\n` +
        `   _(1 ${simB} = ${fmtPreco(1 / atual)} ${simA})_\n\n` +
        `${t('defi.l.fees')} ${fmtUsd(taxaA * usdA + taxaB * usdB)}\n` +
        `   • ${fmtQtd(taxaA)} ${simA} (${fmtUsd(taxaA * usdA)})\n` +
        `   • ${fmtQtd(taxaB)} ${simB} (${fmtUsd(taxaB * usdB)})\n`;

    // Recompensas: só as que têm algo a coletar
    const recompensas = c.recompensas
        .map((r, i) => ({ ...r, token: d.tokensRecompensa[i] }))
        .filter(r => r.quantidade > 0n && r.token);

    if (recompensas.length) {
        texto += t('defi.rewards') + '\n' + recompensas.map(r => {
            const qtd = Number(r.quantidade) / 10 ** r.token.decimals;
            return `   • ${m(fmtQtd(qtd))} ${r.token.metadata?.symbol ?? curto(r.mint)} (${m(fmtUsd(qtd * Number(r.token.priceUsdc ?? 0)))})`;
        }).join('\n') + '\n';
    }

    /*
     * Estimativa do rendimento em 24 h: a fatia da sua liquidez na liquidez
     * ativa da pool × as taxas das últimas 24 h que ficam com os LPs (o
     * protocolo leva 'taxaProtocolo' delas). Só dentro da faixa.
     */
    const s24 = infoPool.stats?.['24h'] ?? {};
    if (c.naFaixa && d.pool.liquidez > 0n && Number(s24.fees) > 0) {
        const fatia = Number(d.posicao.liquidez) / Number(d.pool.liquidez);
        const dosLps = Number(s24.fees) * (1 - d.pool.taxaProtocolo / 10000);
        texto += t('defi.yield', {
            usd: m(fmtUsd(fatia * dosLps)),
            pct: (fatia * 100).toLocaleString('en-US', { maximumSignificantDigits: 3 })
        }) + '\n';
    }

    texto += '\n' + t('defi.poolLine', {
        tvl: fmtCompacto(infoPool.tvlUsdc ?? 0),
        volume: fmtCompacto(s24.volume ?? 0),
        fees: fmtCompacto(s24.fees ?? 0)
    });

    return texto;
}

const exemplos = () => t('defi.examples');

// A palavra do protocolo: /defi orca, /defi prjx -wallet ..., /defi morpho, /defi liqswp (= liquidswap)
const PALAVRAS = { aave: 'aave', liqswp: 'liquidswap', liquidswap: 'liquidswap', morpho: 'morpho', orca: 'orca', prjx: 'prjx' };
const protocoloDe = (palavra) => PALAVRAS[String(palavra ?? '').toLowerCase()] ?? null;

async function limiteOuRepetida(msg, protocolo, endereco, end) {
    const coluna = DE_CARTEIRA.includes(protocolo) ? 'wallet' : 'address';
    if (await dbGet(`SELECT 1 AS ok FROM defi_positions WHERE protocol = ? AND lower(${coluna}) = lower(?)`, [protocolo, endereco])) {
        await msg.reply(t('defi.alreadyRegistered', { addr: end(endereco), cmd: protocolo, ...doProtocolo(protocolo) }));
        return true;
    }
    if ((await dbGet('SELECT COUNT(*) AS n FROM defi_positions')).n >= MAX_POSICOES) {
        await msg.reply(t('defi.limit', { max: MAX_POSICOES }));
        return true;
    }
    return false;
}

/*
 * prjx|morpho -wallet <0x...>: guarda a carteira; as posições são lidas a cada
 * /defi. Antes, confere a carteira no RPC (ou na API): endereço certo, mas sem
 * posição aberta, cadastra e avisa.
 */
const LER_CARTEIRA = {
    prjx: async (carteira) => ({ abertas: (await posicoesDaCarteira(carteira)).length }),
    liquidswap: async (carteira) => ({ abertas: (await posicoesLiquidswap(carteira)).length }),
    morpho: async (carteira) => {
        const r = await posicoesMorpho(carteira);
        return { abertas: r.posicoes.length, texto: (end, nome, { m }) => textoMorpho(r, end, nome, m) };
    },
    aave: async (carteira) => {
        const r = await posicoesAave(carteira);
        const abertas = r.redes.reduce((s, x) => s + x.fornecidos.length + x.dividas.length, 0);
        return { abertas, texto: (end, nome, opcoes) => textoAave(r, end, nome, opcoes) };
    }
};
const DICA_DA_CARTEIRA = {
    prjx: 'defi.tipHyperevm',
    liquidswap: 'defi.tipAptos',
    morpho: 'defi.tipRetry',
    aave: 'defi.tipAave'
};
const dica = (tabela, protocolo) => (tabela[protocolo] ? t(tabela[protocolo]) : '');

/*
 * A carteira de cada rede: a da Aptos (Liquidswap) tem até 64 hexadecimais e é
 * guardada por inteiro (0x1 = 0x000…001); as EVM, 40.
 */
const CARTEIRAS = {
    aptos: {
        valida: isEnderecoAptos,
        normalizar: normalizarEndereco,
        erro: (c) => t('defi.notAptos', { wallet: c }),
        exemplo: '0x8f3c4d2a1b9e7f6a5c4b3a29180f7e6d5c4b3a2918f7e6d5c4b3a2918f7e6d5c'
    },
    evm: {
        valida: isEnderecoEvm,
        normalizar: (c) => c.toLowerCase(),
        erro: (c) => t('defi.notEvm', { wallet: c }),
        exemplo: '0x926024824BAEAf3ee0b7A2EEFA5A216743230444'
    }
};
const carteiraDo = (protocolo) => CARTEIRAS[protocolo === 'liquidswap' ? 'aptos' : 'evm'];

/*
 * O Morpho e o Aave já mostram a posição no cadastro (com -full, a do Aave
 * completa); o Project X e a Liquidswap, que costumam ter várias, ficam para o
 * /defi prjx e o /defi liquidswap.
 */
async function cadastrarCarteira(msg, o, protocolo, end) {
    const digitada = String(o.wallet ?? '').trim().replace(/^<(.*)>$/, '$1');
    const tipo = carteiraDo(protocolo);
    const apelido = o.name || null;

    if (!digitada) {
        await msg.reply(t('defi.walletMissing', { proto: protocolo, example: tipo.exemplo }));
        return;
    }
    if (!tipo.valida(digitada)) {
        await msg.reply(tipo.erro(digitada));
        return;
    }
    // No banco, normalizada; nas mensagens e na leitura, a EVM como foi digitada (com o checksum)
    const carteira = tipo.normalizar(digitada);
    const exibida = tipo === CARTEIRAS.evm ? digitada : carteira;

    // Já cadastrada, com -name: troca o nome
    const existente = await dbGet('SELECT * FROM defi_positions WHERE protocol = ? AND wallet = ?', [protocolo, carteira]);
    if (existente && apelido) {
        await dbRun('UPDATE defi_positions SET name = ? WHERE id = ?', [apelido, existente.id]);
        await msg.reply(t('defi.renamed', { desc: descrever({ ...existente, name: apelido }, end) }));
        return;
    }
    if (await limiteOuRepetida(msg, protocolo, exibida, end)) return;

    let abertas;
    let texto;
    try {
        ({ abertas, texto } = await LER_CARTEIRA[protocolo](exibida));
    } catch (err) {
        printError(`/defi ${protocolo} ${exibida}:`, err.message);
        await msg.reply(t('defi.walletReadFailed', { reason: err.motivo ?? `${err.message}.`, tip: dica(DICA_DA_CARTEIRA, protocolo) }));
        return;
    }

    await dbRun('INSERT INTO defi_positions (protocol, wallet, name, created_at) VALUES (?, ?, ?, ?)',
        [protocolo, carteira, apelido, Date.now()]);
    await msg.reply(t('defi.walletRegistered', { ...doProtocolo(protocolo), addr: apelido ? `${apelido} (${end(exibida)})` : end(exibida) }) + '\n' +
        (abertas
            ? `📍 ${plural(abertas, t('defi.openPosition'), t('defi.openPositions'))}.`
            : t('defi.noOpenPosition', { cmd: protocolo })) +
        '\n' + t('defi.seeWith', { cmd: protocolo }));
    if (abertas && texto) await msg.reply(texto(end, apelido, { full: Boolean(o.full), m: o.mask ? ESCONDER : MOSTRAR }));
    return carteira;
}

/*
 * O endereço cadastrado, ou null (o erro já foi respondido). A Orca cadastra
 * a posição (-address); o Project X, a Liquidswap, o Morpho e o Aave, a carteira (-wallet).
 */
async function cadastrar(msg, { opt: o, given }, protocolo, end) {
    if (!protocolo) {
        await msg.reply(t('defi.needProtocol', { examples: exemplos() }));
        return null;
    }
    if (DE_CARTEIRA.includes(protocolo)) {
        if (given.has('address')) {
            await msg.reply(t('defi.walletGoesInWallet', { ...doProtocolo(protocolo), cmd: protocolo }));
            return null;
        }
        return cadastrarCarteira(msg, o, protocolo, end);
    }
    if (given.has('wallet')) {
        await msg.reply(t('defi.orcaGoesInAddress'));
        return null;
    }

    const [endereco, nft, pool] = [o.address, o.nft, o.pool].map(v => (v ? String(v).trim() : null));

    if (!endereco) {
        await msg.reply(t('defi.addressMissing'));
        return;
    }

    const invalido = [['-address', endereco], ['-nft', nft], ['-pool', pool]].find(([, v]) => v && !isEnderecoSolana(v));
    if (invalido) {
        await msg.reply(t('defi.notSolana', { opt: invalido[0], value: invalido[1] }));
        return;
    }

    // Já cadastrada, com -name: troca o nome
    const existente = await dbGet('SELECT * FROM defi_positions WHERE protocol = ? AND address = ?', ['orca', endereco]);
    if (existente && o.name) {
        await dbRun('UPDATE defi_positions SET name = ? WHERE id = ?', [o.name, existente.id]);
        await msg.reply(t('defi.renamed', { desc: descrever({ ...existente, name: o.name }, end) }));
        return;
    }
    if (await limiteOuRepetida(msg, 'orca', endereco, end)) return;

    const r = await validarPosicao({ endereco, nft, pool });
    if (r.erro) {
        await msg.reply(r.erro);
        return;
    }

    await dbRun('INSERT INTO defi_positions (protocol, address, name, nft, pool, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ['orca', endereco, o.name || null, r.posicao.mint, r.posicao.whirlpool, Date.now()]);

    const cadastrada = posicaoComNome({ address: endereco, name: o.name || null }, end);
    await msg.reply(t('defi.orcaRegistered', { addr: cadastrada }));
    return endereco;
}

const DICA_RPC = {
    liquidswap: 'defi.tipAptos',
    orca: 'defi.tipSolana',
    prjx: 'defi.tipHyperevm'
};

async function mostrar(msg, posicoes, end, { full = false, m = MOSTRAR } = {}) {
    for (const p of posicoes) {
        try {
            const { textos } = await lerCadastro(p, end, { full, m });
            if (!textos.length) await msg.reply(t('defi.noOpen', { desc: descrever(p, end) }));
            for (const texto of textos) await msg.reply(texto);
        } catch (err) {
            printError(`/defi ${enderecoDo(p)}:`, err.response?.status ?? '', err.message);
            // O Morpho e o Aave já trazem o motivo legível (e os detalhes ficaram no log)
            await msg.reply(err.motivo
                ? t('defi.readFailed', { desc: descrever(p, end), reason: err.motivo, tip: dica(DICA_DA_CARTEIRA, p.protocol) })
                : t('defi.readFailed', { desc: descrever(p, end), reason: `${err.message}.`, tip: dica(DICA_RPC, p.protocol) }));
        }
    }
}

/*
 * Morpho: o texto da consulta (os dados vêm de src/defi/morpho.js)
 */
const SEPARADOR = '━━━━━━━━━━━━━━━━━━';
const ESTAVEL = /USD|DAI|EUR|GHO|FRAX|LUSD/i;

// $1,234.56 (e -$1,234.56 quando a dívida passa do colateral)
const fmtUsdComSinal = (v) => (v < 0 ? `-${fmtUsd(-v)}` : fmtUsd(v));
const fmtPct = (v) => `${(v * 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

// Health Rate: ∞ sem dívida, N/A sem como calcular, senão 2 casas
const fmtHf = (hf) => (hf === Infinity ? '∞' : hf === null ? 'N/A'
    : hf.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/*
 * Quantidade de um token: stablecoin com 2 casas; BTC (cbBTC, WBTC...) com até
 * 8; ETH e os outros com até 6. Sem os zeros que sobram no fim.
 */
function fmtQtdToken(qtd, t) {
    if (ESTAVEL.test(t.simbolo)) return qtd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const casas = /BTC/i.test(t.simbolo) ? 8 : 6;
    const max = Math.min(Number.isInteger(t.decimals) ? t.decimals : casas, casas);
    return qtd.toLocaleString('en-US', { minimumFractionDigits: Math.min(2, max), maximumFractionDigits: max });
}

const iconeDoToken = (simbolo) => (/BTC/i.test(simbolo) ? '₿' : ESTAVEL.test(simbolo) ? '💵' : /ETH/i.test(simbolo) ? 'Ξ' : '🪙');

// O token: quantidade e valor (só o que a API trouxe)
function textoDoItem(item, rotulo = '', m = MOSTRAR) {
    return [
        `${iconeDoToken(item.simbolo)} *${item.simbolo}*${rotulo}`,
        item.qtd !== null && `${t('defi.amount')}: \`${m(fmtQtdToken(item.qtd, item))} ${item.simbolo}\``,
        item.usd !== null && `${t('defi.value')}: \`${m(fmtUsd(item.usd))}\``
    ].filter(Boolean).join('\n');
}

// O Health Rate em destaque: num mercado com colateral ou dívida (sem dívida, ∞)
const temHf = (p) => p.tipo === 'mercado' && Boolean(p.emprestado || p.colateral);
const destaqueDoHf = (p) => (temHf(p) ? `❤️ *Health Rate*\n\`${fmtHf(p.hf)}\`` : null);

/*
 * Os blocos de uma posição: o que entrou, o que saiu e o risco. Com
 * hfNoRisco, o Health Rate vai no bloco do risco (com várias posições); sem,
 * ele fica no topo da mensagem (destaqueDoHf).
 */
function textoDaPosicaoMorpho(p, { hfNoRisco, m = MOSTRAR }) {
    const blocos = [];

    if (p.tipo === 'vault') {
        blocos.push(`📥 *SUPPLIED*\n\n${textoDoItem(p.fornecido, ` _(vault ${p.nome})_`, m)}`);
        return blocos;
    }

    const entrou = [
        p.colateral && textoDoItem(p.colateral, '', m),
        p.fornecido && textoDoItem(p.fornecido, p.colateral ? ` _(${t('defi.supplied')})_` : '', m)
    ].filter(Boolean);
    if (entrou.length) blocos.push(`📥 *SUPPLIED / COLLATERAL*\n\n${entrou.join('\n')}`);

    if (p.emprestado) blocos.push(`📤 *BORROWED*\n\n${textoDoItem(p.emprestado, '', m)}`);

    // Risco: só faz sentido com dívida ou colateral
    if (p.emprestado || p.colateral) {
        const linhas = [];
        if (hfNoRisco) linhas.push(`Health Rate: \`${fmtHf(p.hf)}\``);
        if (p.emprestado && p.ltv !== null) linhas.push(`${t('defi.currentLtv')}: \`${fmtPct(p.ltv)}\``);
        linhas.push(`LLTV: \`${fmtPct(p.lltv)}\``);

        const emEmprestimo = (v) => `${fmtQtdToken(v, { simbolo: p.simboloEmprestimo, decimals: 8 })} ${p.simboloEmprestimo}`;
        if (p.precoOraculo !== null) linhas.push(t('defi.oraclePrice', { symbol: p.simboloColateral, value: emEmprestimo(p.precoOraculo) }));
        if (p.precoLiquidacao !== null) linhas.push(`${t('defi.liquidationPrice')}: \`${emEmprestimo(p.precoLiquidacao)}\``);
        if (p.utilizacao !== null) linhas.push(`${t('defi.utilization')}: \`${fmtPct(p.utilizacao)}\``);
        blocos.push(`${t('defi.riskTitle')}\n\n${linhas.join('\n')}`);
    }

    return blocos;
}

const tituloDaPosicao = (p) => (p.tipo === 'vault'
    ? `Vault ${p.nome} · ${p.rede}`
    : `${p.simboloColateral}/${p.simboloEmprestimo} · ${p.rede}`);

// O rodapé: a carteira, a(s) rede(s) e a hora da leitura
const rodapeDaCarteira = (r, end, nome, redes, varias) =>
    `👛 ${t('defi.walletLabel')}: ${nome ? `${nome} · ` : ''}\`${end(r.carteira)}\`\n` +
    `🌐 ${t(varias ? 'defi.networks' : 'defi.network')}: \`${redes}\`\n` +
    `🕐 ${t('defi.updated')}: \`${new Date(r.quando).toLocaleTimeString(idioma() === 'pt_BR' ? 'pt-BR' : 'en-US', { timeZone: 'America/Sao_Paulo' })}\``;

/**
 * A mensagem do /defi morpho: com uma posição, ela direto; com várias, os
 * totais e cada uma com o seu Health Rate (o de um mercado não vale para outro).
 */
function textoMorpho(r, end = curto, nome = null, m = MOSTRAR) {
    const { posicoes, totais: tot } = r;
    const rodape = rodapeDaCarteira(r, end, nome, [...new Set(posicoes.map(p => p.rede))].join(', '), posicoes.length > 1);
    const semPreco = tot.semPreco.length ? '\n' + t('defi.noUsdPrice', { list: tot.semPreco.join(', ') }) : '';

    if (posicoes.length === 1) {
        const [p] = posicoes;
        const liquido = tot.semPreco.length ? semPreco.trim() : `${t('defi.netPosition')}\n\`${m(fmtUsdComSinal(tot.liquido))}\``;
        const topo = [`🦋 *MORPHO* · ${tituloDaPosicao(p)}`, liquido, destaqueDoHf(p)].filter(Boolean).join('\n\n');
        return [topo, ...textoDaPosicaoMorpho(p, { hfNoRisco: false, m }), rodape].join(`\n\n${SEPARADOR}\n\n`);
    }

    const topo = '🦋 *MORPHO*\n\n' +
        `${t('defi.netTotal')}\n\`${m(fmtUsdComSinal(tot.liquido))}\`\n\n` +
        `📥 *Total supplied/collateral*\n\`${m(fmtUsd(tot.fornecido))}\`\n\n` +
        `📤 *Total borrowed*\n\`${m(fmtUsd(tot.emprestado))}\`${semPreco}`;
    const cada = posicoes.map((p, i) =>
        [`${t('defi.positionN', { n: i + 1 })} · ${tituloDaPosicao(p)}`, ...textoDaPosicaoMorpho(p, { hfNoRisco: true, m })].join('\n\n'));

    return [topo, ...cada, rodape].join(`\n\n${SEPARADOR}\n\n`);
}

/*
 * Aave: o texto (os dados vêm de src/defi/aave.js). O curto traz o líquido, o
 * Health Factor e os ativos; o -full, o risco, as taxas, o que é colateral e
 * a configuração. Cada rede tem o seu Health Factor: nunca um só, misturado.
 */
function itemAaveCurto(x, m = MOSTRAR) {
    return [
        `${iconeDoToken(x.simbolo)} *${x.simbolo}*`,
        x.qtd !== null && `\`${m(fmtQtdToken(x.qtd, x))} ${x.simbolo}\``,
        x.usd !== null && `\`${m(fmtUsd(x.usd))}\``
    ].filter(Boolean).join('\n');
}

function itemAaveFull(x, divida, m = MOSTRAR) {
    return [
        `*${x.simbolo}*`,
        x.qtd !== null && `Amount: \`${m(fmtQtdToken(x.qtd, x))}\``,
        x.usd !== null && `Value: \`${m(fmtUsd(x.usd))}\``,
        !divida && `Collateral: \`${x.colateral ? 'Yes' : 'No'}\``,
        x.apy !== null && `${divida ? 'Borrow' : 'Supply'} APY: \`${fmtPct(x.apy)}\``,
        divida && `Rate Mode: \`${x.modo}\``
    ].filter(Boolean).join('\n');
}

// O resumo da rede: o curto (com destaque, numa rede só) ou o técnico (-full)
function resumoAave(x, { full, destaque, m = MOSTRAR }) {
    const semPreco = x.semPreco.length ? '\n' + t('defi.noPrice', { list: x.semPreco.join(', ') }) : '';
    if (!full) {
        return destaque
            ? `${t('defi.netPosition')}\n\`${m(fmtUsdComSinal(x.liquidoUsd))}\`\n\n❤️ *Health Factor*\n\`${fmtHf(x.hf)}\`${semPreco}`
            : `Net: \`${m(fmtUsdComSinal(x.liquidoUsd))}\`\nHealth Factor: \`${fmtHf(x.hf)}\`${semPreco}`;
    }

    const risco = [
        x.ltvAtual !== null && `${t('defi.currentLtv')}: \`${fmtPct(x.ltvAtual)}\``,
        `${t('defi.maxLtv')}: \`${fmtPct(x.ltvMaximo)}\``,
        `Liquidation Threshold: \`${fmtPct(x.liquidationThreshold)}\``,
        `Available Borrows: \`${m(fmtUsd(x.disponivelUsd))}\``,
        `${t('defi.collateralRisk')}: \`${m(fmtUsd(x.colateralUsd))}\``,
        x.precoLiquidacao && t('defi.liquidationPriceOf', { symbol: x.precoLiquidacao.simbolo, value: fmtUsd(x.precoLiquidacao.usd) }),
        x.liquidacaoAmbigua && t('defi.ambiguousLiquidation')
    ].filter(Boolean).join('\n');

    return `💰 Net Position: \`${m(fmtUsdComSinal(x.liquidoUsd))}\`\n` +
        `📥 Supplied: \`${m(fmtUsd(x.fornecidoUsd))}\`\n` +
        `📤 Borrowed: \`${m(fmtUsd(x.dividaUsd))}\`${semPreco}\n\n` +
        `❤️ Health Factor: \`${fmtHf(x.hf)}\`\n\n${t('defi.risk')}\n${risco}`;
}

// As seções de uma rede: o resumo e os ativos (e, no -full, a configuração)
function secoesAave(x, { full, titulo, m = MOSTRAR }) {
    const { fornecidos, dividas } = x;
    const lista = (itens, divida) => itens.map(i => (full ? itemAaveFull(i, divida, m) : itemAaveCurto(i, m))).join('\n\n');
    const secoes = [
        `${titulo}${resumoAave(x, { full, m, destaque: !titulo.startsWith('🌐') })}`,
        fornecidos.length && `📥 *SUPPLIED*\n\n${lista(fornecidos, false)}`,
        dividas.length && `📤 *${full ? 'DEBT' : 'BORROWED'}*\n\n${lista(dividas, true)}`
    ];

    if (full) {
        const emode = x.emode ? `Enabled (${x.emode.nome || t('defi.category', { id: x.emode.id })})` : 'Disabled';
        const isolamento = x.isolamento
            ? `Yes (${x.isolamento.simbolo}, debt ceiling ${fmtUsd(x.isolamento.tetoUsd)})`
            : 'No';
        secoes.push(`${t('defi.configTitle')}\n\neMode: \`${emode}\`\nIsolation Mode: \`${isolamento}\``);
    }
    return secoes.filter(Boolean);
}

/**
 * A mensagem do /defi aave: numa rede só, ela direto; em várias, o total
 * global e cada rede com o seu Health Factor.
 */
function textoAave(r, end = curto, nome = null, { full = false, m = MOSTRAR } = {}) {
    const titulo = `🟣 *AAVE V3${full ? ' — FULL' : ''}*`;
    const redes = r.redes;
    const secoes = [];

    if (redes.length === 1) {
        secoes.push(...secoesAave(redes[0], { full, m, titulo: `${titulo} · ${redes[0].rede}\n\n` }));
    } else {
        const total = redes.reduce((s, x) => s + x.liquidoUsd, 0);
        secoes.push(`${titulo}\n\n💰 *TOTAL GLOBAL*\nNet: \`${m(fmtUsdComSinal(total))}\``);
        for (const x of redes) secoes.push(secoesAave(x, { full, m, titulo: `🌐 *${x.rede}*\n\n` }).join('\n\n'));
    }

    if (r.falhas.length) {
        secoes.push(r.falhas.map(f => `⚠️ *${f.rede}*: ${f.motivo}`).join('\n'));
    }

    secoes.push(rodapeDaCarteira(r, end, nome, redes.map(x => x.rede).join(', ') || '-', redes.length > 1));

    return secoes.join(`\n\n${SEPARADOR}\n\n`);
}

/*
 * /defi morpho ou /defi aave sem nada cadastrado: a carteira do .env
 * (MORPHO_WALLET_ADDRESS, AAVE_WALLET_ADDRESS) ou do setting, consultada na hora.
 */
const DO_ENV = {
    morpho: {
        nome: 'Morpho', env: 'MORPHO_WALLET_ADDRESS', setting: 'defi.morpho.wallet', ler: posicoesMorpho,
        vazio: (r) => !r.posicoes.length,
        semPosicao: (end, carteira) => t('defi.noPosition', { head: '🦋 *MORPHO*', wallet: end(carteira), chains: getSetting('defi.morpho.chains').join(', ') }),
        texto: (r, end, { m }) => textoMorpho(r, end, null, m)
    },
    aave: {
        nome: 'Aave', env: 'AAVE_WALLET_ADDRESS', setting: 'defi.aave.wallet', ler: posicoesAave,
        vazio: (r) => !r.redes.length && !r.falhas.length,
        semPosicao: (end, carteira) => t('defi.noPosition', { head: '🟣 *AAVE V3*', wallet: end(carteira), chains: getSetting('defi.aave.chains').join(', ') }),
        texto: (r, end, opcoes) => textoAave(r, end, null, opcoes)
    }
};

async function mostrarDoEnv(msg, protocolo, end, opcoes) {
    const d = DO_ENV[protocolo];
    const carteira = envOuSetting(d.env, d.setting);
    if (!carteira) {
        await msg.reply(t('defi.walletNotConfigured', { name: d.nome, env: d.env, setting: d.setting, proto: protocolo }));
        return;
    }

    let r;
    try {
        r = await d.ler(carteira);
    } catch (err) {
        if (!err.motivo) printError(`[${d.nome.toUpperCase()}] Erro inesperado:`, err.message);
        await msg.reply(t('defi.queryError', { name: d.nome, reason: err.motivo ?? t('defi.noData') }));
        return;
    }

    await msg.reply(d.vazio(r) ? d.semPosicao(end, carteira) : d.texto(r, end, opcoes));
}

/*
 * -alerta
 */
/**
 * Para onde vai o aviso da posição: "seu privado", "👥 Grupo", "📧 a@b.com".
 */
function descreverDestinoDoAlerta(p) {
    const destinos = destinosDoAlerta(p);
    return destinos.length ? descreverDestinos(destinos) : t('defi.yourPrivate');
}

// Os destinos guardados na posição (os do -to); []: o seu privado
function destinosDoAlerta(p) {
    const unico = p.alert_email
        ? { email: p.alert_email, nome: p.alert_email, grupo: false }
        : p.alert_dest_id ? { id: p.alert_dest_id, nome: p.alert_dest_name, grupo: Boolean(p.alert_dest_is_group) } : null;
    return destinosSalvos(p.alert_recipients, unico);
}

const ESTADO_DA_FAIXA = { 1: 'defi.stateIn', 0: 'defi.stateOut' };
const limiteDasTaxas = (p) => (p.alert_fees ? ` · 💸 ≥ ${fmtUsd(p.alert_fees)}` : '');
const estadoDaFaixa = (p) => t(ESTADO_DA_FAIXA[p.in_range] ?? 'defi.stateUnknown');
const cadaMinutos = () => plural(getSetting('defi.alerta.intervalMin'), t('alerts.minute'), t('alerts.minutes'));

async function listarAlertas(msg, posicoes, end) {
    const comAlerta = posicoes.map((p, i) => ({ p, n: i + 1 })).filter(({ p }) => p.alert);

    if (!comAlerta.length) {
        await msg.reply(t('defi.noAlerts'));
        return;
    }

    await msg.reply(`${t('defi.alertsTitle', { n: comAlerta.length })}\n\n` +
        comAlerta.map(({ p, n }) => `${n}. ${descrever(p, end)} · ${estadoDaFaixa(p)}${limiteDasTaxas(p)} → ${descreverDestinoDoAlerta(p)}`).join('\n') +
        '\n\n' + t('defi.alertsFooter', { every: cadaMinutos() }));
}

async function tratarAlerta(msg, opts, posicoes, { comDestino, destinosTexto }, end = curto) {
    const o = opts.opt;
    const porNumero = (v) => (/^\d+$/.test(v) ? posicoes[Number(v) - 1] : null);

    // -alerta -rm <nº|all>: desliga
    if (opts.given.has('rm')) {
        const rm = String(o.rm ?? '').trim().toLowerCase();
        const alvos = rm === 'all' ? posicoes.filter(p => p.alert) : [porNumero(rm)].filter(Boolean);

        if (rm !== 'all' && !alvos.length) {
            await msg.reply(t('defi.positionNotFound', { n: o.rm ?? '?' }));
            return;
        }

        for (const p of alvos) {
            await dbRun(`UPDATE defi_positions SET alert = 0, alert_dest_id = NULL, alert_dest_name = NULL,
                alert_dest_is_group = 0, alert_email = NULL, alert_recipients = NULL, alert_fees = NULL, fees_notified = 0,
                in_range = NULL WHERE id = ?`, [p.id]);
        }
        await msg.reply(rm === 'all'
            ? `🔕 ${plural(alvos.length, t('defi.alertOff'), t('defi.alertsOff'))}.`
            : t('defi.alertOffOne', { desc: descrever(alvos[0], end) }));
        return;
    }

    const alvo = String(o.alerta ?? '').trim().toLowerCase();

    if (!alvo) {
        if (comDestino) {
            await msg.reply(t('defi.alertNeedPosition'));
            return;
        }
        await listarAlertas(msg, posicoes, end);
        return;
    }

    // O alerta é de faixa: só a Orca e o Project X têm (o all pula o Morpho)
    const escolhidas = alvo === 'all'
        ? posicoes.filter(p => COM_FAIXA.includes(p.protocol))
        : [porNumero(alvo)].filter(Boolean);
    if (!escolhidas.length) {
        await msg.reply(alvo === 'all'
            ? t('defi.noRangePositions', { examples: exemplos() })
            : t('defi.positionNotFound', { n: o.alerta }));
        return;
    }
    const semFaixa = escolhidas.find(p => !COM_FAIXA.includes(p.protocol));
    if (semFaixa) {
        await msg.reply(t('defi.rangeOnlyPos', { n: posicoes.indexOf(semFaixa) + 1, ...doProtocolo(semFaixa.protocol) }));
        return;
    }

    // -taxas <valor>: o limite em dólar; off (ou 0) tira; sem -taxas, fica o que estava
    let taxas;
    if (opts.given.has('taxas')) {
        const v = String(o.taxas ?? '').trim().toLowerCase().replace(/^\$/, '').replace(',', '.');
        taxas = v === 'off' || v === '0' ? null : Number(v);
        if (taxas !== null && !(taxas > 0)) {
            await msg.reply(t('defi.feesInvalid'));
            return;
        }
    }

    // E-mail ou chat (vários -to: avisa em todos); vários contatos ou grupos com o nome,
    // espera você escolher na lista
    let destinos = [];
    if (comDestino) {
        destinos = await resolverDestinos(msg, destinosTexto, { aceitaEmail: true });
        if (!destinos) return;
    }
    const [destino = {}] = destinos;

    // O estado de agora vira a referência: o aviso sai quando a posição passar de dentro para fora
    const linhas = [];
    for (const p of escolhidas) {
        const limite = taxas === undefined ? p.alert_fees : taxas;
        const naFaixa = await lerCadastro(p, end)
            .then(({ naFaixa: f }) => (f === null ? null : f ? 1 : 0))
            .catch((err) => {
                printError(`/defi -alerta ${enderecoDo(p)}:`, err.response?.status ?? '', err.message);
                return null;
            });

        await dbRun(`UPDATE defi_positions SET alert = 1, alert_dest_id = ?, alert_dest_name = ?,
            alert_dest_is_group = ?, alert_email = ?, alert_recipients = ?, alert_fees = ?, fees_notified = 0, in_range = ?
            WHERE id = ?`,
        [destino.id ?? null, destino.email ? null : destino.nome ?? null, destino.grupo ? 1 : 0, destino.email ?? null,
            recipientsDe(destinos), limite ?? null, naFaixa, p.id]);

        const atualizada = { ...p, in_range: naFaixa, alert_fees: limite };
        linhas.push(`${posicoes.indexOf(p) + 1}. ${descrever(p, end)} · ${estadoDaFaixa(atualizada)}${limiteDasTaxas(atualizada)}` +
            (naFaixa === 0 ? ' ' + t('defi.warnWhenBack') : ''));
    }

    const ondeAvisa = destinos.length ? descreverDestinos(destinos) : t('defi.yourPrivate');

    await msg.reply(`${t('defi.alertOn', { n: escolhidas.length })}\n\n${linhas.join('\n')}\n\n` +
        t('defi.alertNotice', { where: ondeAvisa }) +
        (taxas ? t('defi.alertNoticeFees', { fees: fmtUsd(taxas) }) : '') +
        t('defi.alertNoticeEvery', { every: cadaMinutos() }) + '\n' +
        t('defi.alertOnTip'));
}

/*
 * Cadastro com -alerta [valor]: liga o alerta da posição nova, no seu privado (ou nos -to).
 * O valor é o limite das taxas em dólar (o mesmo que -taxas): -alerta 2000.
 */
async function cadastrarComAlerta(msg, opts, protocolo, destino, end) {
    const o = opts.opt;
    let limite = null;
    if (opts.given.has('alerta') && protocolo && !COM_FAIXA.includes(protocolo)) {
        await msg.reply(t('defi.rangeOnlyProto', doProtocolo(protocolo)));
        return;
    }
    if (opts.given.has('alerta')) {
        const v = String(o.alerta ?? '').trim().replace(/^\$/, '').replace(',', '.');
        limite = v ? Number(v) : null;
        if (v && !(limite > 0)) {
            await msg.reply(t('defi.alertFeesInvalid'));
            return;
        }
    }

    const endereco = await cadastrar(msg, opts, protocolo, end);
    if (!endereco || !opts.given.has('alerta')) return;

    const posicoes = await dbAll('SELECT * FROM defi_positions ORDER BY id');
    const n = posicoes.findIndex(p => p.protocol === protocolo && enderecoDo(p).toLowerCase() === endereco.toLowerCase()) + 1;
    const taxas = o.taxas ?? (limite ? String(limite) : null);
    await tratarAlerta(msg, {
        opt: { ...o, alerta: String(n), taxas },
        given: new Set(['alerta', ...(taxas ? ['taxas'] : [])]),
        argv: []
    }, posicoes, destino, end);
}

/*
 * -taxas (sem -alerta): o resumo das taxas a coletar, numa mensagem só. Vai
 * por protocolo de liquidez (Orca, Project X e Liquidswap), com a faixa, o
 * preço e as taxas de cada posição, e o total no fim. O que não está
 * cadastrado aparece como tal; a Liquidswap (AMM) não tem taxas a coletar.
 */
const COM_TAXAS = ['orca', 'prjx', 'liquidswap'];

// A posição no formato do resumo: token 0/1, faixa em 1 por 0 e as taxas (usd null: sem preço)
function taxasDaOrca(d, onde) {
    const x = numerosDaOrca(d);
    return {
        titulo: `Orca · ${x.simA}/${x.simB}`, onde, naFaixa: d.calculo.naFaixa,
        sim0: x.simA, sim1: x.simB, preco: x.atual, inferior: x.inferior, superior: x.superior,
        taxa0: x.taxaA, taxa1: x.taxaB, usd0: x.usdA, usd1: x.usdB
    };
}

const taxasDoPrjx = (x, nome) => ({
    titulo: `Project X · ${x.simbolo0}/${x.simbolo1}`, onde: `#${x.id}${nome ? ` · 👛 ${nome}` : ''}`, naFaixa: x.naFaixa,
    sim0: x.simbolo0, sim1: x.simbolo1, preco: x.preco, inferior: x.inferior, superior: x.superior,
    taxa0: x.taxa0, taxa1: x.taxa1, usd0: x.usd0, usd1: x.usd1
});

// As posições de um cadastro: { faixas } (Orca e Project X) ou { amm } (a Liquidswap: quantas pools)
async function lerTaxas(p, end) {
    if (p.protocol === 'liquidswap') return { amm: (await posicoesLiquidswap(p.wallet)).length };
    if (p.protocol === 'prjx') return { faixas: (await posicoesDaCarteira(p.wallet)).map(x => taxasDoPrjx(x, p.name)) };
    return { faixas: [taxasDaOrca(await detalhesDaPosicao(p.address, p.pool), posicaoComNome(p, end))] };
}

// O valor das taxas em dólar (null: sem preço)
const taxasEmUsd = (x) => (x.usd0 === null || x.usd1 === null ? null : x.taxa0 * x.usd0 + x.taxa1 * x.usd1);

function textoDasTaxas(x) {
    const usd = (q, preco) => (preco === null ? '' : ` (${fmtUsd(q * preco)})`);
    const total = taxasEmUsd(x);
    const fora = x.naFaixa ? '' : ' ' + t('defi.outShort');

    return `🌊 *${x.titulo}* · 📍 ${x.onde}\n` +
        `${t('defi.l.range')} ${fmtPreco(x.inferior)} – ${fmtPreco(x.superior)} ${t('defi.per', { q: x.sim1, b: x.sim0 })}\n` +
        `${t('defi.l.price')} ${fmtPreco(x.preco)} ${t('defi.per', { q: x.sim1, b: x.sim0 })}\n` +
        `   ${barraDaFaixa(x.preco, x.inferior, x.superior)}${fora}\n` +
        (x.preco ? `   _(1 ${x.sim1} = ${fmtPreco(1 / x.preco)} ${x.sim0})_\n` : '') +
        `${t('defi.l.fees')}${total === null ? ' ' + t('defi.noUsdShort') : ` ${fmtUsd(total)}`}\n` +
        `   • ${fmtQtd(x.taxa0)} ${x.sim0}${usd(x.taxa0, x.usd0)}\n` +
        `   • ${fmtQtd(x.taxa1)} ${x.sim1}${usd(x.taxa1, x.usd1)}`;
}

/*
 * Com -alerta: o alerta do cadastro, depois das posições dele. No Project X, o
 * limite das taxas vale para a carteira toda (a soma das posições), como na
 * verificação de src/defi/alertas.js.
 */
function textoDoAlertaNasTaxas(p, n, somaUsd) {
    if (!p.alert) return t('defi.noAlertHint', { n });
    const faixa = t(p.alert_fees ? 'defi.alertLineFees' : 'defi.alertLine', { fees: fmtUsd(p.alert_fees ?? 0), where: descreverDestinoDoAlerta(p) });
    if (!p.alert_fees || somaUsd === null) return faixa;
    return `${faixa}\n   ${somaUsd >= p.alert_fees
        ? t('defi.overLimit')
        : t('defi.missing', { usd: fmtUsd(p.alert_fees - somaUsd), pct: Math.floor((somaUsd / p.alert_fees) * 100) })}`;
}

async function resumirTaxas(msg, posicoes, protocolo, end, { comAlerta = false } = {}) {
    const blocos = [];
    const porProtocolo = [];
    const foraDoTotal = [];

    for (const proto of protocolo ? [protocolo] : COM_TAXAS) {
        const cadastros = posicoes.filter(p => p.protocol === proto);
        if (!cadastros.length) {
            blocos.push(t('defi.notRegistered', { protocol: PROTOCOLOS[proto] }));
            continue;
        }

        let soma = 0;
        let comValor = false;
        for (const p of cadastros) {
            try {
                const { faixas, amm } = await lerTaxas(p, end);
                if (amm !== undefined) {
                    blocos.push(`🌊 *Liquidswap* · 📍 ${carteiraComNome(p, end)}\n` +
                        (amm ? t('defi.ammNote', { pools: plural(amm, t('defi.pool'), t('defi.pools')) }) : t('defi.ammNoneNote')));
                    continue;
                }
                if (!faixas.length) blocos.push(t('defi.noOpenShort', { desc: descrever(p, end) }));
                let doCadastro = 0;
                let semPreco = false;
                for (const x of faixas) {
                    blocos.push(textoDasTaxas(x));
                    const v = taxasEmUsd(x);
                    if (v === null) {
                        foraDoTotal.push(t('defi.noPriceItem', { title: x.titulo }));
                        semPreco = true;
                    } else {
                        doCadastro += v;
                        comValor = true;
                    }
                }
                soma += doCadastro;
                if (comAlerta) {
                    const alerta = textoDoAlertaNasTaxas(p, posicoes.indexOf(p) + 1, semPreco ? null : doCadastro);
                    if (faixas.length > 1) blocos.push(`👛 *${descrever(p, end)}*: ${fmtUsd(doCadastro)}\n${alerta}`);
                    else blocos[blocos.length - 1] += `\n${alerta}`;
                }
            } catch (err) {
                printError(`/defi -taxas ${enderecoDo(p)}:`, err.response?.status ?? '', err.message);
                blocos.push(t('defi.cantReadNow', { desc: descrever(p, end), reason: err.motivo ?? `${err.message}.` }));
                foraDoTotal.push(t('defi.notRead', { desc: descrever(p, end) }));
            }
        }
        if (comValor) porProtocolo.push([PROTOCOLOS[proto], soma]);
    }

    const total = porProtocolo.reduce((s, [, v]) => s + v, 0);
    const quando = formatarData(Date.now()).replace(/,? (\d\d:\d\d):\d\d$/, (_, hora) => ` ${t('defi.at')} ${hora}`);
    const detalhe = porProtocolo.length > 1 ? `\n${porProtocolo.map(([nome, v]) => `   • ${nome}: ${fmtUsd(v)}`).join('\n')}` : '';
    const fora = foraDoTotal.length ? '\n' + t('defi.outOfTotal', { list: foraDoTotal.join(', ') }) : '';

    await msg.reply(`${t('defi.feesSummary', { when: quando })}\n\n${blocos.join('\n\n')}\n\n${SEPARADOR}\n` +
        `${t('defi.totalToCollect', { total: fmtUsd(total) })}${detalhe}${fora}`);
}

// -rm 2, -rm 1 3 5, -rm 1,3 (os números da lista de antes) ou all; algum que não existe: nenhum sai
async function remover(msg, o, argv, posicoes, end) {
    const partes = [o.rm, ...argv].join(' ').toLowerCase().split(/[\s,]+/).filter(Boolean);

    if (partes.includes('all')) {
        await dbRun('DELETE FROM defi_positions');
        await msg.reply(`🗑️ ${plural(posicoes.length, t('defi.registryRemoved'), t('defi.registriesRemoved'))}.`);
        return;
    }

    const numeros = [...new Set(partes.map(Number))].sort((a, b) => a - b);
    const faltando = numeros.filter(n => !posicoes[n - 1]);
    if (!numeros.length || faltando.length) {
        await msg.reply(t(faltando.length > 1 ? 'defi.numbersNotFoundMany' : 'defi.numbersNotFoundOne', { list: faltando.join(', ') || '?' }));
        return;
    }

    const removidos = numeros.map(n => posicoes[n - 1]);
    for (const p of removidos) await dbRun('DELETE FROM defi_positions WHERE id = ?', [p.id]);
    await msg.reply(removidos.length === 1
        ? t('defi.removedOne', { desc: descrever(removidos[0], end) })
        : `${t('defi.removedMany', { n: removidos.length })}\n${removidos.map(p => `• ${descrever(p, end)}`).join('\n')}`);
}

// O 🔔 do alerta, com o limite das taxas se tiver (🔔 ≥ $2,000.00)
const sinoDoAlerta = (p) => (p.alert ? ` 🔔${p.alert_fees ? ` ≥ ${fmtUsd(p.alert_fees)}` : ''}` : '');

// A lista: no seu privado, os endereços inteiros; fora dele, abreviados
function textoDaLista(posicoes, end, endPool = end) {
    const linha = (p, i) => `${i + 1}. ${PROTOCOLOS[p.protocol] ?? p.protocol} · ` +
        (DE_CARTEIRA.includes(p.protocol) ? carteiraComNome(p, end) : `${posicaoComNome(p, end)} · pool ${endPool(p.pool)}`) +
        ` ${t('defi.since', { date: formatarData(p.created_at).split(',')[0] })}${sinoDoAlerta(p)}`;

    return `${t('defi.listTitle', { n: posicoes.length })}\n\n${posicoes.map(linha).join('\n')}\n\n` +
        t('defi.listFooter');
}

async function cmdDefi({ msg, opts: optsDoComando, args, chatId }) {
    await dbPronto;

    // No seu privado, os endereços e as carteiras vêm inteiros; fora dele, abreviados
    const noPrivado = (await idsDoChatAtual(chatId)).includes(client.info?.wid?._serialized);
    const endNormal = noPrivado ? (e) => e : curto;

    /*
     * O -to aceita espaços (/Jorge Pereira/), que o parser de opções
     * separaria: sai do texto antes, e o resto é lido de novo.
     */
    const { destinos: destinosTexto, informado: comDestino, resto } = extrairDestinos(args);
    const opts = comDestino ? GetOptFromCommand(resto, findCommand('/defi')) : optsDoComando;
    const o = opts.opt;
    const end = o.mask ? () => '****…****' : endNormal;

    if (comDestino && !opts.given.has('alerta')) {
        await msg.reply(t('defi.toIsForAlert'));
        return;
    }

    // O protocolo vem como palavra: /defi orca, /defi prjx -wallet ...
    const palavra = opts.argv.find(protocoloDe);
    const argv = opts.argv.filter(a => a !== palavra);
    const protocolo = protocoloDe(palavra);

    /*
     * -name: o nome da posição ou da carteira, com espaços (-n Carteira Hare,
     * ou entre aspas). O parser separa as palavras; as que sobram no argv são
     * do nome.
     */
    if (opts.given.has('name')) {
        const nome = [o.name, ...argv].filter(Boolean).join(' ').trim();
        argv.length = 0;
        const erro = !opts.given.has('wallet') && !opts.given.has('address')
            ? t('defi.nameWithRegistration')
            : !nome ? t('defi.nameMissing')
                : nome.length > MAX_NOME ? t('defi.nameTooLong', { max: MAX_NOME }) : null;
        if (erro) {
            await msg.reply(erro);
            return;
        }
        o.name = nome;
    }

    if (opts.given.has('address') || opts.given.has('wallet')) {
        await cadastrarComAlerta(msg, opts, protocolo, { comDestino, destinosTexto }, end);
        return;
    }

    const posicoes = await dbAll('SELECT * FROM defi_positions ORDER BY id');

    // -taxas -alerta (os dois sem valor): o resumo das taxas com o alerta de cada cadastro
    const resumoComAlerta = opts.given.has('taxas') && opts.given.has('alerta') && !o.taxas && !o.alerta &&
        !opts.given.has('rm') && !comDestino;

    if (opts.given.has('alerta') && !resumoComAlerta) {
        await tratarAlerta(msg, opts, posicoes, { comDestino, destinosTexto }, end);
        return;
    }

    if (opts.given.has('rm')) {
        await remover(msg, o, argv, posicoes, end);
        return;
    }

    // -taxas sem -alerta: o resumo das taxas a coletar
    if (opts.given.has('taxas')) {
        const erro = o.taxas
            ? t('defi.feesWithValue')
            : protocolo && !COM_TAXAS.includes(protocolo)
                ? t('defi.noFeesFor', doProtocolo(protocolo))
                : argv.length ? t('defi.notProtocolFees', { word: argv[0] }) : null;
        if (erro) await msg.reply(erro);
        else await resumirTaxas(msg, posicoes, protocolo, end, { comAlerta: resumoComAlerta });
        return;
    }

    const vazio = t('defi.noneRegistered', { examples: exemplos() });

    if (o.list) {
        await msg.reply(posicoes.length ? textoDaLista(posicoes, end, endNormal) : vazio);
        return;
    }

    if (argv.length) {
        await msg.reply(`${t('defi.notProtocol', { word: argv[0] })}\n\n\`\`\`${getCommandSyntax('/defi')}\`\`\``);
        return;
    }

    // -full (o Aave completo) e -mask (os números da carteira com *)
    const exibir = { full: Boolean(o.full), m: o.mask ? ESCONDER : MOSTRAR };

    // /defi: o Position Details de todos; /defi orca, prjx, liquidswap ou morpho: só dele
    const escolhidas = posicoes.filter(x => !protocolo || x.protocol === protocolo);

    // Morpho e Aave sem cadastro: a carteira do .env (ou do setting), consultada na hora
    if (DO_ENV[protocolo] && !escolhidas.length) {
        await mostrarDoEnv(msg, protocolo, end, exibir);
        return;
    }

    if (!escolhidas.length) {
        await msg.reply(protocolo ? t('defi.nothingRegistered', { ...doProtocolo(protocolo), examples: exemplos() }) : vazio);
        return;
    }
    await mostrar(msg, escolhidas, end, exibir);
}

module.exports = {
    barraDaFaixa,
    cmdDefi,
    descrever,
    descreverDestinoDoAlerta,
    enderecoDo,
    destinosDoAlerta,
    fmtUsd,
    lerCadastro,
    textoDaPosicao,
    textoAave,
    textoDaPosicaoLiquidswap,
    textoDaPosicaoPrjx,
    textoMorpho
};
