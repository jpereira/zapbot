/*
 * Comando /defi.
 */

const { findCommand, getCommandSyntax } = require('./base');
const { client } = require('../cliente');
const { dbAll, dbGet, dbPronto, dbRun } = require('../db');
const { isEnderecoEvm } = require('../defi/hyperevm');
const { detalhesDaPosicao, validarPosicao } = require('../defi/orca');
const { posicoesDaCarteira } = require('../defi/prjx');
const { isEnderecoSolana } = require('../defi/solana');
const { descreverDestinos, destinosSalvos, extrairDestinos, recipientsDe, resolverDestinos } = require('../destinos');
const { printError } = require('../log');
const { GetOptFromCommand } = require('../opcoes');
const { getSetting } = require('../settings');
const { formatarData, plural } = require('../util/formatar');

/*
 * /defi: posições de liquidez cadastradas, da Orca (Solana) e do Project X (HyperEVM).
 *   /defi                      → o "Position Details" de todas
 *   /defi orca|prjx            → só das daquele protocolo
 *   /defi -l                   → lista os cadastros (endereço inteiro só no seu privado)
 *   /defi -rm <nº...|all>      → remove
 *   /defi orca -address <endereço> [-pool <endereço>] [-nft <mint>]  → cadastra uma posição
 *   /defi prjx -address <0x...>  → cadastra a carteira (o bot lê as posições dela)
 * O -nft e o -pool são opcionais: se vierem, o bot confere se batem com a posição.
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
 * @returns {Promise<{ naFaixa: boolean|null, textos: string[], foraDaFaixa: string[], taxasUsd: number|null }>}
 *   naFaixa: todas as posições na faixa (null: a carteira não tem nenhuma aberta)
 *   taxasUsd: as taxas a coletar em dólar (null: sem preço, num par sem stablecoin)
 */
