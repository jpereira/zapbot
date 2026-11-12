/*
 * Comando /defi.
 */

const { findCommand, getCommandSyntax } = require('./base');
const { client } = require('../client');
const { chatCurrentIds } = require('../contacts');
const { dbAll, dbGet, dbReady, dbRun } = require('../db');
const { positionsAave } = require('../defi/aave');
const { isAddressAptos, normalizeAddress } = require('../defi/aptos');
const { isAddressEvm } = require('../defi/hyperevm');
const { positionsLiquidswap } = require('../defi/liquidswap');
const { positionsMorpho } = require('../defi/morpho');
const { positionDetails, validatePosition } = require('../defi/orca');
const { walletPositions } = require('../defi/prjx');
const { isEnderecoSolana: isAddressSolana } = require('../defi/solana');
const { describeDestinations, destinationsSaved, extractDestinations, recipientsDe, resolverDestinations } = require('../destinations');
const { language, t } = require('../i18n');
const { printError } = require('../log');
const { GetOptFromCommand } = require('../options');
const { envOuSetting, getSetting } = require('../settings');
const { formatData, plural } = require('../util/format');

/*
 * /defi: registered positions from Orca (Solana), Project X (HyperEVM), the
 * Liquidswap (Aptos) and Morpho (loans, on Base and the defi.morpho.chains networks).
 * /defi                      → the "Position Details" of all of them
 * /defi orca|prjx|liquidswap|morpho  → only those of that protocol (morpho with no registration:
 * the MORPHO_WALLET_ADDRESS wallet or defi.morpho.wallet)
 * /defi -l                   → lists the registrations
 *   /defi -rm <nº...|all>      → remove
 * /defi orca -address <address> [-pool <address>] [-nft <mint>]  → registers a position
 * /defi prjx|liquidswap|morpho -wallet <0x...>  → registers the wallet (the bot reads its positions)
 * /defi <protocol> -help    → the help for that protocol only
 * /defi [protocol] -taxas [-alerta]  → the summary of fees to collect (with each one's alert)
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
    return `▕${'─'.repeat(k)}●${'─'.repeat(N - k)}▏ ${t('defi.rangePct', { pct: Math.round(((current - inferior) / (superior - inferior)) * 100) })}`;
}

const PROTOCOLS = { aave: 'Aave', liquidswap: 'Liquidswap', morpho: 'Morpho', orca: 'Orca', prjx: 'Project X' };
// Protocol variables in the messages: {protocol}, {of} (of Orca), {in} (in Orca), {In} and {the} (the Orca)
const protocolAlt = (p) => ({
    protocol: PROTOCOLS[p],
    of: t(`defi.of.${p}`),
    in: t(`defi.in.${p}`),
    In: t(`defi.In.${p}`),
    the: t(`defi.the.${p}`)
});
// Those that register a wallet (-wallet), and not a position (-address)
const WALLET = ['aave', 'liquidswap', 'morpho', 'prjx'];
// Those that have a range (the -alerta)
const WITH_RANGE = ['orca', 'prjx'];

// The registration address: the position (address, from Orca) or the wallet (wallet)
const addressAlt2 = (p) => p.address ?? p.wallet;

/*
 * "Orca · ime1…VPcg", "Project X · wallet 0x12…5678" or, with -name,
 * "Orca · Position TAL (ime1…VPcg)" and "Project X · Wallet Hare (0x12…5678)".
 * The end says how the address appears: abbreviated (the default) or in full (in your
 * privado).
 */
const walletWithName = (p, end) => (p.name ? `${p.name} (${end(p.wallet)})` : t('defi.walletLower', { addr: end(p.wallet) }));
const positionWithName = (p, end) => (p.name ? `${p.name} (${end(p.address)})` : end(p.address));
const describe = (p, end = short) => (WALLET.includes(p.protocol)
    ? `${PROTOCOLS[p.protocol]} · ${walletWithName(p, end)}`
    : `${PROTOCOLS[p.protocol] ?? p.protocol} · ${positionWithName(p, end)}`);

/*
 * -mask: wallet balances, amounts and values become * keeping the
 * format ($**,***.**); fees to collect and the market numbers (price,
 * range, pool, HF, LTV, APY) remain. Good for sending a screenshot without showing the
 * pocket size.
 */
const SHOW = (t) => t;
const HIDE = (t) => String(t).replace(/\d/g, '*');

// The position or wallet name (-name): up to 40 characters, on one line
const MAX_NAME = 40;

/**
 * "Position Details" text of a Project X position (from walletPositions).
 */
function positionPrjxText(x, nameAlt = null, m = SHOW) {
    const usd = (q, price, show = m) =>
        (price === null ? '' : ` (${show(fmtUsd(q * price))})`);
    const total = (a, b, show = m) =>
        (x.usd1 === null ? '' : ` ${show(fmtUsd(a * x.usd0 + b * x.usd1))}`);
    const qtd = (q) => m(fmtQtd(q));
    const status = x.naFaixa
        ? t('defi.inRange')
        : t('defi.outOfRange', { dir: t(x.preco < x.inferior ? 'defi.below' : 'defi.above') });

    return `🌊 *Project X · ${x.simbolo0}/${x.simbolo1}* · ${t('defi.fee', { fee: (x.taxa / 10000).toLocaleString('en-US', { maximumFractionDigits: 2 }) })}\n` +
        `📍 #${x.id}${nameAlt ? ` · 👛 ${nameAlt}` : ''} · ${status}\n\n` +
        `${t('defi.l.balance')}${total(x.qtd0, x.qtd1)}\n` +
        `   • ${qtd(x.qtd0)} ${x.simbolo0}${usd(x.qtd0, x.usd0)}\n` +
        `   • ${qtd(x.qtd1)} ${x.simbolo1}${usd(x.qtd1, x.usd1)}\n\n` +
        `${t('defi.l.range')} ${fmtPrice(x.inferior)} – ${fmtPrice(x.superior)} ${t('defi.per', { q: x.simbolo1, b: x.simbolo0 })}\n` +
        `${t('defi.l.price')} ${fmtPrice(x.preco)} ${t('defi.per', { q: x.simbolo1, b: x.simbolo0 })}\n` +
        `   ${rangeBar(x.preco, x.inferior, x.superior)}\n\n` +
        `${t('defi.l.fees')}${total(x.taxa0, x.taxa1, SHOW)}\n` +
        `   • ${fmtQtd(x.taxa0)} ${x.simbolo0}${usd(x.taxa0, x.usd0, SHOW)}\n` +
        `   • ${fmtQtd(x.taxa1)} ${x.simbolo1}${usd(x.taxa1, x.usd1, SHOW)}`;
}

/**
 * Text of a Liquidswap position (from positionsLiquidswap). In an AMM, the fees
 * enter the pool: there is no range nor fees to collect.
 */
