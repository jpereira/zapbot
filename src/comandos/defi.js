/*
 * Comando /defi.
 */

const { findCommand, getCommandSyntax } = require('./base');
const { client } = require('../cliente');
const { idsDoChatAtual } = require('../contatos');
const { dbAll, dbGet, dbPronto, dbRun } = require('../db');
const { posicoesAave } = require('../defi/aave');
const { isEnderecoEvm } = require('../defi/hyperevm');
const { posicoesMorpho } = require('../defi/morpho');
const { detalhesDaPosicao, validarPosicao } = require('../defi/orca');
const { posicoesDaCarteira } = require('../defi/prjx');
const { isEnderecoSolana } = require('../defi/solana');
const { descreverDestinos, destinosSalvos, extrairDestinos, recipientsDe, resolverDestinos } = require('../destinos');
const { printError } = require('../log');
const { GetOptFromCommand } = require('../opcoes');
const { envOuSetting, getSetting } = require('../settings');
const { formatarData, plural } = require('../util/formatar');

/*
 * /defi: posições cadastradas da Orca (Solana), do Project X (HyperEVM) e do
 * Morpho (empréstimos, na Base e nas redes do defi.morpho.chains).
 *   /defi                      → o "Position Details" de todas
 *   /defi orca|prjx|morpho     → só das daquele protocolo (morpho sem cadastro:
 *                                a carteira do MORPHO_WALLET_ADDRESS ou do defi.morpho.wallet)
 *   /defi -l                   → lista os cadastros
 *   /defi -rm <nº...|all>      → remove
 *   /defi orca -address <endereço> [-pool <endereço>] [-nft <mint>]  → cadastra uma posição
 *   /defi prjx|morpho -wallet <0x...>  → cadastra a carteira (o bot lê as posições dela)
 *   /defi <protocolo> -help    → a ajuda só daquele protocolo
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
    return `▕${'─'.repeat(k)}●${'─'.repeat(N - k)}▏ ${Math.round(((atual - inferior) / (superior - inferior)) * 100)}% da faixa`;
}

const PROTOCOLOS = { aave: 'Aave', morpho: 'Morpho', orca: 'Orca', prjx: 'Project X' };
// Os que cadastram uma carteira (-wallet), e não uma posição (-address)
const DE_CARTEIRA = ['aave', 'morpho', 'prjx'];
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
const carteiraComNome = (p, end) => (p.name ? `${p.name} (${end(p.wallet)})` : `carteira ${end(p.wallet)}`);
const posicaoComNome = (p, end) => (p.name ? `${p.name} (${end(p.address)})` : end(p.address));
const descrever = (p, end = curto) => (DE_CARTEIRA.includes(p.protocol)
    ? `${PROTOCOLOS[p.protocol]} · ${carteiraComNome(p, end)}`
    : `${PROTOCOLOS[p.protocol] ?? p.protocol} · ${posicaoComNome(p, end)}`);

// O nome da posição ou da carteira (-name): até 40 caracteres, numa linha
const MAX_NOME = 40;

/**
 * Texto do "Position Details" de uma posição do Project X (de posicoesDaCarteira).
 */
function textoDaPosicaoPrjx(x, nome = null) {
    const usd = (q, preco) => (preco === null ? '' : ` (${fmtUsd(q * preco)})`);
    const total = (a, b) => (x.usd1 === null ? '' : ` ${fmtUsd(a * x.usd0 + b * x.usd1)}`);
    const status = x.naFaixa
        ? '✅ dentro da faixa'
        : `⚠️ *fora da faixa* (preço ${x.preco < x.inferior ? 'abaixo' : 'acima'}: a posição não rende taxas)`;

    return `🌊 *Project X · ${x.simbolo0}/${x.simbolo1}* · taxa ${(x.taxa / 10000).toLocaleString('en-US', { maximumFractionDigits: 2 })}%\n` +
        `📍 #${x.id}${nome ? ` · 👛 ${nome}` : ''} · ${status}\n\n` +
        `💰 *Saldo:*${total(x.qtd0, x.qtd1)}\n` +
        `   • ${fmtQtd(x.qtd0)} ${x.simbolo0}${usd(x.qtd0, x.usd0)}\n` +
        `   • ${fmtQtd(x.qtd1)} ${x.simbolo1}${usd(x.qtd1, x.usd1)}\n\n` +
        `📏 *Faixa:* ${fmtPreco(x.inferior)} – ${fmtPreco(x.superior)} ${x.simbolo1} por ${x.simbolo0}\n` +
        `🎯 *Preço atual:* ${fmtPreco(x.preco)} ${x.simbolo1} por ${x.simbolo0}\n` +
        `   ${barraDaFaixa(x.preco, x.inferior, x.superior)}\n\n` +
        `💸 *Taxas a coletar:*${total(x.taxa0, x.taxa1)}\n` +
        `   • ${fmtQtd(x.taxa0)} ${x.simbolo0}${usd(x.taxa0, x.usd0)}\n` +
        `   • ${fmtQtd(x.taxa1)} ${x.simbolo1}${usd(x.taxa1, x.usd1)}`;
}

/**
 * Lê um cadastro, de qualquer protocolo.
 * @returns {Promise<{ naFaixa: boolean|null, textos: string[], foraDaFaixa: string[], taxasUsd: number|null }>}
 *   naFaixa: todas as posições na faixa (null: a carteira não tem nenhuma aberta)
 *   taxasUsd: as taxas a coletar em dólar (null: sem preço, num par sem stablecoin)
 */
