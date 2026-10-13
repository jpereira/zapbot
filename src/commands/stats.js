/*
 * Comando /stats.
 */

const { getCommandSyntax } = require('./base');
const { completeNotice } = require('../client');
const { DAY_MS } = require('../constants');
const { chatCurrentIds } = require('../contacts');
const { dbAll, dbGet, dbReady, dbRun } = require('../db');
const { waitChoice, authorAlt } = require('../choices');
const { getSetting } = require('../settings');
const { dayAndHour, myIdStats } = require('../stats');
const { fmtInA, plural, withoutAccents } = require('../util/format');

/*
 * /stats [-N] [/chat/] [-me]
 * Statistics for the last N days (default 7), from the stats table counters:
 * without -me → THIS chat's ranking (or the /chat/ one): who talks, deletes and edits the most;
 * with -me → YOUR messages, summed across all chats (or only in /chat/).
 * In both: messages per time band, peak time and day.
 * -l                → the chats that have stats
 * -f /chat/         → deletes those of a chat (group, or the private chat with the person)
 *   -flush-all        → apaga todas
 * The /chat/ is looked up by name among the chats with stats; -N may come
 * before or after it.
 */
const MEDALS = ['🥇', '🥈', '🥉'];

// 8 bands of 3 hours with a proportional bar, time and peak day
async function textTimesStats(filter, params) {
    const byHour = await dbAll(`SELECT hour, SUM(msgs) AS msgs FROM stats WHERE ${filter} GROUP BY hour`, params);
    const [byDay] = await dbAll(
        `SELECT day, SUM(msgs) AS msgs FROM stats WHERE ${filter} GROUP BY day ORDER BY msgs DESC, day DESC LIMIT 1`,
        params
    );

    const ranges = Array.from({ length: 8 }, (_, i) => ({ ini: i * 3, msgs: 0 }));
    for (const h of byHour) ranges[Math.floor(h.hour / 3)].msgs += h.msgs;

    const greater = Math.max(...ranges.map(f => f.msgs));
    if (!greater) return '';

    const pico = byHour.reduce((a, b) => (b.msgs > a.msgs ? b : a));

    let textAlt = '\n🕐 *Por horário*\n```\n';
    for (const f of ranges) {
        const bar = '█'.repeat(Math.round((f.msgs / greater) * 10)) || (f.msgs ? '▏' : '');
        textAlt += `${String(f.ini).padStart(2, '0')}–${String(f.ini + 3).padStart(2, '0')}h ${bar.padEnd(10)} ${f.msgs}\n`;
    }
    textAlt += '```\n';
    textAlt += `⏰ *Horário de pico:* ${pico.hour}h–${(pico.hour + 1) % 24}h _(${fmtInA(pico.msgs)} ${pico.msgs === 1 ? 'msg' : 'msgs'})_\n`;

    if (byDay?.msgs) {
        const [a, m, d] = byDay.day.split('-');
        textAlt += `📅 *Dia mais movimentado:* ${d}/${m}/${a} _(${fmtInA(byDay.msgs)} ${byDay.msgs === 1 ? 'msg' : 'msgs'})_\n`;
    }

    return textAlt;
}

// A chat's ranking: who talks, deletes and edits the most
async function chatTextStats(filter, params, daysAlt) {
    const people = await dbAll(
        `SELECT sender_id,
                MAX(sender_name) AS nome,
                SUM(msgs) AS msgs,
                SUM(media) AS media,
                SUM(deleted) AS deleted,
                SUM(edited) AS edited
           FROM stats
          WHERE ${filter}
          GROUP BY sender_id`,
        params
    );

    const total = people.reduce((s, p) => s + p.msgs, 0);
    if (!total && !people.some(p => p.deleted || p.edited)) return null;

    const { nome: nameChat } = await dbGet(`SELECT MAX(chat_name) AS nome FROM stats WHERE ${filter}`, params);
    const speakers = people.filter(p => p.msgs > 0).sort((a, b) => b.msgs - a.msgs);
    const mediaAlt = people.reduce((s, p) => s + p.media, 0);

    let textAlt = `📊 *Estatísticas${nameChat ? ` de ${nameChat}` : ''}*\n` +
                `_Últimos ${plural(daysAlt, 'dia', 'dias')}_\n\n` +
                `💬 *Mensagens:* ${fmtInA(total)} _(média ${fmtInA(Math.round(total / daysAlt))}/dia)_\n` +
                `📎 *Com mídia:* ${fmtInA(mediaAlt)}\n` +
                `👥 *Participantes ativos:* ${speakers.length}\n`;

    if (speakers.length) {
        textAlt += '\n🏆 *Quem mais fala*\n';
        speakers.slice(0, 10).forEach((p, i) => {
            const pct = Math.round((p.msgs / total) * 100);
            textAlt += `${MEDALS[i] || `${i + 1}.`} ${p.nome || p.sender_id} — *${fmtInA(p.msgs)}* _(${pct}%)_\n`;
        });
        if (speakers.length > 10) textAlt += `_+${speakers.length - 10} pessoa(s)_\n`;
    }

    // Who deletes / edits the most (only shows if someone deleted/edited)
    for (const [campo, title] of [['deleted', '🗑️ *Quem mais apaga*'], ['edited', '✏️ *Quem mais edita*']]) {
        const list = people.filter(p => p[campo] > 0).sort((a, b) => b[campo] - a[campo]).slice(0, 5);
        if (!list.length) continue;

        textAlt += `\n${title}\n`;
        list.forEach((p, i) => { textAlt += `${i + 1}. ${p.nome || p.sender_id} — *${fmtInA(p[campo])}*\n`; });
    }

    return textAlt + await textTimesStats(filter, params);
}