function positionLiquidswapText(x, nameAlt = null, m = SHOW) {
    const usd = (q, price) => (price === null ? '' : ` (${m(fmtUsd(q * price))})`);
    const total = x.usdY === null ? '' : ` ${m(fmtUsd(x.qtdX * x.usdX + x.qtdY * x.usdY))}`;
    const tvl = x.usdY === null ? '' : `TVL ${fmtCompact(x.reservaX * x.usdX + x.reservaY * x.usdY)} · `;
    const slice = (x.fatia * 100).toLocaleString('en-US', { maximumSignificantDigits: 3 });

    return `🌊 *Liquidswap · ${x.simboloX}/${x.simboloY}* · ${t('defi.fee', { fee: x.taxa.toLocaleString('en-US', { maximumFractionDigits: 2 }) })}` +
        ` · ${x.versao} ${t(x.estavel ? 'defi.stable' : 'defi.uncorrelated')}\n` +
        `📍 ${nameAlt ? `👛 ${nameAlt} · ` : ''}${t('defi.poolShare', { pct: m(slice) })}\n\n` +
        `${t('defi.l.balance')}${total}\n` +
        `   • ${m(fmtQtd(x.qtdX))} ${x.simboloX}${usd(x.qtdX, x.usdX)}\n` +
        `   • ${m(fmtQtd(x.qtdY))} ${x.simboloY}${usd(x.qtdY, x.usdY)}\n\n` +
        `${t('defi.l.price')} ${fmtPrice(x.preco)} ${t('defi.per', { q: x.simboloY, b: x.simboloX })}\n` +
        (x.preco ? `   _(1 ${x.simboloY} = ${fmtPrice(1 / x.preco)} ${x.simboloX})_\n\n` : '\n') +
        `${t('defi.l.pool')} ${tvl}${fmtQtd(x.reservaX)} ${x.simboloX} + ${fmtQtd(x.reservaY)} ${x.simboloY}\n` +
        t('defi.ammFeesNote');
}

/**
 * Reads a registration, from any protocol.
 * @returns {Promise<{ naFaixa: boolean|null, textos: string[], foraDaFaixa: string[], taxasUsd: number|null }>}
 * inRange: all the positions in range (null: the wallet has none open)
 * ratesUsd: the fees to collect in dollars (null: no price, in a pair without a stablecoin)
 */
async function readRegistration(p, end = short, { full = false, m = SHOW } = {}) {
    if (p.protocol === 'aave') {
        const r = await positionsAave(p.wallet);
        const something = r.redes.length || r.falhas.length;
        return { naFaixa: null, textos: something ? [textAave(r, end, p.name, { full, m })] : [], foraDaFaixa: [], taxasUsd: null };
    }

    if (p.protocol === 'morpho') {
        const r = await positionsMorpho(p.wallet);
        return { naFaixa: null, textos: r.posicoes.length ? [textMorpho(r, end, p.name, m)] : [], foraDaFaixa: [], taxasUsd: null };
    }

    if (p.protocol === 'liquidswap') {
        const positions = await positionsLiquidswap(p.wallet);
        return { naFaixa: null, textos: positions.map(x => positionLiquidswapText(x, p.name, m)), foraDaFaixa: [], taxasUsd: null };
    }

    if (p.protocol === 'prjx') {
        const positions = await walletPositions(p.wallet);
        const withPrice = positions.filter(x => x.usd1 !== null);
        return {
            naFaixa: positions.length ? positions.every(x => x.naFaixa) : null,
            textos: positions.map(x => positionPrjxText(x, p.name, m)),
            foraDaFaixa: positions.filter(x => !x.naFaixa).map(x => positionPrjxText(x, p.name, m)),
            taxasUsd: withPrice.length ? withPrice.reduce((s, x) => s + x.taxa0 * x.usd0 + x.taxa1 * x.usd1, 0) : null
        };
    }

    const d = await positionDetails(p.address, p.pool);
    const textAlt = positionText(d, end, p.name, m);
    const inUsd = (qtd, token) => (Number(qtd) / 10 ** token.decimals) * Number(token.priceUsdc ?? 0);
    return {
        naFaixa: d.calculo.naFaixa,
        textos: [textAlt],
        foraDaFaixa: d.calculo.naFaixa ? [] : [textAlt],
        taxasUsd: inUsd(d.calculo.taxaA, d.tokenA) + inUsd(d.calculo.taxaB, d.tokenB)
    };
}

/*
 * An Orca position's numbers: minimum units → tokens and the price
 * raw → B per A (the Position Details and the -taxas summary).
 */
function orcaNumbers(d) {
    const { calculo: c, tokenA, tokenB, infoPool } = d;
    const inA = (v) => Number(v) / 10 ** tokenA.decimals;
    const inB = (v) => Number(v) / 10 ** tokenB.decimals;
    const adjustment = 10 ** (tokenA.decimals - tokenB.decimals);
    const [current, inferior, superior] = [c.precoAtual, c.precoInferior, c.precoSuperior].map(p => p * adjustment);

    return {
        simA: tokenA.metadata?.symbol ?? infoPool.tokenA?.symbol ?? 'A',
        simB: tokenB.metadata?.symbol ?? infoPool.tokenB?.symbol ?? 'B',
        usdA: Number(tokenA.priceUsdc ?? 0),
        usdB: Number(tokenB.priceUsdc ?? 0),
        atual: current,
        inferior,
        superior,
        qtdA: inA(c.qtdA),
        qtdB: inB(c.qtdB),
        taxaA: inA(c.taxaA),
        taxaB: inB(c.taxaB)
    };
}

/**
 * "Position Details" text of an Orca position.
 */
