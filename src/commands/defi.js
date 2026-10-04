/*
 * Comando /defi.
 */

const { findCommand, getCommandSyntax } = require('./base');
const { client } = require('../client');
const { chatCurrentIds } = require('../contacts');
const { dbAll, dbGet, dbReady, dbRun } = require('../db');
const { positionsAave } = require('../defi/aave');
const { isAddressEvm } = require('../defi/hyperevm');
const { positionsMorpho } = require('../defi/morpho');
const { positionDetails, validatePosition } = require('../defi/orca');
const { walletPositions } = require('../defi/prjx');
const { isEnderecoSolana: isAddressSolana } = require('../defi/solana');
const { describeDestinations, destinationsSaved, extractDestinations, recipientsDe, resolverDestinations } = require('../destinations');
const { printError } = require('../log');
const { GetOptFromCommand } = require('../options');
const { envOuSetting, getSetting } = require('../settings');
const { formatData, plural } = require('../util/format');

/*
 * /defi: registered positions from Orca (Solana), Project X (HyperEVM) and
 * Morpho (loans, on Base and the defi.morpho.chains networks).
 * /defi                      → the "Position Details" of all of them
 * /defi orca|prjx|morpho     → only those of that protocol (morpho with no registration:
 * the MORPHO_WALLET_ADDRESS wallet or defi.morpho.wallet)
 * /defi -l                   → lists the registrations
 *   /defi -rm <nº...|all>      → remove
 * /defi orca -address <address> [-pool <address>] [-nft <mint>]  → registers a position
 * /defi prjx|morpho -wallet <0x...>  → registers the wallet (the bot reads its positions)
 * /defi <protocol> -help    → the help for that protocol only
 * -nft and -pool are optional: if they come, the bot checks that they match the position.
 * In your private chat, addresses come in full; outside it, abbreviated (0x12…5678).
 *
 * And the out-of-range alert (the check lives in src/defi/alerts.js):
 * /defi -alerta                         → lists the alerts
 * /defi -alerta <no.|all> [-to <dest>]... → notifies when the position leaves the range and when
 * returns: in your private chat or in the -to (email, emails,
 * contact, group or number; repeat for several)
 * /defi -alerta <no.|all> -taxas <US$>   → and when the fees to collect pass the value
 *   /defi -alerta -rm <nº|all>            → desliga
 */
const MAX_POSITIONS = 20;

const short = (address) => `${address.slice(0, 4)}…${address.slice(-4)}`;

// Dollar numbers in the /crypto standard (en-US)
const fmtUsd = (v) => (v > 0 && v < 0.01 ? '<$0.01' : `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const fmtCompact = (v) => `$${Number(v).toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 2 })}`;
const fmtQtd = (v) => {
    if (v === 0) return '0';
    if (Math.abs(v) >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (Math.abs(v) >= 1) return v.toLocaleString('en-US', { maximumFractionDigits: 4 });
    return v.toLocaleString('en-US', { maximumSignificantDigits: 4 });
};
const fmtPrice = (v) => v.toLocaleString('en-US', { maximumSignificantDigits: 6 });

// ▕──●───────▏: where the price is within the range
function rangeBar(current, inferior, superior) {
    const N = 10;
    if (current < inferior) return `● ▕${'─'.repeat(N)}▏`;
    if (current >= superior) return `▕${'─'.repeat(N)}▏ ●`;

    const k = Math.min(N, Math.round(((current - inferior) / (superior - inferior)) * N));
    return `▕${'─'.repeat(k)}●${'─'.repeat(N - k)}▏ ${Math.round(((current - inferior) / (superior - inferior)) * 100)}% da faixa`;
}

const PROTOCOLS = { aave: 'Aave', morpho: 'Morpho', orca: 'Orca', prjx: 'Project X' };
// Those that register a wallet (-wallet), and not a position (-address)
const WALLET = ['aave', 'morpho', 'prjx'];
// Those that have a range (the -alerta)
const WITH_RANGE = ['orca', 'prjx'];

// The registration address: the position (address, from Orca) or the wallet (wallet)
const addressAlt2 = (p) => p.address ?? p.wallet;

/*
 * "Orca · ime1…VPcg", "Project X · wallet 0x12…5678" or, with -name,
 * "Project X · Wallet Hare (0x12…5678)". The end says how the address appears:
 * abbreviated (the default) or in full (in your private chat).
 */
const walletWithName = (p, end) => (p.name ? `${p.name} (${end(p.wallet)})` : `carteira ${end(p.wallet)}`);
const describe = (p, end = short) => (WALLET.includes(p.protocol)
    ? `${PROTOCOLS[p.protocol]} · ${walletWithName(p, end)}`
    : `${PROTOCOLS[p.protocol] ?? p.protocol} · ${end(p.address)}`);

// The wallet name (-name): up to 40 characters, on one line
const MAX_NAME = 40;

/**
 * "Position Details" text of a Project X position (from walletPositions).
 */
function positionPrjxText(x, nameAlt = null) {
    const usd = (q, price) => (price === null ? '' : ` (${fmtUsd(q * price)})`);
    const total = (a, b) => (x.usd1 === null ? '' : ` ${fmtUsd(a * x.usd0 + b * x.usd1)}`);
    const status = x.naFaixa
        ? '✅ dentro da faixa'
        : `⚠️ *fora da faixa* (preço ${x.preco < x.inferior ? 'abaixo' : 'acima'}: a posição não rende taxas)`;

    return `🌊 *Project X · ${x.simbolo0}/${x.simbolo1}* · taxa ${(x.taxa / 10000).toLocaleString('en-US', { maximumFractionDigits: 2 })}%\n` +
        `📍 #${x.id}${nameAlt ? ` · 👛 ${nameAlt}` : ''} · ${status}\n\n` +
        `💰 *Saldo:*${total(x.qtd0, x.qtd1)}\n` +
        `   • ${fmtQtd(x.qtd0)} ${x.simbolo0}${usd(x.qtd0, x.usd0)}\n` +
        `   • ${fmtQtd(x.qtd1)} ${x.simbolo1}${usd(x.qtd1, x.usd1)}\n\n` +
        `📏 *Faixa:* ${fmtPrice(x.inferior)} – ${fmtPrice(x.superior)} ${x.simbolo1} por ${x.simbolo0}\n` +
        `🎯 *Preço atual:* ${fmtPrice(x.preco)} ${x.simbolo1} por ${x.simbolo0}\n` +
        `   ${rangeBar(x.preco, x.inferior, x.superior)}\n\n` +
        `💸 *Taxas a coletar:*${total(x.taxa0, x.taxa1)}\n` +
        `   • ${fmtQtd(x.taxa0)} ${x.simbolo0}${usd(x.taxa0, x.usd0)}\n` +
        `   • ${fmtQtd(x.taxa1)} ${x.simbolo1}${usd(x.taxa1, x.usd1)}`;
}