// Your messages: in which chats you talk the most (or in a single chat, with -c)
async function textStatsMy(filter, params, daysAlt, umChat) {
    const chats = await dbAll(
        `SELECT chat_id,
                MAX(chat_name) AS nome,
                MAX(is_group) AS is_group,
                SUM(msgs) AS msgs,
                SUM(media) AS media,
                SUM(deleted) AS deleted
           FROM stats
          WHERE ${filter}
          GROUP BY chat_id`,
        params
    );

    const total = chats.reduce((s, c) => s + c.msgs, 0);
    const deletedAlt = chats.reduce((s, c) => s + c.deleted, 0);
    if (!total && !deletedAlt) return null;

    const mediaAlt = chats.reduce((s, c) => s + c.media, 0);
    const assets = chats.filter(c => c.msgs > 0).sort((a, b) => b.msgs - a.msgs);

    let textAlt = `📊 *Suas estatísticas${umChat && chats[0]?.nome ? ` em ${chats[0].nome}` : ''}*\n` +
                `_Últimos ${plural(daysAlt, 'dia', 'dias')}${umChat ? '' : ', todos os chats'}_\n\n` +
                `💬 *Mensagens:* ${fmtInA(total)} _(média ${fmtInA(Math.round(total / daysAlt))}/dia)_\n` +
                `📎 *Com mídia:* ${fmtInA(mediaAlt)}\n`;

    if (deletedAlt) textAlt += `🗑️ *Apagadas por você:* ${fmtInA(deletedAlt)}\n`;

    if (!umChat && assets.length) {
        textAlt += `👥 *Chats em que você falou:* ${assets.length}\n`;
        textAlt += '\n🏆 *Onde você mais fala*\n';
        assets.slice(0, 10).forEach((c, i) => {
            const pct = Math.round((c.msgs / total) * 100);
            const iconAlt = c.is_group ? '👥' : '👤';
            textAlt += `${MEDALS[i] || `${i + 1}.`} ${iconAlt} ${c.nome || c.chat_id.split('@')[0]} — *${fmtInA(c.msgs)}* _(${pct}%)_\n`;
        });
        if (assets.length > 10) textAlt += `_+${assets.length - 10} chat(s)_\n`;
    }

    return textAlt + await textTimesStats(filter, params);
}

/**
 * "-10 /Grupo Familia/ -me" → { days, target, me, list, flush, flushAll }, or { error }.
 * The target comes between slashes or quotes (with spaces) or as the rest of the words.
 */
