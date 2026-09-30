/*
 * Comando /stats.
 */

const { client } = require('../cliente');
const { getCommandSyntax } = require('./base');
const { DAY_MS } = require('../constantes');
const { idsDoChatAtual } = require('../contatos');
const { dbAll, dbGet, dbPronto } = require('../db');
const { getSetting } = require('../settings');
const { diaEHora, meuIdStats } = require('../stats');
const { fmtNum, plural } = require('../util/formatar');

/*
 * /stats [-N] [-me] [-c <nome>] [-pv]
 * Estatísticas dos últimos N dias (padrão 7), vindas dos contadores da tabela stats:
 *   sem -me → ranking DESTE chat (ou do -c): quem mais fala, quem mais apaga e edita;
 *   com -me → as SUAS mensagens, somadas em todos os chats (ou só no -c): onde você mais fala.
 * Nos dois: mensagens por faixa de horário, horário e dia de pico.
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

async function cmdStats({ msg, opts, chatId }) {
    await dbPronto;

    const extras = opts.argv.filter(Boolean);
    const maxDias = getSetting('stats.retentionDays');
    let dias = 7;

    if (extras.length > 1) {
        await msg.reply('```' + getCommandSyntax('/stats') + '```');
        return;
    }

    if (extras.length === 1) {
        const m = extras[0].match(/^-?(\d+)$/);

        if (!m || Number(m[1]) < 1) {
            await msg.reply('```' + getCommandSyntax('/stats') + '```');
            return;
        }

        dias = Math.min(Number(m[1]), maxDias);
    }

    /*
     * Chats considerados:
     *   -c <nome> → o chat buscado pelo nome, entre os que têm estatísticas;
     *   -me       → todos (null);
     *   senão     → o chat atual.
     */
    let ids = opts.opt.me ? null : await idsDoChatAtual(chatId);

    if (opts.opt.chat) {
        const busca = String(opts.opt.chat).toLowerCase();
        const chats = await dbAll('SELECT chat_id, MAX(chat_name) AS chat_name FROM stats GROUP BY chat_id');
        const encontrados = chats.filter(c => (c.chat_name || '').toLowerCase().includes(busca));
        const exato = encontrados.find(c => c.chat_name.toLowerCase() === busca);

        if (!exato && encontrados.length !== 1) {
            await msg.reply(encontrados.length
                ? `🔎 "${opts.opt.chat}" corresponde a ${encontrados.length} chats. Seja mais específico:\n` +
                  encontrados.slice(0, 10).map(c => `• ${c.chat_name}`).join('\n')
                : `❌ Nenhum chat com estatísticas contém "${opts.opt.chat}".`);
            return;
        }

        ids = [(exato || encontrados[0]).chat_id];
    }

    const { day: desde } = diaEHora(Date.now() - (dias - 1) * DAY_MS);
    const condicoes = ['day >= ?'];
    const params = [desde];

    if (ids) {
        condicoes.push(`chat_id IN (${ids.map(() => '?').join(', ')})`);
        params.push(...ids);
    }

    if (opts.opt.me) {
        condicoes.push('sender_id = ?');
        params.push(meuIdStats());
    }

    const filtro = condicoes.join(' AND ');
    let texto = opts.opt.me
        ? await textoStatsMeu(filtro, params, dias, Boolean(opts.opt.chat))
        : await textoStatsDoChat(filtro, params, dias);

    if (!texto) {
        const onde = opts.opt.me ? (opts.opt.chat ? 'suas neste chat' : 'suas') : 'deste chat';
        await msg.reply(`📊 Sem estatísticas ${onde} nos últimos ${plural(dias, 'dia', 'dias')}.` +
            (getSetting('stats.enabled') ? '' : '\n💡 _A contagem está desligada: /set stats.enabled on_'));
        return;
    }

    texto += `\n💡 _/stats -N para outro período (máx. ${maxDias} dias)${opts.opt.me ? '' : '; /stats -me para as suas'}._`;

    if (opts.opt.pv) {
        await msg.reply('📊 Estatísticas enviadas no seu privado.');
        await client.sendMessage(client.info.wid._serialized, texto);
    } else {
        await msg.reply(texto);
    }
}

module.exports = {
    cmdStats
};
