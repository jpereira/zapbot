/*
 * Comando /defi.
 */

const { findCommand, getCommandSyntax } = require('./base');
const { dbAll, dbGet, dbPronto, dbRun } = require('../db');
const { detalhesDaPosicao, validarPosicao } = require('../defi/orca');
const { isEnderecoSolana } = require('../defi/solana');
const { descreverDestino, extrairDestino, resolverOuEscolher } = require('../destinos');
const { smtpParaEnviar } = require('../email');
const { printError } = require('../log');
const { GetOptFromCommand } = require('../opcoes');
const { getSetting } = require('../settings');
const { formatarData, plural } = require('../util/formatar');

/*
 * /defi: posições de liquidez cadastradas (por enquanto, da Orca).
 *   /defi -orca -position <endereço> [-nft <mint>] [-pool <endereço>]  → cadastra
 *   /defi -show [nº]   → "Position Details" de todas (ou da nº N)
 *   /defi -l           → lista as cadastradas
 *   /defi -rm <nº|all> → remove
 * O -nft e o -pool são opcionais: se vierem, o bot confere se batem com a posição.
 *
 * E o alerta de saída da faixa (a verificação fica em src/defi/alertas.js):
 *   /defi -alerta                         → lista os alertas
 *   /defi -alerta <nº|all> [-send <dest>] → avisa sempre que a posição sair da faixa:
 *                                           no seu privado ou no -send (email, e-mails,
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

/*
 * -alerta
 */
const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const ehEmail = (s) => /^e-?mail$/i.test(s) || EMAIL.test(s);

/**
 * Para onde vai o aviso da posição: "seu privado", "👥 Grupo", "📧 a@b.com".
 */
function descreverDestinoDoAlerta(p) {
    if (p.alert_email) return `📧 ${p.alert_email}`;
    if (p.alert_dest_id) return descreverDestino({ nome: p.alert_dest_name, grupo: p.alert_dest_is_group });
    return 'seu privado';
}

const ESTADO_DA_FAIXA = { 1: '✅ na faixa', 0: '⚠️ fora da faixa' };
const estadoDaFaixa = (p) => ESTADO_DA_FAIXA[p.in_range] ?? '❔ ainda não lida';
const cadaMinutos = () => plural(getSetting('defi.alerta.intervalMin'), 'minuto', 'minutos');

/**
 * O destino do -send: "email" (o QRCODE_EMAIL_SMTP_TO), um ou mais e-mails, ou
 * um contato, um grupo ou um número (vários com o nome: você escolhe na lista).
 * @returns {Promise<{ email?: string, id?: string, nome?: string, grupo?: boolean } | null>} null: já respondeu o erro
 */
async function destinoDoSend(msg, valor) {
    const partes = String(valor ?? '').split(/[\s,;]+/).filter(Boolean);

    if (!partes.length) {
        await msg.reply('❌ Informe o destino do -send: email, um e-mail, um contato, um grupo ou um número.\n' +
            '💡 _/defi -alerta 1 -send email, -send /Jorge Pereira/, -send /Grupo L200/ ou -send +5521999999999_');
        return null;
    }

    if (!partes.every(ehEmail)) return resolverOuEscolher(msg, valor, { opcao: '-send' });

    const emails = partes.flatMap(p => (/^e-?mail$/i.test(p)
        ? String(process.env.QRCODE_EMAIL_SMTP_TO ?? '').split(/\s*,\s*/)
        : [p])).map(e => e.trim());

    if (emails.some(e => !EMAIL.test(e))) {
        await msg.reply('❌ O "email" do -send usa o QRCODE_EMAIL_SMTP_TO, que está vazio (ou inválido) no config/.env. Informe o e-mail: -send voce@exemplo.com');
        return null;
    }
    if (!smtpParaEnviar()) {
        await msg.reply('❌ SMTP não configurado (QRCODE_EMAIL_SMTP_HOST e QRCODE_EMAIL_SMTP_USER no config/.env): o alerta não teria como sair por e-mail.');
        return null;
    }

    return { email: [...new Set(emails)].join(', ') };
}