function readStats(args) {
    const r = { dias: null, alvo: '', me: false, list: false, flush: false, flushAll: false };
    let rest = String(args ?? '');

    const delimited = rest.match(/(^|\s)(\/[^/]+\/|"[^"]+"|'[^']+')(?=\s|$)/);
    if (delimited) {
        r.alvo = delimited[2].slice(1, -1).trim();
        rest = rest.replace(delimited[2], ' ');
    }

    const words = [];
    for (const t of rest.split(/\s+/).filter(Boolean)) {
        const nameAlt = t.startsWith('-') ? t.slice(1).toLowerCase() : null;
        if (nameAlt === null) words.push(t);
        else if (/^\d+$/.test(nameAlt)) r.dias = Number(nameAlt);
        else if (nameAlt === 'l' || nameAlt === 'list') r.list = true;
        else if (nameAlt === 'me') r.me = true;
        else if (nameAlt === 'f' || nameAlt === 'flush') r.flush = true;
        else if (nameAlt === 'flush-all') r.flushAll = true;
        else return { erro: `❌ Opção desconhecida: ${t}` };
    }

    if (!r.alvo) r.alvo = words.join(' ');
    return r;
}

// The chats with stats, from the one that talks the most to the least
const chatsWithStats = () => dbAll(
    `SELECT chat_id, MAX(chat_name) AS nome, MAX(is_group) AS grupo, SUM(msgs) AS msgs, MAX(day) AS ultimo
       FROM stats GROUP BY chat_id ORDER BY msgs DESC`
);

const describeChat = (c) => `${c.grupo ? '👥' : '👤'} ${c.nome || c.chat_id.split('@')[0]}`;

/*
 * The chat with stats whose name has all the words of the target (the exact name
 * wins). Several: lists and waits for the no., as in -to. Null: already replied.
 */
async function findChat(msg, target) {
    const words = withoutAccents(target).split(/\s+/).filter(Boolean);
    const chats = await chatsWithStats();
    const match = chats.filter(c => words.every(p => withoutAccents(c.nome ?? '').includes(p)));
    const exact = match.find(c => withoutAccents(c.nome ?? '') === words.join(' '));

    if (exact || match.length === 1) return exact ?? match[0];
    if (!match.length) {
        await msg.reply(`❌ Nenhum chat com estatísticas tem "${target}" no nome.\n💡 _Veja os que têm com /stats -l_`);
        return null;
    }

    const question = await msg.reply(`🔎 "${target}" corresponde a ${match.length} chats:\n\n` +
        match.slice(0, 10).map((c, i) => `${i + 1}. ${describeChat(c)}`).join('\n') +
        '\n\n💡 _Responda só com o nº (em até 2 minutos), ou repita o comando com mais palavras do nome._');
    return waitChoice(msg.id?.remote ?? msg.from, match.slice(0, 10), {
        autor: authorAlt(msg),
        aoExpirar: () => completeNotice(msg, question, `⌛ Nenhum nº escolhido para "${target}" em 2 minutos: nada foi feito.`)
    });
}

async function listChats(msg) {
    const chats = await chatsWithStats();
    if (!chats.length) {
        await msg.reply('📊 Nenhuma estatística guardada ainda.');
        return;
    }

    const data = (day) => day.split('-').reverse().slice(0, 2).join('/');
    await msg.reply(`📊 *Chats com estatísticas* (${chats.length})\n` +
        `_Até ${plural(getSetting('stats.retentionDays'), 'dia', 'dias')} guardados_\n\n` +
        chats.map((c, i) => `${i + 1}. ${describeChat(c)} — ${fmtInA(c.msgs)} msgs _(última em ${data(c.ultimo)})_`).join('\n') +
        '\n\n💡 _/stats /nome/ mostra um; /stats -f /nome/ apaga as dele._');
}

async function cmdStats({ msg, args, chatId }) {
    await dbReady;

    const r = readStats(args);
    if (r.erro) {
        await msg.reply(`${r.erro}\n\n\`\`\`${getCommandSyntax('/stats')}\`\`\``);
        return;
    }

    if (r.list) {
        await listChats(msg);
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

    // The chat: the target's (/Grupo/) or the current one; with -me and no target, all
    let ids = r.me ? null : await chatCurrentIds(chatId);
    let chat = null;
    if (r.alvo) {
        chat = await findChat(msg, r.alvo);
        if (!chat) return;
        ids = await chatCurrentIds(chat.chat_id);
    }

    if (r.flush) {
        await dbRun(`DELETE FROM stats WHERE chat_id IN (${ids.map(() => '?').join(', ')})`, ids);
        await msg.reply(`🗑️ Estatísticas de ${describeChat(chat)} apagadas.`);
        return;
    }

    const maxDays = getSetting('stats.retentionDays');
    const daysAlt = Math.min(r.dias ?? 7, maxDays);
    if (daysAlt < 1) {
        await msg.reply('```' + getCommandSyntax('/stats') + '```');
        return;
    }

    const { day: since } = dayAndHour(Date.now() - (daysAlt - 1) * DAY_MS);
    const conditions = ['day >= ?'];
    const params = [since];

    if (ids) {
        conditions.push(`chat_id IN (${ids.map(() => '?').join(', ')})`);
        params.push(...ids);
    }

    if (r.me) {
        conditions.push('sender_id = ?');
        params.push(myIdStats());
    }

    const filter = conditions.join(' AND ');
    let textAlt = r.me
        ? await textStatsMy(filter, params, daysAlt, Boolean(chat))
        : await chatTextStats(filter, params, daysAlt);

    if (!textAlt) {
        const whereAlt = r.me ? (chat ? `suas em ${describeChat(chat)}` : 'suas') : chat ? `de ${describeChat(chat)}` : 'deste chat';
        await msg.reply(`📊 Sem estatísticas ${whereAlt} nos últimos ${plural(daysAlt, 'dia', 'dias')}.` +
            (getSetting('stats.enable') ? '' : '\n💡 _A contagem está desligada: /set stats.enable on_'));
        return;
    }

    textAlt += `\n💡 _/stats -N para outro período (máx. ${maxDays} dias)${r.me ? '' : '; /stats -me para as suas'}; /stats -l para os outros chats._`;
    await msg.reply(textAlt);
}

module.exports = {
    cmdStats
};
