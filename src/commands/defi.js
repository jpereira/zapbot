/*
 * Comando /defi.
 */

const { findCommand, getCommandSyntax } = require('./base');
const { client } = require('../client');
const { dbAll, dbGet, dbReady, dbRun } = require('../db');
const { isAddressEvm } = require('../defi/hyperevm');
const { positionDetails, validatePosition } = require('../defi/orca');
const { walletPositions } = require('../defi/prjx');
const { isEnderecoSolana: isAddressSolana } = require('../defi/solana');
const { describeDestinations, destinationsSaved, extractDestinations, recipientsDe, resolverDestinations } = require('../destinations');
const { printError } = require('../log');
const { GetOptFromCommand } = require('../options');
const { getSetting } = require('../settings');
const { formatData, plural } = require('../util/format');

/*
 * /defi: registered liquidity positions, from Orca (Solana) and Project X (HyperEVM).
 * /defi                      → the "Position Details" of all of them
 * /defi orca|prjx            → only those of that protocol
 * /defi -l                   → lists the registrations (full address only in your private chat)
 *   /defi -rm <nº...|all>      → remove
 * /defi orca -address <address> [-pool <address>] [-nft <mint>]  → registers a position
 * /defi prjx -address <0x...>  → registers the wallet (the bot reads its positions)
 * -nft and -pool are optional: if they come, the bot checks that they match the position.
 *
 * And the out-of-range alert (the check lives in src/defi/alerts.js):
 * /defi -alerta                         → lists the alerts
 * /defi -alerta <no.|all> [-to <dest>]   → notifies when the position leaves the range and when
 * returns: in your private chat or in -to (email, emails,
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

const PROTOCOLS = { orca: 'Orca', prjx: 'Project X' };

// "Orca · ime1…VPcg" or "Project X · wallet 0x12…5678"
const describe = (p) => (p.protocol === 'prjx'
    ? `Project X · carteira ${short(p.position)}`
    : `${PROTOCOLS[p.protocol] ?? p.protocol} · ${short(p.position)}`);

/**
 * "Position Details" text of a Project X position (from walletPositions).
 */