async function lerCadastro(p, end = curto, { full = false } = {}) {
    if (p.protocol === 'aave') {
        const r = await posicoesAave(p.wallet);
        const algo = r.redes.length || r.falhas.length;
        return { naFaixa: null, textos: algo ? [textoAave(r, end, p.name, { full })] : [], foraDaFaixa: [], taxasUsd: null };
    }

    if (p.protocol === 'morpho') {
        const r = await posicoesMorpho(p.wallet);
        return { naFaixa: null, textos: r.posicoes.length ? [textoMorpho(r, end, p.name)] : [], foraDaFaixa: [], taxasUsd: null };
    }

    if (p.protocol === 'prjx') {
        const posicoes = await posicoesDaCarteira(p.wallet);
        const comPreco = posicoes.filter(x => x.usd1 !== null);
        return {
            naFaixa: posicoes.length ? posicoes.every(x => x.naFaixa) : null,
            textos: posicoes.map(x => textoDaPosicaoPrjx(x, p.name)),
            foraDaFaixa: posicoes.filter(x => !x.naFaixa).map(x => textoDaPosicaoPrjx(x, p.name)),
            taxasUsd: comPreco.length ? comPreco.reduce((s, x) => s + x.taxa0 * x.usd0 + x.taxa1 * x.usd1, 0) : null
        };
    }

    const d = await detalhesDaPosicao(p.address, p.pool);
    const texto = textoDaPosicao(d, end, p.name);
    const emUsd = (qtd, token) => (Number(qtd) / 10 ** token.decimals) * Number(token.priceUsdc ?? 0);
    return {
        naFaixa: d.calculo.naFaixa,
        textos: [texto],
        foraDaFaixa: d.calculo.naFaixa ? [] : [texto],
        taxasUsd: emUsd(d.calculo.taxaA, d.tokenA) + emUsd(d.calculo.taxaB, d.tokenB)
    };
}

/**
 * Texto do "Position Details" de uma posição da Orca.
 */
