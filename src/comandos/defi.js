/*
 * Comando /defi.
 */

const { findCommand, getCommandSyntax } = require('./base');
const { dbAll, dbGet, dbPronto, dbRun } = require('../db');
const { isEnderecoEvm } = require('../defi/hyperevm');
const { detalhesDaPosicao, validarPosicao } = require('../defi/orca');
const { posicoesDaCarteira } = require('../defi/prjx');
const { isEnderecoSolana } = require('../defi/solana');
const { descreverDestino, extrairDestino, resolverOuEscolher } = require('../destinos');
const { printError } = require('../log');
const { GetOptFromCommand } = require('../opcoes');
const { getSetting } = require('../settings');
const { formatarData, plural } = require('../util/formatar');

/*
 * /defi: posições de liquidez cadastradas, da Orca (Solana) e do Project X (HyperEVM).
 *   /defi -orca -position <endereço> [-nft <mint>] [-pool <endereço>]  → cadastra uma posição
 *   /defi -project-x -wallet <0x...>   → cadastra a carteira (o bot lê as posições dela)
 *   /defi -show [nº]   → "Position Details" de todas (ou da nº N)
 *   /defi -l           → lista as cadastradas
 *   /defi -rm <nº|all> → remove
 * O -nft e o -pool são opcionais: se vierem, o bot confere se batem com a posição.
 *
 * E o alerta de saída da faixa (a verificação fica em src/defi/alertas.js):
 *   /defi -alerta                         → lista os alertas
 *   /defi -alerta <nº|all> [-to <dest>]   → avisa sempre que a posição sair da faixa:
 *                                           no seu privado ou no -to (email, e-mails,
 *                                           contato, grupo ou número)
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

const PROTOCOLOS = { orca: 'Orca', prjx: 'Project X' };

// "Orca · Hz15…RaPZ" ou "Project X · carteira 0x92…0444"
const descrever = (p) => (p.protocol === 'prjx'
    ? `Project X · carteira ${curto(p.position)}`
    : `${PROTOCOLOS[p.protocol] ?? p.protocol} · ${curto(p.position)}`);

/**
 * Texto do "Position Details" de uma posição do Project X (de posicoesDaCarteira).
 */