async function listarAlertas(msg, posicoes) {
    const comAlerta = posicoes.map((p, i) => ({ p, n: i + 1 })).filter(({ p }) => p.alert);

    if (!comAlerta.length) {
        await msg.reply('🔕 Nenhum alerta no /defi.\n💡 _Ligue com /defi -alerta <nº> (avisa sempre que a posição sair da faixa)._');
        return;
    }

    await msg.reply(`🔔 *Alertas do /defi* (${comAlerta.length})\n\n` +
        comAlerta.map(({ p, n }) => `${n}. Orca · ${curto(p.position)} · ${estadoDaFaixa(p)} → ${descreverDestinoDoAlerta(p)}`).join('\n') +
        `\n\n💡 _Verificados a cada ${cadaMinutos()}. Desligue com /defi -alerta -rm <nº|all>._`);
}

async function tratarAlerta(msg, opts, posicoes, { comSend, sendTexto }) {
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
            : `🔕 Alerta desligado: Orca · ${curto(alvos[0].position)}`);
        return;
    }

    const alvo = String(o.alerta ?? '').trim().toLowerCase();

    if (!alvo) {
        if (comSend) {
            await msg.reply('❌ Informe a posição: /defi -alerta <nº|all> -send <destino>');
            return;
        }
        await listarAlertas(msg, posicoes);
        return;
    }

    const escolhidas = alvo === 'all' ? posicoes : [porNumero(alvo)].filter(Boolean);
    if (!escolhidas.length) {
        await msg.reply(alvo === 'all'
            ? '🌊 Nenhuma posição cadastrada.\n💡 _/defi -orca -position <endereço> -nft <mint> -pool <endereço>_'
            : `❌ Posição nº ${o.alerta} não existe. Veja a lista com /defi -l`);
        return;
    }

    let destino = {};
    if (comSend) {
        destino = await destinoDoSend(msg, sendTexto);
        if (!destino) return;
    }

    // O estado de agora vira a referência: o aviso sai quando a posição passar de dentro para fora
    const linhas = [];
    for (const p of escolhidas) {
        const naFaixa = await detalhesDaPosicao(p.position, p.pool)
            .then(d => (d.calculo.naFaixa ? 1 : 0))
            .catch((err) => {
                printError(`/defi -alerta ${p.position}:`, err.response?.status ?? '', err.message);
                return null;
            });

        await dbRun(`UPDATE defi_positions SET alert = 1, alert_dest_id = ?, alert_dest_name = ?,
            alert_dest_is_group = ?, alert_email = ?, in_range = ? WHERE id = ?`,
        [destino.id ?? null, destino.nome ?? null, destino.grupo ? 1 : 0, destino.email ?? null, naFaixa, p.id]);

        const atualizada = { ...p, in_range: naFaixa };
        linhas.push(`${posicoes.indexOf(p) + 1}. Orca · ${curto(p.position)} · ${estadoDaFaixa(atualizada)}` +
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
     * O -send aceita espaços (/Jorge Pereira/), que o parser de opções
     * separaria: sai do texto antes, e o resto é lido de novo.
     */
    const { destino: sendTexto, informado: comSend, resto } = extrairDestino(args, 'send');
    const opts = comSend ? GetOptFromCommand(resto, findCommand('/defi')) : optsDoComando;
    const o = opts.opt;

    if (comSend && !opts.given.has('alerta')) {
        await msg.reply('❌ O -send é do -alerta: /defi -alerta <nº|all> -send <destino>');
        return;
    }

    if (o.orca || opts.given.has('position')) {
        await cadastrar(msg, o);
        return;
    }

    const posicoes = await dbAll('SELECT * FROM defi_positions ORDER BY id');

    if (opts.given.has('alerta')) {
        await tratarAlerta(msg, opts, posicoes, { comSend, sendTexto });
        return;
    }

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
            posicoes.map((p, i) => `${i + 1}. Orca · ${curto(p.position)} · pool ${curto(p.pool)} _(desde ${formatarData(p.created_at).split(',')[0]})_` +
                (p.alert ? ' 🔔' : '')).join('\n') +
            '\n\n💡 _/defi -show mostra os detalhes; /defi -rm <nº> remove; 🔔 = com alerta (/defi -alerta)._');
        return;
    }

    await msg.reply('```' + getCommandSyntax('/defi') + '```');
}

module.exports = {
    barraDaFaixa,
    cmdDefi,
    descreverDestinoDoAlerta,
    textoDaPosicao
};