function textoDaPosicao(d, end = curto, nome = null) {
    const { calculo: c, tokenA, tokenB, infoPool } = d;
    const simA = tokenA.metadata?.symbol ?? infoPool.tokenA?.symbol ?? 'A';
    const simB = tokenB.metadata?.symbol ?? infoPool.tokenB?.symbol ?? 'B';
    const decA = tokenA.decimals;
    const decB = tokenB.decimals;
    const usdA = Number(tokenA.priceUsdc ?? 0);
    const usdB = Number(tokenB.priceUsdc ?? 0);

    // Unidades mínimas → tokens; preço bruto → B por A
    const emA = (v) => Number(v) / 10 ** decA;
    const emB = (v) => Number(v) / 10 ** decB;
    const ajuste = 10 ** (decA - decB);
    const [atual, inferior, superior] = [c.precoAtual, c.precoInferior, c.precoSuperior].map(p => p * ajuste);

    const qtdA = emA(c.qtdA);
    const qtdB = emB(c.qtdB);
    const taxaA = emA(c.taxaA);
    const taxaB = emB(c.taxaB);

    const status = c.naFaixa
        ? '✅ dentro da faixa'
        : `⚠️ *fora da faixa* (preço ${atual < inferior ? 'abaixo' : 'acima'}: a posição não rende taxas)`;

    let texto = `🌊 *Orca · ${simA}/${simB}* · taxa ${(d.pool.feeRate / 10000).toLocaleString('en-US', { maximumFractionDigits: 2 })}%\n` +
        `📍 ${nome ? `${nome} (${end(d.endereco)})` : end(d.endereco)} · ${status}\n\n` +
        `💰 *Saldo:* ${fmtUsd(qtdA * usdA + qtdB * usdB)}\n` +
        `   • ${fmtQtd(qtdA)} ${simA} (${fmtUsd(qtdA * usdA)})\n` +
        `   • ${fmtQtd(qtdB)} ${simB} (${fmtUsd(qtdB * usdB)})\n\n` +
        `📏 *Faixa:* ${fmtPreco(inferior)} – ${fmtPreco(superior)} ${simB} por ${simA}\n` +
        `🎯 *Preço atual:* ${fmtPreco(atual)} ${simB} por ${simA}\n` +
        `   ${barraDaFaixa(atual, inferior, superior)}\n` +
        `   _(1 ${simB} = ${fmtPreco(1 / atual)} ${simA})_\n\n` +
        `💸 *Taxas a coletar:* ${fmtUsd(taxaA * usdA + taxaB * usdB)}\n` +
        `   • ${fmtQtd(taxaA)} ${simA} (${fmtUsd(taxaA * usdA)})\n` +
        `   • ${fmtQtd(taxaB)} ${simB} (${fmtUsd(taxaB * usdB)})\n`;

    // Recompensas: só as que têm algo a coletar
    const recompensas = c.recompensas
        .map((r, i) => ({ ...r, token: d.tokensRecompensa[i] }))
        .filter(r => r.quantidade > 0n && r.token);

    if (recompensas.length) {
        texto += '🎁 *Recompensas a coletar:*\n' + recompensas.map(r => {
            const qtd = Number(r.quantidade) / 10 ** r.token.decimals;
            return `   • ${fmtQtd(qtd)} ${r.token.metadata?.symbol ?? curto(r.mint)} (${fmtUsd(qtd * Number(r.token.priceUsdc ?? 0))})`;
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
        texto += `📊 *Rende ~${fmtUsd(fatia * dosLps)}/dia* _(estimativa: ${(fatia * 100).toLocaleString('en-US', { maximumSignificantDigits: 3 })}% da liquidez ativa × as taxas 24h dos LPs)_\n`;
    }

    texto += `\n🏊 *Pool:* TVL ${fmtCompacto(infoPool.tvlUsdc ?? 0)} · volume 24h ${fmtCompacto(s24.volume ?? 0)} · taxas 24h ${fmtCompacto(s24.fees ?? 0)}`;

    return texto;
}

const EXEMPLOS = '💡 _/defi orca -address <endereço> -pool <endereço> -nft <mint>\n/defi prjx -wallet <0x...>\n/defi morpho -wallet <0x...>\n/defi aave -wallet <0x...>_';

// A palavra do protocolo: /defi orca, /defi prjx -wallet ..., /defi morpho
const PALAVRAS = { aave: 'aave', morpho: 'morpho', orca: 'orca', prjx: 'prjx' };
const protocoloDe = (palavra) => PALAVRAS[String(palavra ?? '').toLowerCase()] ?? null;

async function limiteOuRepetida(msg, protocolo, endereco, end) {
    const coluna = DE_CARTEIRA.includes(protocolo) ? 'wallet' : 'address';
    if (await dbGet(`SELECT 1 AS ok FROM defi_positions WHERE protocol = ? AND lower(${coluna}) = lower(?)`, [protocolo, endereco])) {
        await msg.reply(`ℹ️ ${end(endereco)} já está cadastrada no ${PROTOCOLOS[protocolo]}. Veja com /defi ${protocolo}`);
        return true;
    }
    if ((await dbGet('SELECT COUNT(*) AS n FROM defi_positions')).n >= MAX_POSICOES) {
        await msg.reply(`❌ Limite de ${MAX_POSICOES} cadastros. Remova algum com /defi -rm <nº>`);
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
    morpho: async (carteira) => {
        const r = await posicoesMorpho(carteira);
        return { abertas: r.posicoes.length, texto: (end, nome) => textoMorpho(r, end, nome) };
    },
    aave: async (carteira) => {
        const r = await posicoesAave(carteira);
        const abertas = r.redes.reduce((s, x) => s + x.fornecidos.length + x.dividas.length, 0);
        return { abertas, texto: (end, nome, full) => textoAave(r, end, nome, { full }) };
    }
};
const DICA_DA_CARTEIRA = {
    prjx: '💡 _O RPC público da HyperEVM limita as consultas; um RPC próprio vai no setting defi.hyperevm.rpc._',
    morpho: '💡 _Tente de novo em alguns instantes._',
    aave: '💡 _Tente de novo em alguns instantes; um RPC próprio vai no ETHEREUM_RPC_URL e no BASE_RPC_URL._'
};

/*
 * O Morpho e o Aave já mostram a posição no cadastro (com -full, a do Aave
 * completa); o Project X, que costuma ter várias, fica para o /defi prjx.
 */
async function cadastrarCarteira(msg, o, protocolo, end) {
    const carteira = String(o.wallet ?? '').trim().replace(/^<(.*)>$/, '$1');
    const protocoloNome = PROTOCOLOS[protocolo];
    const apelido = o.name || null;

    if (!carteira) {
        await msg.reply(`❌ Informe a carteira: -wallet <0x...>\n💡 _/defi ${protocolo} -wallet 0x926024824BAEAf3ee0b7A2EEFA5A216743230444_`);
        return;
    }
    if (!isEnderecoEvm(carteira)) {
        await msg.reply(`❌ -wallet: "${carteira}" não é uma carteira EVM (0x e 40 caracteres hexadecimais).`);
        return;
    }

    // Já cadastrada, com -name: troca o nome
    const existente = await dbGet('SELECT * FROM defi_positions WHERE protocol = ? AND wallet = ?', [protocolo, carteira.toLowerCase()]);
    if (existente && apelido) {
        await dbRun('UPDATE defi_positions SET name = ? WHERE id = ?', [apelido, existente.id]);
        await msg.reply(`✏️ *Nome trocado:* ${descrever({ ...existente, name: apelido }, end)}`);
        return;
    }
    if (await limiteOuRepetida(msg, protocolo, carteira, end)) return;

    let abertas;
    let texto;
    try {
        ({ abertas, texto } = await LER_CARTEIRA[protocolo](carteira));
    } catch (err) {
        printError(`/defi ${protocolo} ${carteira}:`, err.message);
        await msg.reply(`⚠️ Não consegui ler a carteira agora: ${err.motivo ?? `${err.message}.`}\n${DICA_DA_CARTEIRA[protocolo]}`);
        return;
    }

    await dbRun('INSERT INTO defi_positions (protocol, wallet, name, created_at) VALUES (?, ?, ?, ?)',
        [protocolo, carteira.toLowerCase(), apelido, Date.now()]);
    await msg.reply(`✅ *Carteira do ${protocoloNome} cadastrada:* ${apelido ? `${apelido} (${end(carteira)})` : end(carteira)}\n` +
        (abertas ? `📍 ${plural(abertas, 'posição aberta', 'posições abertas')}.` : `ℹ️ Nenhuma posição aberta agora: o /defi ${protocolo} mostra quando houver.`) +
        `\n💡 _Veja com /defi ${protocolo}_`);
    if (abertas && texto) await msg.reply(texto(end, apelido, Boolean(o.full)));
    return carteira.toLowerCase();
}

/*
 * O endereço cadastrado, ou null (o erro já foi respondido). A Orca cadastra
 * a posição (-address); o Project X e o Morpho, a carteira (-wallet).
 */
async function cadastrar(msg, { opt: o, given }, protocolo, end) {
    if (!protocolo) {
        await msg.reply(`❌ Informe o protocolo antes do -address ou do -wallet: orca, prjx, morpho ou aave.\n${EXEMPLOS}`);
        return null;
    }
    if (DE_CARTEIRA.includes(protocolo)) {
        if (given.has('address')) {
            await msg.reply(`❌ No ${PROTOCOLOS[protocolo]}, a carteira vai no -wallet: /defi ${protocolo} -wallet <0x...>`);
            return null;
        }
        return cadastrarCarteira(msg, o, protocolo, end);
    }
    if (given.has('wallet')) {
        await msg.reply('❌ Na Orca, a posição vai no -address: /defi orca -address <endereço>');
        return null;
    }

    const [endereco, nft, pool] = [o.address, o.nft, o.pool].map(v => (v ? String(v).trim() : null));

    if (!endereco) {
        await msg.reply('❌ Informe o endereço da posição: -address <endereço>');
        return;
    }

    const invalido = [['-address', endereco], ['-nft', nft], ['-pool', pool]].find(([, v]) => v && !isEnderecoSolana(v));
    if (invalido) {
        await msg.reply(`❌ ${invalido[0]}: "${invalido[1]}" não é um endereço da Solana.`);
        return;
    }

    // Já cadastrada, com -name: troca o nome
    const existente = await dbGet('SELECT * FROM defi_positions WHERE protocol = ? AND address = ?', ['orca', endereco]);
    if (existente && o.name) {
        await dbRun('UPDATE defi_positions SET name = ? WHERE id = ?', [o.name, existente.id]);
        await msg.reply(`✏️ *Nome trocado:* ${descrever({ ...existente, name: o.name }, end)}`);
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
    await msg.reply(`✅ *Posição da Orca cadastrada:* ${cadastrada}\n💡 _Veja com /defi orca_`);
    return endereco;
}

const DICA_RPC = {
    orca: '💡 _O RPC público da Solana limita as consultas; um RPC próprio vai no setting defi.solana.rpc._',
    prjx: '💡 _O RPC público da HyperEVM limita as consultas; um RPC próprio vai no setting defi.hyperevm.rpc._'
};

async function mostrar(msg, posicoes, end, { full = false } = {}) {
    for (const p of posicoes) {
        try {
            const { textos } = await lerCadastro(p, end, { full });
            if (!textos.length) await msg.reply(`🌊 ${descrever(p, end)}: nenhuma posição aberta.`);
            for (const texto of textos) await msg.reply(texto);
        } catch (err) {
            printError(`/defi ${enderecoDo(p)}:`, err.response?.status ?? '', err.message);
            // O Morpho e o Aave já trazem o motivo legível (e os detalhes ficaram no log)
            await msg.reply(err.motivo
                ? `⚠️ Não consegui ler ${descrever(p, end)} agora: ${err.motivo}\n${DICA_DA_CARTEIRA[p.protocol] ?? ''}`
                : `⚠️ Não consegui ler ${descrever(p, end)} agora: ${err.message}.\n${DICA_RPC[p.protocol] ?? ''}`);
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
function textoDoItem(item, rotulo = '') {
    return [
        `${iconeDoToken(item.simbolo)} *${item.simbolo}*${rotulo}`,
        item.qtd !== null && `Quantidade: \`${fmtQtdToken(item.qtd, item)} ${item.simbolo}\``,
        item.usd !== null && `Valor: \`${fmtUsd(item.usd)}\``
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
function textoDaPosicaoMorpho(p, { hfNoRisco }) {
    const blocos = [];

    if (p.tipo === 'vault') {
        blocos.push(`📥 *SUPPLIED*\n\n${textoDoItem(p.fornecido, ` _(vault ${p.nome})_`)}`);
        return blocos;
    }

    const entrou = [
        p.colateral && textoDoItem(p.colateral),
        p.fornecido && textoDoItem(p.fornecido, p.colateral ? ' _(fornecido)_' : '')
    ].filter(Boolean);
    if (entrou.length) blocos.push(`📥 *SUPPLIED / COLLATERAL*\n\n${entrou.join('\n')}`);

    if (p.emprestado) blocos.push(`📤 *BORROWED*\n\n${textoDoItem(p.emprestado)}`);

    // Risco: só faz sentido com dívida ou colateral
    if (p.emprestado || p.colateral) {
        const linhas = [];
        if (hfNoRisco) linhas.push(`Health Rate: \`${fmtHf(p.hf)}\``);
        if (p.emprestado && p.ltv !== null) linhas.push(`LTV atual: \`${fmtPct(p.ltv)}\``);
        linhas.push(`LLTV: \`${fmtPct(p.lltv)}\``);

        const emEmprestimo = (v) => `${fmtQtdToken(v, { simbolo: p.simboloEmprestimo, decimals: 8 })} ${p.simboloEmprestimo}`;
        if (p.precoOraculo !== null) linhas.push(`Preço ${p.simboloColateral} (oráculo): \`${emEmprestimo(p.precoOraculo)}\``);
        if (p.precoLiquidacao !== null) linhas.push(`Preço de liquidação: \`${emEmprestimo(p.precoLiquidacao)}\``);
        if (p.utilizacao !== null) linhas.push(`Utilização do mercado: \`${fmtPct(p.utilizacao)}\``);
        blocos.push(`📊 *RISCO*\n\n${linhas.join('\n')}`);
    }

    return blocos;
}

const tituloDaPosicao = (p) => (p.tipo === 'vault'
    ? `Vault ${p.nome} · ${p.rede}`
    : `${p.simboloColateral}/${p.simboloEmprestimo} · ${p.rede}`);

/**
 * A mensagem do /defi morpho: com uma posição, ela direto; com várias, os
 * totais e cada uma com o seu Health Rate (o de um mercado não vale para outro).
 */
function textoMorpho(r, end = curto, nome = null) {
    const { posicoes, totais: t } = r;
    const rodape = `👛 Carteira: ${nome ? `${nome} · ` : ''}\`${end(r.carteira)}\`\n` +
        `🌐 ${posicoes.length > 1 ? 'Redes' : 'Rede'}: \`${[...new Set(posicoes.map(p => p.rede))].join(', ')}\`\n` +
        `🕐 Atualizado: \`${new Date(r.quando).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\``;
    const semPreco = t.semPreco.length ? `\n_Sem preço em USD (fora dos totais): ${t.semPreco.join(', ')}_` : '';

    if (posicoes.length === 1) {
        const [p] = posicoes;
        const liquido = t.semPreco.length ? semPreco.trim() : `💰 *Posição líquida*\n\`${fmtUsdComSinal(t.liquido)}\``;
        const topo = [`🦋 *MORPHO* · ${tituloDaPosicao(p)}`, liquido, destaqueDoHf(p)].filter(Boolean).join('\n\n');
        return [topo, ...textoDaPosicaoMorpho(p, { hfNoRisco: false }), rodape].join(`\n\n${SEPARADOR}\n\n`);
    }

    const topo = '🦋 *MORPHO*\n\n' +
        `💰 *Total líquido*\n\`${fmtUsdComSinal(t.liquido)}\`\n\n` +
        `📥 *Total supplied/collateral*\n\`${fmtUsd(t.fornecido)}\`\n\n` +
        `📤 *Total borrowed*\n\`${fmtUsd(t.emprestado)}\`${semPreco}`;
    const cada = posicoes.map((p, i) =>
        [`*POSIÇÃO ${i + 1}* · ${tituloDaPosicao(p)}`, ...textoDaPosicaoMorpho(p, { hfNoRisco: true })].join('\n\n'));

    return [topo, ...cada, rodape].join(`\n\n${SEPARADOR}\n\n`);
}

/*
 * Aave: o texto (os dados vêm de src/defi/aave.js). O curto traz o líquido, o
 * Health Factor e os ativos; o -full, o risco, as taxas, o que é colateral e
 * a configuração. Cada rede tem o seu Health Factor: nunca um só, misturado.
 */
function itemAaveCurto(x) {
    return [
        `${iconeDoToken(x.simbolo)} *${x.simbolo}*`,
        x.qtd !== null && `\`${fmtQtdToken(x.qtd, x)} ${x.simbolo}\``,
        x.usd !== null && `\`${fmtUsd(x.usd)}\``
    ].filter(Boolean).join('\n');
}

function itemAaveFull(x, divida) {
    return [
        `*${x.simbolo}*`,
        x.qtd !== null && `Amount: \`${fmtQtdToken(x.qtd, x)}\``,
        x.usd !== null && `Value: \`${fmtUsd(x.usd)}\``,
        !divida && `Collateral: \`${x.colateral ? 'Yes' : 'No'}\``,
        x.apy !== null && `${divida ? 'Borrow' : 'Supply'} APY: \`${fmtPct(x.apy)}\``,
        divida && `Rate Mode: \`${x.modo}\``
    ].filter(Boolean).join('\n');
}

// O resumo da rede: o curto (com destaque, numa rede só) ou o técnico (-full)
function resumoAave(x, { full, destaque }) {
    const semPreco = x.semPreco.length ? `\n_Sem preço (fora dos totais): ${x.semPreco.join(', ')}_` : '';
    if (!full) {
        return destaque
            ? `💰 *Posição líquida*\n\`${fmtUsdComSinal(x.liquidoUsd)}\`\n\n❤️ *Health Factor*\n\`${fmtHf(x.hf)}\`${semPreco}`
            : `Net: \`${fmtUsdComSinal(x.liquidoUsd)}\`\nHealth Factor: \`${fmtHf(x.hf)}\`${semPreco}`;
    }

    const risco = [
        x.ltvAtual !== null && `LTV atual: \`${fmtPct(x.ltvAtual)}\``,
        `LTV máximo: \`${fmtPct(x.ltvMaximo)}\``,
        `Liquidation Threshold: \`${fmtPct(x.liquidationThreshold)}\``,
        `Available Borrows: \`${fmtUsd(x.disponivelUsd)}\``,
        `Collateral (risco): \`${fmtUsd(x.colateralUsd)}\``,
        x.precoLiquidacao && `Preço de liquidação (${x.precoLiquidacao.simbolo}): \`${fmtUsd(x.precoLiquidacao.usd)}\``,
        x.liquidacaoAmbigua && '⚠️ _Preço de liquidação individual não é determinístico com múltiplos collaterals._'
    ].filter(Boolean).join('\n');

    return `💰 Net Position: \`${fmtUsdComSinal(x.liquidoUsd)}\`\n` +
        `📥 Supplied: \`${fmtUsd(x.fornecidoUsd)}\`\n` +
        `📤 Borrowed: \`${fmtUsd(x.dividaUsd)}\`${semPreco}\n\n` +
        `❤️ Health Factor: \`${fmtHf(x.hf)}\`\n\n📊 *Risco*\n${risco}`;
}

// As seções de uma rede: o resumo e os ativos (e, no -full, a configuração)
function secoesAave(x, { full, titulo }) {
    const { fornecidos, dividas } = x;
    const lista = (itens, divida) => itens.map(i => (full ? itemAaveFull(i, divida) : itemAaveCurto(i))).join('\n\n');
    const secoes = [
        `${titulo}${resumoAave(x, { full, destaque: !titulo.startsWith('🌐') })}`,
        fornecidos.length && `📥 *SUPPLIED*\n\n${lista(fornecidos, false)}`,
        dividas.length && `📤 *${full ? 'DEBT' : 'BORROWED'}*\n\n${lista(dividas, true)}`
    ];

    if (full) {
        const emode = x.emode ? `Enabled (${x.emode.nome || `categoria ${x.emode.id}`})` : 'Disabled';
        const isolamento = x.isolamento
            ? `Yes (${x.isolamento.simbolo}, debt ceiling ${fmtUsd(x.isolamento.tetoUsd)})`
            : 'No';
        secoes.push(`⚙️ *CONFIGURAÇÃO*\n\neMode: \`${emode}\`\nIsolation Mode: \`${isolamento}\``);
    }
    return secoes.filter(Boolean);
}

/**
 * A mensagem do /defi aave: numa rede só, ela direto; em várias, o total
 * global e cada rede com o seu Health Factor.
 */
function textoAave(r, end = curto, nome = null, { full = false } = {}) {
    const titulo = `🟣 *AAVE V3${full ? ' — FULL' : ''}*`;
    const redes = r.redes;
    const secoes = [];

    if (redes.length === 1) {
        secoes.push(...secoesAave(redes[0], { full, titulo: `${titulo} · ${redes[0].rede}\n\n` }));
    } else {
        const total = redes.reduce((s, x) => s + x.liquidoUsd, 0);
        secoes.push(`${titulo}\n\n💰 *TOTAL GLOBAL*\nNet: \`${fmtUsdComSinal(total)}\``);
        for (const x of redes) secoes.push(secoesAave(x, { full, titulo: `🌐 *${x.rede}*\n\n` }).join('\n\n'));
    }

    if (r.falhas.length) {
        secoes.push(r.falhas.map(f => `⚠️ *${f.rede}*: ${f.motivo}`).join('\n'));
    }

    secoes.push(`👛 Carteira: ${nome ? `${nome} · ` : ''}\`${end(r.carteira)}\`\n` +
        `🌐 ${redes.length > 1 ? 'Redes' : 'Rede'}: \`${redes.map(x => x.rede).join(', ') || '-'}\`\n` +
        `🕐 Atualizado: \`${new Date(r.quando).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\``);

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
        semPosicao: (end, carteira) => `🦋 *MORPHO*\n\nNenhuma posição aberta na carteira \`${end(carteira)}\` (chain ${getSetting('defi.morpho.chains').join(', ')}).`,
        texto: (r, end) => textoMorpho(r, end)
    },
    aave: {
        nome: 'Aave', env: 'AAVE_WALLET_ADDRESS', setting: 'defi.aave.wallet', ler: posicoesAave,
        vazio: (r) => !r.redes.length && !r.falhas.length,
        semPosicao: (end, carteira) => `🟣 *AAVE V3*\n\nNenhuma posição aberta na carteira \`${end(carteira)}\` (chain ${getSetting('defi.aave.chains').join(', ')}).`,
        texto: (r, end, full) => textoAave(r, end, null, { full })
    }
};

async function mostrarDoEnv(msg, protocolo, end, full) {
    const d = DO_ENV[protocolo];
    const carteira = envOuSetting(d.env, d.setting);
    if (!carteira) {
        await msg.reply(`❌ Endereço da carteira ${d.nome} não configurado.\n\n` +
            `Configure ${d.env} no arquivo .env (ou /set ${d.setting} <0x...>), ` +
            `ou cadastre a carteira: /defi ${protocolo} -wallet <0x...>`);
        return;
    }

    let r;
    try {
        r = await d.ler(carteira);
    } catch (err) {
        if (!err.motivo) printError(`[${d.nome.toUpperCase()}] Erro inesperado:`, err.message);
        await msg.reply(`❌ *Erro ao consultar ${d.nome}*\n\n${err.motivo ?? 'Não foi possível obter os dados neste momento.'}\n\n` +
            'Tente novamente em alguns instantes.');
        return;
    }

    await msg.reply(d.vazio(r) ? d.semPosicao(end, carteira) : d.texto(r, end, full));
}

/*
 * -alerta
 */
/**
 * Para onde vai o aviso da posição: "seu privado", "👥 Grupo", "📧 a@b.com".
 */
function descreverDestinoDoAlerta(p) {
    const destinos = destinosDoAlerta(p);
    return destinos.length ? descreverDestinos(destinos) : 'seu privado';
}

// Os destinos guardados na posição (os do -to); []: o seu privado
function destinosDoAlerta(p) {
    const unico = p.alert_email
        ? { email: p.alert_email, nome: p.alert_email, grupo: false }
        : p.alert_dest_id ? { id: p.alert_dest_id, nome: p.alert_dest_name, grupo: Boolean(p.alert_dest_is_group) } : null;
    return destinosSalvos(p.alert_recipients, unico);
}

const ESTADO_DA_FAIXA = { 1: '✅ na faixa', 0: '⚠️ fora da faixa' };
const limiteDasTaxas = (p) => (p.alert_fees ? ` · 💸 ≥ ${fmtUsd(p.alert_fees)}` : '');
const estadoDaFaixa = (p) => ESTADO_DA_FAIXA[p.in_range] ?? '❔ ainda não lida';
const cadaMinutos = () => plural(getSetting('defi.alerta.intervalMin'), 'minuto', 'minutos');

async function listarAlertas(msg, posicoes, end) {
    const comAlerta = posicoes.map((p, i) => ({ p, n: i + 1 })).filter(({ p }) => p.alert);

    if (!comAlerta.length) {
        await msg.reply('🔕 Nenhum alerta no /defi.\n💡 _Ligue com /defi -alerta <nº> (avisa quando a posição sair da faixa e quando voltar)._');
        return;
    }

    await msg.reply(`🔔 *Alertas do /defi* (${comAlerta.length})\n\n` +
        comAlerta.map(({ p, n }) => `${n}. ${descrever(p, end)} · ${estadoDaFaixa(p)}${limiteDasTaxas(p)} → ${descreverDestinoDoAlerta(p)}`).join('\n') +
        `\n\n💡 _Verificados a cada ${cadaMinutos()}. Desligue com /defi -alerta -rm <nº|all>._`);
}

async function tratarAlerta(msg, opts, posicoes, { comDestino, destinosTexto }, end = curto) {
    const o = opts.opt;
    const porNumero = (v) => (/^\d+$/.test(v) ? posicoes[Number(v) - 1] : null);

    // -alerta -rm <nº|all>: desliga
    if (opts.given.has('rm')) {
        const rm = String(o.rm ?? '').trim().toLowerCase();
        const alvos = rm === 'all' ? posicoes.filter(p => p.alert) : [porNumero(rm)].filter(Boolean);

        if (rm !== 'all' && !alvos.length) {
            await msg.reply(`❌ Posição nº ${o.rm ?? '?'} não existe. Veja a lista com /defi -l`);
            return;
        }

        for (const p of alvos) {
            await dbRun(`UPDATE defi_positions SET alert = 0, alert_dest_id = NULL, alert_dest_name = NULL,
                alert_dest_is_group = 0, alert_email = NULL, alert_recipients = NULL, alert_fees = NULL, fees_notified = 0,
                in_range = NULL WHERE id = ?`, [p.id]);
        }
        await msg.reply(rm === 'all'
            ? `🔕 ${plural(alvos.length, 'alerta desligado', 'alertas desligados')}.`
            : `🔕 Alerta desligado: ${descrever(alvos[0], end)}`);
        return;
    }

    const alvo = String(o.alerta ?? '').trim().toLowerCase();

    if (!alvo) {
        if (comDestino) {
            await msg.reply('❌ Informe a posição: /defi -alerta <nº|all> -to <destino>');
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
            ? `🌊 Nenhuma posição da Orca ou do Project X cadastrada.\n${EXEMPLOS}`
            : `❌ Posição nº ${o.alerta} não existe. Veja a lista com /defi -l`);
        return;
    }
    const semFaixa = escolhidas.find(p => !COM_FAIXA.includes(p.protocol));
    if (semFaixa) {
        await msg.reply(`❌ O alerta do /defi é de faixa, só da Orca e do Project X: a nº ${posicoes.indexOf(semFaixa) + 1} é do ${PROTOCOLOS[semFaixa.protocol]}.`);
        return;
    }

    // -taxas <valor>: o limite em dólar; off (ou 0) tira; sem -taxas, fica o que estava
    let taxas;
    if (opts.given.has('taxas')) {
        const t = String(o.taxas ?? '').trim().toLowerCase().replace(/^\$/, '').replace(',', '.');
        taxas = t === 'off' || t === '0' ? null : Number(t);
        if (taxas !== null && !(taxas > 0)) {
            await msg.reply('❌ -taxas: informe o valor em dólar (ex.: -taxas 50) ou off.');
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
            (naFaixa === 0 ? ' _(avisa quando voltar para a faixa)_' : ''));
    }

    const ondeAvisa = destinos.length ? descreverDestinos(destinos) : 'seu privado';

    await msg.reply(`🔔 *Alerta do /defi ligado* (${escolhidas.length})\n\n${linhas.join('\n')}\n\n` +
        `📣 Aviso: ${ondeAvisa}, quando a posição sair da faixa e quando voltar` +
        (taxas ? `, e quando as taxas a coletar passarem de ${fmtUsd(taxas)}` : '') +
        ` (verificada a cada ${cadaMinutos()}).\n` +
        '💡 _Veja com /defi -alerta; desligue com /defi -alerta -rm <nº|all>._');
}

/*
 * Cadastro com -alerta [valor]: liga o alerta da posição nova, no seu privado (ou nos -to).
 * O valor é o limite das taxas em dólar (o mesmo que -taxas): -alerta 2000.
 */
async function cadastrarComAlerta(msg, opts, protocolo, destino, end) {
    const o = opts.opt;
    let limite = null;
    if (opts.given.has('alerta') && protocolo && !COM_FAIXA.includes(protocolo)) {
        await msg.reply(`❌ O alerta do /defi é de faixa, só da Orca e do Project X: o ${PROTOCOLOS[protocolo]} não tem.`);
        return;
    }
    if (opts.given.has('alerta')) {
        const v = String(o.alerta ?? '').trim().replace(/^\$/, '').replace(',', '.');
        limite = v ? Number(v) : null;
        if (v && !(limite > 0)) {
            await msg.reply('❌ No cadastro, o -alerta leva o limite das taxas em dólar (ex.: -alerta 2000) ou nada.');
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

// -rm 2, -rm 1 3 5, -rm 1,3 (os números da lista de antes) ou all; algum que não existe: nenhum sai
async function remover(msg, o, argv, posicoes, end) {
    const partes = [o.rm, ...argv].join(' ').toLowerCase().split(/[\s,]+/).filter(Boolean);

    if (partes.includes('all')) {
        await dbRun('DELETE FROM defi_positions');
        await msg.reply(`🗑️ ${plural(posicoes.length, 'cadastro removido', 'cadastros removidos')}.`);
        return;
    }

    const numeros = [...new Set(partes.map(Number))].sort((a, b) => a - b);
    const faltando = numeros.filter(n => !posicoes[n - 1]);
    if (!numeros.length || faltando.length) {
        await msg.reply(`❌ Nº ${faltando.join(', ') || '?'} não existe${faltando.length > 1 ? 'm' : ''}. Nada foi removido; veja a lista com /defi -l`);
        return;
    }

    const removidos = numeros.map(n => posicoes[n - 1]);
    for (const p of removidos) await dbRun('DELETE FROM defi_positions WHERE id = ?', [p.id]);
    await msg.reply(removidos.length === 1
        ? `🗑️ Removido: ${descrever(removidos[0], end)}`
        : `🗑️ *Removidos* (${removidos.length})\n${removidos.map(p => `• ${descrever(p, end)}`).join('\n')}`);
}

// O 🔔 do alerta, com o limite das taxas se tiver (🔔 ≥ $2,000.00)
const sinoDoAlerta = (p) => (p.alert ? ` 🔔${p.alert_fees ? ` ≥ ${fmtUsd(p.alert_fees)}` : ''}` : '');

// A lista: no seu privado, os endereços inteiros; fora dele, abreviados
function textoDaLista(posicoes, end) {
    const linha = (p, i) => `${i + 1}. ${PROTOCOLOS[p.protocol] ?? p.protocol} · ` +
        (DE_CARTEIRA.includes(p.protocol) ? carteiraComNome(p, end) : `${posicaoComNome(p, end)} · pool ${end(p.pool)}`) +
        ` _(desde ${formatarData(p.created_at).split(',')[0]})_${sinoDoAlerta(p)}`;

    return `🌊 *Posições DeFi* (${posicoes.length})\n\n${posicoes.map(linha).join('\n')}\n\n` +
        '💡 _/defi mostra os detalhes; /defi -rm <nº> remove; 🔔 = com alerta (/defi -alerta), ≥ $ é o limite das taxas._';
}

async function cmdDefi({ msg, opts: optsDoComando, args, chatId }) {
    await dbPronto;

    // No seu privado, os endereços e as carteiras vêm inteiros; fora dele, abreviados
    const noPrivado = (await idsDoChatAtual(chatId)).includes(client.info?.wid?._serialized);
    const end = noPrivado ? (e) => e : curto;

    /*
     * O -to aceita espaços (/Jorge Pereira/), que o parser de opções
     * separaria: sai do texto antes, e o resto é lido de novo.
     */
    const { destinos: destinosTexto, informado: comDestino, resto } = extrairDestinos(args);
    const opts = comDestino ? GetOptFromCommand(resto, findCommand('/defi')) : optsDoComando;
    const o = opts.opt;

    if (comDestino && !opts.given.has('alerta')) {
        await msg.reply('❌ O -to é do -alerta: /defi -alerta <nº|all> -to <destino>');
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
            ? '❌ O -name vai junto com o cadastro: /defi orca -address <endereço> -n <nome> ou /defi prjx -wallet <0x...> -n <nome>'
            : !nome ? '❌ Informe o nome: -n <nome> (ex.: -n Carteira Hare).'
                : nome.length > MAX_NOME ? `❌ O nome tem até ${MAX_NOME} caracteres.` : null;
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

    if (opts.given.has('alerta')) {
        await tratarAlerta(msg, opts, posicoes, { comDestino, destinosTexto }, end);
        return;
    }

    if (opts.given.has('rm')) {
        await remover(msg, o, argv, posicoes, end);
        return;
    }

    const vazio = `🌊 Nenhuma posição cadastrada.\n${EXEMPLOS}`;

    if (o.list) {
        await msg.reply(posicoes.length ? textoDaLista(posicoes, end) : vazio);
        return;
    }

    if (argv.length) {
        await msg.reply(`❌ "${argv[0]}" não é um protocolo: use orca, prjx, morpho ou aave.\n\n\`\`\`${getCommandSyntax('/defi')}\`\`\``);
        return;
    }

    // /defi: o Position Details de todos; /defi orca, prjx ou morpho: só dele
    const escolhidas = posicoes.filter(x => !protocolo || x.protocol === protocolo);

    // Morpho e Aave sem cadastro: a carteira do .env (ou do setting), consultada na hora
    if (DO_ENV[protocolo] && !escolhidas.length) {
        await mostrarDoEnv(msg, protocolo, end, Boolean(o.full));
        return;
    }

    if (!escolhidas.length) {
        await msg.reply(protocolo ? `🌊 Nada cadastrado ${protocolo === 'prjx' ? 'do Project X' : 'da Orca'}.\n${EXEMPLOS}` : vazio);
        return;
    }
    await mostrar(msg, escolhidas, end, { full: Boolean(o.full) });
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
    textoDaPosicaoPrjx,
    textoMorpho
};
