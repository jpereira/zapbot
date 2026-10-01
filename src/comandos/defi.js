/*
 * Comando /defi.
 */

const { getCommandSyntax } = require('./base');
const { dbAll, dbGet, dbPronto, dbRun } = require('../db');
const { detalhesDaPosicao, validarPosicao } = require('../defi/orca');
const { isEnderecoSolana } = require('../defi/solana');
const { printError } = require('../log');
const { formatarData, plural } = require('../util/formatar');

/*
 * /defi: posições de liquidez cadastradas (por enquanto, da Orca).
 *   /defi -orca -position <endereço> [-nft <mint>] [-pool <endereço>]  → cadastra
 *   /defi -show [nº]   → "Position Details" de todas (ou da nº N)
 *   /defi -l           → lista as cadastradas
 *   /defi -rm <nº|all> → remove
 * O -nft e o -pool são opcionais: se vierem, o bot confere se batem com a posição.
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

/**
 * Texto do "Position Details" de uma posição da Orca.
 */
function textoDaPosicao(d) {
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
        `📍 ${curto(d.endereco)} · ${status}\n\n` +
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

async function cadastrar(msg, o) {
    const [endereco, nft, pool] = [o.position, o.nft, o.pool].map(v => (v ? String(v).trim() : null));

    if (!o.orca) {
        await msg.reply('❌ Informe o protocolo: por enquanto só a Orca (-orca).\n💡 _/defi -orca -position <endereço> -nft <mint> -pool <endereço>_');
        return;
    }
    if (!endereco) {
        await msg.reply('❌ Informe o endereço da posição: -position <endereço>');
        return;
    }

    const invalido = [['-position', endereco], ['-nft', nft], ['-pool', pool]].find(([, v]) => v && !isEnderecoSolana(v));
    if (invalido) {
        await msg.reply(`❌ ${invalido[0]}: "${invalido[1]}" não é um endereço da Solana.`);
        return;
    }

    if (await dbGet('SELECT 1 AS ok FROM defi_positions WHERE position = ?', [endereco])) {
        await msg.reply(`ℹ️ A posição ${curto(endereco)} já está cadastrada. Veja com /defi -show`);
        return;
    }
    if ((await dbGet('SELECT COUNT(*) AS n FROM defi_positions')).n >= MAX_POSICOES) {
        await msg.reply(`❌ Limite de ${MAX_POSICOES} posições. Remova alguma com /defi -rm <nº>`);
        return;
    }

    const r = await validarPosicao({ endereco, nft, pool });
    if (r.erro) {
        await msg.reply(r.erro);
        return;
    }

    await dbRun('INSERT INTO defi_positions (protocol, position, nft, pool, created_at) VALUES (?, ?, ?, ?, ?)',
        ['orca', endereco, r.posicao.mint, r.posicao.whirlpool, Date.now()]);

    await msg.reply(`✅ *Posição da Orca cadastrada:* ${curto(endereco)}\n💡 _Veja com /defi -show_`);
}

async function mostrar(msg, posicoes) {
    for (const p of posicoes) {
        try {
            await msg.reply(textoDaPosicao(await detalhesDaPosicao(p.position, p.pool)));
        } catch (err) {
            printError(`/defi -show ${p.position}:`, err.response?.status ?? '', err.message);
            await msg.reply(`⚠️ Não consegui ler a posição ${curto(p.position)} agora: ${err.message}.\n` +
                '💡 _O RPC público da Solana limita as consultas; um RPC próprio vai no setting defi.solana.rpc._');
        }
    }
}

async function cmdDefi({ msg, opts }) {
    const o = opts.opt;
    await dbPronto;

    if (o.orca || opts.given.has('position')) {
        await cadastrar(msg, o);
        return;
    }

    const posicoes = await dbAll('SELECT * FROM defi_positions ORDER BY id');
    const vazio = '🌊 Nenhuma posição cadastrada.\n💡 _/defi -orca -position <endereço> -nft <mint> -pool <endereço>_';

    if (opts.given.has('rm')) {
        if (String(o.rm ?? '').toLowerCase() === 'all') {
            await dbRun('DELETE FROM defi_positions');
            await msg.reply(`🗑️ ${plural(posicoes.length, 'posição removida', 'posições removidas')}.`);
            return;
        }

        const p = /^\d+$/.test(String(o.rm ?? '')) ? posicoes[Number(o.rm) - 1] : null;
        if (!p) {
            await msg.reply(`❌ Posição nº ${o.rm ?? '?'} não existe. Veja a lista com /defi -l`);
            return;
        }
        await dbRun('DELETE FROM defi_positions WHERE id = ?', [p.id]);
        await msg.reply(`🗑️ Posição removida: ${curto(p.position)}`);
        return;
    }

    if (opts.given.has('show')) {
        if (!posicoes.length) {
            await msg.reply(vazio);
            return;
        }

        const p = o.show ? posicoes[Number(o.show) - 1] : null;
        if (o.show && !p) {
            await msg.reply(`❌ Posição nº ${o.show} não existe. Veja a lista com /defi -l`);
            return;
        }

        await mostrar(msg, p ? [p] : posicoes);
        return;
    }

    if (o.list || !opts.argv.length) {
        if (!posicoes.length) {
            await msg.reply(vazio);
            return;
        }

        await msg.reply(`🌊 *Posições DeFi* (${posicoes.length})\n\n` +
            posicoes.map((p, i) => `${i + 1}. Orca · ${curto(p.position)} · pool ${curto(p.pool)} _(desde ${formatarData(p.created_at).split(',')[0]})_`).join('\n') +
            '\n\n💡 _/defi -show mostra os detalhes; /defi -rm <nº> remove._');
        return;
    }

    await msg.reply('```' + getCommandSyntax('/defi') + '```');
}

module.exports = {
    barraDaFaixa,
    cmdDefi,
    textoDaPosicao
};