/**
 * Reads a registration, from any protocol.
 * @returns {Promise<{ naFaixa: boolean|null, textos: string[], foraDaFaixa: string[], taxasUsd: number|null }>}
 * inRange: all the positions in range (null: the wallet has none open)
 * ratesUsd: the fees to collect in dollars (null: no price, in a pair without a stablecoin)
 */
async function readRegistration(p, end = short, { full = false } = {}) {
    if (p.protocol === 'aave') {
        const r = await positionsAave(p.wallet);
        const something = r.redes.length || r.falhas.length;
        return { naFaixa: null, textos: something ? [textAave(r, end, p.name, { full })] : [], foraDaFaixa: [], taxasUsd: null };
    }

    if (p.protocol === 'morpho') {
        const r = await positionsMorpho(p.wallet);
        return { naFaixa: null, textos: r.posicoes.length ? [textMorpho(r, end, p.name)] : [], foraDaFaixa: [], taxasUsd: null };
    }

    if (p.protocol === 'prjx') {
        const positions = await walletPositions(p.wallet);
        const withPrice = positions.filter(x => x.usd1 !== null);
        return {
            naFaixa: positions.length ? positions.every(x => x.naFaixa) : null,
            textos: positions.map(x => positionPrjxText(x, p.name)),
            foraDaFaixa: positions.filter(x => !x.naFaixa).map(x => positionPrjxText(x, p.name)),
            taxasUsd: withPrice.length ? withPrice.reduce((s, x) => s + x.taxa0 * x.usd0 + x.taxa1 * x.usd1, 0) : null
        };
    }

    const d = await positionDetails(p.address, p.pool);
    const textAlt = positionText(d, end);
    const inUsd = (qtd, token) => (Number(qtd) / 10 ** token.decimals) * Number(token.priceUsdc ?? 0);
    return {
        naFaixa: d.calculo.naFaixa,
        textos: [textAlt],
        foraDaFaixa: d.calculo.naFaixa ? [] : [textAlt],
        taxasUsd: inUsd(d.calculo.taxaA, d.tokenA) + inUsd(d.calculo.taxaB, d.tokenB)
    };
}

/**
 * "Position Details" text of an Orca position.
 */
function positionText(d, end = short) {
    const { calculo: c, tokenA, tokenB, infoPool } = d;
    const simA = tokenA.metadata?.symbol ?? infoPool.tokenA?.symbol ?? 'A';
    const simB = tokenB.metadata?.symbol ?? infoPool.tokenB?.symbol ?? 'B';
    const decA = tokenA.decimals;
    const decB = tokenB.decimals;
    const usdA = Number(tokenA.priceUsdc ?? 0);
    const usdB = Number(tokenB.priceUsdc ?? 0);

    // Minimum units → tokens; raw price → B per A
    const inA = (v) => Number(v) / 10 ** decA;
    const inB = (v) => Number(v) / 10 ** decB;
    const adjustment = 10 ** (decA - decB);
    const [current, inferior, superior] = [c.precoAtual, c.precoInferior, c.precoSuperior].map(p => p * adjustment);

    const qtdA = inA(c.qtdA);
    const qtdB = inB(c.qtdB);
    const rateA = inA(c.taxaA);
    const rateB = inB(c.taxaB);

    const status = c.naFaixa
        ? '✅ dentro da faixa'
        : `⚠️ *fora da faixa* (preço ${current < inferior ? 'abaixo' : 'acima'}: a posição não rende taxas)`;

    let textAlt = `🌊 *Orca · ${simA}/${simB}* · taxa ${(d.pool.feeRate / 10000).toLocaleString('en-US', { maximumFractionDigits: 2 })}%\n` +
        `📍 ${end(d.endereco)} · ${status}\n\n` +
        `💰 *Saldo:* ${fmtUsd(qtdA * usdA + qtdB * usdB)}\n` +
        `   • ${fmtQtd(qtdA)} ${simA} (${fmtUsd(qtdA * usdA)})\n` +
        `   • ${fmtQtd(qtdB)} ${simB} (${fmtUsd(qtdB * usdB)})\n\n` +
        `📏 *Faixa:* ${fmtPrice(inferior)} – ${fmtPrice(superior)} ${simB} por ${simA}\n` +
        `🎯 *Preço atual:* ${fmtPrice(current)} ${simB} por ${simA}\n` +
        `   ${rangeBar(current, inferior, superior)}\n` +
        `   _(1 ${simB} = ${fmtPrice(1 / current)} ${simA})_\n\n` +
        `💸 *Taxas a coletar:* ${fmtUsd(rateA * usdA + rateB * usdB)}\n` +
        `   • ${fmtQtd(rateA)} ${simA} (${fmtUsd(rateA * usdA)})\n` +
        `   • ${fmtQtd(rateB)} ${simB} (${fmtUsd(rateB * usdB)})\n`;

    // Rewards: only those with something to collect
    const rewards = c.recompensas
        .map((r, i) => ({ ...r, token: d.tokensRecompensa[i] }))
        .filter(r => r.quantidade > 0n && r.token);

    if (rewards.length) {
        textAlt += '🎁 *Recompensas a coletar:*\n' + rewards.map(r => {
            const qtd = Number(r.quantidade) / 10 ** r.token.decimals;
            return `   • ${fmtQtd(qtd)} ${r.token.metadata?.symbol ?? short(r.mint)} (${fmtUsd(qtd * Number(r.token.priceUsdc ?? 0))})`;
        }).join('\n') + '\n';
    }

    /*
     * Estimate of the 24 h yield: the share of your liquidity in the liquidity
     * active pool × the fees of the last 24 h that stay with the LPs (the
     * protocol takes 'rateProtocol' of them). Only inside the range.
     */
    const s24 = infoPool.stats?.['24h'] ?? {};
    if (c.naFaixa && d.pool.liquidez > 0n && Number(s24.fees) > 0) {
        const slice = Number(d.posicao.liquidez) / Number(d.pool.liquidez);
        const dosLps = Number(s24.fees) * (1 - d.pool.taxaProtocolo / 10000);
        textAlt += `📊 *Rende ~${fmtUsd(slice * dosLps)}/dia* _(estimativa: ${(slice * 100).toLocaleString('en-US', { maximumSignificantDigits: 3 })}% da liquidez ativa × as taxas 24h dos LPs)_\n`;
    }

    textAlt += `\n🏊 *Pool:* TVL ${fmtCompact(infoPool.tvlUsdc ?? 0)} · volume 24h ${fmtCompact(s24.volume ?? 0)} · taxas 24h ${fmtCompact(s24.fees ?? 0)}`;

    return textAlt;
}

