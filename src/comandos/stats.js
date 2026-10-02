/*
 * Comando /stats.
 */

const { getCommandSyntax } = require('./base');
const { DAY_MS } = require('../constantes');
const { idsDoChatAtual } = require('../contatos');
const { dbAll, dbGet, dbPronto, dbRun } = require('../db');
const { aguardarEscolha, autorDe } = require('../escolhas');
const { getSetting } = require('../settings');
const { diaEHora, meuIdStats } = require('../stats');
const { fmtNum, plural, semAcentos } = require('../util/formatar');

/*
 * /stats [-N] [/chat/] [-me]
 * Estatísticas dos últimos N dias (padrão 7), vindas dos contadores da tabela stats:
 *   sem -me → ranking DESTE chat (ou do /chat/): quem mais fala, quem mais apaga e edita;
 *   com -me → as SUAS mensagens, somadas em todos os chats (ou só no /chat/).
 * Nos dois: mensagens por faixa de horário, horário e dia de pico.
 *   -l                → os chats que têm estatísticas
 *   -f /chat/         → apaga as de um chat (grupo, ou o privado com a pessoa)
 *   -flush-all        → apaga todas
 * O /chat/ é buscado pelo nome entre os chats com estatísticas; o -N pode vir
 * antes ou depois dele.
 */
const MEDALHAS = ['🥇', '🥈', '🥉'];

// 8 faixas de 3 horas com barra proporcional, horário e dia de pico
async function textoHorariosStats(filtro, params) {
    const porHora = await dbAll(`SELECT hour, SUM(msgs) AS msgs FROM stats WHERE ${filtro} GROUP BY hour`, params);
    const [porDia] = await dbAll(
        `SELECT day, SUM(msgs) AS msgs FROM stats WHERE ${filtro} GROUP BY day ORDER BY msgs DESC, day DESC LIMIT 1`,
        params
    );

    const faixas = Array.from({ length: 8 }, (_, i) => ({ ini: i * 3, msgs: 0 }));
    for (const h of porHora) faixas[Math.floor(h.hour / 3)].msgs += h.msgs;

    const maior = Math.max(...faixas.map(f => f.msgs));
    if (!maior) return '';

    const pico = porHora.reduce((a, b) => (b.msgs > a.msgs ? b : a));

    let texto = '\n🕐 *Por horário*\n```\n';
    for (const f of faixas) {
        const barra = '█'.repeat(Math.round((f.msgs / maior) * 10)) || (f.msgs ? '▏' : '');
        texto += `${String(f.ini).padStart(2, '0')}–${String(f.ini + 3).padStart(2, '0')}h ${barra.padEnd(10)} ${f.msgs}\n`;
    }
    texto += '```\n';
    texto += `⏰ *Horário de pico:* ${pico.hour}h–${(pico.hour + 1) % 24}h _(${fmtNum(pico.msgs)} ${pico.msgs === 1 ? 'msg' : 'msgs'})_\n`;

    if (porDia?.msgs) {
        const [a, m, d] = porDia.day.split('-');
        texto += `📅 *Dia mais movimentado:* ${d}/${m}/${a} _(${fmtNum(porDia.msgs)} ${porDia.msgs === 1 ? 'msg' : 'msgs'})_\n`;
    }

    return texto;
}

// Ranking de um chat: quem mais fala, apaga e edita
async function textoStatsDoChat(filtro, params, dias) {
    const pessoas = await dbAll(
        `SELECT sender_id,
                MAX(sender_name) AS nome,
                SUM(msgs) AS msgs,
                SUM(media) AS media,
                SUM(deleted) AS deleted,
                SUM(edited) AS edited
           FROM stats
          WHERE ${filtro}
          GROUP BY sender_id`,
        params
    );

    const total = pessoas.reduce((s, p) => s + p.msgs, 0);
    if (!total && !pessoas.some(p => p.deleted || p.edited)) return null;

    const { nome: nomeChat } = await dbGet(`SELECT MAX(chat_name) AS nome FROM stats WHERE ${filtro}`, params);
    const falantes = pessoas.filter(p => p.msgs > 0).sort((a, b) => b.msgs - a.msgs);
    const midia = pessoas.reduce((s, p) => s + p.media, 0);

    let texto = `📊 *Estatísticas${nomeChat ? ` de ${nomeChat}` : ''}*\n` +
                `_Últimos ${plural(dias, 'dia', 'dias')}_\n\n` +
                `💬 *Mensagens:* ${fmtNum(total)} _(média ${fmtNum(Math.round(total / dias))}/dia)_\n` +
                `📎 *Com mídia:* ${fmtNum(midia)}\n` +
                `👥 *Participantes ativos:* ${falantes.length}\n`;

    if (falantes.length) {
        texto += '\n🏆 *Quem mais fala*\n';
        falantes.slice(0, 10).forEach((p, i) => {
            const pct = Math.round((p.msgs / total) * 100);
            texto += `${MEDALHAS[i] || `${i + 1}.`} ${p.nome || p.sender_id} — *${fmtNum(p.msgs)}* _(${pct}%)_\n`;
        });
        if (falantes.length > 10) texto += `_+${falantes.length - 10} pessoa(s)_\n`;
    }

    // Quem mais apaga / edita (só aparece se alguém apagou/editou)
    for (const [campo, titulo] of [['deleted', '🗑️ *Quem mais apaga*'], ['edited', '✏️ *Quem mais edita*']]) {
        const lista = pessoas.filter(p => p[campo] > 0).sort((a, b) => b[campo] - a[campo]).slice(0, 5);
        if (!lista.length) continue;

        texto += `\n${titulo}\n`;
        lista.forEach((p, i) => { texto += `${i + 1}. ${p.nome || p.sender_id} — *${fmtNum(p[campo])}*\n`; });
    }

    return texto + await textoHorariosStats(filtro, params);
}