function textoDaPosicaoPrjx(x) {
    const usd = (q, preco) => (preco === null ? '' : ` (${fmtUsd(q * preco)})`);
    const total = (a, b) => (x.usd1 === null ? '' : ` ${fmtUsd(a * x.usd0 + b * x.usd1)}`);
    const status = x.naFaixa
        ? '✅ dentro da faixa'
        : `⚠️ *fora da faixa* (preço ${x.preco < x.inferior ? 'abaixo' : 'acima'}: a posição não rende taxas)`;

    return `🌊 *Project X · ${x.simbolo0}/${x.simbolo1}* · taxa ${(x.taxa / 10000).toLocaleString('en-US', { maximumFractionDigits: 2 })}%\n` +
        `📍 #${x.id} · ${status}\n\n` +
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
 * @returns {Promise<{ naFaixa: boolean|null, textos: string[], foraDaFaixa: string[] }>}
 *   naFaixa: todas as posições na faixa (null: a carteira não tem nenhuma aberta)
 */
async function lerCadastro(p) {
    if (p.protocol === 'prjx') {
        const posicoes = await posicoesDaCarteira(p.position);
        return {
            naFaixa: posicoes.length ? posicoes.every(x => x.naFaixa) : null,
            textos: posicoes.map(textoDaPosicaoPrjx),
            foraDaFaixa: posicoes.filter(x => !x.naFaixa).map(textoDaPosicaoPrjx)
        };
    }

    const d = await detalhesDaPosicao(p.position, p.pool);
    const texto = textoDaPosicao(d);
    return { naFaixa: d.calculo.naFaixa, textos: [texto], foraDaFaixa: d.calculo.naFaixa ? [] : [texto] };
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

const EXEMPLOS = '💡 _/defi -orca -position <endereço> -nft <mint> -pool <endereço>\n/defi -project-x -wallet <0x...>_';

async function limiteOuRepetida(msg, endereco) {
    if (await dbGet('SELECT 1 AS ok FROM defi_positions WHERE lower(position) = lower(?)', [endereco])) {
        await msg.reply(`ℹ️ ${curto(endereco)} já está cadastrada. Veja com /defi -show`);
        return true;
    }
    if ((await dbGet('SELECT COUNT(*) AS n FROM defi_positions')).n >= MAX_POSICOES) {
        await msg.reply(`❌ Limite de ${MAX_POSICOES} cadastros. Remova algum com /defi -rm <nº>`);
        return true;
    }
    return false;
}

// -project-x -wallet <0x...>: guarda a carteira; as posições são lidas a cada -show
async function cadastrarCarteira(msg, o) {
    const carteira = String(o.wallet ?? '').trim().replace(/^<(.*)>$/, '$1');

    if (!carteira) {
        await msg.reply('❌ Informe a carteira: -wallet <0x...>\n💡 _/defi -project-x -wallet 0x926024824BAEAf3ee0b7A2EEFA5A216743230444_');
        return;
    }
    if (!isEnderecoEvm(carteira)) {
        await msg.reply(`❌ -wallet: "${carteira}" não é um endereço da HyperEVM (0x e 40 caracteres hexadecimais).`);
        return;
    }
    if (await limiteOuRepetida(msg, carteira)) return;

    // Confere no RPC agora: endereço certo, mas sem posição aberta, cadastra e avisa
    let abertas;
    try {
        abertas = (await posicoesDaCarteira(carteira)).length;
    } catch (err) {
        printError(`/defi -project-x ${carteira}:`, err.message);
        await msg.reply(`⚠️ Não consegui ler a carteira agora: ${err.message}.\n💡 _O RPC público da HyperEVM limita as consultas; um RPC próprio vai no setting defi.hyperevm.rpc._`);
        return;
    }

    await dbRun('INSERT INTO defi_positions (protocol, position, created_at) VALUES (?, ?, ?)', ['prjx', carteira.toLowerCase(), Date.now()]);
    await msg.reply(`✅ *Carteira do Project X cadastrada:* ${curto(carteira)}\n` +
        (abertas ? `📍 ${plural(abertas, 'posição aberta', 'posições abertas')}.` : 'ℹ️ Nenhuma posição aberta agora: o /defi -show mostra quando houver.') +
        '\n💡 _Veja com /defi -show_');
}

async function cadastrar(msg, o) {
    if (o['project-x']) {
        await cadastrarCarteira(msg, o);
        return;
    }

    const [endereco, nft, pool] = [o.position, o.nft, o.pool].map(v => (v ? String(v).trim() : null));

    if (!o.orca) {
        await msg.reply(`❌ Informe o protocolo: -orca (com -position) ou -project-x (com -wallet).\n${EXEMPLOS}`);
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

    if (await limiteOuRepetida(msg, endereco)) return;

    const r = await validarPosicao({ endereco, nft, pool });
    if (r.erro) {
        await msg.reply(r.erro);
        return;
    }

    await dbRun('INSERT INTO defi_positions (protocol, position, nft, pool, created_at) VALUES (?, ?, ?, ?, ?)',
        ['orca', endereco, r.posicao.mint, r.posicao.whirlpool, Date.now()]);

    await msg.reply(`✅ *Posição da Orca cadastrada:* ${curto(endereco)}\n💡 _Veja com /defi -show_`);
}

const DICA_RPC = {
    orca: '💡 _O RPC público da Solana limita as consultas; um RPC próprio vai no setting defi.solana.rpc._',
    prjx: '💡 _O RPC público da HyperEVM limita as consultas; um RPC próprio vai no setting defi.hyperevm.rpc._'
};

async function mostrar(msg, posicoes) {
    for (const p of posicoes) {
        try {
            const { textos } = await lerCadastro(p);
            if (!textos.length) await msg.reply(`🌊 ${descrever(p)}: nenhuma posição aberta.`);
            for (const texto of textos) await msg.reply(texto);
        } catch (err) {
            printError(`/defi -show ${p.position}:`, err.response?.status ?? '', err.message);
            await msg.reply(`⚠️ Não consegui ler ${descrever(p)} agora: ${err.message}.\n${DICA_RPC[p.protocol] ?? ''}`);
        }
    }
}

/*
 * -alerta
 */
/**
 * Para onde vai o aviso da posição: "seu privado", "👥 Grupo", "📧 a@b.com".
 */
function descreverDestinoDoAlerta(p) {
    const destino = destinoDoAlerta(p);
    return destino ? descreverDestino(destino) : 'seu privado';
}

// O destino guardado na posição (o do -to); null: o seu privado
function destinoDoAlerta(p) {
    if (p.alert_email) return { email: p.alert_email, nome: p.alert_email, grupo: false };
    return p.alert_dest_id ? { id: p.alert_dest_id, nome: p.alert_dest_name, grupo: Boolean(p.alert_dest_is_group) } : null;
}

const ESTADO_DA_FAIXA = { 1: '✅ na faixa', 0: '⚠️ fora da faixa' };
const estadoDaFaixa = (p) => ESTADO_DA_FAIXA[p.in_range] ?? '❔ ainda não lida';
const cadaMinutos = () => plural(getSetting('defi.alerta.intervalMin'), 'minuto', 'minutos');

async function listarAlertas(msg, posicoes) {
    const comAlerta = posicoes.map((p, i) => ({ p, n: i + 1 })).filter(({ p }) => p.alert);

    if (!comAlerta.length) {
        await msg.reply('🔕 Nenhum alerta no /defi.\n💡 _Ligue com /defi -alerta <nº> (avisa sempre que a posição sair da faixa)._');
        return;
    }

    await msg.reply(`🔔 *Alertas do /defi* (${comAlerta.length})\n\n` +
        comAlerta.map(({ p, n }) => `${n}. ${descrever(p)} · ${estadoDaFaixa(p)} → ${descreverDestinoDoAlerta(p)}`).join('\n') +
        `\n\n💡 _Verificados a cada ${cadaMinutos()}. Desligue com /defi -alerta -rm <nº|all>._`);
}

async function tratarAlerta(msg, opts, posicoes, { comDestino, destinoTexto }) {
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
                alert_dest_is_group = 0, alert_email = NULL, in_range = NULL WHERE id = ?`, [p.id]);
        }
        await msg.reply(rm === 'all'
            ? `🔕 ${plural(alvos.length, 'alerta desligado', 'alertas desligados')}.`
            : `🔕 Alerta desligado: ${descrever(alvos[0])}`);
        return;
    }

    const alvo = String(o.alerta ?? '').trim().toLowerCase();

    if (!alvo) {
        if (comDestino) {
            await msg.reply('❌ Informe a posição: /defi -alerta <nº|all> -to <destino>');
            return;
        }
        await listarAlertas(msg, posicoes);
        return;
    }

    const escolhidas = alvo === 'all' ? posicoes : [porNumero(alvo)].filter(Boolean);
    if (!escolhidas.length) {
        await msg.reply(alvo === 'all'
            ? `🌊 Nenhuma posição cadastrada.\n${EXEMPLOS}`
            : `❌ Posição nº ${o.alerta} não existe. Veja a lista com /defi -l`);
        return;
    }

    let destino = {};
    if (comDestino) {
        // E-mail ou chat; vários contatos ou grupos com o nome: espera você escolher na lista
        destino = await resolverOuEscolher(msg, destinoTexto, { aceitaEmail: true });
        if (!destino) return;
    }

    // O estado de agora vira a referência: o aviso sai quando a posição passar de dentro para fora
    const linhas = [];
    for (const p of escolhidas) {
        const naFaixa = await lerCadastro(p)
            .then(({ naFaixa: f }) => (f === null ? null : f ? 1 : 0))
            .catch((err) => {
                printError(`/defi -alerta ${p.position}:`, err.response?.status ?? '', err.message);
                return null;
            });

        await dbRun(`UPDATE defi_positions SET alert = 1, alert_dest_id = ?, alert_dest_name = ?,
            alert_dest_is_group = ?, alert_email = ?, in_range = ? WHERE id = ?`,
        [destino.id ?? null, destino.email ? null : destino.nome ?? null, destino.grupo ? 1 : 0, destino.email ?? null, naFaixa, p.id]);

        const atualizada = { ...p, in_range: naFaixa };
        linhas.push(`${posicoes.indexOf(p) + 1}. ${descrever(p)} · ${estadoDaFaixa(atualizada)}` +
            (naFaixa === 0 ? ' _(avisa quando voltar para a faixa e sair de novo)_' : ''));
    }

    const ondeAvisa = descreverDestinoDoAlerta({
        alert_email: destino.email, alert_dest_id: destino.id, alert_dest_name: destino.nome, alert_dest_is_group: destino.grupo
    });

    await msg.reply(`🔔 *Alerta do /defi ligado* (${escolhidas.length})\n\n${linhas.join('\n')}\n\n` +
        `📣 Aviso: ${ondeAvisa}, sempre que a posição sair da faixa (verificada a cada ${cadaMinutos()}).\n` +
        '💡 _Veja com /defi -alerta; desligue com /defi -alerta -rm <nº|all>._');
}

async function cmdDefi({ msg, opts: optsDoComando, args }) {
    await dbPronto;

    /*
     * O -to aceita espaços (/Jorge Pereira/), que o parser de opções
     * separaria: sai do texto antes, e o resto é lido de novo.
     */
    const { destino: destinoTexto, informado: comDestino, resto } = extrairDestino(args);
    const opts = comDestino ? GetOptFromCommand(resto, findCommand('/defi')) : optsDoComando;
    const o = opts.opt;

    if (comDestino && !opts.given.has('alerta')) {
        await msg.reply('❌ O -to é do -alerta: /defi -alerta <nº|all> -to <destino>');
        return;
    }

    if (o.orca || o['project-x'] || opts.given.has('position') || opts.given.has('wallet')) {
        await cadastrar(msg, o);
        return;
    }

    const posicoes = await dbAll('SELECT * FROM defi_positions ORDER BY id');

    if (opts.given.has('alerta')) {
        await tratarAlerta(msg, opts, posicoes, { comDestino, destinoTexto });
        return;
    }

    const vazio = `🌊 Nenhuma posição cadastrada.\n${EXEMPLOS}`;

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
            posicoes.map((p, i) => `${i + 1}. ${descrever(p)}${p.pool ? ` · pool ${curto(p.pool)}` : ''} _(desde ${formatarData(p.created_at).split(',')[0]})_` +
                (p.alert ? ' 🔔' : '')).join('\n') +
            '\n\n💡 _/defi -show mostra os detalhes; /defi -rm <nº> remove; 🔔 = com alerta (/defi -alerta)._');
        return;
    }

    await msg.reply('```' + getCommandSyntax('/defi') + '```');
}

module.exports = {
    barraDaFaixa,
    cmdDefi,
    descrever,
    descreverDestinoDoAlerta,
    destinoDoAlerta,
    lerCadastro,
    textoDaPosicao,
    textoDaPosicaoPrjx
};