const EXAMPLES = '💡 _/defi orca -address <endereço> -pool <endereço> -nft <mint>\n/defi prjx -wallet <0x...>\n/defi morpho -wallet <0x...>\n/defi aave -wallet <0x...>_';

// The protocol word: /defi orca, /defi prjx -wallet ..., /defi morpho
const WORDS = { aave: 'aave', morpho: 'morpho', orca: 'orca', prjx: 'prjx' };
const protocolAlt2 = (word) => WORDS[String(word ?? '').toLowerCase()] ?? null;

async function limitOrRepeated(msg, protocol, address, end) {
    const column = WALLET.includes(protocol) ? 'wallet' : 'address';
    if (await dbGet(`SELECT 1 AS ok FROM defi_positions WHERE protocol = ? AND lower(${column}) = lower(?)`, [protocol, address])) {
        await msg.reply(`ℹ️ ${end(address)} já está cadastrada no ${PROTOCOLS[protocol]}. Veja com /defi ${protocol}`);
        return true;
    }
    if ((await dbGet('SELECT COUNT(*) AS n FROM defi_positions')).n >= MAX_POSITIONS) {
        await msg.reply(`❌ Limite de ${MAX_POSITIONS} cadastros. Remova algum com /defi -rm <nº>`);
        return true;
    }
    return false;
}

/*
 * prjx|morpho -wallet <0x...>: stores the wallet; the positions are read on each
 * /defi. First, checks the wallet on the RPC (or on the API): right address, but with no
 * open position, registers and warns.
 */
const READ_WALLET = {
    prjx: async (wallet) => ({ abertas: (await walletPositions(wallet)).length }),
    morpho: async (wallet) => {
        const r = await positionsMorpho(wallet);
        return { abertas: r.posicoes.length, texto: (end, nameAlt) => textMorpho(r, end, nameAlt) };
    },
    aave: async (wallet) => {
        const r = await positionsAave(wallet);
        const openAlt = r.redes.reduce((s, x) => s + x.fornecidos.length + x.dividas.length, 0);
        return { abertas: openAlt, texto: (end, nameAlt, full) => textAave(r, end, nameAlt, { full }) };
    }
};
const WALLET_TIP = {
    prjx: '💡 _O RPC público da HyperEVM limita as consultas; um RPC próprio vai no setting defi.hyperevm.rpc._',
    morpho: '💡 _Tente de novo em alguns instantes._',
    aave: '💡 _Tente de novo em alguns instantes; um RPC próprio vai no ETHEREUM_RPC_URL e no BASE_RPC_URL._'
};

/*
 * Morpho and Aave already show the position in the registration (with -full, Aave's
 * full one); Project X, which tends to have several, is left for /defi prjx.
 */
async function registerWallet(msg, o, protocol, end) {
    const wallet = String(o.wallet ?? '').trim().replace(/^<(.*)>$/, '$1');
    const protocolName = PROTOCOLS[protocol];
    const nickname = o.name || null;

    if (!wallet) {
        await msg.reply(`❌ Informe a carteira: -wallet <0x...>\n💡 _/defi ${protocol} -wallet 0x12b2C3d4E5f60718293A4b5C6d7E8f9012345678_`);
        return;
    }
    if (!isAddressEvm(wallet)) {
        await msg.reply(`❌ -wallet: "${wallet}" não é uma carteira EVM (0x e 40 caracteres hexadecimais).`);
        return;
    }

    // Already registered, with -name: changes the name
    const existing = await dbGet('SELECT * FROM defi_positions WHERE protocol = ? AND wallet = ?', [protocol, wallet.toLowerCase()]);
    if (existing && nickname) {
        await dbRun('UPDATE defi_positions SET name = ? WHERE id = ?', [nickname, existing.id]);
        await msg.reply(`✏️ *Nome trocado:* ${describe({ ...existing, name: nickname }, end)}`);
        return;
    }
    if (await limitOrRepeated(msg, protocol, wallet, end)) return;

    let openAlt;
    let textAlt;
    try {
        ({ abertas: openAlt, texto: textAlt } = await READ_WALLET[protocol](wallet));
    } catch (err) {
        printError(`/defi ${protocol} ${wallet}:`, err.message);
        await msg.reply(`⚠️ Não consegui ler a carteira agora: ${err.motivo ?? `${err.message}.`}\n${WALLET_TIP[protocol]}`);
        return;
    }

    await dbRun('INSERT INTO defi_positions (protocol, wallet, name, created_at) VALUES (?, ?, ?, ?)',
        [protocol, wallet.toLowerCase(), nickname, Date.now()]);
    await msg.reply(`✅ *Carteira do ${protocolName} cadastrada:* ${nickname ? `${nickname} (${end(wallet)})` : end(wallet)}\n` +
        (openAlt ? `📍 ${plural(openAlt, 'posição aberta', 'posições abertas')}.` : `ℹ️ Nenhuma posição aberta agora: o /defi ${protocol} mostra quando houver.`) +
        `\n💡 _Veja com /defi ${protocol}_`);
    if (openAlt && textAlt) await msg.reply(textAlt(end, nickname, Boolean(o.full)));
    return wallet.toLowerCase();
}

/*
 * The registered address, or null (the error was already replied). Orca registers
 * the position (-address); Project X and Morpho, the wallet (-wallet).
 */
