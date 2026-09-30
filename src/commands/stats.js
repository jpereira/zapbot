/*
 * Comando /stats.
 */

const { client } = require('../client');
const { getCommandSyntax } = require('./base');
const { DAY_MS } = require('../constants');
const { chatCurrentIds } = require('../contacts');
const { dbAll, dbGet, dbReady } = require('../db');
const { getSetting } = require('../settings');
const { dayAndHour, myIdStats } = require('../stats');
const { fmtInA, plural } = require('../util/format');

/*
 * /stats [-N] [-me] [-c <nome>] [-pv]
 * Statistics for the last N days (default 7), from the stats table counters:
 * without -me → THIS chat's ranking (or the -c one): who talks, deletes and edits the most;
 * with -me → YOUR messages, summed across all chats (or only in -c): where you talk the most.
 * In both: messages per time band, peak time and day.
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

async function cmdStats({ msg, opts, chatId }) {
    await dbReady;

    const extras = opts.argv.filter(Boolean);
    const maxDays = getSetting('stats.retentionDays');
    let daysAlt = 7;

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

        daysAlt = Math.min(Number(m[1]), maxDays);
    }

    /*
     * Chats considerados:
     * -c <name> → the chat looked up by name, among those that have stats;
     *   -me       → todos (null);
     * otherwise → the current chat.
     */
    let ids = opts.opt.me ? null : await chatCurrentIds(chatId);

    if (opts.opt.chat) {
        const search = String(opts.opt.chat).toLowerCase();
        const chats = await dbAll('SELECT chat_id, MAX(chat_name) AS chat_name FROM stats GROUP BY chat_id');
        const foundAlt6 = chats.filter(c => (c.chat_name || '').toLowerCase().includes(search));
        const exact = foundAlt6.find(c => c.chat_name.toLowerCase() === search);

        if (!exact && foundAlt6.length !== 1) {
            await msg.reply(foundAlt6.length
                ? `🔎 "${opts.opt.chat}" corresponde a ${foundAlt6.length} chats. Seja mais específico:\n` +
                  foundAlt6.slice(0, 10).map(c => `• ${c.chat_name}`).join('\n')
                : `❌ Nenhum chat com estatísticas contém "${opts.opt.chat}".`);
            return;
        }

        ids = [(exact || foundAlt6[0]).chat_id];
    }

    const { day: since } = dayAndHour(Date.now() - (daysAlt - 1) * DAY_MS);
    const conditions = ['day >= ?'];
    const params = [since];

    if (ids) {
        conditions.push(`chat_id IN (${ids.map(() => '?').join(', ')})`);
        params.push(...ids);
    }

    if (opts.opt.me) {
        conditions.push('sender_id = ?');
        params.push(myIdStats());
    }

    const filter = conditions.join(' AND ');
    let textAlt = opts.opt.me
        ? await textStatsMy(filter, params, daysAlt, Boolean(opts.opt.chat))
        : await chatTextStats(filter, params, daysAlt);

    if (!textAlt) {
        const whereAlt = opts.opt.me ? (opts.opt.chat ? 'suas neste chat' : 'suas') : 'deste chat';
        await msg.reply(`📊 Sem estatísticas ${whereAlt} nos últimos ${plural(daysAlt, 'dia', 'dias')}.` +
            (getSetting('stats.enabled') ? '' : '\n💡 _A contagem está desligada: /set stats.enabled on_'));
        return;
    }

    textAlt += `\n💡 _/stats -N para outro período (máx. ${maxDays} dias)${opts.opt.me ? '' : '; /stats -me para as suas'}._`;

    if (opts.opt.pv) {
        await msg.reply('📊 Estatísticas enviadas no seu privado.');
        await client.sendMessage(client.info.wid._serialized, textAlt);
    } else {
        await msg.reply(textAlt);
    }
}

module.exports = {
    cmdStats
};
