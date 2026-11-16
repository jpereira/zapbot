/*
 * Comando /stats.
 */

const { commandUsage } = require('./base');
const { completeNotice } = require('../client');
const { DAY_MS } = require('../constants');
const { chatCurrentIds } = require('../contacts');
const { dbAll, dbGet, dbReady, dbRun } = require('../db');
const { waitChoice, authorAlt } = require('../choices');
const { t } = require('../i18n');
const { getSetting } = require('../settings');
const { dayAndHour, myIdStats } = require('../stats');
const { countAlt } = require('../util/count');
const { fmtInA, withoutAccents } = require('../util/format');

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

// "1 msg" / "3 msgs" (the number already formatted)
const msgs = (n) => t('stats.msgs', { n: n === 1 ? 1 : 2, count: fmtInA(n) });

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

    let textAlt = t('stats.hourTitle');
    for (const f of ranges) {
        const bar = '█'.repeat(Math.round((f.msgs / greater) * 10)) || (f.msgs ? '▏' : '');
        textAlt += `${String(f.ini).padStart(2, '0')}–${String(f.ini + 3).padStart(2, '0')}h ${bar.padEnd(10)} ${f.msgs}\n`;
    }
    textAlt += '```\n';
    textAlt += t('stats.peakHour', { from: pico.hour, to: (pico.hour + 1) % 24, msgs: msgs(pico.msgs) });

    if (byDay?.msgs) {
        const [a, m, d] = byDay.day.split('-');
        textAlt += t('stats.busiestDay', { date: `${d}/${m}/${a}`, msgs: msgs(byDay.msgs) });
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

    let textAlt = t('stats.chatHeader', {
        chat: nameChat ? t('stats.of', { name: nameChat }) : '',
        days: countAlt('stats.days', daysAlt),
        total: fmtInA(total),
        avg: fmtInA(Math.round(total / daysAlt)),
        media: fmtInA(mediaAlt),
        active: speakers.length
    });

    if (speakers.length) {
        textAlt += t('stats.topTalkers');
        speakers.slice(0, 10).forEach((p, i) => {
            const pct = Math.round((p.msgs / total) * 100);
            textAlt += `${MEDALS[i] || `${i + 1}.`} ${p.nome || p.sender_id} — *${fmtInA(p.msgs)}* _(${pct}%)_\n`;
        });
        if (speakers.length > 10) textAlt += t('stats.morePeople', { count: speakers.length - 10 });
    }

    // Who deletes / edits the most (only shows if someone deleted/edited)
    for (const [campo, title] of [['deleted', t('stats.topDeleters')], ['edited', t('stats.topEditors')]]) {
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

    let textAlt = t('stats.myHeader', {
        chat: umChat && chats[0]?.nome ? t('stats.in', { name: chats[0].nome }) : '',
        days: countAlt('stats.days', daysAlt),
        scope: umChat ? '' : t('stats.allChatsScope'),
        total: fmtInA(total),
        avg: fmtInA(Math.round(total / daysAlt)),
        media: fmtInA(mediaAlt)
    });

    if (deletedAlt) textAlt += t('stats.deletedByYou', { count: fmtInA(deletedAlt) });

    if (!umChat && assets.length) {
        textAlt += t('stats.activeChats', { count: assets.length });
        textAlt += t('stats.whereTalk');
        assets.slice(0, 10).forEach((c, i) => {
            const pct = Math.round((c.msgs / total) * 100);
            const iconAlt = c.is_group ? '👥' : '👤';
            textAlt += `${MEDALS[i] || `${i + 1}.`} ${iconAlt} ${c.nome || c.chat_id.split('@')[0]} — *${fmtInA(c.msgs)}* _(${pct}%)_\n`;
        });
        if (assets.length > 10) textAlt += t('stats.moreChats', { count: assets.length - 10 });
    }

    return textAlt + await textTimesStats(filter, params);
}

// The target comes between slashes or quotes (with spaces) or as the rest of the words; -flush takes the chat as its value
const withoutBars = (t) => String(t).replace(/^\/(.*)\/$/s, '$1').trim();

/**
 * "-10 /Grupo Familia/ -me" (already read by the parser) → { days, target, me, list, flush, flushAll }.
 */
function readStats(opts) {
    const words = [typeof opts.opt.flush === 'string' ? opts.opt.flush : '', ...opts.argv].filter(Boolean);
    return {
        dias: opts.numero,
        alvo: withoutBars(words.join(' ')),
        me: opts.opt.me,
        list: opts.opt.list,
        flush: opts.given.has('flush'),
        flushAll: opts.opt['flush-all']
    };
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
        await msg.reply(t('stats.noChatHas', { text: target }));
        return null;
    }

    const question = await msg.reply(t('stats.multiMatch', { text: target, count: match.length }) +
        match.slice(0, 10).map((c, i) => `${i + 1}. ${describeChat(c)}`).join('\n') +
        t('stats.multiMatchFooter'));
    return waitChoice(msg.id?.remote ?? msg.from, match.slice(0, 10), {
        autor: authorAlt(msg),
        aoExpirar: () => completeNotice(msg, question, t('stats.choiceExpired', { text: target }))
    });
}

async function listChats(msg) {
    const chats = await chatsWithStats();
    if (!chats.length) {
        await msg.reply(t('stats.none'));
        return;
    }

    const data = (day) => day.split('-').reverse().slice(0, 2).join('/');
    await msg.reply(t('stats.listHeader', { count: chats.length, days: countAlt('stats.days', getSetting('stats.retentionDays')) }) +
        chats.map((c, i) => t('stats.listLine', { n: i + 1, chat: describeChat(c), msgs: fmtInA(c.msgs), date: data(c.ultimo) })).join('\n') +
        t('stats.listFooter'));
}

async function cmdStats({ msg, opts, chatId }) {
    await dbReady;

    const r = readStats(opts);

    if (r.list) {
        await listChats(msg);
        return;
    }

    if (r.flushAll) {
        const { n } = await dbGet('SELECT COUNT(DISTINCT chat_id) AS n FROM stats');
        await dbRun('DELETE FROM stats');
        await msg.reply(t('stats.flushedAll', { chats: countAlt('stats.chats', n) }));
        return;
    }

    if (r.flush && !r.alvo) {
        await msg.reply(t('stats.flushNeedsChat'));
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
        await msg.reply(t('stats.flushedChat', { chat: describeChat(chat) }));
        return;
    }

    const maxDays = getSetting('stats.retentionDays');
    const daysAlt = Math.min(r.dias ?? 7, maxDays);
    if (daysAlt < 1) {
        await msg.reply(commandUsage('/stats'));
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
        const whereAlt = r.me ? (chat ? t('stats.whereMineIn', { chat: describeChat(chat) }) : t('stats.whereMine')) : chat ? t('stats.whereOf', { chat: describeChat(chat) }) : t('stats.whereHere');
        await msg.reply(t('stats.noneIn', { where: whereAlt, days: countAlt('stats.days', daysAlt) }) +
            (getSetting('stats.enable') ? '' : t('stats.countingOff')));
        return;
    }

    textAlt += t('stats.footerPeriod', { max: maxDays }) +
        (r.me ? '' : t('stats.footerMe')) +
        t('stats.footerList');
    await msg.reply(textAlt);
}

module.exports = {
    cmdStats
};