async function register(msg, { opt: o, given }, protocol, end) {
    if (!protocol) {
        await msg.reply(`❌ Informe o protocolo antes do -address ou do -wallet: orca, prjx, morpho ou aave.\n${EXAMPLES}`);
        return null;
    }
    if (WALLET.includes(protocol)) {
        if (given.has('address')) {
            await msg.reply(`❌ No ${PROTOCOLS[protocol]}, a carteira vai no -wallet: /defi ${protocol} -wallet <0x...>`);
            return null;
        }
        return registerWallet(msg, o, protocol, end);
    }
    if (given.has('wallet')) {
        await msg.reply('❌ Na Orca, a posição vai no -address: /defi orca -address <endereço>');
        return null;
    }

    const [address, nft, pool] = [o.address, o.nft, o.pool].map(v => (v ? String(v).trim() : null));

    if (!address) {
        await msg.reply('❌ Informe o endereço da posição: -address <endereço>');
        return;
    }

    const invalid = [['-address', address], ['-nft', nft], ['-pool', pool]].find(([, v]) => v && !isAddressSolana(v));
    if (invalid) {
        await msg.reply(`❌ ${invalid[0]}: "${invalid[1]}" não é um endereço da Solana.`);
        return;
    }

    if (await limitOrRepeated(msg, 'orca', address, end)) return;

    const r = await validatePosition({ endereco: address, nft, pool });
    if (r.erro) {
        await msg.reply(r.erro);
        return;
    }

    await dbRun('INSERT INTO defi_positions (protocol, address, nft, pool, created_at) VALUES (?, ?, ?, ?, ?)',
        ['orca', address, r.posicao.mint, r.posicao.whirlpool, Date.now()]);

    await msg.reply(`✅ *Posição da Orca cadastrada:* ${end(address)}\n💡 _Veja com /defi orca_`);
    return address;
}

const TIP_RPC = {
    orca: '💡 _O RPC público da Solana limita as consultas; um RPC próprio vai no setting defi.solana.rpc._',
    prjx: '💡 _O RPC público da HyperEVM limita as consultas; um RPC próprio vai no setting defi.hyperevm.rpc._'
};

async function showAlt(msg, positions, end, { full = false } = {}) {
    for (const p of positions) {
        try {
            const { textos: texts } = await readRegistration(p, end, { full });
            if (!texts.length) await msg.reply(`🌊 ${describe(p, end)}: nenhuma posição aberta.`);
            for (const textAlt of texts) await msg.reply(textAlt);
        } catch (err) {
            printError(`/defi ${addressAlt2(p)}:`, err.response?.status ?? '', err.message);
            // Morpho and Aave already bring the readable reason (and the details stayed in the log)
            await msg.reply(err.motivo
                ? `⚠️ Não consegui ler ${describe(p, end)} agora: ${err.motivo}\n${WALLET_TIP[p.protocol] ?? ''}`
                : `⚠️ Não consegui ler ${describe(p, end)} agora: ${err.message}.\n${TIP_RPC[p.protocol] ?? ''}`);
        }
    }
}

/*
 * Morpho: the query text (the data comes from src/defi/morpho.js)
 */
const SEPARATOR = '━━━━━━━━━━━━━━━━━━';
const STABLE = /USD|DAI|EUR|GHO|FRAX|LUSD/i;

// $1,234.56 (and -$1,234.56 when the debt exceeds the collateral)
const fmtUsdWithSignal = (v) => (v < 0 ? `-${fmtUsd(-v)}` : fmtUsd(v));
const fmtPct = (v) => `${(v * 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

// Health Rate: ∞ without debt, N/A when it cannot be computed, otherwise 2 decimals
const fmtHf = (hf) => (hf === Infinity ? '∞' : hf === null ? 'N/A'
    : hf.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/*
 * A token's amount: stablecoin with 2 decimals; BTC (cbBTC, WBTC...) with up to
 * 8; ETH and the others with up to 6. Without the trailing zeros.
 */
function fmtQtdToken(qtd, t) {
    if (STABLE.test(t.simbolo)) return qtd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const places = /BTC/i.test(t.simbolo) ? 8 : 6;
    const max = Math.min(Number.isInteger(t.decimals) ? t.decimals : places, places);
    return qtd.toLocaleString('en-US', { minimumFractionDigits: Math.min(2, max), maximumFractionDigits: max });
}

const tokenIcon = (symbolAlt) => (/BTC/i.test(symbolAlt) ? '₿' : STABLE.test(symbolAlt) ? '💵' : /ETH/i.test(symbolAlt) ? 'Ξ' : '🪙');

// The token: amount and value (only what the API brought)
function itemText(item, label = '') {
    return [
        `${tokenIcon(item.simbolo)} *${item.simbolo}*${label}`,
        item.qtd !== null && `Quantidade: \`${fmtQtdToken(item.qtd, item)} ${item.simbolo}\``,
        item.usd !== null && `Valor: \`${fmtUsd(item.usd)}\``
    ].filter(Boolean).join('\n');
}

// The Health Rate highlighted: in a market with collateral or debt (without debt, ∞)
const hasHf = (p) => p.tipo === 'mercado' && Boolean(p.emprestado || p.colateral);
const hfHighlight = (p) => (hasHf(p) ? `❤️ *Health Rate*\n\`${fmtHf(p.hf)}\`` : null);

/*
 * A position's blocks: what came in, what went out and the risk. With
 * hfInRisk, the Health Rate goes in the risk block (with several positions); without,
 * it stays at the top of the message (hfHighlight).
 */
function positionMorphoText(p, { hfNoRisco: hfInRisk }) {
    const blocks = [];

    if (p.tipo === 'vault') {
        blocks.push(`📥 *SUPPLIED*\n\n${itemText(p.fornecido, ` _(vault ${p.nome})_`)}`);
        return blocks;
    }

    const entered = [
        p.colateral && itemText(p.colateral),
        p.fornecido && itemText(p.fornecido, p.colateral ? ' _(fornecido)_' : '')
    ].filter(Boolean);
    if (entered.length) blocks.push(`📥 *SUPPLIED / COLLATERAL*\n\n${entered.join('\n')}`);

    if (p.emprestado) blocks.push(`📤 *BORROWED*\n\n${itemText(p.emprestado)}`);

    // Risk: only makes sense with debt or collateral
    if (p.emprestado || p.colateral) {
        const linesAlt = [];
        if (hfInRisk) linesAlt.push(`Health Rate: \`${fmtHf(p.hf)}\``);
        if (p.emprestado && p.ltv !== null) linesAlt.push(`LTV atual: \`${fmtPct(p.ltv)}\``);
        linesAlt.push(`LLTV: \`${fmtPct(p.lltv)}\``);

        const inLoan = (v) => `${fmtQtdToken(v, { simbolo: p.simboloEmprestimo, decimals: 8 })} ${p.simboloEmprestimo}`;
        if (p.precoOraculo !== null) linesAlt.push(`Preço ${p.simboloColateral} (oráculo): \`${inLoan(p.precoOraculo)}\``);
        if (p.precoLiquidacao !== null) linesAlt.push(`Preço de liquidação: \`${inLoan(p.precoLiquidacao)}\``);
        if (p.utilizacao !== null) linesAlt.push(`Utilização do mercado: \`${fmtPct(p.utilizacao)}\``);
        blocks.push(`📊 *RISCO*\n\n${linesAlt.join('\n')}`);
    }

    return blocks;
}