function positionPrjxText(x) {
    const usd = (q, price) => (price === null ? '' : ` (${fmtUsd(q * price)})`);
    const total = (a, b) => (x.usd1 === null ? '' : ` ${fmtUsd(a * x.usd0 + b * x.usd1)}`);
    const status = x.naFaixa
        ? '✅ dentro da faixa'
        : `⚠️ *fora da faixa* (preço ${x.preco < x.inferior ? 'abaixo' : 'acima'}: a posição não rende taxas)`;

    return `🌊 *Project X · ${x.simbolo0}/${x.simbolo1}* · taxa ${(x.taxa / 10000).toLocaleString('en-US', { maximumFractionDigits: 2 })}%\n` +
        `📍 #${x.id} · ${status}\n\n` +
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
async function readRegistration(p) {
    if (p.protocol === 'prjx') {
        const positions = await walletPositions(p.position);
        const withPrice = positions.filter(x => x.usd1 !== null);
        return {
            naFaixa: positions.length ? positions.every(x => x.naFaixa) : null,
            textos: positions.map(positionPrjxText),
            foraDaFaixa: positions.filter(x => !x.naFaixa).map(positionPrjxText),
            taxasUsd: withPrice.length ? withPrice.reduce((s, x) => s + x.taxa0 * x.usd0 + x.taxa1 * x.usd1, 0) : null
        };
    }

    const d = await positionDetails(p.position, p.pool);
    const textAlt = positionText(d);
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
function positionText(d) {
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
        `📍 ${short(d.endereco)} · ${status}\n\n` +
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

const EXAMPLES = '💡 _/defi orca -address <endereço> -pool <endereço> -nft <mint>\n/defi prjx -address <0x...>_';

// The protocol word: /defi orca, /defi prjx -address ...
const WORDS = { orca: 'orca', prjx: 'prjx' };
const protocolAlt2 = (word) => WORDS[String(word ?? '').toLowerCase()] ?? null;

async function limitOrRepeated(msg, address) {
    if (await dbGet('SELECT 1 AS ok FROM defi_positions WHERE lower(position) = lower(?)', [address])) {
        await msg.reply(`ℹ️ ${short(address)} já está cadastrada. Veja com /defi`);
        return true;
    }
    if ((await dbGet('SELECT COUNT(*) AS n FROM defi_positions')).n >= MAX_POSITIONS) {
        await msg.reply(`❌ Limite de ${MAX_POSITIONS} cadastros. Remova algum com /defi -rm <nº>`);
        return true;
    }
    return false;
}

// prjx -address <0x...>: stores the wallet; the positions are read on each -s
async function registerWallet(msg, o) {
    const wallet = String(o.address ?? '').trim().replace(/^<(.*)>$/, '$1');

    if (!wallet) {
        await msg.reply('❌ Informe a carteira: -address <0x...>\n💡 _/defi prjx -address 0x12b2C3d4E5f60718293A4b5C6d7E8f9012345678_');
        return;
    }
    if (!isAddressEvm(wallet)) {
        await msg.reply(`❌ -address: "${wallet}" não é um endereço da HyperEVM (0x e 40 caracteres hexadecimais).`);
        return;
    }
    if (await limitOrRepeated(msg, wallet)) return;

    // Checks on the RPC now: right address, but with no open position, registers and warns
    let openAlt;
    try {
        openAlt = (await walletPositions(wallet)).length;
    } catch (err) {
        printError(`/defi prjx ${wallet}:`, err.message);
        await msg.reply(`⚠️ Não consegui ler a carteira agora: ${err.message}.\n💡 _O RPC público da HyperEVM limita as consultas; um RPC próprio vai no setting defi.hyperevm.rpc._`);
        return;
    }

    await dbRun('INSERT INTO defi_positions (protocol, position, created_at) VALUES (?, ?, ?)', ['prjx', wallet.toLowerCase(), Date.now()]);
    await msg.reply(`✅ *Carteira do Project X cadastrada:* ${short(wallet)}\n` +
        (openAlt ? `📍 ${plural(openAlt, 'posição aberta', 'posições abertas')}.` : 'ℹ️ Nenhuma posição aberta agora: o /defi prjx mostra quando houver.') +
        '\n💡 _Veja com /defi prjx_');
    return wallet.toLowerCase();
}

// The registered address, or null (the error was already replied)
async function register(msg, o, protocol) {
    if (!protocol) {
        await msg.reply(`❌ Informe o protocolo: orca ou prjx, antes do -address.\n${EXAMPLES}`);
        return null;
    }
    if (protocol === 'prjx') return registerWallet(msg, o);

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

    if (await limitOrRepeated(msg, address)) return;

    const r = await validatePosition({ endereco: address, nft, pool });
    if (r.erro) {
        await msg.reply(r.erro);
        return;
    }

    await dbRun('INSERT INTO defi_positions (protocol, position, nft, pool, created_at) VALUES (?, ?, ?, ?, ?)',
        ['orca', address, r.posicao.mint, r.posicao.whirlpool, Date.now()]);

    await msg.reply(`✅ *Posição da Orca cadastrada:* ${short(address)}\n💡 _Veja com /defi orca_`);
    return address;
}

const TIP_RPC = {
    orca: '💡 _O RPC público da Solana limita as consultas; um RPC próprio vai no setting defi.solana.rpc._',
    prjx: '💡 _O RPC público da HyperEVM limita as consultas; um RPC próprio vai no setting defi.hyperevm.rpc._'
};

async function showAlt(msg, positions) {
    for (const p of positions) {
        try {
            const { textos: texts } = await readRegistration(p);
            if (!texts.length) await msg.reply(`🌊 ${describe(p)}: nenhuma posição aberta.`);
            for (const textAlt of texts) await msg.reply(textAlt);
        } catch (err) {
            printError(`/defi ${p.position}:`, err.response?.status ?? '', err.message);
            await msg.reply(`⚠️ Não consegui ler ${describe(p)} agora: ${err.message}.\n${TIP_RPC[p.protocol] ?? ''}`);
        }
    }
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

async function listAlerts(msg, positions) {
    const withAlert = positions.map((p, i) => ({ p, n: i + 1 })).filter(({ p }) => p.alert);

    if (!withAlert.length) {
        await msg.reply('🔕 Nenhum alerta no /defi.\n💡 _Ligue com /defi -alerta <nº> (avisa quando a posição sair da faixa e quando voltar)._');
        return;
    }

    await msg.reply(`🔔 *Alertas do /defi* (${withAlert.length})\n\n` +
        withAlert.map(({ p, n }) => `${n}. ${describe(p)} · ${rangeState(p)}${ratesLimit(p)} → ${alertDescribeDestination(p)}`).join('\n') +
        `\n\n💡 _Verificados a cada ${eachMinutes()}. Desligue com /defi -alerta -rm <nº|all>._`);
}

async function handleAlert(msg, opts, positions, { comDestino: withDestination, destinosTexto: destinationsText }) {
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
            : `🔕 Alerta desligado: ${describe(targets[0])}`);
        return;
    }

    const target = String(o.alerta ?? '').trim().toLowerCase();

    if (!target) {
        if (withDestination) {
            await msg.reply('❌ Informe a posição: /defi -alerta <nº|all> -to <destino>');
            return;
        }
        await listAlerts(msg, positions);
        return;
    }

    const chosen = target === 'all' ? positions : [byNumber(target)].filter(Boolean);
    if (!chosen.length) {
        await msg.reply(target === 'all'
            ? `🌊 Nenhuma posição cadastrada.\n${EXAMPLES}`
            : `❌ Posição nº ${o.alerta} não existe. Veja a lista com /defi -l`);
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
        const inRange = await readRegistration(p)
            .then(({ naFaixa: f }) => (f === null ? null : f ? 1 : 0))
            .catch((err) => {
                printError(`/defi -alerta ${p.position}:`, err.response?.status ?? '', err.message);
                return null;
            });

        await dbRun(`UPDATE defi_positions SET alert = 1, alert_dest_id = ?, alert_dest_name = ?,
            alert_dest_is_group = ?, alert_email = ?, alert_recipients = ?, alert_fees = ?, fees_notified = 0, in_range = ?
            WHERE id = ?`,
        [destination.id ?? null, destination.email ? null : destination.nome ?? null, destination.grupo ? 1 : 0, destination.email ?? null,
            recipientsDe(destinations), limitAlt ?? null, inRange, p.id]);

        const updated = { ...p, in_range: inRange, alert_fees: limitAlt };
        linesAlt.push(`${positions.indexOf(p) + 1}. ${describe(p)} · ${rangeState(updated)}${ratesLimit(updated)}` +
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
async function registerWithAlert(msg, opts, protocol, destination) {
    const o = opts.opt;
    let limitAlt = null;
    if (opts.given.has('alerta')) {
        const v = String(o.alerta ?? '').trim().replace(/^\$/, '').replace(',', '.');
        limitAlt = v ? Number(v) : null;
        if (v && !(limitAlt > 0)) {
            await msg.reply('❌ No cadastro, o -alerta leva o limite das taxas em dólar (ex.: -alerta 2000) ou nada.');
            return;
        }
    }

    const address = await register(msg, o, protocol);
    if (!address || !opts.given.has('alerta')) return;

    const positions = await dbAll('SELECT * FROM defi_positions ORDER BY id');
    const n = positions.findIndex(p => p.position.toLowerCase() === address.toLowerCase()) + 1;
    const rates = o.taxas ?? (limitAlt ? String(limitAlt) : null);
    await handleAlert(msg, {
        opt: { ...o, alerta: String(n), taxas: rates },
        given: new Set(['alerta', ...(rates ? ['taxas'] : [])]),
        argv: []
    }, positions, destination);
}

// -rm 2, -rm 1 3 5, -rm 1,3 (the numbers from the previous list) or all; if any does not exist: none is removed
async function removeAlt2(msg, o, argv, positions) {
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
        ? `🗑️ Removido: ${describe(removed[0])}`
        : `🗑️ *Removidos* (${removed.length})\n${removed.map(p => `• ${describe(p)}`).join('\n')}`);
}

// The alert's 🔔, with the fee limit if there is one (🔔 ≥ $2,000.00)
const alertBell = (p) => (p.alert ? ` 🔔${p.alert_fees ? ` ≥ ${fmtUsd(p.alert_fees)}` : ''}` : '');

// The list: in your private chat, the full addresses; outside it, abbreviated
function listText(positions, inPrivate) {
    const address = (e) => (inPrivate ? e : short(e));
    const line = (p, i) => `${i + 1}. ${PROTOCOLS[p.protocol] ?? p.protocol} · ` +
        (p.protocol === 'prjx' ? `carteira ${address(p.position)}` : `${address(p.position)} · pool ${address(p.pool)}`) +
        ` _(desde ${formatData(p.created_at).split(',')[0]})_${alertBell(p)}`;

    return `🌊 *Posições DeFi* (${positions.length})\n\n${positions.map(line).join('\n')}\n\n` +
        '💡 _/defi mostra os detalhes; /defi -rm <nº> remove; 🔔 = com alerta (/defi -alerta), ≥ $ é o limite das taxas._';
}

async function cmdDefi({ msg, opts: commandOpts, args, chatId }) {
    await dbReady;

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

    // The protocol comes as a word: /defi orca, /defi prjx -address ...
    const word = opts.argv.find(protocolAlt2);
    const argv = opts.argv.filter(a => a !== word);
    const protocol = protocolAlt2(word);

    if (opts.given.has('address')) {
        await registerWithAlert(msg, opts, protocol, { comDestino: withDestination, destinosTexto: destinationsText });
        return;
    }

    const positions = await dbAll('SELECT * FROM defi_positions ORDER BY id');

    if (opts.given.has('alerta')) {
        await handleAlert(msg, opts, positions, { comDestino: withDestination, destinosTexto: destinationsText });
        return;
    }

    if (opts.given.has('rm')) {
        await removeAlt2(msg, o, argv, positions);
        return;
    }

    const empty = `🌊 Nenhuma posição cadastrada.\n${EXAMPLES}`;

    if (o.list) {
        await msg.reply(positions.length ? listText(positions, chatId === client.info?.wid?._serialized) : empty);
        return;
    }

    if (argv.length) {
        await msg.reply(`❌ "${argv[0]}" não é um protocolo: use orca ou prjx.\n\n\`\`\`${getCommandSyntax('/defi')}\`\`\``);
        return;
    }

    // /defi: the Position Details of all; /defi orca or /defi prjx: only that one
    const chosen = positions.filter(x => !protocol || x.protocol === protocol);
    if (!chosen.length) {
        await msg.reply(protocol ? `🌊 Nada cadastrado ${protocol === 'prjx' ? 'do Project X' : 'da Orca'}.\n${EXAMPLES}` : empty);
        return;
    }
    await showAlt(msg, chosen);
}

module.exports = {
    rangeBar,
    cmdDefi,
    describe,
    alertDescribeDestination,
    alertDestinations,
    fmtUsd,
    readRegistration,
    positionText,
    positionPrjxText
};