function positionText(d, end = short, nameAlt = null, m = SHOW) {
    const { calculo: c, infoPool } = d;
    const { simA, simB, usdA, usdB, atual: current, inferior, superior, qtdA, qtdB, taxaA: rateA, taxaB: rateB } = orcaNumbers(d);

    const status = c.naFaixa
        ? t('defi.inRange')
        : t('defi.outOfRange', { dir: t(current < inferior ? 'defi.below' : 'defi.above') });

    let textAlt = `🌊 *Orca · ${simA}/${simB}* · ${t('defi.fee', { fee: (d.pool.feeRate / 10000).toLocaleString('en-US', { maximumFractionDigits: 2 }) })}\n` +
        `📍 ${nameAlt ? `${nameAlt} (${end(d.endereco)})` : end(d.endereco)} · ${status}\n\n` +
        `${t('defi.l.balance')} ${m(fmtUsd(qtdA * usdA + qtdB * usdB))}\n` +
        `   • ${m(fmtQtd(qtdA))} ${simA} (${m(fmtUsd(qtdA * usdA))})\n` +
        `   • ${m(fmtQtd(qtdB))} ${simB} (${m(fmtUsd(qtdB * usdB))})\n\n` +
        `${t('defi.l.range')} ${fmtPrice(inferior)} – ${fmtPrice(superior)} ${t('defi.per', { q: simB, b: simA })}\n` +
        `${t('defi.l.price')} ${fmtPrice(current)} ${t('defi.per', { q: simB, b: simA })}\n` +
        `   ${rangeBar(current, inferior, superior)}\n` +
        `   _(1 ${simB} = ${fmtPrice(1 / current)} ${simA})_\n\n` +
        `${t('defi.l.fees')} ${fmtUsd(rateA * usdA + rateB * usdB)}\n` +
        `   • ${fmtQtd(rateA)} ${simA} (${fmtUsd(rateA * usdA)})\n` +
        `   • ${fmtQtd(rateB)} ${simB} (${fmtUsd(rateB * usdB)})\n`;

    // Rewards: only those with something to collect
    const rewards = c.recompensas
        .map((r, i) => ({ ...r, token: d.tokensRecompensa[i] }))
        .filter(r => r.quantidade > 0n && r.token);

    if (rewards.length) {
        textAlt += t('defi.rewards') + '\n' + rewards.map(r => {
            const qtd = Number(r.quantidade) / 10 ** r.token.decimals;
            return `   • ${m(fmtQtd(qtd))} ${r.token.metadata?.symbol ?? short(r.mint)} (${m(fmtUsd(qtd * Number(r.token.priceUsdc ?? 0)))})`;
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
        textAlt += t('defi.yield', {
            usd: m(fmtUsd(slice * dosLps)),
            pct: (slice * 100).toLocaleString('en-US', { maximumSignificantDigits: 3 })
        }) + '\n';
    }

    textAlt += '\n' + t('defi.poolLine', {
        tvl: fmtCompact(infoPool.tvlUsdc ?? 0),
        volume: fmtCompact(s24.volume ?? 0),
        fees: fmtCompact(s24.fees ?? 0)
    });

    return textAlt;
}

const examples = () => t('defi.examples');

// The protocol word: /defi orca, /defi prjx -wallet ..., /defi morpho, /defi liqswp (= liquidswap)
const WORDS = { aave: 'aave', liqswp: 'liquidswap', liquidswap: 'liquidswap', morpho: 'morpho', orca: 'orca', prjx: 'prjx' };
const protocolAlt2 = (word) => WORDS[String(word ?? '').toLowerCase()] ?? null;

async function limitOrRepeated(msg, protocol, address, end) {
    const column = WALLET.includes(protocol) ? 'wallet' : 'address';
    if (await dbGet(`SELECT 1 AS ok FROM defi_positions WHERE protocol = ? AND lower(${column}) = lower(?)`, [protocol, address])) {
        await msg.reply(t('defi.alreadyRegistered', { addr: end(address), cmd: protocol, ...protocolAlt(protocol) }));
        return true;
    }
    if ((await dbGet('SELECT COUNT(*) AS n FROM defi_positions')).n >= MAX_POSITIONS) {
        await msg.reply(t('defi.limit', { max: MAX_POSITIONS }));
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
    liquidswap: async (wallet) => ({ abertas: (await positionsLiquidswap(wallet)).length }),
    morpho: async (wallet) => {
        const r = await positionsMorpho(wallet);
        return { abertas: r.posicoes.length, texto: (end, nameAlt, { m }) => textMorpho(r, end, nameAlt, m) };
    },
    aave: async (wallet) => {
        const r = await positionsAave(wallet);
        const openAlt = r.redes.reduce((s, x) => s + x.fornecidos.length + x.dividas.length, 0);
        return { abertas: openAlt, texto: (end, nameAlt, optionsAlt) => textAave(r, end, nameAlt, optionsAlt) };
    }
};
const WALLET_TIP = {
    prjx: 'defi.tipHyperevm',
    liquidswap: 'defi.tipAptos',
    morpho: 'defi.tipRetry',
    aave: 'defi.tipAave'
};
const tip = (table, protocol) => (table[protocol] ? t(table[protocol]) : '');

/*
 * Each network's wallet: Aptos' (Liquidswap) has up to 64 hex digits and is
 * stored in full (0x1 = 0x000…001); the EVM ones, 40.
 */
const WALLETS = {
    aptos: {
        valida: isAddressAptos,
        normalizar: normalizeAddress,
        erro: (c) => t('defi.notAptos', { wallet: c }),
        exemplo: '0x8f3c4d2a1b9e7f6a5c4b3a29180f7e6d5c4b3a2918f7e6d5c4b3a2918f7e6d5c'
    },
    evm: {
        valida: isAddressEvm,
        normalizar: (c) => c.toLowerCase(),
        erro: (c) => t('defi.notEvm', { wallet: c }),
        exemplo: '0x12b2C3d4E5f60718293A4b5C6d7E8f9012345678'
    }
};
const walletAlt = (protocol) => WALLETS[protocol === 'liquidswap' ? 'aptos' : 'evm'];

/*
 * Morpho and Aave already show the position in the registration (with -full, Aave's
 * full one); Project X and Liquidswap, which tend to have several, are left for the
 * /defi prjx e o /defi liquidswap.
 */
async function registerWallet(msg, o, protocol, end) {
    const typed = String(o.wallet ?? '').trim().replace(/^<(.*)>$/, '$1');
    const type = walletAlt(protocol);
    const nickname = o.name || null;

    if (!typed) {
        await msg.reply(t('defi.walletMissing', { proto: protocol, example: type.exemplo }));
        return;
    }
    if (!type.valida(typed)) {
        await msg.reply(type.erro(typed));
        return;
    }
    // In the database, normalized; in the messages and on reading, the EVM as typed (with the checksum)
    const wallet = type.normalizar(typed);
    const shown = type === WALLETS.evm ? typed : wallet;

    // Already registered, with -name: changes the name
    const existing = await dbGet('SELECT * FROM defi_positions WHERE protocol = ? AND wallet = ?', [protocol, wallet]);
    if (existing && nickname) {
        await dbRun('UPDATE defi_positions SET name = ? WHERE id = ?', [nickname, existing.id]);
        await msg.reply(t('defi.renamed', { desc: describe({ ...existing, name: nickname }, end) }));
        return;
    }
    if (await limitOrRepeated(msg, protocol, shown, end)) return;

    let openAlt;
    let textAlt;
    try {
        ({ abertas: openAlt, texto: textAlt } = await READ_WALLET[protocol](shown));
    } catch (err) {
        printError(`/defi ${protocol} ${shown}:`, err.message);
        await msg.reply(t('defi.walletReadFailed', { reason: err.motivo ?? `${err.message}.`, tip: tip(WALLET_TIP, protocol) }));
        return;
    }

    await dbRun('INSERT INTO defi_positions (protocol, wallet, name, created_at) VALUES (?, ?, ?, ?)',
        [protocol, wallet, nickname, Date.now()]);
    await msg.reply(t('defi.walletRegistered', { ...protocolAlt(protocol), addr: nickname ? `${nickname} (${end(shown)})` : end(shown) }) + '\n' +
        (openAlt
            ? `📍 ${plural(openAlt, t('defi.openPosition'), t('defi.openPositions'))}.`
            : t('defi.noOpenPosition', { cmd: protocol })) +
        '\n' + t('defi.seeWith', { cmd: protocol }));
    if (openAlt && textAlt) await msg.reply(textAlt(end, nickname, { full: Boolean(o.full), m: o.mask ? HIDE : SHOW }));
    return wallet;
}

/*
 * The registered address, or null (the error was already replied). Orca registers
 * the position (-address); Project X, Liquidswap, Morpho and Aave, the wallet (-wallet).
 */
async function register(msg, { opt: o, given }, protocol, end) {
    if (!protocol) {
        await msg.reply(t('defi.needProtocol', { examples: examples() }));
        return null;
    }
    if (WALLET.includes(protocol)) {
        if (given.has('address')) {
            await msg.reply(t('defi.walletGoesInWallet', { ...protocolAlt(protocol), cmd: protocol }));
            return null;
        }
        return registerWallet(msg, o, protocol, end);
    }
    if (given.has('wallet')) {
        await msg.reply(t('defi.orcaGoesInAddress'));
        return null;
    }

    const [address, nft, pool] = [o.address, o.nft, o.pool].map(v => (v ? String(v).trim() : null));

    if (!address) {
        await msg.reply(t('defi.addressMissing'));
        return;
    }

    const invalid = [['-address', address], ['-nft', nft], ['-pool', pool]].find(([, v]) => v && !isAddressSolana(v));
    if (invalid) {
        await msg.reply(t('defi.notSolana', { opt: invalid[0], value: invalid[1] }));
        return;
    }

    // Already registered, with -name: changes the name
    const existing = await dbGet('SELECT * FROM defi_positions WHERE protocol = ? AND address = ?', ['orca', address]);
    if (existing && o.name) {
        await dbRun('UPDATE defi_positions SET name = ? WHERE id = ?', [o.name, existing.id]);
        await msg.reply(t('defi.renamed', { desc: describe({ ...existing, name: o.name }, end) }));
        return;
    }
    if (await limitOrRepeated(msg, 'orca', address, end)) return;

    const r = await validatePosition({ endereco: address, nft, pool });
    if (r.erro) {
        await msg.reply(r.erro);
        return;
    }

    await dbRun('INSERT INTO defi_positions (protocol, address, name, nft, pool, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ['orca', address, o.name || null, r.posicao.mint, r.posicao.whirlpool, Date.now()]);

    const registered = positionWithName({ address: address, name: o.name || null }, end);
    await msg.reply(t('defi.orcaRegistered', { addr: registered }));
    return address;
}

const TIP_RPC = {
    liquidswap: 'defi.tipAptos',
    orca: 'defi.tipSolana',
    prjx: 'defi.tipHyperevm'
};

async function showAlt(msg, positions, end, { full = false, m = SHOW } = {}) {
    for (const p of positions) {
        try {
            const { textos: texts } = await readRegistration(p, end, { full, m });
            if (!texts.length) await msg.reply(t('defi.noOpen', { desc: describe(p, end) }));
            for (const textAlt of texts) await msg.reply(textAlt);
        } catch (err) {
            printError(`/defi ${addressAlt2(p)}:`, err.response?.status ?? '', err.message);
            // Morpho and Aave already bring the readable reason (and the details stayed in the log)
            await msg.reply(err.motivo
                ? t('defi.readFailed', { desc: describe(p, end), reason: err.motivo, tip: tip(WALLET_TIP, p.protocol) })
                : t('defi.readFailed', { desc: describe(p, end), reason: `${err.message}.`, tip: tip(TIP_RPC, p.protocol) }));
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
function itemText(item, label = '', m = SHOW) {
    return [
        `${tokenIcon(item.simbolo)} *${item.simbolo}*${label}`,
        item.qtd !== null && `${t('defi.amount')}: \`${m(fmtQtdToken(item.qtd, item))} ${item.simbolo}\``,
        item.usd !== null && `${t('defi.value')}: \`${m(fmtUsd(item.usd))}\``
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
function positionMorphoText(p, { hfNoRisco: hfInRisk, m = SHOW }) {
    const blocks = [];

    if (p.tipo === 'vault') {
        blocks.push(`📥 *SUPPLIED*\n\n${itemText(p.fornecido, ` _(vault ${p.nome})_`, m)}`);
        return blocks;
    }

    const entered = [
        p.colateral && itemText(p.colateral, '', m),
        p.fornecido && itemText(p.fornecido, p.colateral ? ` _(${t('defi.supplied')})_` : '', m)
    ].filter(Boolean);
    if (entered.length) blocks.push(`📥 *SUPPLIED / COLLATERAL*\n\n${entered.join('\n')}`);

    if (p.emprestado) blocks.push(`📤 *BORROWED*\n\n${itemText(p.emprestado, '', m)}`);

    // Risk: only makes sense with debt or collateral
    if (p.emprestado || p.colateral) {
        const linesAlt = [];
        if (hfInRisk) linesAlt.push(`Health Rate: \`${fmtHf(p.hf)}\``);
        if (p.emprestado && p.ltv !== null) linesAlt.push(`${t('defi.currentLtv')}: \`${fmtPct(p.ltv)}\``);
        linesAlt.push(`LLTV: \`${fmtPct(p.lltv)}\``);

        const inLoan = (v) => `${fmtQtdToken(v, { simbolo: p.simboloEmprestimo, decimals: 8 })} ${p.simboloEmprestimo}`;
        if (p.precoOraculo !== null) linesAlt.push(t('defi.oraclePrice', { symbol: p.simboloColateral, value: inLoan(p.precoOraculo) }));
        if (p.precoLiquidacao !== null) linesAlt.push(`${t('defi.liquidationPrice')}: \`${inLoan(p.precoLiquidacao)}\``);
        if (p.utilizacao !== null) linesAlt.push(`${t('defi.utilization')}: \`${fmtPct(p.utilizacao)}\``);
        blocks.push(`${t('defi.riskTitle')}\n\n${linesAlt.join('\n')}`);
    }

    return blocks;
}

const positionTitle = (p) => (p.tipo === 'vault'
    ? `Vault ${p.nome} · ${p.rede}`
    : `${p.simboloColateral}/${p.simboloEmprestimo} · ${p.rede}`);

// The footer: the wallet, the network(s) and the time of the reading
const walletFooter = (r, end, nameAlt, networks, several) =>
    `👛 ${t('defi.walletLabel')}: ${nameAlt ? `${nameAlt} · ` : ''}\`${end(r.carteira)}\`\n` +
    `🌐 ${t(several ? 'defi.networks' : 'defi.network')}: \`${networks}\`\n` +
    `🕐 ${t('defi.updated')}: \`${new Date(r.quando).toLocaleTimeString(language() === 'pt_BR' ? 'pt-BR' : 'en-US', { timeZone: 'America/Sao_Paulo' })}\``;

/**
 * The /defi morpho message: with one position, it directly; with several, the
 * totals and each with its own Health Rate (one market's does not apply to another).
 */
function textMorpho(r, end = short, nameAlt = null, m = SHOW) {
    const { posicoes: positions, totais: tot } = r;
    const footer = walletFooter(r, end, nameAlt, [...new Set(positions.map(p => p.rede))].join(', '), positions.length > 1);
    const withoutPrice = tot.semPreco.length ? '\n' + t('defi.noUsdPrice', { list: tot.semPreco.join(', ') }) : '';

    if (positions.length === 1) {
        const [p] = positions;
        const net = tot.semPreco.length ? withoutPrice.trim() : `${t('defi.netPosition')}\n\`${m(fmtUsdWithSignal(tot.liquido))}\``;
        const top = [`🦋 *MORPHO* · ${positionTitle(p)}`, net, hfHighlight(p)].filter(Boolean).join('\n\n');
        return [top, ...positionMorphoText(p, { hfNoRisco: false, m }), footer].join(`\n\n${SEPARATOR}\n\n`);
    }

    const top = '🦋 *MORPHO*\n\n' +
        `${t('defi.netTotal')}\n\`${m(fmtUsdWithSignal(tot.liquido))}\`\n\n` +
        `📥 *Total supplied/collateral*\n\`${m(fmtUsd(tot.fornecido))}\`\n\n` +
        `📤 *Total borrowed*\n\`${m(fmtUsd(tot.emprestado))}\`${withoutPrice}`;
    const each = positions.map((p, i) =>
        [`${t('defi.positionN', { n: i + 1 })} · ${positionTitle(p)}`, ...positionMorphoText(p, { hfNoRisco: true, m })].join('\n\n'));

    return [top, ...each, footer].join(`\n\n${SEPARATOR}\n\n`);
}

/*
 * Aave: the text (the data comes from src/defi/aave.js). The short one brings the net, the
 * Health Factor and the assets; with -full, the risk, the fees, what is collateral and
 * the configuration. Each network has its own Health Factor: never a single, mixed one.
 */
function itemAaveShort(x, m = SHOW) {
    return [
        `${tokenIcon(x.simbolo)} *${x.simbolo}*`,
        x.qtd !== null && `\`${m(fmtQtdToken(x.qtd, x))} ${x.simbolo}\``,
        x.usd !== null && `\`${m(fmtUsd(x.usd))}\``
    ].filter(Boolean).join('\n');
}

function itemAaveFull(x, debt, m = SHOW) {
    return [
        `*${x.simbolo}*`,
        x.qtd !== null && `Amount: \`${m(fmtQtdToken(x.qtd, x))}\``,
        x.usd !== null && `Value: \`${m(fmtUsd(x.usd))}\``,
        !debt && `Collateral: \`${x.colateral ? 'Yes' : 'No'}\``,
        x.apy !== null && `${debt ? 'Borrow' : 'Supply'} APY: \`${fmtPct(x.apy)}\``,
        debt && `Rate Mode: \`${x.modo}\``
    ].filter(Boolean).join('\n');
}

// The network summary: the short one (with highlight, on a single network) or the technical one (-full)
function summaryAave(x, { full, destaque: highlight, m = SHOW }) {
    const withoutPrice = x.semPreco.length ? '\n' + t('defi.noPrice', { list: x.semPreco.join(', ') }) : '';
    if (!full) {
        return highlight
            ? `${t('defi.netPosition')}\n\`${m(fmtUsdWithSignal(x.liquidoUsd))}\`\n\n❤️ *Health Factor*\n\`${fmtHf(x.hf)}\`${withoutPrice}`
            : `Net: \`${m(fmtUsdWithSignal(x.liquidoUsd))}\`\nHealth Factor: \`${fmtHf(x.hf)}\`${withoutPrice}`;
    }

    const risk = [
        x.ltvAtual !== null && `${t('defi.currentLtv')}: \`${fmtPct(x.ltvAtual)}\``,
        `${t('defi.maxLtv')}: \`${fmtPct(x.ltvMaximo)}\``,
        `Liquidation Threshold: \`${fmtPct(x.liquidationThreshold)}\``,
        `Available Borrows: \`${m(fmtUsd(x.disponivelUsd))}\``,
        `${t('defi.collateralRisk')}: \`${m(fmtUsd(x.colateralUsd))}\``,
        x.precoLiquidacao && t('defi.liquidationPriceOf', { symbol: x.precoLiquidacao.simbolo, value: fmtUsd(x.precoLiquidacao.usd) }),
        x.liquidacaoAmbigua && t('defi.ambiguousLiquidation')
    ].filter(Boolean).join('\n');

    return `💰 Net Position: \`${m(fmtUsdWithSignal(x.liquidoUsd))}\`\n` +
        `📥 Supplied: \`${m(fmtUsd(x.fornecidoUsd))}\`\n` +
        `📤 Borrowed: \`${m(fmtUsd(x.dividaUsd))}\`${withoutPrice}\n\n` +
        `❤️ Health Factor: \`${fmtHf(x.hf)}\`\n\n${t('defi.risk')}\n${risk}`;
}

// A network's sections: the summary and the assets (and, with -full, the configuration)
function sectionsAave(x, { full, titulo: title, m = SHOW }) {
    const { fornecidos: provided, dividas: debts } = x;
    const list = (items, debt) => items.map(i => (full ? itemAaveFull(i, debt, m) : itemAaveShort(i, m))).join('\n\n');
    const sections = [
        `${title}${summaryAave(x, { full, m, destaque: !title.startsWith('🌐') })}`,
        provided.length && `📥 *SUPPLIED*\n\n${list(provided, false)}`,
        debts.length && `📤 *${full ? 'DEBT' : 'BORROWED'}*\n\n${list(debts, true)}`
    ];

    if (full) {
        const emode = x.emode ? `Enabled (${x.emode.nome || t('defi.category', { id: x.emode.id })})` : 'Disabled';
        const isolation = x.isolamento
            ? `Yes (${x.isolamento.simbolo}, debt ceiling ${fmtUsd(x.isolamento.tetoUsd)})`
            : 'No';
        sections.push(`${t('defi.configTitle')}\n\neMode: \`${emode}\`\nIsolation Mode: \`${isolation}\``);
    }
    return sections.filter(Boolean);
}

/**
 * The /defi aave message: on a single network, it directly; on several, the total
 * global and each network with its own Health Factor.
 */
function textAave(r, end = short, nameAlt = null, { full = false, m = SHOW } = {}) {
    const title = `🟣 *AAVE V3${full ? ' — FULL' : ''}*`;
    const networks = r.redes;
    const sections = [];

    if (networks.length === 1) {
        sections.push(...sectionsAave(networks[0], { full, m, titulo: `${title} · ${networks[0].rede}\n\n` }));
    } else {
        const total = networks.reduce((s, x) => s + x.liquidoUsd, 0);
        sections.push(`${title}\n\n💰 *TOTAL GLOBAL*\nNet: \`${m(fmtUsdWithSignal(total))}\``);
        for (const x of networks) sections.push(sectionsAave(x, { full, m, titulo: `🌐 *${x.rede}*\n\n` }).join('\n\n'));
    }

    if (r.falhas.length) {
        sections.push(r.falhas.map(f => `⚠️ *${f.rede}*: ${f.motivo}`).join('\n'));
    }

    sections.push(walletFooter(r, end, nameAlt, networks.map(x => x.rede).join(', ') || '-', networks.length > 1));

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
        semPosicao: (end, wallet) => t('defi.noPosition', { head: '🦋 *MORPHO*', wallet: end(wallet), chains: getSetting('defi.morpho.chains').join(', ') }),
        texto: (r, end, { m }) => textMorpho(r, end, null, m)
    },
    aave: {
        nome: 'Aave', env: 'AAVE_WALLET_ADDRESS', setting: 'defi.aave.wallet', ler: positionsAave,
        vazio: (r) => !r.redes.length && !r.falhas.length,
        semPosicao: (end, wallet) => t('defi.noPosition', { head: '🟣 *AAVE V3*', wallet: end(wallet), chains: getSetting('defi.aave.chains').join(', ') }),
        texto: (r, end, optionsAlt) => textAave(r, end, null, optionsAlt)
    }
};

async function envShow(msg, protocol, end, optionsAlt) {
    const d = DO_ENV[protocol];
    const wallet = envOuSetting(d.env, d.setting);
    if (!wallet) {
        await msg.reply(t('defi.walletNotConfigured', { name: d.nome, env: d.env, setting: d.setting, proto: protocol }));
        return;
    }

    let r;
    try {
        r = await d.ler(wallet);
    } catch (err) {
        if (!err.motivo) printError(`[${d.nome.toUpperCase()}] Erro inesperado:`, err.message);
        await msg.reply(t('defi.queryError', { name: d.nome, reason: err.motivo ?? t('defi.noData') }));
        return;
    }

    await msg.reply(d.vazio(r) ? d.semPosicao(end, wallet) : d.texto(r, end, optionsAlt));
}

/*
 * -alerta
 */
/**
 * Where the position notice goes: "seu privado", "👥 Grupo", "📧 a@b.com".
 */
function alertDescribeDestination(p) {
    const destinations = alertDestinations(p);
    return destinations.length ? describeDestinations(destinations) : t('defi.yourPrivate');
}

// The destinations stored on the position (the -to ones); []: your private chat
function alertDestinations(p) {
    const single = p.alert_email
        ? { email: p.alert_email, nome: p.alert_email, grupo: false }
        : p.alert_dest_id ? { id: p.alert_dest_id, nome: p.alert_dest_name, grupo: Boolean(p.alert_dest_is_group) } : null;
    return destinationsSaved(p.alert_recipients, single);
}

const RANGE_STATE = { 1: 'defi.stateIn', 0: 'defi.stateOut' };
const ratesLimit = (p) => (p.alert_fees ? ` · 💸 ≥ ${fmtUsd(p.alert_fees)}` : '');
const rangeState = (p) => t(RANGE_STATE[p.in_range] ?? 'defi.stateUnknown');
const eachMinutes = () => plural(getSetting('defi.alerta.intervalMin'), t('alerts.minute'), t('alerts.minutes'));

async function listAlerts(msg, positions, end) {
    const withAlert = positions.map((p, i) => ({ p, n: i + 1 })).filter(({ p }) => p.alert);

    if (!withAlert.length) {
        await msg.reply(t('defi.noAlerts'));
        return;
    }

    await msg.reply(`${t('defi.alertsTitle', { n: withAlert.length })}\n\n` +
        withAlert.map(({ p, n }) => `${n}. ${describe(p, end)} · ${rangeState(p)}${ratesLimit(p)} → ${alertDescribeDestination(p)}`).join('\n') +
        '\n\n' + t('defi.alertsFooter', { every: eachMinutes() }));
}

async function handleAlert(msg, opts, positions, { comDestino: withDestination, destinosTexto: destinationsText }, end = short) {
    const o = opts.opt;
    const byNumber = (v) => (/^\d+$/.test(v) ? positions[Number(v) - 1] : null);

    // -alerta -rm <nº|all>: desliga
    if (opts.given.has('rm')) {
        const rm = String(o.rm ?? '').trim().toLowerCase();
        const targets = rm === 'all' ? positions.filter(p => p.alert) : [byNumber(rm)].filter(Boolean);

        if (rm !== 'all' && !targets.length) {
            await msg.reply(t('defi.positionNotFound', { n: o.rm ?? '?' }));
            return;
        }

        for (const p of targets) {
            await dbRun(`UPDATE defi_positions SET alert = 0, alert_dest_id = NULL, alert_dest_name = NULL,
                alert_dest_is_group = 0, alert_email = NULL, alert_recipients = NULL, alert_fees = NULL, fees_notified = 0,
                in_range = NULL WHERE id = ?`, [p.id]);
        }
        await msg.reply(rm === 'all'
            ? `🔕 ${plural(targets.length, t('defi.alertOff'), t('defi.alertsOff'))}.`
            : t('defi.alertOffOne', { desc: describe(targets[0], end) }));
        return;
    }

    const target = String(o.alerta ?? '').trim().toLowerCase();

    if (!target) {
        if (withDestination) {
            await msg.reply(t('defi.alertNeedPosition'));
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
            ? t('defi.noRangePositions', { examples: examples() })
            : t('defi.positionNotFound', { n: o.alerta }));
        return;
    }
    const withoutRange = chosen.find(p => !WITH_RANGE.includes(p.protocol));
    if (withoutRange) {
        await msg.reply(t('defi.rangeOnlyPos', { n: positions.indexOf(withoutRange) + 1, ...protocolAlt(withoutRange.protocol) }));
        return;
    }

    // -taxas <value>: the limit in dollars; off (or 0) removes it; without -taxas, what was there stays
    let rates;
    if (opts.given.has('taxas')) {
        const v = String(o.taxas ?? '').trim().toLowerCase().replace(/^\$/, '').replace(',', '.');
        rates = v === 'off' || v === '0' ? null : Number(v);
        if (rates !== null && !(rates > 0)) {
            await msg.reply(t('defi.feesInvalid'));
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
            (inRange === 0 ? ' ' + t('defi.warnWhenBack') : ''));
    }

    const whereWarn = destinations.length ? describeDestinations(destinations) : t('defi.yourPrivate');

    await msg.reply(`${t('defi.alertOn', { n: chosen.length })}\n\n${linesAlt.join('\n')}\n\n` +
        t('defi.alertNotice', { where: whereWarn }) +
        (rates ? t('defi.alertNoticeFees', { fees: fmtUsd(rates) }) : '') +
        t('defi.alertNoticeEvery', { every: eachMinutes() }) + '\n' +
        t('defi.alertOnTip'));
}

/*
 * Registration with -alerta [value]: turns on the new position's alert, in your private chat (or in the -to).
 * The value is the fee limit in dollars (the same as -taxas): -alerta 2000.
 */
async function registerWithAlert(msg, opts, protocol, destination, end) {
    const o = opts.opt;
    let limitAlt = null;
    if (opts.given.has('alerta') && protocol && !WITH_RANGE.includes(protocol)) {
        await msg.reply(t('defi.rangeOnlyProto', protocolAlt(protocol)));
        return;
    }
    if (opts.given.has('alerta')) {
        const v = String(o.alerta ?? '').trim().replace(/^\$/, '').replace(',', '.');
        limitAlt = v ? Number(v) : null;
        if (v && !(limitAlt > 0)) {
            await msg.reply(t('defi.alertFeesInvalid'));
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

/*
 * -taxas (without -alerta): the summary of fees to collect, in a single message. It goes
 * per liquidity protocol (Orca, Project X and Liquidswap), with the range, the
 * price and the fees of each position, and the total at the end. What is not
 * registered appears as such; Liquidswap (AMM) has no fees to collect.
 */
const WITH_RATES = ['orca', 'prjx', 'liquidswap'];

// The position in the summary format: token 0/1, range in 1 per 0 and the fees (usd null: no price)
function orcaRates(d, whereAlt) {
    const x = orcaNumbers(d);
    return {
        titulo: `Orca · ${x.simA}/${x.simB}`, onde: whereAlt, naFaixa: d.calculo.naFaixa,
        sim0: x.simA, sim1: x.simB, preco: x.atual, inferior: x.inferior, superior: x.superior,
        taxa0: x.taxaA, taxa1: x.taxaB, usd0: x.usdA, usd1: x.usdB
    };
}

const prjxRates = (x, nameAlt) => ({
    titulo: `Project X · ${x.simbolo0}/${x.simbolo1}`, onde: `#${x.id}${nameAlt ? ` · 👛 ${nameAlt}` : ''}`, naFaixa: x.naFaixa,
    sim0: x.simbolo0, sim1: x.simbolo1, preco: x.preco, inferior: x.inferior, superior: x.superior,
    taxa0: x.taxa0, taxa1: x.taxa1, usd0: x.usd0, usd1: x.usd1
});

// A registration's positions: { ranges } (Orca and Project X) or { amm } (Liquidswap: how many pools)
async function readRates(p, end) {
    if (p.protocol === 'liquidswap') return { amm: (await positionsLiquidswap(p.wallet)).length };
    if (p.protocol === 'prjx') return { faixas: (await walletPositions(p.wallet)).map(x => prjxRates(x, p.name)) };
    return { faixas: [orcaRates(await positionDetails(p.address, p.pool), positionWithName(p, end))] };
}

// The value of the fees in dollars (null: no price)
const ratesInUsd = (x) => (x.usd0 === null || x.usd1 === null ? null : x.taxa0 * x.usd0 + x.taxa1 * x.usd1);

function ratesText(x) {
    const usd = (q, price) => (price === null ? '' : ` (${fmtUsd(q * price)})`);
    const total = ratesInUsd(x);
    const outside = x.naFaixa ? '' : ' ' + t('defi.outShort');

    return `🌊 *${x.titulo}* · 📍 ${x.onde}\n` +
        `${t('defi.l.range')} ${fmtPrice(x.inferior)} – ${fmtPrice(x.superior)} ${t('defi.per', { q: x.sim1, b: x.sim0 })}\n` +
        `${t('defi.l.price')} ${fmtPrice(x.preco)} ${t('defi.per', { q: x.sim1, b: x.sim0 })}\n` +
        `   ${rangeBar(x.preco, x.inferior, x.superior)}${outside}\n` +
        (x.preco ? `   _(1 ${x.sim1} = ${fmtPrice(1 / x.preco)} ${x.sim0})_\n` : '') +
        `${t('defi.l.fees')}${total === null ? ' ' + t('defi.noUsdShort') : ` ${fmtUsd(total)}`}\n` +
        `   • ${fmtQtd(x.taxa0)} ${x.sim0}${usd(x.taxa0, x.usd0)}\n` +
        `   • ${fmtQtd(x.taxa1)} ${x.sim1}${usd(x.taxa1, x.usd1)}`;
}

/*
 * With -alerta: the registration's alert, after its positions. In Project X, the
 * the fee limit applies to the whole wallet (the sum of the positions), as in the
 * src/defi/alerts.js check.
 */
function alertInRatesText(p, n, sumUsd) {
    if (!p.alert) return t('defi.noAlertHint', { n });
    const range = t(p.alert_fees ? 'defi.alertLineFees' : 'defi.alertLine', { fees: fmtUsd(p.alert_fees ?? 0), where: alertDescribeDestination(p) });
    if (!p.alert_fees || sumUsd === null) return range;
    return `${range}\n   ${sumUsd >= p.alert_fees
        ? t('defi.overLimit')
        : t('defi.missing', { usd: fmtUsd(p.alert_fees - sumUsd), pct: Math.floor((sumUsd / p.alert_fees) * 100) })}`;
}

async function summarizeRates(msg, positions, protocol, end, { comAlerta: withAlert = false } = {}) {
    const blocks = [];
    const byProtocol = [];
    const totalOutside = [];

    for (const proto of protocol ? [protocol] : WITH_RATES) {
        const registrations = positions.filter(p => p.protocol === proto);
        if (!registrations.length) {
            blocks.push(t('defi.notRegistered', { protocol: PROTOCOLS[proto] }));
            continue;
        }

        let sum = 0;
        let withValue = false;
        for (const p of registrations) {
            try {
                const { faixas: ranges, amm } = await readRates(p, end);
                if (amm !== undefined) {
                    blocks.push(`🌊 *Liquidswap* · 📍 ${walletWithName(p, end)}\n` +
                        (amm ? t('defi.ammNote', { pools: plural(amm, t('defi.pool'), t('defi.pools')) }) : t('defi.ammNoneNote')));
                    continue;
                }
                if (!ranges.length) blocks.push(t('defi.noOpenShort', { desc: describe(p, end) }));
                let registration = 0;
                let withoutPrice = false;
                for (const x of ranges) {
                    blocks.push(ratesText(x));
                    const v = ratesInUsd(x);
                    if (v === null) {
                        totalOutside.push(t('defi.noPriceItem', { title: x.titulo }));
                        withoutPrice = true;
                    } else {
                        registration += v;
                        withValue = true;
                    }
                }
                sum += registration;
                if (withAlert) {
                    const alert = alertInRatesText(p, positions.indexOf(p) + 1, withoutPrice ? null : registration);
                    if (ranges.length > 1) blocks.push(`👛 *${describe(p, end)}*: ${fmtUsd(registration)}\n${alert}`);
                    else blocks[blocks.length - 1] += `\n${alert}`;
                }
            } catch (err) {
                printError(`/defi -taxas ${addressAlt2(p)}:`, err.response?.status ?? '', err.message);
                blocks.push(t('defi.cantReadNow', { desc: describe(p, end), reason: err.motivo ?? `${err.message}.` }));
                totalOutside.push(t('defi.notRead', { desc: describe(p, end) }));
            }
        }
        if (withValue) byProtocol.push([PROTOCOLS[proto], sum]);
    }

    const total = byProtocol.reduce((s, [, v]) => s + v, 0);
    const when = formatData(Date.now()).replace(/,? (\d\d:\d\d):\d\d$/, (_, hour) => ` ${t('defi.at')} ${hour}`);
    const detail = byProtocol.length > 1 ? `\n${byProtocol.map(([nameAlt, v]) => `   • ${nameAlt}: ${fmtUsd(v)}`).join('\n')}` : '';
    const outside = totalOutside.length ? '\n' + t('defi.outOfTotal', { list: totalOutside.join(', ') }) : '';

    await msg.reply(`${t('defi.feesSummary', { when: when })}\n\n${blocks.join('\n\n')}\n\n${SEPARATOR}\n` +
        `${t('defi.totalToCollect', { total: fmtUsd(total) })}${detail}${outside}`);
}

// -rm 2, -rm 1 3 5, -rm 1,3 (the numbers from the previous list) or all; if any does not exist: none is removed
async function removeAlt2(msg, o, argv, positions, end) {
    const partsAlt = [o.rm, ...argv].join(' ').toLowerCase().split(/[\s,]+/).filter(Boolean);

    if (partsAlt.includes('all')) {
        await dbRun('DELETE FROM defi_positions');
        await msg.reply(`🗑️ ${plural(positions.length, t('defi.registryRemoved'), t('defi.registriesRemoved'))}.`);
        return;
    }

    const numbers = [...new Set(partsAlt.map(Number))].sort((a, b) => a - b);
    const missing = numbers.filter(n => !positions[n - 1]);
    if (!numbers.length || missing.length) {
        await msg.reply(t(missing.length > 1 ? 'defi.numbersNotFoundMany' : 'defi.numbersNotFoundOne', { list: missing.join(', ') || '?' }));
        return;
    }

    const removed = numbers.map(n => positions[n - 1]);
    for (const p of removed) await dbRun('DELETE FROM defi_positions WHERE id = ?', [p.id]);
    await msg.reply(removed.length === 1
        ? t('defi.removedOne', { desc: describe(removed[0], end) })
        : `${t('defi.removedMany', { n: removed.length })}\n${removed.map(p => `• ${describe(p, end)}`).join('\n')}`);
}

// The alert's 🔔, with the fee limit if there is one (🔔 ≥ $2,000.00)
const alertBell = (p) => (p.alert ? ` 🔔${p.alert_fees ? ` ≥ ${fmtUsd(p.alert_fees)}` : ''}` : '');

// The list: in your private chat, the full addresses; outside it, abbreviated
function listText(positions, end, endPool = end) {
    const line = (p, i) => `${i + 1}. ${PROTOCOLS[p.protocol] ?? p.protocol} · ` +
        (WALLET.includes(p.protocol) ? walletWithName(p, end) : `${positionWithName(p, end)} · pool ${endPool(p.pool)}`) +
        ` ${t('defi.since', { date: formatData(p.created_at).split(',')[0] })}${alertBell(p)}`;

    return `${t('defi.listTitle', { n: positions.length })}\n\n${positions.map(line).join('\n')}\n\n` +
        t('defi.listFooter');
}

async function cmdDefi({ msg, opts: commandOpts, args, chatId }) {
    await dbReady;

    // In your private chat, addresses and wallets come in full; outside it, abbreviated
    const inPrivate = (await chatCurrentIds(chatId)).includes(client.info?.wid?._serialized);
    const endNormal = inPrivate ? (e) => e : short;

    /*
     * -to accepts spaces (/Jorge Pereira/), which the option parser
     * would split: goes out of the text first, and the rest is read again.
     */
    const { destinos: destinationsText, informado: withDestination, resto: rest } = extractDestinations(args);
    const opts = withDestination ? GetOptFromCommand(rest, findCommand('/defi')) : commandOpts;
    const o = opts.opt;
    const end = o.mask ? () => '****…****' : endNormal;

    if (withDestination && !opts.given.has('alerta')) {
        await msg.reply(t('defi.toIsForAlert'));
        return;
    }

    // The protocol comes as a word: /defi orca, /defi prjx -wallet ...
    const word = opts.argv.find(protocolAlt2);
    const argv = opts.argv.filter(a => a !== word);
    const protocol = protocolAlt2(word);

    /*
     * -name: the position or wallet name, with spaces (-n Carteira Hare,
     * or between quotes). The parser splits the words; those left in argv are
     * of the name.
     */
    if (opts.given.has('name')) {
        const nameAlt = [o.name, ...argv].filter(Boolean).join(' ').trim();
        argv.length = 0;
        const errorAlt = !opts.given.has('wallet') && !opts.given.has('address')
            ? t('defi.nameWithRegistration')
            : !nameAlt ? t('defi.nameMissing')
                : nameAlt.length > MAX_NAME ? t('defi.nameTooLong', { max: MAX_NAME }) : null;
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

    // -taxas -alerta (both without a value): the fee summary with each registration's alert
    const summaryWithAlert = opts.given.has('taxas') && opts.given.has('alerta') && !o.taxas && !o.alerta &&
        !opts.given.has('rm') && !withDestination;

    if (opts.given.has('alerta') && !summaryWithAlert) {
        await handleAlert(msg, opts, positions, { comDestino: withDestination, destinosTexto: destinationsText }, end);
        return;
    }

    if (opts.given.has('rm')) {
        await removeAlt2(msg, o, argv, positions, end);
        return;
    }

    // -taxas without -alerta: the summary of fees to collect
    if (opts.given.has('taxas')) {
        const errorAlt = o.taxas
            ? t('defi.feesWithValue')
            : protocol && !WITH_RATES.includes(protocol)
                ? t('defi.noFeesFor', protocolAlt(protocol))
                : argv.length ? t('defi.notProtocolFees', { word: argv[0] }) : null;
        if (errorAlt) await msg.reply(errorAlt);
        else await summarizeRates(msg, positions, protocol, end, { comAlerta: summaryWithAlert });
        return;
    }

    const empty = t('defi.noneRegistered', { examples: examples() });

    if (o.list) {
        await msg.reply(positions.length ? listText(positions, end, endNormal) : empty);
        return;
    }

    if (argv.length) {
        await msg.reply(`${t('defi.notProtocol', { word: argv[0] })}\n\n\`\`\`${getCommandSyntax('/defi')}\`\`\``);
        return;
    }

    // -full (the whole Aave) and -mask (the wallet numbers with *)
    const show = { full: Boolean(o.full), m: o.mask ? HIDE : SHOW };

    // /defi: the Position Details of all; /defi orca, prjx, liquidswap or morpho: only that one
    const chosen = positions.filter(x => !protocol || x.protocol === protocol);

    // Morpho and Aave with no registration: the .env wallet (or the setting's), queried on the spot
    if (DO_ENV[protocol] && !chosen.length) {
        await envShow(msg, protocol, end, show);
        return;
    }

    if (!chosen.length) {
        await msg.reply(protocol ? t('defi.nothingRegistered', { ...protocolAlt(protocol), examples: examples() }) : empty);
        return;
    }
    await showAlt(msg, chosen, end, show);
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
    positionLiquidswapText,
    positionPrjxText,
    textMorpho
};