const positionTitle = (p) => (p.tipo === 'vault'
    ? `Vault ${p.nome} · ${p.rede}`
    : `${p.simboloColateral}/${p.simboloEmprestimo} · ${p.rede}`);

/**
 * The /defi morpho message: with one position, it directly; with several, the
 * totals and each with its own Health Rate (one market's does not apply to another).
 */
function textMorpho(r, end = short, nameAlt = null) {
    const { posicoes: positions, totais: t } = r;
    const footer = `👛 Carteira: ${nameAlt ? `${nameAlt} · ` : ''}\`${end(r.carteira)}\`\n` +
        `🌐 ${positions.length > 1 ? 'Redes' : 'Rede'}: \`${[...new Set(positions.map(p => p.rede))].join(', ')}\`\n` +
        `🕐 Atualizado: \`${new Date(r.quando).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\``;
    const withoutPrice = t.semPreco.length ? `\n_Sem preço em USD (fora dos totais): ${t.semPreco.join(', ')}_` : '';

    if (positions.length === 1) {
        const [p] = positions;
        const net = t.semPreco.length ? withoutPrice.trim() : `💰 *Posição líquida*\n\`${fmtUsdWithSignal(t.liquido)}\``;
        const top = [`🦋 *MORPHO* · ${positionTitle(p)}`, net, hfHighlight(p)].filter(Boolean).join('\n\n');
        return [top, ...positionMorphoText(p, { hfNoRisco: false }), footer].join(`\n\n${SEPARATOR}\n\n`);
    }

    const top = '🦋 *MORPHO*\n\n' +
        `💰 *Total líquido*\n\`${fmtUsdWithSignal(t.liquido)}\`\n\n` +
        `📥 *Total supplied/collateral*\n\`${fmtUsd(t.fornecido)}\`\n\n` +
        `📤 *Total borrowed*\n\`${fmtUsd(t.emprestado)}\`${withoutPrice}`;
    const each = positions.map((p, i) =>
        [`*POSIÇÃO ${i + 1}* · ${positionTitle(p)}`, ...positionMorphoText(p, { hfNoRisco: true })].join('\n\n'));

    return [top, ...each, footer].join(`\n\n${SEPARATOR}\n\n`);
}

/*
 * Aave: the text (the data comes from src/defi/aave.js). The short one brings the net, the
 * Health Factor and the assets; with -full, the risk, the fees, what is collateral and
 * the configuration. Each network has its own Health Factor: never a single, mixed one.
 */
function itemAaveShort(x) {
    return [
        `${tokenIcon(x.simbolo)} *${x.simbolo}*`,
        x.qtd !== null && `\`${fmtQtdToken(x.qtd, x)} ${x.simbolo}\``,
        x.usd !== null && `\`${fmtUsd(x.usd)}\``
    ].filter(Boolean).join('\n');
}

function itemAaveFull(x, debt) {
    return [
        `*${x.simbolo}*`,
        x.qtd !== null && `Amount: \`${fmtQtdToken(x.qtd, x)}\``,
        x.usd !== null && `Value: \`${fmtUsd(x.usd)}\``,
        !debt && `Collateral: \`${x.colateral ? 'Yes' : 'No'}\``,
        x.apy !== null && `${debt ? 'Borrow' : 'Supply'} APY: \`${fmtPct(x.apy)}\``,
        debt && `Rate Mode: \`${x.modo}\``
    ].filter(Boolean).join('\n');
}

// The network summary: the short one (with highlight, on a single network) or the technical one (-full)
function summaryAave(x, { full, destaque: highlight }) {
    const withoutPrice = x.semPreco.length ? `\n_Sem preço (fora dos totais): ${x.semPreco.join(', ')}_` : '';
    if (!full) {
        return highlight
            ? `💰 *Posição líquida*\n\`${fmtUsdWithSignal(x.liquidoUsd)}\`\n\n❤️ *Health Factor*\n\`${fmtHf(x.hf)}\`${withoutPrice}`
            : `Net: \`${fmtUsdWithSignal(x.liquidoUsd)}\`\nHealth Factor: \`${fmtHf(x.hf)}\`${withoutPrice}`;
    }

    const risk = [
        x.ltvAtual !== null && `LTV atual: \`${fmtPct(x.ltvAtual)}\``,
        `LTV máximo: \`${fmtPct(x.ltvMaximo)}\``,
        `Liquidation Threshold: \`${fmtPct(x.liquidationThreshold)}\``,
        `Available Borrows: \`${fmtUsd(x.disponivelUsd)}\``,
        `Collateral (risco): \`${fmtUsd(x.colateralUsd)}\``,
        x.precoLiquidacao && `Preço de liquidação (${x.precoLiquidacao.simbolo}): \`${fmtUsd(x.precoLiquidacao.usd)}\``,
        x.liquidacaoAmbigua && '⚠️ _Preço de liquidação individual não é determinístico com múltiplos collaterals._'
    ].filter(Boolean).join('\n');

    return `💰 Net Position: \`${fmtUsdWithSignal(x.liquidoUsd)}\`\n` +
        `📥 Supplied: \`${fmtUsd(x.fornecidoUsd)}\`\n` +
        `📤 Borrowed: \`${fmtUsd(x.dividaUsd)}\`${withoutPrice}\n\n` +
        `❤️ Health Factor: \`${fmtHf(x.hf)}\`\n\n📊 *Risco*\n${risk}`;
}

// A network's sections: the summary and the assets (and, with -full, the configuration)
function sectionsAave(x, { full, titulo: title }) {
    const { fornecidos: provided, dividas: debts } = x;
    const list = (items, debt) => items.map(i => (full ? itemAaveFull(i, debt) : itemAaveShort(i))).join('\n\n');
    const sections = [
        `${title}${summaryAave(x, { full, destaque: !title.startsWith('🌐') })}`,
        provided.length && `📥 *SUPPLIED*\n\n${list(provided, false)}`,
        debts.length && `📤 *${full ? 'DEBT' : 'BORROWED'}*\n\n${list(debts, true)}`
    ];

    if (full) {
        const emode = x.emode ? `Enabled (${x.emode.nome || `categoria ${x.emode.id}`})` : 'Disabled';
        const isolation = x.isolamento
            ? `Yes (${x.isolamento.simbolo}, debt ceiling ${fmtUsd(x.isolamento.tetoUsd)})`
            : 'No';
        sections.push(`⚙️ *CONFIGURAÇÃO*\n\neMode: \`${emode}\`\nIsolation Mode: \`${isolation}\``);
    }
    return sections.filter(Boolean);
}