// As suas mensagens: em quais chats você mais fala (ou num chat só, com -c)
async function textoStatsMeu(filtro, params, dias, umChat) {
    const chats = await dbAll(
        `SELECT chat_id,
                MAX(chat_name) AS nome,
                MAX(is_group) AS is_group,
                SUM(msgs) AS msgs,
                SUM(media) AS media,
                SUM(deleted) AS deleted
           FROM stats
          WHERE ${filtro}
          GROUP BY chat_id`,
        params
    );

    const total = chats.reduce((s, c) => s + c.msgs, 0);
    const apagadas = chats.reduce((s, c) => s + c.deleted, 0);
    if (!total && !apagadas) return null;

    const midia = chats.reduce((s, c) => s + c.media, 0);
    const ativos = chats.filter(c => c.msgs > 0).sort((a, b) => b.msgs - a.msgs);

    let texto = `📊 *Suas estatísticas${umChat && chats[0]?.nome ? ` em ${chats[0].nome}` : ''}*\n` +
                `_Últimos ${plural(dias, 'dia', 'dias')}${umChat ? '' : ', todos os chats'}_\n\n` +
                `💬 *Mensagens:* ${fmtNum(total)} _(média ${fmtNum(Math.round(total / dias))}/dia)_\n` +
                `📎 *Com mídia:* ${fmtNum(midia)}\n`;

    if (apagadas) texto += `🗑️ *Apagadas por você:* ${fmtNum(apagadas)}\n`;

    if (!umChat && ativos.length) {
        texto += `👥 *Chats em que você falou:* ${ativos.length}\n`;
        texto += '\n🏆 *Onde você mais fala*\n';
        ativos.slice(0, 10).forEach((c, i) => {
            const pct = Math.round((c.msgs / total) * 100);
            const icone = c.is_group ? '👥' : '👤';
            texto += `${MEDALHAS[i] || `${i + 1}.`} ${icone} ${c.nome || c.chat_id.split('@')[0]} — *${fmtNum(c.msgs)}* _(${pct}%)_\n`;
        });
        if (ativos.length > 10) texto += `_+${ativos.length - 10} chat(s)_\n`;
    }

    return texto + await textoHorariosStats(filtro, params);
}

/**
 * "-10 /Grupo Familia/ -me" → { dias, alvo, me, list, flush, flushAll }, ou { erro }.
 * O alvo vem entre barras ou aspas (com espaços) ou como o resto das palavras.
 */
