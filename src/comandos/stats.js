/*
 * Comando /stats.
 */

const { getCommandSyntax } = require('./base');
const { concluirAviso } = require('../cliente');
const { DAY_MS } = require('../constantes');
const { idsDoChatAtual } = require('../contatos');
const { dbAll, dbGet, dbPronto, dbRun } = require('../db');
const { aguardarEscolha, autorDe } = require('../escolhas');
const { t } = require('../i18n');
const { getSetting } = require('../settings');
const { diaEHora, meuIdStats } = require('../stats');
const { contar } = require('../util/contar');
const { fmtNum, semAcentos } = require('../util/formatar');

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

// "1 msg" / "3 msgs" (o número já formatado)
const msgs = (n) => t('stats.msgs', { n: n === 1 ? 1 : 2, count: fmtNum(n) });

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

    let texto = t('stats.hourTitle');
    for (const f of faixas) {
        const barra = '█'.repeat(Math.round((f.msgs / maior) * 10)) || (f.msgs ? '▏' : '');
        texto += `${String(f.ini).padStart(2, '0')}–${String(f.ini + 3).padStart(2, '0')}h ${barra.padEnd(10)} ${f.msgs}\n`;
    }
    texto += '```\n';
    texto += t('stats.peakHour', { from: pico.hour, to: (pico.hour + 1) % 24, msgs: msgs(pico.msgs) });

    if (porDia?.msgs) {
        const [a, m, d] = porDia.day.split('-');
        texto += t('stats.busiestDay', { date: `${d}/${m}/${a}`, msgs: msgs(porDia.msgs) });
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

    let texto = t('stats.chatHeader', {
        chat: nomeChat ? t('stats.of', { name: nomeChat }) : '',
        days: contar('stats.days', dias),
        total: fmtNum(total),
        avg: fmtNum(Math.round(total / dias)),
        media: fmtNum(midia),
        active: falantes.length
    });

    if (falantes.length) {
        texto += t('stats.topTalkers');
        falantes.slice(0, 10).forEach((p, i) => {
            const pct = Math.round((p.msgs / total) * 100);
            texto += `${MEDALHAS[i] || `${i + 1}.`} ${p.nome || p.sender_id} — *${fmtNum(p.msgs)}* _(${pct}%)_\n`;
        });
        if (falantes.length > 10) texto += t('stats.morePeople', { count: falantes.length - 10 });
    }

    // Quem mais apaga / edita (só aparece se alguém apagou/editou)
    for (const [campo, titulo] of [['deleted', t('stats.topDeleters')], ['edited', t('stats.topEditors')]]) {
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

    let texto = t('stats.myHeader', {
        chat: umChat && chats[0]?.nome ? t('stats.in', { name: chats[0].nome }) : '',
        days: contar('stats.days', dias),
        scope: umChat ? '' : t('stats.allChatsScope'),
        total: fmtNum(total),
        avg: fmtNum(Math.round(total / dias)),
        media: fmtNum(midia)
    });

    if (apagadas) texto += t('stats.deletedByYou', { count: fmtNum(apagadas) });

    if (!umChat && ativos.length) {
        texto += t('stats.activeChats', { count: ativos.length });
        texto += t('stats.whereTalk');
        ativos.slice(0, 10).forEach((c, i) => {
            const pct = Math.round((c.msgs / total) * 100);
            const icone = c.is_group ? '👥' : '👤';
            texto += `${MEDALHAS[i] || `${i + 1}.`} ${icone} ${c.nome || c.chat_id.split('@')[0]} — *${fmtNum(c.msgs)}* _(${pct}%)_\n`;
        });
        if (ativos.length > 10) texto += t('stats.moreChats', { count: ativos.length - 10 });
    }

    return texto + await textoHorariosStats(filtro, params);
}

// O alvo vem entre barras ou aspas (com espaços) ou como o resto das palavras; o -flush leva o chat de valor
const semBarras = (t) => String(t).replace(/^\/(.*)\/$/s, '$1').trim();

/**
 * "-10 /Grupo Familia/ -me" (já lido pelo parser) → { dias, alvo, me, list, flush, flushAll }.
 */
function lerStats(opts) {
    const palavras = [typeof opts.opt.flush === 'string' ? opts.opt.flush : '', ...opts.argv].filter(Boolean);
    return {
        dias: opts.numero,
        alvo: semBarras(palavras.join(' ')),
        me: opts.opt.me,
        list: opts.opt.list,
        flush: opts.given.has('flush'),
        flushAll: opts.opt['flush-all']
    };
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
        await msg.reply(t('stats.noChatHas', { text: alvo }));
        return null;
    }

    const pergunta = await msg.reply(t('stats.multiMatch', { text: alvo, count: casam.length }) +
        casam.slice(0, 10).map((c, i) => `${i + 1}. ${descreverChat(c)}`).join('\n') +
        t('stats.multiMatchFooter'));
    return aguardarEscolha(msg.id?.remote ?? msg.from, casam.slice(0, 10), {
        autor: autorDe(msg),
        aoExpirar: () => concluirAviso(msg, pergunta, t('stats.choiceExpired', { text: alvo }))
    });
}

async function listarChats(msg) {
    const chats = await chatsComStats();
    if (!chats.length) {
        await msg.reply(t('stats.none'));
        return;
    }

    const data = (dia) => dia.split('-').reverse().slice(0, 2).join('/');
    await msg.reply(t('stats.listHeader', { count: chats.length, days: contar('stats.days', getSetting('stats.retentionDays')) }) +
        chats.map((c, i) => t('stats.listLine', { n: i + 1, chat: descreverChat(c), msgs: fmtNum(c.msgs), date: data(c.ultimo) })).join('\n') +
        t('stats.listFooter'));
}

async function cmdStats({ msg, opts, chatId }) {
    await dbPronto;

    const r = lerStats(opts);

    if (r.list) {
        await listarChats(msg);
        return;
    }

    if (r.flushAll) {
        const { n } = await dbGet('SELECT COUNT(DISTINCT chat_id) AS n FROM stats');
        await dbRun('DELETE FROM stats');
        await msg.reply(t('stats.flushedAll', { chats: contar('stats.chats', n) }));
        return;
    }

    if (r.flush && !r.alvo) {
        await msg.reply(t('stats.flushNeedsChat'));
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
        await msg.reply(t('stats.flushedChat', { chat: descreverChat(chat) }));
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
        const onde = r.me ? (chat ? t('stats.whereMineIn', { chat: descreverChat(chat) }) : t('stats.whereMine')) : chat ? t('stats.whereOf', { chat: descreverChat(chat) }) : t('stats.whereHere');
        await msg.reply(t('stats.noneIn', { where: onde, days: contar('stats.days', dias) }) +
            (getSetting('stats.enable') ? '' : t('stats.countingOff')));
        return;
    }

    texto += t('stats.footerPeriod', { max: maxDias }) +
        (r.me ? '' : t('stats.footerMe')) +
        t('stats.footerList');
    await msg.reply(texto);
}

module.exports = {
    cmdStats
};