/**
 * The /defi aave message: on a single network, it directly; on several, the total
 * global and each network with its own Health Factor.
 */
function textAave(r, end = short, nameAlt = null, { full = false } = {}) {
    const title = `🟣 *AAVE V3${full ? ' — FULL' : ''}*`;
    const networks = r.redes;
    const sections = [];

    if (networks.length === 1) {
        sections.push(...sectionsAave(networks[0], { full, titulo: `${title} · ${networks[0].rede}\n\n` }));
    } else {
        const total = networks.reduce((s, x) => s + x.liquidoUsd, 0);
        sections.push(`${title}\n\n💰 *TOTAL GLOBAL*\nNet: \`${fmtUsdWithSignal(total)}\``);
        for (const x of networks) sections.push(sectionsAave(x, { full, titulo: `🌐 *${x.rede}*\n\n` }).join('\n\n'));
    }

    if (r.falhas.length) {
        sections.push(r.falhas.map(f => `⚠️ *${f.rede}*: ${f.motivo}`).join('\n'));
    }

    sections.push(`👛 Carteira: ${nameAlt ? `${nameAlt} · ` : ''}\`${end(r.carteira)}\`\n` +
        `🌐 ${networks.length > 1 ? 'Redes' : 'Rede'}: \`${networks.map(x => x.rede).join(', ') || '-'}\`\n` +
        `🕐 Atualizado: \`${new Date(r.quando).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\``);

    return sections.join(`\n\n${SEPARATOR}\n\n`);
}

/*
 * /defi morpho or /defi aave with nothing registered: the wallet from .env
 * (MORPHO_WALLET_ADDRESS, AAVE_WALLET_ADDRESS) or from the setting, queried on the spot.
 */
const DO_ENV = {
    morpho: {
        nome: 'Morpho', env: 'MORPHO_WALLET_ADDRESS', setting: 'defi.morpho.wallet', ler: positionsMorpho,
        vazio: (r) => !r.posicoes.length,
        semPosicao: (end, wallet) => `🦋 *MORPHO*\n\nNenhuma posição aberta na carteira \`${end(wallet)}\` (chain ${getSetting('defi.morpho.chains').join(', ')}).`,
        texto: (r, end) => textMorpho(r, end)
    },
    aave: {
        nome: 'Aave', env: 'AAVE_WALLET_ADDRESS', setting: 'defi.aave.wallet', ler: positionsAave,
        vazio: (r) => !r.redes.length && !r.falhas.length,
        semPosicao: (end, wallet) => `🟣 *AAVE V3*\n\nNenhuma posição aberta na carteira \`${end(wallet)}\` (chain ${getSetting('defi.aave.chains').join(', ')}).`,
        texto: (r, end, full) => textAave(r, end, null, { full })
    }
};

async function envShow(msg, protocol, end, full) {
    const d = DO_ENV[protocol];
    const wallet = envOuSetting(d.env, d.setting);
    if (!wallet) {
        await msg.reply(`❌ Endereço da carteira ${d.nome} não configurado.\n\n` +
            `Configure ${d.env} no arquivo .env (ou /set ${d.setting} <0x...>), ` +
            `ou cadastre a carteira: /defi ${protocol} -wallet <0x...>`);
        return;
    }

    let r;
    try {
        r = await d.ler(wallet);
    } catch (err) {
        if (!err.motivo) printError(`[${d.nome.toUpperCase()}] Erro inesperado:`, err.message);
        await msg.reply(`❌ *Erro ao consultar ${d.nome}*\n\n${err.motivo ?? 'Não foi possível obter os dados neste momento.'}\n\n` +
            'Tente novamente em alguns instantes.');
        return;
    }

    await msg.reply(d.vazio(r) ? d.semPosicao(end, wallet) : d.texto(r, end, full));
}

/*
 * -alerta
 */
/**
 * Where the position notice goes: "seu privado", "👥 Grupo", "📧 a@b.com".
 */
function alertDescribeDestination(p) {
    const destinations = alertDestinations(p);
    return destinations.length ? describeDestinations(destinations) : 'seu privado';
}

// The destinations stored on the position (the -to ones); []: your private chat
function alertDestinations(p) {
    const single = p.alert_email
        ? { email: p.alert_email, nome: p.alert_email, grupo: false }
        : p.alert_dest_id ? { id: p.alert_dest_id, nome: p.alert_dest_name, grupo: Boolean(p.alert_dest_is_group) } : null;
    return destinationsSaved(p.alert_recipients, single);
}

const RANGE_STATE = { 1: '✅ na faixa', 0: '⚠️ fora da faixa' };
const ratesLimit = (p) => (p.alert_fees ? ` · 💸 ≥ ${fmtUsd(p.alert_fees)}` : '');
const rangeState = (p) => RANGE_STATE[p.in_range] ?? '❔ ainda não lida';
const eachMinutes = () => plural(getSetting('defi.alerta.intervalMin'), 'minuto', 'minutos');

async function listAlerts(msg, positions, end) {
    const withAlert = positions.map((p, i) => ({ p, n: i + 1 })).filter(({ p }) => p.alert);

    if (!withAlert.length) {
        await msg.reply('🔕 Nenhum alerta no /defi.\n💡 _Ligue com /defi -alerta <nº> (avisa quando a posição sair da faixa e quando voltar)._');
        return;
    }

    await msg.reply(`🔔 *Alertas do /defi* (${withAlert.length})\n\n` +
        withAlert.map(({ p, n }) => `${n}. ${describe(p, end)} · ${rangeState(p)}${ratesLimit(p)} → ${alertDescribeDestination(p)}`).join('\n') +
        `\n\n💡 _Verificados a cada ${eachMinutes()}. Desligue com /defi -alerta -rm <nº|all>._`);
}