function lerStats(args) {
    const r = { dias: null, alvo: '', me: false, list: false, flush: false, flushAll: false };
    let resto = String(args ?? '');

    const delimitado = resto.match(/(^|\s)(\/[^/]+\/|"[^"]+"|'[^']+')(?=\s|$)/);
    if (delimitado) {
        r.alvo = delimitado[2].slice(1, -1).trim();
        resto = resto.replace(delimitado[2], ' ');
    }

    const palavras = [];
    for (const t of resto.split(/\s+/).filter(Boolean)) {
        const nome = t.startsWith('-') ? t.slice(1).toLowerCase() : null;
        if (nome === null) palavras.push(t);
        else if (/^\d+$/.test(nome)) r.dias = Number(nome);
        else if (nome === 'l' || nome === 'list') r.list = true;
        else if (nome === 'me') r.me = true;
        else if (nome === 'f' || nome === 'flush') r.flush = true;
        else if (nome === 'flush-all') r.flushAll = true;
        else return { erro: `❌ Opção desconhecida: ${t}` };
    }

    if (!r.alvo) r.alvo = palavras.join(' ');
    return r;
}

// Os chats com estatísticas, do que mais fala para o que menos
const chatsComStats = () => dbAll(
    `SELECT chat_id, MAX(chat_name) AS nome, MAX(is_group) AS grupo, SUM(msgs) AS msgs, MAX(day) AS ultimo
       FROM stats GROUP BY chat_id ORDER BY msgs DESC`
);

const descreverChat = (c) => `${c.grupo ? '👥' : '👤'} ${c.nome || c.chat_id.split('@')[0]}`;

/*
 * O chat com estatísticas cujo nome tem todas as palavras do alvo (o nome exato
 * ganha). Vários: lista e espera o nº, como no -to. Null: já respondeu.
 */
async function acharChat(msg, alvo) {
    const palavras = semAcentos(alvo).split(/\s+/).filter(Boolean);
    const chats = await chatsComStats();
    const casam = chats.filter(c => palavras.every(p => semAcentos(c.nome ?? '').includes(p)));
    const exato = casam.find(c => semAcentos(c.nome ?? '') === palavras.join(' '));

    if (exato || casam.length === 1) return exato ?? casam[0];
    if (!casam.length) {
        await msg.reply(`❌ Nenhum chat com estatísticas tem "${alvo}" no nome.\n💡 _Veja os que têm com /stats -l_`);
        return null;
    }

    await msg.reply(`🔎 "${alvo}" corresponde a ${casam.length} chats:\n\n` +
        casam.slice(0, 10).map((c, i) => `${i + 1}. ${descreverChat(c)}`).join('\n') +
        '\n\n💡 _Responda só com o nº (em até 2 minutos), ou repita o comando com mais palavras do nome._');
    return aguardarEscolha(msg.id?.remote ?? msg.from, casam.slice(0, 10), {
        autor: autorDe(msg),
        aoExpirar: () => msg.reply(`⌛ Nenhum nº escolhido para "${alvo}" em 2 minutos: nada foi feito.`)
    });
}

async function listarChats(msg) {
    const chats = await chatsComStats();
    if (!chats.length) {
        await msg.reply('📊 Nenhuma estatística guardada ainda.');
        return;
    }

    const data = (dia) => dia.split('-').reverse().slice(0, 2).join('/');
    await msg.reply(`📊 *Chats com estatísticas* (${chats.length})\n` +
        `_Até ${plural(getSetting('stats.retentionDays'), 'dia', 'dias')} guardados_\n\n` +
        chats.map((c, i) => `${i + 1}. ${descreverChat(c)} — ${fmtNum(c.msgs)} msgs _(última em ${data(c.ultimo)})_`).join('\n') +
        '\n\n💡 _/stats /nome/ mostra um; /stats -f /nome/ apaga as dele._');
}

async function cmdStats({ msg, args, chatId }) {
    await dbPronto;

    const r = lerStats(args);
    if (r.erro) {
        await msg.reply(`${r.erro}\n\n\`\`\`${getCommandSyntax('/stats')}\`\`\``);
        return;
    }

    if (r.list) {
        await listarChats(msg);
        return;
    }

    if (r.flushAll) {
        const { n } = await dbGet('SELECT COUNT(DISTINCT chat_id) AS n FROM stats');
        await dbRun('DELETE FROM stats');
        await msg.reply(`🗑️ Estatísticas apagadas: ${plural(n, 'chat', 'chats')}.`);
        return;
    }

    if (r.flush && !r.alvo) {
        await msg.reply('❌ Informe o chat: /stats -flush /Grupo/ (ou /stats -flush-all para todos).');
        return;
    }

    // O chat: o do alvo (/Grupo/) ou o atual; com -me sem alvo, todos
    let ids = r.me ? null : await idsDoChatAtual(chatId);
    let chat = null;
    if (r.alvo) {
        chat = await acharChat(msg, r.alvo);
        if (!chat) return;
        ids = await idsDoChatAtual(chat.chat_id);
    }

    if (r.flush) {
        await dbRun(`DELETE FROM stats WHERE chat_id IN (${ids.map(() => '?').join(', ')})`, ids);
        await msg.reply(`🗑️ Estatísticas de ${descreverChat(chat)} apagadas.`);
        return;
    }

    const maxDias = getSetting('stats.retentionDays');
    const dias = Math.min(r.dias ?? 7, maxDias);
    if (dias < 1) {
        await msg.reply('```' + getCommandSyntax('/stats') + '```');
        return;
    }

    const { day: desde } = diaEHora(Date.now() - (dias - 1) * DAY_MS);
    const condicoes = ['day >= ?'];
    const params = [desde];

    if (ids) {
        condicoes.push(`chat_id IN (${ids.map(() => '?').join(', ')})`);
        params.push(...ids);
    }

    if (r.me) {
        condicoes.push('sender_id = ?');
        params.push(meuIdStats());
    }

    const filtro = condicoes.join(' AND ');
    let texto = r.me
        ? await textoStatsMeu(filtro, params, dias, Boolean(chat))
        : await textoStatsDoChat(filtro, params, dias);

    if (!texto) {
        const onde = r.me ? (chat ? `suas em ${descreverChat(chat)}` : 'suas') : chat ? `de ${descreverChat(chat)}` : 'deste chat';
        await msg.reply(`📊 Sem estatísticas ${onde} nos últimos ${plural(dias, 'dia', 'dias')}.` +
            (getSetting('stats.enable') ? '' : '\n💡 _A contagem está desligada: /set stats.enable on_'));
        return;
    }

    texto += `\n💡 _/stats -N para outro período (máx. ${maxDias} dias)${r.me ? '' : '; /stats -me para as suas'}; /stats -l para os outros chats._`;
    await msg.reply(texto);
}

module.exports = {
    cmdStats
};