async function lerCadastro(p) {
    if (p.protocol === 'prjx') {
        const posicoes = await posicoesDaCarteira(p.position);
        const comPreco = posicoes.filter(x => x.usd1 !== null);
        return {
            naFaixa: posicoes.length ? posicoes.every(x => x.naFaixa) : null,
            textos: posicoes.map(textoDaPosicaoPrjx),
            foraDaFaixa: posicoes.filter(x => !x.naFaixa).map(textoDaPosicaoPrjx),
            taxasUsd: comPreco.length ? comPreco.reduce((s, x) => s + x.taxa0 * x.usd0 + x.taxa1 * x.usd1, 0) : null
        };
    }

    const d = await detalhesDaPosicao(p.position, p.pool);
    const texto = textoDaPosicao(d);
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

const EXEMPLOS = '💡 _/defi orca -address <endereço> -pool <endereço> -nft <mint>\n/defi prjx -address <0x...>_';

// A palavra do protocolo: /defi orca, /defi prjx -address ...
const PALAVRAS = { orca: 'orca', prjx: 'prjx' };
const protocoloDe = (palavra) => PALAVRAS[String(palavra ?? '').toLowerCase()] ?? null;

async function limiteOuRepetida(msg, endereco) {
    if (await dbGet('SELECT 1 AS ok FROM defi_positions WHERE lower(position) = lower(?)', [endereco])) {
        await msg.reply(`ℹ️ ${curto(endereco)} já está cadastrada. Veja com /defi`);
        return true;
    }
    if ((await dbGet('SELECT COUNT(*) AS n FROM defi_positions')).n >= MAX_POSICOES) {
        await msg.reply(`❌ Limite de ${MAX_POSICOES} cadastros. Remova algum com /defi -rm <nº>`);
        return true;
    }
    return false;
}

// prjx -address <0x...>: guarda a carteira; as posições são lidas a cada -s
async function cadastrarCarteira(msg, o) {
    const carteira = String(o.address ?? '').trim().replace(/^<(.*)>$/, '$1');

    if (!carteira) {
        await msg.reply('❌ Informe a carteira: -address <0x...>\n💡 _/defi prjx -address 0x926024824BAEAf3ee0b7A2EEFA5A216743230444_');
        return;
    }
    if (!isEnderecoEvm(carteira)) {
        await msg.reply(`❌ -address: "${carteira}" não é um endereço da HyperEVM (0x e 40 caracteres hexadecimais).`);
        return;
    }
    if (await limiteOuRepetida(msg, carteira)) return;

    // Confere no RPC agora: endereço certo, mas sem posição aberta, cadastra e avisa
    let abertas;
    try {
        abertas = (await posicoesDaCarteira(carteira)).length;
    } catch (err) {
        printError(`/defi prjx ${carteira}:`, err.message);
        await msg.reply(`⚠️ Não consegui ler a carteira agora: ${err.message}.\n💡 _O RPC público da HyperEVM limita as consultas; um RPC próprio vai no setting defi.hyperevm.rpc._`);
        return;
    }

    await dbRun('INSERT INTO defi_positions (protocol, position, created_at) VALUES (?, ?, ?)', ['prjx', carteira.toLowerCase(), Date.now()]);
    await msg.reply(`✅ *Carteira do Project X cadastrada:* ${curto(carteira)}\n` +
        (abertas ? `📍 ${plural(abertas, 'posição aberta', 'posições abertas')}.` : 'ℹ️ Nenhuma posição aberta agora: o /defi prjx mostra quando houver.') +
        '\n💡 _Veja com /defi prjx_');
    return carteira.toLowerCase();
}

// O endereço cadastrado, ou null (o erro já foi respondido)
async function cadastrar(msg, o, protocolo) {
    if (!protocolo) {
        await msg.reply(`❌ Informe o protocolo: orca ou prjx, antes do -address.\n${EXEMPLOS}`);
        return null;
    }
    if (protocolo === 'prjx') return cadastrarCarteira(msg, o);

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

    if (await limiteOuRepetida(msg, endereco)) return;

    const r = await validarPosicao({ endereco, nft, pool });
    if (r.erro) {
        await msg.reply(r.erro);
        return;
    }

    await dbRun('INSERT INTO defi_positions (protocol, position, nft, pool, created_at) VALUES (?, ?, ?, ?, ?)',
        ['orca', endereco, r.posicao.mint, r.posicao.whirlpool, Date.now()]);

    await msg.reply(`✅ *Posição da Orca cadastrada:* ${curto(endereco)}\n💡 _Veja com /defi orca_`);
    return endereco;
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
            printError(`/defi ${p.position}:`, err.response?.status ?? '', err.message);
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

async function listarAlertas(msg, posicoes) {
    const comAlerta = posicoes.map((p, i) => ({ p, n: i + 1 })).filter(({ p }) => p.alert);

    if (!comAlerta.length) {
        await msg.reply('🔕 Nenhum alerta no /defi.\n💡 _Ligue com /defi -alerta <nº> (avisa quando a posição sair da faixa e quando voltar)._');
        return;
    }

    await msg.reply(`🔔 *Alertas do /defi* (${comAlerta.length})\n\n` +
        comAlerta.map(({ p, n }) => `${n}. ${descrever(p)} · ${estadoDaFaixa(p)}${limiteDasTaxas(p)} → ${descreverDestinoDoAlerta(p)}`).join('\n') +
        `\n\n💡 _Verificados a cada ${cadaMinutos()}. Desligue com /defi -alerta -rm <nº|all>._`);
}

async function tratarAlerta(msg, opts, posicoes, { comDestino, destinosTexto }) {
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
        const naFaixa = await lerCadastro(p)
            .then(({ naFaixa: f }) => (f === null ? null : f ? 1 : 0))
            .catch((err) => {
                printError(`/defi -alerta ${p.position}:`, err.response?.status ?? '', err.message);
                return null;
            });

        await dbRun(`UPDATE defi_positions SET alert = 1, alert_dest_id = ?, alert_dest_name = ?,
            alert_dest_is_group = ?, alert_email = ?, alert_recipients = ?, alert_fees = ?, fees_notified = 0, in_range = ?
            WHERE id = ?`,
        [destino.id ?? null, destino.email ? null : destino.nome ?? null, destino.grupo ? 1 : 0, destino.email ?? null,
            recipientsDe(destinos), limite ?? null, naFaixa, p.id]);

        const atualizada = { ...p, in_range: naFaixa, alert_fees: limite };
        linhas.push(`${posicoes.indexOf(p) + 1}. ${descrever(p)} · ${estadoDaFaixa(atualizada)}${limiteDasTaxas(atualizada)}` +
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
async function cadastrarComAlerta(msg, opts, protocolo, destino) {
    const o = opts.opt;
    let limite = null;
    if (opts.given.has('alerta')) {
        const v = String(o.alerta ?? '').trim().replace(/^\$/, '').replace(',', '.');
        limite = v ? Number(v) : null;
        if (v && !(limite > 0)) {
            await msg.reply('❌ No cadastro, o -alerta leva o limite das taxas em dólar (ex.: -alerta 2000) ou nada.');
            return;
        }
    }

    const endereco = await cadastrar(msg, o, protocolo);
    if (!endereco || !opts.given.has('alerta')) return;

    const posicoes = await dbAll('SELECT * FROM defi_positions ORDER BY id');
    const n = posicoes.findIndex(p => p.position.toLowerCase() === endereco.toLowerCase()) + 1;
    const taxas = o.taxas ?? (limite ? String(limite) : null);
    await tratarAlerta(msg, {
        opt: { ...o, alerta: String(n), taxas },
        given: new Set(['alerta', ...(taxas ? ['taxas'] : [])]),
        argv: []
    }, posicoes, destino);
}

// -rm 2, -rm 1 3 5, -rm 1,3 (os números da lista de antes) ou all; algum que não existe: nenhum sai
async function remover(msg, o, argv, posicoes) {
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
        ? `🗑️ Removido: ${descrever(removidos[0])}`
        : `🗑️ *Removidos* (${removidos.length})\n${removidos.map(p => `• ${descrever(p)}`).join('\n')}`);
}

// O 🔔 do alerta, com o limite das taxas se tiver (🔔 ≥ $2,000.00)
const sinoDoAlerta = (p) => (p.alert ? ` 🔔${p.alert_fees ? ` ≥ ${fmtUsd(p.alert_fees)}` : ''}` : '');

// A lista: no seu privado, os endereços inteiros; fora dele, abreviados
function textoDaLista(posicoes, noPrivado) {
    const endereco = (e) => (noPrivado ? e : curto(e));
    const linha = (p, i) => `${i + 1}. ${PROTOCOLOS[p.protocol] ?? p.protocol} · ` +
        (p.protocol === 'prjx' ? `carteira ${endereco(p.position)}` : `${endereco(p.position)} · pool ${endereco(p.pool)}`) +
        ` _(desde ${formatarData(p.created_at).split(',')[0]})_${sinoDoAlerta(p)}`;

    return `🌊 *Posições DeFi* (${posicoes.length})\n\n${posicoes.map(linha).join('\n')}\n\n` +
        '💡 _/defi mostra os detalhes; /defi -rm <nº> remove; 🔔 = com alerta (/defi -alerta), ≥ $ é o limite das taxas._';
}

async function cmdDefi({ msg, opts: optsDoComando, args, chatId }) {
    await dbPronto;

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

    // O protocolo vem como palavra: /defi orca, /defi prjx -address ...
    const palavra = opts.argv.find(protocoloDe);
    const argv = opts.argv.filter(a => a !== palavra);
    const protocolo = protocoloDe(palavra);

    if (opts.given.has('address')) {
        await cadastrarComAlerta(msg, opts, protocolo, { comDestino, destinosTexto });
        return;
    }

    const posicoes = await dbAll('SELECT * FROM defi_positions ORDER BY id');

    if (opts.given.has('alerta')) {
        await tratarAlerta(msg, opts, posicoes, { comDestino, destinosTexto });
        return;
    }

    if (opts.given.has('rm')) {
        await remover(msg, o, argv, posicoes);
        return;
    }

    const vazio = `🌊 Nenhuma posição cadastrada.\n${EXEMPLOS}`;

    if (o.list) {
        await msg.reply(posicoes.length ? textoDaLista(posicoes, chatId === client.info?.wid?._serialized) : vazio);
        return;
    }

    if (argv.length) {
        await msg.reply(`❌ "${argv[0]}" não é um protocolo: use orca ou prjx.\n\n\`\`\`${getCommandSyntax('/defi')}\`\`\``);
        return;
    }

    // /defi: o Position Details de todos; /defi orca ou /defi prjx: só dele
    const escolhidas = posicoes.filter(x => !protocolo || x.protocol === protocolo);
    if (!escolhidas.length) {
        await msg.reply(protocolo ? `🌊 Nada cadastrado ${protocolo === 'prjx' ? 'do Project X' : 'da Orca'}.\n${EXEMPLOS}` : vazio);
        return;
    }
    await mostrar(msg, escolhidas);
}

module.exports = {
    barraDaFaixa,
    cmdDefi,
    descrever,
    descreverDestinoDoAlerta,
    destinosDoAlerta,
    fmtUsd,
    lerCadastro,
    textoDaPosicao,
    textoDaPosicaoPrjx
};
