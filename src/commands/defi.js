/*
 * Comando /defi.
 */

const { findCommand, getCommandSyntax } = require('./base');
const { dbAll, dbGet, dbReady, dbRun } = require('../db');
const { isAddressEvm } = require('../defi/hyperevm');
const { positionDetails, validatePosition } = require('../defi/orca');
const { walletPositions } = require('../defi/prjx');
const { isEnderecoSolana: isAddressSolana } = require('../defi/solana');
const { describeDestination, extractDestination, resolverOrChoose } = require('../destinations');
const { printError } = require('../log');
const { GetOptFromCommand } = require('../options');
const { getSetting } = require('../settings');
const { formatData, plural } = require('../util/format');

/*
 * /defi: registered liquidity positions, from Orca (Solana) and Project X (HyperEVM).
 * /defi -orca -position <address> [-nft <mint>] [-pool <address>]  → registers a position
 * /defi -project-x -wallet <0x...>   → registers the wallet (the bot reads its positions)
 * /defi -show [no.]   → "Position Details" of all (or of no. N)
 * /defi -l           → lists the registered ones
 *   /defi -rm <nº|all> → remove
 * -nft and -pool are optional: if they come, the bot checks that they match the position.
 *
 * And the out-of-range alert (the check lives in src/defi/alerts.js):
 * /defi -alerta                         → lists the alerts
 * /defi -alerta <no.|all> [-to <dest>]   → notifies whenever the position leaves the range:
 * in your private chat or in -to (email, emails,
 * contact, group or number)
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
 * @returns {Promise<{ naFaixa: boolean|null, textos: string[], foraDaFaixa: string[] }>}
 * inRange: all the positions in range (null: the wallet has none open)
 */
