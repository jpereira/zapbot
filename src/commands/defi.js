/*
 * Comando /defi.
 */

const { getCommandSyntax } = require('./base');
const { dbAll, dbGet, dbReady, dbRun } = require('../db');
const { positionDetails, validatePosition } = require('../defi/orca');
const { isEnderecoSolana: isAddressSolana } = require('../defi/solana');
const { printError } = require('../log');
const { formatData, plural } = require('../util/format');

/*
 * /defi: registered liquidity positions (for now, from Orca).
 * /defi -orca -position <address> [-nft <mint>] [-pool <address>]  → registers
 * /defi -show [no.]   → "Position Details" of all (or of no. N)
 * /defi -l           → lists the registered ones
 *   /defi -rm <nº|all> → remove
 * -nft and -pool are optional: if they come, the bot checks that they match the position.
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

async function register(msg, o) {
    const [address, nft, pool] = [o.position, o.nft, o.pool].map(v => (v ? String(v).trim() : null));

    if (!o.orca) {
        await msg.reply('❌ Informe o protocolo: por enquanto só a Orca (-orca).\n💡 _/defi -orca -position <endereço> -nft <mint> -pool <endereço>_');
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

    if (await dbGet('SELECT 1 AS ok FROM defi_positions WHERE position = ?', [address])) {
        await msg.reply(`ℹ️ A posição ${short(address)} já está cadastrada. Veja com /defi -show`);
        return;
    }
    if ((await dbGet('SELECT COUNT(*) AS n FROM defi_positions')).n >= MAX_POSITIONS) {
        await msg.reply(`❌ Limite de ${MAX_POSITIONS} posições. Remova alguma com /defi -rm <nº>`);
        return;
    }

    const r = await validatePosition({ endereco: address, nft, pool });
    if (r.erro) {
        await msg.reply(r.erro);
        return;
    }

    await dbRun('INSERT INTO defi_positions (protocol, position, nft, pool, created_at) VALUES (?, ?, ?, ?, ?)',
        ['orca', address, r.posicao.mint, r.posicao.whirlpool, Date.now()]);

    await msg.reply(`✅ *Posição da Orca cadastrada:* ${short(address)}\n💡 _Veja com /defi -show_`);
}

async function showAlt(msg, positions) {
    for (const p of positions) {
        try {
            await msg.reply(positionText(await positionDetails(p.position, p.pool)));
        } catch (err) {
            printError(`/defi -show ${p.position}:`, err.response?.status ?? '', err.message);
            await msg.reply(`⚠️ Não consegui ler a posição ${short(p.position)} agora: ${err.message}.\n` +
                '💡 _O RPC público da Solana limita as consultas; um RPC próprio vai no setting defi.solana.rpc._');
        }
    }
}

async function cmdDefi({ msg, opts }) {
    const o = opts.opt;
    await dbReady;

    if (o.orca || opts.given.has('position')) {
        await register(msg, o);
        return;
    }

    const positions = await dbAll('SELECT * FROM defi_positions ORDER BY id');
    const empty = '🌊 Nenhuma posição cadastrada.\n💡 _/defi -orca -position <endereço> -nft <mint> -pool <endereço>_';

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
            positions.map((p, i) => `${i + 1}. Orca · ${short(p.position)} · pool ${short(p.pool)} _(desde ${formatData(p.created_at).split(',')[0]})_`).join('\n') +
            '\n\n💡 _/defi -show mostra os detalhes; /defi -rm <nº> remove._');
        return;
    }

    await msg.reply('```' + getCommandSyntax('/defi') + '```');
}

module.exports = {
    rangeBar,
    cmdDefi,
    positionText
};