async function handleAlert(msg, opts, positions, { comDestino: withDestination, destinosTexto: destinationsText }, end = short) {
    const o = opts.opt;
    const byNumber = (v) => (/^\d+$/.test(v) ? positions[Number(v) - 1] : null);

    // -alerta -rm <nº|all>: desliga
    if (opts.given.has('rm')) {
        const rm = String(o.rm ?? '').trim().toLowerCase();
        const targets = rm === 'all' ? positions.filter(p => p.alert) : [byNumber(rm)].filter(Boolean);

        if (rm !== 'all' && !targets.length) {
            await msg.reply(`❌ Posição nº ${o.rm ?? '?'} não existe. Veja a lista com /defi -l`);
            return;
        }

        for (const p of targets) {
            await dbRun(`UPDATE defi_positions SET alert = 0, alert_dest_id = NULL, alert_dest_name = NULL,
                alert_dest_is_group = 0, alert_email = NULL, alert_recipients = NULL, alert_fees = NULL, fees_notified = 0,
                in_range = NULL WHERE id = ?`, [p.id]);
        }
        await msg.reply(rm === 'all'
            ? `🔕 ${plural(targets.length, 'alerta desligado', 'alertas desligados')}.`
            : `🔕 Alerta desligado: ${describe(targets[0], end)}`);
        return;
    }

    const target = String(o.alerta ?? '').trim().toLowerCase();

    if (!target) {
        if (withDestination) {
            await msg.reply('❌ Informe a posição: /defi -alerta <nº|all> -to <destino>');
            return;
        }
        await listAlerts(msg, positions, end);
        return;
    }

    // The alert is range-based: only Orca and Project X have it (all skips Morpho)
    const chosen = target === 'all'
        ? positions.filter(p => WITH_RANGE.includes(p.protocol))
        : [byNumber(target)].filter(Boolean);
    if (!chosen.length) {
        await msg.reply(target === 'all'
            ? `🌊 Nenhuma posição da Orca ou do Project X cadastrada.\n${EXAMPLES}`
            : `❌ Posição nº ${o.alerta} não existe. Veja a lista com /defi -l`);
        return;
    }
    const withoutRange = chosen.find(p => !WITH_RANGE.includes(p.protocol));
    if (withoutRange) {
        await msg.reply(`❌ O alerta do /defi é de faixa, só da Orca e do Project X: a nº ${positions.indexOf(withoutRange) + 1} é do ${PROTOCOLS[withoutRange.protocol]}.`);
        return;
    }

    // -taxas <value>: the limit in dollars; off (or 0) removes it; without -taxas, what was there stays
    let rates;
    if (opts.given.has('taxas')) {
        const t = String(o.taxas ?? '').trim().toLowerCase().replace(/^\$/, '').replace(',', '.');
        rates = t === 'off' || t === '0' ? null : Number(t);
        if (rates !== null && !(rates > 0)) {
            await msg.reply('❌ -taxas: informe o valor em dólar (ex.: -taxas 50) ou off.');
            return;
        }
    }

    // Email or chat (several -to: notifies all); several contacts or groups with the name,
    // waits for you to choose from the list
    let destinations = [];
    if (withDestination) {
        destinations = await resolverDestinations(msg, destinationsText, { aceitaEmail: true });
        if (!destinations) return;
    }
    const [destination = {}] = destinations;

    // The current state becomes the reference: the notice goes out when the position goes from inside to outside
    const linesAlt = [];
    for (const p of chosen) {
        const limitAlt = rates === undefined ? p.alert_fees : rates;
        const inRange = await readRegistration(p, end)
            .then(({ naFaixa: f }) => (f === null ? null : f ? 1 : 0))
            .catch((err) => {
                printError(`/defi -alerta ${addressAlt2(p)}:`, err.response?.status ?? '', err.message);
                return null;
            });

        await dbRun(`UPDATE defi_positions SET alert = 1, alert_dest_id = ?, alert_dest_name = ?,
            alert_dest_is_group = ?, alert_email = ?, alert_recipients = ?, alert_fees = ?, fees_notified = 0, in_range = ?
            WHERE id = ?`,
        [destination.id ?? null, destination.email ? null : destination.nome ?? null, destination.grupo ? 1 : 0, destination.email ?? null,
            recipientsDe(destinations), limitAlt ?? null, inRange, p.id]);

        const updated = { ...p, in_range: inRange, alert_fees: limitAlt };
        linesAlt.push(`${positions.indexOf(p) + 1}. ${describe(p, end)} · ${rangeState(updated)}${ratesLimit(updated)}` +
            (inRange === 0 ? ' _(avisa quando voltar para a faixa)_' : ''));
    }

    const whereWarn = destinations.length ? describeDestinations(destinations) : 'seu privado';

    await msg.reply(`🔔 *Alerta do /defi ligado* (${chosen.length})\n\n${linesAlt.join('\n')}\n\n` +
        `📣 Aviso: ${whereWarn}, quando a posição sair da faixa e quando voltar` +
        (rates ? `, e quando as taxas a coletar passarem de ${fmtUsd(rates)}` : '') +
        ` (verificada a cada ${eachMinutes()}).\n` +
        '💡 _Veja com /defi -alerta; desligue com /defi -alerta -rm <nº|all>._');
}

/*
 * Registration with -alerta [value]: turns on the new position's alert, in your private chat (or in the -to).
 * The value is the fee limit in dollars (the same as -taxas): -alerta 2000.
 */
async function registerWithAlert(msg, opts, protocol, destination, end) {
    const o = opts.opt;
    let limitAlt = null;
    if (opts.given.has('alerta') && protocol && !WITH_RANGE.includes(protocol)) {
        await msg.reply(`❌ O alerta do /defi é de faixa, só da Orca e do Project X: o ${PROTOCOLS[protocol]} não tem.`);
        return;
    }
    if (opts.given.has('alerta')) {
        const v = String(o.alerta ?? '').trim().replace(/^\$/, '').replace(',', '.');
        limitAlt = v ? Number(v) : null;
        if (v && !(limitAlt > 0)) {
            await msg.reply('❌ No cadastro, o -alerta leva o limite das taxas em dólar (ex.: -alerta 2000) ou nada.');
            return;
        }
    }

    const address = await register(msg, opts, protocol, end);
    if (!address || !opts.given.has('alerta')) return;

    const positions = await dbAll('SELECT * FROM defi_positions ORDER BY id');
    const n = positions.findIndex(p => p.protocol === protocol && addressAlt2(p).toLowerCase() === address.toLowerCase()) + 1;
    const rates = o.taxas ?? (limitAlt ? String(limitAlt) : null);
    await handleAlert(msg, {
        opt: { ...o, alerta: String(n), taxas: rates },
        given: new Set(['alerta', ...(rates ? ['taxas'] : [])]),
        argv: []
    }, positions, destination, end);
}