async function readRegistration(p) {
    if (p.protocol === 'prjx') {
        const positions = await walletPositions(p.position);
        return {
            naFaixa: positions.length ? positions.every(x => x.naFaixa) : null,
            textos: positions.map(positionPrjxText),
            foraDaFaixa: positions.filter(x => !x.naFaixa).map(positionPrjxText)
        };
    }

    const d = await positionDetails(p.position, p.pool);
    const textAlt = positionText(d);
    return { naFaixa: d.calculo.naFaixa, textos: [textAlt], foraDaFaixa: d.calculo.naFaixa ? [] : [textAlt] };
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

const EXAMPLES = '💡 _/defi -orca -position <endereço> -nft <mint> -pool <endereço>\n/defi -project-x -wallet <0x...>_';

async function limitOrRepeated(msg, address) {
    if (await dbGet('SELECT 1 AS ok FROM defi_positions WHERE lower(position) = lower(?)', [address])) {
        await msg.reply(`ℹ️ ${short(address)} já está cadastrada. Veja com /defi -show`);
        return true;
    }
    if ((await dbGet('SELECT COUNT(*) AS n FROM defi_positions')).n >= MAX_POSITIONS) {
        await msg.reply(`❌ Limite de ${MAX_POSITIONS} cadastros. Remova algum com /defi -rm <nº>`);
        return true;
    }
    return false;
}

// -project-x -wallet <0x...>: saves the wallet; the positions are read on each -show
async function registerWallet(msg, o) {
    const wallet = String(o.wallet ?? '').trim().replace(/^<(.*)>$/, '$1');

    if (!wallet) {
        await msg.reply('❌ Informe a carteira: -wallet <0x...>\n💡 _/defi -project-x -wallet 0x12b2C3d4E5f60718293A4b5C6d7E8f9012345678_');
        return;
    }
    if (!isAddressEvm(wallet)) {
        await msg.reply(`❌ -wallet: "${wallet}" não é um endereço da HyperEVM (0x e 40 caracteres hexadecimais).`);
        return;
    }
    if (await limitOrRepeated(msg, wallet)) return;

    // Checks on the RPC now: right address, but with no open position, registers and warns
    let openAlt;
    try {
        openAlt = (await walletPositions(wallet)).length;
    } catch (err) {
        printError(`/defi -project-x ${wallet}:`, err.message);
        await msg.reply(`⚠️ Não consegui ler a carteira agora: ${err.message}.\n💡 _O RPC público da HyperEVM limita as consultas; um RPC próprio vai no setting defi.hyperevm.rpc._`);
        return;
    }

    await dbRun('INSERT INTO defi_positions (protocol, position, created_at) VALUES (?, ?, ?)', ['prjx', wallet.toLowerCase(), Date.now()]);
    await msg.reply(`✅ *Carteira do Project X cadastrada:* ${short(wallet)}\n` +
        (openAlt ? `📍 ${plural(openAlt, 'posição aberta', 'posições abertas')}.` : 'ℹ️ Nenhuma posição aberta agora: o /defi -show mostra quando houver.') +
        '\n💡 _Veja com /defi -show_');
}

async function register(msg, o) {
    if (o['project-x']) {
        await registerWallet(msg, o);
        return;
    }

    const [address, nft, pool] = [o.position, o.nft, o.pool].map(v => (v ? String(v).trim() : null));

    if (!o.orca) {
        await msg.reply(`❌ Informe o protocolo: -orca (com -position) ou -project-x (com -wallet).\n${EXAMPLES}`);
        return;
    }
    if (!address) {
        await msg.reply('❌ Informe o endereço da posição: -position <endereço>');
        return;
    }

    const invalid = [['-position', address], ['-nft', nft], ['-pool', pool]].find(([, v]) => v && !isAddressSolana(v));
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

    await msg.reply(`✅ *Posição da Orca cadastrada:* ${short(address)}\n💡 _Veja com /defi -show_`);
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
            printError(`/defi -show ${p.position}:`, err.response?.status ?? '', err.message);
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
    const destination = alertDestination(p);
    return destination ? describeDestination(destination) : 'seu privado';
}

// The destination stored on the position (the -to one); null: your private chat
function alertDestination(p) {
    if (p.alert_email) return { email: p.alert_email, nome: p.alert_email, grupo: false };
    return p.alert_dest_id ? { id: p.alert_dest_id, nome: p.alert_dest_name, grupo: Boolean(p.alert_dest_is_group) } : null;
}

const RANGE_STATE = { 1: '✅ na faixa', 0: '⚠️ fora da faixa' };
const rangeState = (p) => RANGE_STATE[p.in_range] ?? '❔ ainda não lida';
const eachMinutes = () => plural(getSetting('defi.alerta.intervalMin'), 'minuto', 'minutos');

async function listAlerts(msg, positions) {
    const withAlert = positions.map((p, i) => ({ p, n: i + 1 })).filter(({ p }) => p.alert);

    if (!withAlert.length) {
        await msg.reply('🔕 Nenhum alerta no /defi.\n💡 _Ligue com /defi -alerta <nº> (avisa sempre que a posição sair da faixa)._');
        return;
    }

    await msg.reply(`🔔 *Alertas do /defi* (${withAlert.length})\n\n` +
        withAlert.map(({ p, n }) => `${n}. ${describe(p)} · ${rangeState(p)} → ${alertDescribeDestination(p)}`).join('\n') +
        `\n\n💡 _Verificados a cada ${eachMinutes()}. Desligue com /defi -alerta -rm <nº|all>._`);
}

async function handleAlert(msg, opts, positions, { comDestino: withDestination, destinoTexto: destinationText }) {
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
                alert_dest_is_group = 0, alert_email = NULL, in_range = NULL WHERE id = ?`, [p.id]);
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

    let destination = {};
    if (withDestination) {
        // Email or chat; several contacts or groups with the name: waits for you to choose from the list
        destination = await resolverOrChoose(msg, destinationText, { aceitaEmail: true });
        if (!destination) return;
    }

    // The current state becomes the reference: the notice goes out when the position goes from inside to outside
    const linesAlt = [];
    for (const p of chosen) {
        const inRange = await readRegistration(p)
            .then(({ naFaixa: f }) => (f === null ? null : f ? 1 : 0))
            .catch((err) => {
                printError(`/defi -alerta ${p.position}:`, err.response?.status ?? '', err.message);
                return null;
            });

        await dbRun(`UPDATE defi_positions SET alert = 1, alert_dest_id = ?, alert_dest_name = ?,
            alert_dest_is_group = ?, alert_email = ?, in_range = ? WHERE id = ?`,
        [destination.id ?? null, destination.email ? null : destination.nome ?? null, destination.grupo ? 1 : 0, destination.email ?? null, inRange, p.id]);

        const updated = { ...p, in_range: inRange };
        linesAlt.push(`${positions.indexOf(p) + 1}. ${describe(p)} · ${rangeState(updated)}` +
            (inRange === 0 ? ' _(avisa quando voltar para a faixa e sair de novo)_' : ''));
    }

    const whereWarn = alertDescribeDestination({
        alert_email: destination.email, alert_dest_id: destination.id, alert_dest_name: destination.nome, alert_dest_is_group: destination.grupo
    });

    await msg.reply(`🔔 *Alerta do /defi ligado* (${chosen.length})\n\n${linesAlt.join('\n')}\n\n` +
        `📣 Aviso: ${whereWarn}, sempre que a posição sair da faixa (verificada a cada ${eachMinutes()}).\n` +
        '💡 _Veja com /defi -alerta; desligue com /defi -alerta -rm <nº|all>._');
}

async function cmdDefi({ msg, opts: commandOpts, args }) {
    await dbReady;

    /*
     * -to accepts spaces (/Jorge Pereira/), which the option parser
     * would split: goes out of the text first, and the rest is read again.
     */
    const { destino: destinationText, informado: withDestination, resto: rest } = extractDestination(args);
    const opts = withDestination ? GetOptFromCommand(rest, findCommand('/defi')) : commandOpts;
    const o = opts.opt;

    if (withDestination && !opts.given.has('alerta')) {
        await msg.reply('❌ O -to é do -alerta: /defi -alerta <nº|all> -to <destino>');
        return;
    }

    if (o.orca || o['project-x'] || opts.given.has('position') || opts.given.has('wallet')) {
        await register(msg, o);
        return;
    }

    const positions = await dbAll('SELECT * FROM defi_positions ORDER BY id');

    if (opts.given.has('alerta')) {
        await handleAlert(msg, opts, positions, { comDestino: withDestination, destinoTexto: destinationText });
        return;
    }

    const empty = `🌊 Nenhuma posição cadastrada.\n${EXAMPLES}`;

    if (opts.given.has('rm')) {
        if (String(o.rm ?? '').toLowerCase() === 'all') {
            await dbRun('DELETE FROM defi_positions');
            await msg.reply(`🗑️ ${plural(positions.length, 'posição removida', 'posições removidas')}.`);
            return;
        }

        const p = /^\d+$/.test(String(o.rm ?? '')) ? positions[Number(o.rm) - 1] : null;
        if (!p) {
            await msg.reply(`❌ Posição nº ${o.rm ?? '?'} não existe. Veja a lista com /defi -l`);
            return;
        }
        await dbRun('DELETE FROM defi_positions WHERE id = ?', [p.id]);
        await msg.reply(`🗑️ Posição removida: ${short(p.position)}`);
        return;
    }

    if (opts.given.has('show')) {
        if (!positions.length) {
            await msg.reply(empty);
            return;
        }

        const p = o.show ? positions[Number(o.show) - 1] : null;
        if (o.show && !p) {
            await msg.reply(`❌ Posição nº ${o.show} não existe. Veja a lista com /defi -l`);
            return;
        }

        await showAlt(msg, p ? [p] : positions);
        return;
    }

    if (o.list || !opts.argv.length) {
        if (!positions.length) {
            await msg.reply(empty);
            return;
        }

        await msg.reply(`🌊 *Posições DeFi* (${positions.length})\n\n` +
            positions.map((p, i) => `${i + 1}. ${describe(p)}${p.pool ? ` · pool ${short(p.pool)}` : ''} _(desde ${formatData(p.created_at).split(',')[0]})_` +
                (p.alert ? ' 🔔' : '')).join('\n') +
            '\n\n💡 _/defi -show mostra os detalhes; /defi -rm <nº> remove; 🔔 = com alerta (/defi -alerta)._');
        return;
    }

    await msg.reply('```' + getCommandSyntax('/defi') + '```');
}

module.exports = {
    rangeBar,
    cmdDefi,
    describe,
    alertDescribeDestination,
    alertDestination,
    readRegistration,
    positionText,
    positionPrjxText
};