// -rm 2, -rm 1 3 5, -rm 1,3 (the numbers from the previous list) or all; if any does not exist: none is removed
async function removeAlt2(msg, o, argv, positions, end) {
    const partsAlt = [o.rm, ...argv].join(' ').toLowerCase().split(/[\s,]+/).filter(Boolean);

    if (partsAlt.includes('all')) {
        await dbRun('DELETE FROM defi_positions');
        await msg.reply(`🗑️ ${plural(positions.length, 'cadastro removido', 'cadastros removidos')}.`);
        return;
    }

    const numbers = [...new Set(partsAlt.map(Number))].sort((a, b) => a - b);
    const missing = numbers.filter(n => !positions[n - 1]);
    if (!numbers.length || missing.length) {
        await msg.reply(`❌ Nº ${missing.join(', ') || '?'} não existe${missing.length > 1 ? 'm' : ''}. Nada foi removido; veja a lista com /defi -l`);
        return;
    }

    const removed = numbers.map(n => positions[n - 1]);
    for (const p of removed) await dbRun('DELETE FROM defi_positions WHERE id = ?', [p.id]);
    await msg.reply(removed.length === 1
        ? `🗑️ Removido: ${describe(removed[0], end)}`
        : `🗑️ *Removidos* (${removed.length})\n${removed.map(p => `• ${describe(p, end)}`).join('\n')}`);
}

// The alert's 🔔, with the fee limit if there is one (🔔 ≥ $2,000.00)
const alertBell = (p) => (p.alert ? ` 🔔${p.alert_fees ? ` ≥ ${fmtUsd(p.alert_fees)}` : ''}` : '');

// The list: in your private chat, the full addresses; outside it, abbreviated
function listText(positions, end) {
    const line = (p, i) => `${i + 1}. ${PROTOCOLS[p.protocol] ?? p.protocol} · ` +
        (WALLET.includes(p.protocol) ? walletWithName(p, end) : `${end(p.address)} · pool ${end(p.pool)}`) +
        ` _(desde ${formatData(p.created_at).split(',')[0]})_${alertBell(p)}`;

    return `🌊 *Posições DeFi* (${positions.length})\n\n${positions.map(line).join('\n')}\n\n` +
        '💡 _/defi mostra os detalhes; /defi -rm <nº> remove; 🔔 = com alerta (/defi -alerta), ≥ $ é o limite das taxas._';
}

async function cmdDefi({ msg, opts: commandOpts, args, chatId }) {
    await dbReady;

    // In your private chat, addresses and wallets come in full; outside it, abbreviated
    const inPrivate = (await chatCurrentIds(chatId)).includes(client.info?.wid?._serialized);
    const end = inPrivate ? (e) => e : short;

    /*
     * -to accepts spaces (/Jorge Pereira/), which the option parser
     * would split: goes out of the text first, and the rest is read again.
     */
    const { destinos: destinationsText, informado: withDestination, resto: rest } = extractDestinations(args);
    const opts = withDestination ? GetOptFromCommand(rest, findCommand('/defi')) : commandOpts;
    const o = opts.opt;

    if (withDestination && !opts.given.has('alerta')) {
        await msg.reply('❌ O -to é do -alerta: /defi -alerta <nº|all> -to <destino>');
        return;
    }

    // The protocol comes as a word: /defi orca, /defi prjx -wallet ...
    const word = opts.argv.find(protocolAlt2);
    const argv = opts.argv.filter(a => a !== word);
    const protocol = protocolAlt2(word);

    /*
     * -name: the wallet name, with spaces (-n Carteira Hare). The parser
     * splits the words; those left in argv are the name's.
     */
    if (opts.given.has('name')) {
        const nameAlt = [o.name, ...argv].filter(Boolean).join(' ').trim();
        argv.length = 0;
        const errorAlt = !opts.given.has('wallet')
            ? `❌ O -name vai junto com o -wallet: /defi ${protocol && WALLET.includes(protocol) ? protocol : 'prjx'} -wallet <0x...> -n <nome>`
            : !nameAlt ? '❌ Informe o nome: -n <nome> (ex.: -n Carteira Hare).'
                : nameAlt.length > MAX_NAME ? `❌ O nome tem até ${MAX_NAME} caracteres.` : null;
        if (errorAlt) {
            await msg.reply(errorAlt);
            return;
        }
        o.name = nameAlt;
    }

    if (opts.given.has('address') || opts.given.has('wallet')) {
        await registerWithAlert(msg, opts, protocol, { comDestino: withDestination, destinosTexto: destinationsText }, end);
        return;
    }

    const positions = await dbAll('SELECT * FROM defi_positions ORDER BY id');

    if (opts.given.has('alerta')) {
        await handleAlert(msg, opts, positions, { comDestino: withDestination, destinosTexto: destinationsText }, end);
        return;
    }

    if (opts.given.has('rm')) {
        await removeAlt2(msg, o, argv, positions, end);
        return;
    }

    const empty = `🌊 Nenhuma posição cadastrada.\n${EXAMPLES}`;

    if (o.list) {
        await msg.reply(positions.length ? listText(positions, end) : empty);
        return;
    }

    if (argv.length) {
        await msg.reply(`❌ "${argv[0]}" não é um protocolo: use orca, prjx, morpho ou aave.\n\n\`\`\`${getCommandSyntax('/defi')}\`\`\``);
        return;
    }

    // /defi: the Position Details of all; /defi orca, prjx or morpho: only that one
    const chosen = positions.filter(x => !protocol || x.protocol === protocol);

    // Morpho and Aave with no registration: the .env wallet (or the setting's), queried on the spot
    if (DO_ENV[protocol] && !chosen.length) {
        await envShow(msg, protocol, end, Boolean(o.full));
        return;
    }

    if (!chosen.length) {
        await msg.reply(protocol ? `🌊 Nada cadastrado ${protocol === 'prjx' ? 'do Project X' : 'da Orca'}.\n${EXAMPLES}` : empty);
        return;
    }
    await showAlt(msg, chosen, end, { full: Boolean(o.full) });
}

module.exports = {
    rangeBar,
    cmdDefi,
    describe,
    alertDescribeDestination,
    addressAlt2,
    alertDestinations,
    fmtUsd,
    readRegistration,
    positionText,
    textAave,
    positionPrjxText,
    textMorpho
};
