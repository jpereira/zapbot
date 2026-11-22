/*
 * /show command: deleted messages, edited ones, deleted status and removed or changed reactions.
 */

const fs = require('fs-extra');

const { client, completeNotice } = require('../client');
const { commandUsage } = require('./base');
const { DAY_MS, MEDIA_DIR } = require('../constants');
const { chatCurrentIds } = require('../contacts');
const { dbAll, dbGet, dbReady, dbRun } = require('../db');
const { resolverDestination } = require('../destinations');
const { waitChoice, authorAlt } = require('../choices');
const { sendMessageDeleted, isStatus, resolverAuthorDeleted } = require('../events/deleted');
const { sendMessageEdited } = require('../events/edited');
const { sendReactionUndone } = require('../events/reactions');
const { t: tr } = require('../i18n');
const { printError, printInfo } = require('../log');
const { getSetting } = require('../settings');
const { humanSize, mediaIsPath } = require('../util/files');
const { countAlt } = require('../util/count');
const { wait, formatData, paraMs, withoutAccents } = require('../util/format');
const { isChannelAlt } = require('../util/origin');
const { matchingRows, regexTest } = require('../util/regexRunner');
const { regexDangerous } = require('../util/safeRegex');
const { compileSearch } = require('../watch/rules');

/*
 * /show [-N] [-d] [-e] [-s] [-r] [chat]: re-shows what is in the cache, in the
 * same format as the alerts: the DELETED (-d), the EDITED (-e), the STATUS
 * deleted (-s) and the removed or changed REACTIONS (-r), which add up. Without
 * none of the four: with a chat (or in the search across all), all together, by date;
 * otherwise, only this chat's deleted ones.
 * /show              → in private, lists the cache; in a group, the last deleted one
 * /show -3           → the last 3
 * /show -2 /^Maria/ → the last 2 (deleted, edited or status) of the chat that matches
 * /show -e Trabalho  → the last edited one of the chat with "Trabalho" in the name
 * /show 2            → the last one of chat no. 2 of the last -l
 * /show -list        → the chats with something in the cache
 * /show -l trab      → only the chats that match (no., name, @mention or /regex/)
 * /show -flush       → removes the deleted ones of this chat (in your private chat: of all chats)
 * /show -flush -yes  → removes everything of the scope: deleted, edited, status and reactions (with their media files)
 * /show -q pix       → the ones that have "pix" (case and accent insensitive;
 * or /regex/flags: -q /pix|boleto/i);
 * in this chat, in the requested chat or, in your private chat, in all.
 * Without -N: the 5 most recent
 * The chat: the no. from the -l list, part of the name, @mention or /regex/. In a private chat,
 * the status are the person's. Sends in chronological order: the last one is the most recent.
 * Whoever has a @lid id and a @c.us may appear twice in -l (it is the same
 * person, just with an identity crisis).
 */
const SEARCH_DEFAULT = 5;
const STATUS = 'status@broadcast';

// What changes among the deleted (-d), the edited (-e), the status (-s) and the reactions (-r)
const TYPES = {
    apagadas: {
        key: 'apagadas',
        opt: 'deleted',
        flag: '-d',
        table: 'messages',
        filter: `revoked = 1 AND chat_id <> '${STATUS}'`,
        doChat: 'chat_id',          // which chat it is (in status: which person)
        name: 'chat_name',
        group: 'is_group',
        when: 'revoked_at',
        order: 'revoked_at DESC, timestamp DESC',
        retention: 'cache.revokedRetentionDays',
        withMedia: true,
        texts: (r) => [r.body],
        icon: '♻️',
        listIcon: '🗑️'
    },
    editadas: {
        key: 'editadas',
        opt: 'edited',
        flag: '-e',
        table: 'message_edits',
        filter: '1 = 1',
        doChat: 'chat_id',
        name: 'chat_name',
        group: 'is_group',
        when: 'edited_at',
        order: 'edited_at DESC, id DESC',
        retention: 'cache.editedRetentionDays',
        withMedia: false,
        texts: (r) => [r.old_body, r.new_body],
        icon: '✏️',
        listIcon: '✏️'
    },
    status: {
        key: 'status',
        opt: 'status',
        flag: '-s',
        table: 'messages',
        filter: `revoked = 1 AND chat_id = '${STATUS}'`,
        doChat: 'sender_jid',
        name: 'sender_name',
        group: '0',
        when: 'revoked_at',
        order: 'revoked_at DESC, timestamp DESC',
        retention: 'cache.revokedRetentionDays',
        withMedia: true,
        texts: (r) => [r.body],
        icon: '📸',
        listIcon: '📸'
    },
    reacoes: {
        key: 'reacoes',
        opt: 'reaction',
        flag: '-r',
        table: 'reaction_changes',
        filter: '1 = 1',
        doChat: 'chat_id',
        name: 'chat_name',
        group: 'is_group',
        when: 'changed_at',
        order: 'changed_at DESC, id DESC',
        retention: 'cache.reactionRetentionDays',
        withMedia: false,
        texts: (r) => [r.old_reaction, r.new_reaction, r.body],
        icon: '😶',
        listIcon: '😶'
    }
};

// Several types together: what changes in the texts
const TOGETHER = { key: 'juntos', icon: '🗄️' };

// The texts of a type (or of JUNTOS): show.<key>.<field>
const tx = (type, field, vars) => tr(`show.${type.key}.${field}`, vars);

// The type filter, only on the ids (null: of all chats)
function whereAltAlt(t, ids) {
    if (!ids) return { where: t.filter, params: [] };
    const marks = ids.map(() => '?').join(', ');
    return { where: `${t.filter} AND ${t.doChat} IN (${marks})`, params: ids };
}

/*
 * Numbering of the last -l (index → chat_id). We keep the snapshot because the
 * the list order changes with every new message in the cache: without it, "chat 2"
 * could point to another chat between -l and /show 2.
 */
let chatsLastList = [];

// The chats with something in the cache (in status, the person), in the -l order
function chatsDoCache() {
    const partsAlt = Object.entries(TYPES).map(([type, t]) =>
        `SELECT ${t.doChat} AS chat_id, ${t.name} AS chat_name, ${t.group} AS is_group,
                '${type}' AS type, ${t.when} AS "when"
           FROM ${t.table}
          WHERE ${t.filter}`);

    return dbAll(
        `SELECT chat_id,
                MAX(chat_name) AS chat_name,
                MAX(is_group) AS is_group,
                ${Object.keys(TYPES).map(type => `SUM(type = '${type}') AS ${type},`).join('\n                ')}
                COUNT(*) AS total,
                MAX("when") AS last
           FROM (${partsAlt.join(' UNION ALL ')})
          WHERE chat_id IS NOT NULL
          GROUP BY chat_id
          ORDER BY total DESC, last DESC`
    );
}

const chatNameAlt = (c) => c.chat_name || c.chat_id.split('@')[0];
const describeChat = (c) => `${isChannelAlt(c.chat_id) ? '📰' : c.is_group ? '👥' : '👤'} ${chatNameAlt(c)}`;
// Like withoutAccents, but without touching case: \D and \d are very different things in a regex
const removeAccents = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const paraTarget = async (c) => ({ ids: await chatCurrentIds(c.chat_id), name: chatNameAlt(c) });

/**
 * The cache chats that match the text: @mention, the no. from the last
 * -l, /regex/ or the name (all the words), regardless of case or
 * accents. Replies the error when none matches.
 * @returns {Promise<{ matches: object[], exact?: object, mention?: object } | null>} null: already replied
 */
async function chatsThatMatch(msg, textAlt, chats, { number: numberAlt = true } = {}) {
    if (/^@\d+$/.test(textAlt)) {
        const r = await resolverDestination(textAlt, { mentions: msg.mentionedIds ?? [] });
        if (r.error) {
            await msg.reply(r.error);
            return null;
        }
        const ids = await chatCurrentIds(r.id);
        return { matches: chats.filter(c => ids.includes(c.chat_id)), mention: { ids, name: r.name } };
    }

    if (numberAlt && /^\d+$/.test(textAlt)) {
        const list = chatsLastList.length ? chatsLastList : chats.map(c => c.chat_id);
        const chat = chats.find(c => c.chat_id === list[Number(textAlt) - 1]);
        if (!chat) {
            await msg.reply(tr('show.chatNotFound', { n: textAlt }));
            return null;
        }
        return { matches: [chat], exact: chat };
    }

    let match;
    let exact;
    const regex = textAlt.match(/^\/(.+)\/$/);

    if (regex) {
        if (regexDangerous(regex[1])) {
            await msg.reply(tr('show.regexRisky', { text: textAlt }));
            return null;
        }
        let re;
        try {
            re = new RegExp(removeAccents(regex[1]), 'i');
        } catch (err) {
            await msg.reply(tr('show.regexInvalid', { text: textAlt, error: err.message }));
            return null;
        }
        match = await matchingRows(regexTest(re), chats, c => [removeAccents(chatNameAlt(c))]);
    } else {
        // "@Maria Lucia" typed, without picking from the @ list: the name counts
        const words = withoutAccents(textAlt.replace(/^@/, '')).split(/\s+/).filter(Boolean);
        match = chats.filter(c => words.every(p => withoutAccents(chatNameAlt(c)).includes(p)));
        exact = match.find(c => withoutAccents(chatNameAlt(c)) === words.join(' '));
    }

    if (!match.length) {
        await msg.reply(tr('show.noChatMatches', { text: textAlt }));
        return null;
    }
    return { matches: match, exact };
}

/**
 * O chat request (see o chatsQueCasam; o name exact ganha).
 * Several: lists and waits for the no., as in /stats.
 * `chats` swaps the list to search from (/tldr uses the chats with stored messages, without the -l no.).
 * @returns {Promise<{ ids: string[], name: string } | null>} null: already replied
 */
async function resolverTarget(msg, textAlt, { chats: yourChats } = {}) {
    // The mention counts even with nothing in the cache: the reply says there is nothing of theirs
    const chats = yourChats ?? await chatsDoCache();
    if (!chats.length && !/^@\d+$/.test(textAlt)) {
        await msg.reply(tr('show.cacheEmpty'));
        return null;
    }

    const r = await chatsThatMatch(msg, textAlt, chats, { number: !yourChats });
    if (!r) return null;
    if (r.mention) return r.mention;

    const { matches: match, exact } = r;
    if (exact || match.length === 1) return paraTarget(exact ?? match[0]);

    const optionsAlt = match.slice(0, 10);
    const question = await msg.reply(tr('show.multiMatch', { text: textAlt, count: match.length }) +
        optionsAlt.map((c, i) => `${i + 1}. ${describeChat(c)}`).join('\n') +
        tr('show.multiMatchFooter'));

    const chosen = await waitChoice(msg.id?.remote ?? msg.from, optionsAlt, {
        author: authorAlt(msg),
        onExpire: () => completeNotice(msg, question, tr('show.choiceExpired', { text: textAlt }))
    });
    return chosen ? paraTarget(chosen) : null;
}

/*
 * /show -list [chat] (the types do not change the list)
 * What is in the cache, by type, and the numbered chats (the /show <no.> number),
 * with the current chat marked. With a chat (no., name, @mention or /regex/): only the
 * that match, with the full list no., and the calculations of only those.
 */
async function listCache({ msg, chatId, filter }) {
    const idsDoChat = await chatCurrentIds(chatId);
    const allOsChats = await chatsDoCache();

    let chats = allOsChats;
    let ids = null;
    let de = null;
    if (filter) {
        const r = await chatsThatMatch(msg, filter, allOsChats);
        if (!r) return;

        // With the other ids of the same person (@lid and @c.us)
        ids = [...new Set([
            ...(r.mention?.ids ?? []),
            ...(await Promise.all(r.matches.map(c => chatCurrentIds(c.chat_id)))).flat()
        ])];
        chats = allOsChats.filter(c => ids.includes(c.chat_id));
        // A single chat: its name (the "2" of -l 2 says nothing); several: what was typed
        de = r.mention?.name ?? (r.matches.length === 1 ? chatNameAlt(r.matches[0]) : filter);
        if (!chats.length) {
            await msg.reply(tr('show.listNothingOf', { name: de }));
            return;
        }
    }

    let textAlt = de ? tr('show.listTitleOf', { name: de }) : tr('show.listTitle');

    for (const t of Object.values(TYPES)) {
        const { where, params } = whereAltAlt(t, ids);
        const summary = await dbGet(
            `SELECT COUNT(*) AS total,
                    ${t.withMedia ? 'COALESCE(SUM(has_media), 0)' : '0'} AS with_media,
                    MIN(${t.when}) AS oldest
               FROM ${t.table}
              WHERE ${where}`,
            params
        );

        const details = [];
        if (summary.with_media > 0) details.push(tr('show.withMedia', { count: summary.with_media }));

        if (summary.total > 0 && summary.oldest) {
            const expiresIn = paraMs(summary.oldest) + getSetting(t.retention) * DAY_MS;
            const daysAlt = Math.max(0, Math.ceil((expiresIn - Date.now()) / DAY_MS));
            details.push(tr('show.oldestExpires', { days: countAlt('show.days', daysAlt) }));
        }

        textAlt += `${t.listIcon} *${tx(t, 'label')}:* ${summary.total}`;
        textAlt += details.length ? ` _(${details.join(' · ')})_\n` : '\n';
    }

    // The numbering is always that of the full list: /show <no.> works with or without a filter
    chatsLastList = allOsChats.map(c => c.chat_id);

    const line = (c) => {
        const accounts = Object.entries(TYPES)
            .filter(([type]) => c[type] > 0)
            .map(([type, t]) => `${t.listIcon} ${c[type]}`)
            .join(' · ');
        const current = idsDoChat.includes(c.chat_id) ? tr('show.thisChat') : '';
        const n = chatsLastList.indexOf(c.chat_id) + 1;
        return tr('show.listLine', { n, chat: describeChat(c), counts: accounts, date: formatData(c.last), current: current });
    };

    if (chats.length) {
        textAlt += '\n';
        chats.forEach((c) => { textAlt += line(c); });

        textAlt += tr('show.listHint', { max: getSetting('show.max') });
    }

    await msg.reply(textAlt);
}

/*
 * /show -flush: removes the requested types from the cache (media leaves the disk too; with -yes, all the types):
 * - with a chat (/show -f Trabalho) → only its own;
 * - in any chat            → only those of THIS chat;
 * - in your own private chat       → those of ALL chats.
 * Destructive: -flush is for the owner and admins (role in commands.js), even if /show is opened up.
 */
async function cacheClean({ msg, types, target, ids, general, cmd }) {
    const removed = [];
    const byChat = new Map();
    let files = 0;
    let bytes = 0;

    for (const type of types) {
        const t = TYPES[type];
        const { where, params } = whereAltAlt(t, general ? null : ids);

        // What will go out, per chat, BEFORE deleting: for the general summary
        if (general) {
            const chats = await dbAll(
                `SELECT ${t.doChat} AS chat_id,
                        MAX(${t.name}) AS chat_name,
                        MAX(${t.group}) AS is_group,
                        COUNT(*) AS total
                   FROM ${t.table}
                  WHERE ${where}
                  GROUP BY ${t.doChat}`,
                params
            );
            for (const c of chats) {
                const beforeAlt = byChat.get(c.chat_id)?.total ?? 0;
                byChat.set(c.chat_id, { ...c, total: c.total + beforeAlt });
            }
        }

        if (t.withMedia) {
            const mediaAltAlt = await dbAll(
                `SELECT media_path FROM ${t.table} WHERE ${where} AND media_path IS NOT NULL`, params);

            for (const { media_path } of mediaAltAlt) {
                if (!mediaIsPath(media_path)) continue;

                try {
                    bytes += fs.statSync(media_path).size;
                    fs.unlinkSync(media_path);
                    files++;
                } catch {
                    // file no longer exists
                }
            }
        }

        const res = await dbRun(`DELETE FROM ${t.table} WHERE ${where}`, params);
        removed.push({ t, n: res.changes });
    }

    const total = removed.reduce((sum, r) => sum + r.n, 0);
    const u = types.length === 1 ? TYPES[types[0]] : TOGETHER;

    if (!total) {
        await msg.reply(general
            ? tr('show.noneAll', { icon: u.icon, none: tx(u, 'none') })
            : target
                ? tr('show.noneOf', { icon: u.icon, none: tx(u, 'none'), name: target.name })
                : tr('show.noneHere', { icon: u.icon, none: tx(u, 'none'), registered: tx(u, 'registered') }));
        return;
    }

    const accounts = removed.map(r => `${r.n} ${tx(r.t, 'label').toLowerCase()}`).join(', ');
    printInfo(`/show -flush (${general ? 'general' : target?.name ?? ids[0]}): ${accounts}; ${files} files removed`);

    let textAlt = general
        ? tr('show.flushAll')
        : target
            ? tr('show.flushOf', { name: target.name })
            : tr('show.flushHere');

    for (const { t, n } of removed) {
        textAlt += `${t.listIcon} ${tx(t, 'label')}: *${countAlt(`show.${t.key}.count`, n)}*\n`;
    }

    if (removed.some(r => r.t.withMedia)) {
        textAlt += tr('show.flushMedia', { count: files, size: files ? ` _(${humanSize(bytes)})_` : '' });
    }

    if (general) {
        const LIMIT = 10;
        const chats = [...byChat.values()].sort((a, b) => b.total - a.total);

        textAlt += tr('show.flushPerChat', { count: chats.length });
        chats.slice(0, LIMIT).forEach((c, i) => {
            textAlt += `${i + 1}. ${describeChat(c)} — *${c.total}*\n`;
        });
        if (chats.length > LIMIT) textAlt += tr('show.flushMore', { count: chats.length - LIMIT });
    } else if (!target) {
        textAlt += tr('show.flushHint', { cmd });
    }

    await msg.reply(textAlt);
}

// Resend of an item, by type (the status is a deleted one with its own title)
async function resendDeleted(destination, row, i, total) {
    const info = await resolverAuthorDeleted(row);

    await sendMessageDeleted(destination, row, info, {
        title: tr(isStatus(row) ? 'show.deletedStatusTitle' : 'show.deletedTitle', { i: i + 1, total }),
        extras: [tr('show.deletedAt', { date: formatData(row.revoked_at) })]
    });
}

const RESEND_CACHE = {
    apagadas: resendDeleted,
    status: resendDeleted,
    editadas: async (destination, row, i, total) => {
        await sendMessageEdited(destination, row, {
            chatName: row.chat_name || tr('show.unknownChat'),
            senderName: row.sender_name || tr('show.unknownSender'),
            senderNumber: row.sender_number || null
        }, { title: tr('show.editedTitle', { i: i + 1, total }) });
    },
    reacoes: (destination, row, i, total) => sendReactionUndone(destination, row, { count: `${i + 1}/${total}` })
};

// "♻️ *2 messages deleted*" (one type) or "🗄️ *3 messages* (🗑️ 2 · 📸 1)" (several)
function itemsSummary(types, rows) {
    if (types.length === 1) {
        const t = TYPES[types[0]];
        return `${t.icon} *${countAlt(`show.${t.key}.summary`, rows.length)}*`;
    }

    const accounts = Object.entries(TYPES)
        .map(([type, t]) => [t, rows.filter(r => r.type === type).length])
        .filter(([, n]) => n)
        .map(([t, n]) => `${t.listIcon} ${n}`);
    const total = countAlt('show.juntos.summary', rows.length);
    return `${TOGETHER.icon} *${total}* (${accounts.join(' · ')})`;
}


/*
 * /show -all (-a): the general history of a chat, kept in the messages table (not just the deleted ones) and in
 * cache/media: even deleting messages on the phone or on WhatsApp Web, the bot keeps them (for
 * cache.messageRetentionHours). It never dumps a whole chat: with more messages than show.max, it summarizes by
 * month, then by day, then by hour, and says how to go down a level:
 *   /show -a /Fulano/                   → the months (total, with media)
 *   /show -a /Fulano/ 2026-11           → the days of the month
 *   /show -a /Fulano/ 2026-11-19        → the hours of the day (or the messages, if there are few)
 *   /show -a /Fulano/ 2026-11-19 14h    → the messages of that hour (in parts of show.max: p2, p3...)
 *   /show -a -5 /Fulano/                → the last 5       /show -a -q boleto /Fulano/ → searches the history
 */
const HISTORY_TZ = 'America/Sao_Paulo';
const hoursFormat = new Intl.DateTimeFormat('en-CA', {
    timeZone: HISTORY_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
});

// { month: '2026-11', day: '2026-11-19', hour: '14' } of a timestamp, in the bot's time zone
function whenOf(ms) {
    const p = Object.fromEntries(hoursFormat.formatToParts(ms).map(x => [x.type, x.value]));
    return { month: `${p.year}-${p.month}`, day: `${p.year}-${p.month}-${p.day}`, hour: p.hour };
}

const pad2 = (n) => String(n).padStart(2, '0');
const validDay = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * Separates what is a period (2026-05, 2026-05-05, 05/05/2026, 05/05, today, yesterday, 14h, p2) from the
 * words of the chat. { period: { month?, day?, hour? }, page, rest: string[] } or { error } ready to reply.
 */
function readPeriod(words) {
    const now = whenOf(Date.now());
    const period = {};
    const rest = [];
    let page = 1;
    let day = null;
    let month = null;

    // The date typed → { y, mo, d } (d null: a month), or null when it is not a date
    const asDate = (w) => {
        let m;
        if ((m = w.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/))) return { y: Number(m[1]), mo: Number(m[2]), d: m[3] ? Number(m[3]) : null };
        if ((m = w.match(/^(\d{1,2})\/(\d{4})$/))) return { y: Number(m[2]), mo: Number(m[1]), d: null };
        if ((m = w.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return { y: Number(m[3]), mo: Number(m[2]), d: Number(m[1]) };
        if ((m = w.match(/^(\d{1,2})\/(\d{1,2})$/))) return { y: Number(now.month.slice(0, 4)), mo: Number(m[2]), d: Number(m[1]) };
        return null;
    };

    for (const w of words) {
        let m;
        if ((m = w.match(/^p(\d+)$/i))) {
            page = Math.max(1, Number(m[1]));
        } else if ((m = w.match(/^(\d{1,2})(?:h|:00)$/i))) {
            if (Number(m[1]) > 23) return { error: tr('show.history.badDate', { text: w }) };
            period.hour = pad2(m[1]);
        } else if (/^(hoje|today)$/i.test(w) || /^(ontem|yesterday)$/i.test(w)) {
            if (day || month) return { error: tr('show.history.manyDates') };
            day = /^(hoje|today)$/i.test(w) ? now.day : whenOf(Date.now() - DAY_MS).day;
        } else if (asDate(w)) {
            const { y, mo, d } = asDate(w);
            if (!validDay(y, mo, d ?? 1)) return { error: tr('show.history.badDate', { text: w }) };
            if (day || month) return { error: tr('show.history.manyDates') };
            if (d == null) month = `${y}-${pad2(mo)}`;
            else day = `${y}-${pad2(mo)}-${pad2(d)}`;
        } else {
            rest.push(w);
        }
    }
    if (day) period.day = day;
    else if (month) period.month = month;
    return { period, page, rest };
}

// "2026-11", "2026-11-19" or "2026-11-19 14h"
const periodLabel = (p) => (p.day ? `${p.day}${p.hour ? ` ${p.hour}h` : ''}` : p.month ?? '');
const msgsAlt = (n) => countAlt('show.history.msgs', n);
const mediaAlt = (n) => (n ? tr('show.history.withMedia', { count: n }) : '');

// The chats with messages in the history (without the statuses), in the list order
function historyChats() {
    return dbAll(
        `SELECT chat_id, MAX(chat_name) AS chat_name, MAX(is_group) AS is_group, COUNT(*) AS total,
                SUM(has_media) AS with_media, MAX(timestamp) AS last
           FROM messages
          WHERE chat_id IS NOT NULL AND chat_id <> '${STATUS}' AND ${NOT_MY_COMMAND}
          GROUP BY chat_id
          ORDER BY last DESC`
    );
}

// The commands you typed (/show -a itself, /ping...) are not part of the conversation
const NOT_MY_COMMAND = "NOT (from_me = 1 AND body LIKE '/%')";

const marksOf = (ids) => ids.map(() => '?').join(', ');

// The deleted messages come with their title; the others, with the plain one
async function resendHistory(destination, row, i, total) {
    const info = await resolverAuthorDeleted(row);
    await sendMessageDeleted(destination, row, info, {
        title: tr(row.revoked ? 'show.history.msgTitleRevoked' : 'show.history.msgTitle', { i: i + 1, total }),
        extras: row.revoked ? [tr('show.deletedAt', { date: formatData(row.revoked_at) })] : []
    });
}

// Deletes the media files of the rows (and the empty date folders), returns how many and the size
function deleteMediaFiles(rows) {
    let files = 0;
    let bytes = 0;
    for (const { media_path } of rows) {
        if (!mediaIsPath(media_path)) continue;
        try {
            bytes += fs.statSync(media_path).size;
            fs.unlinkSync(media_path);
            files++;
        } catch { /* file no longer exists */ }
    }
    pruneEmptyDirs(MEDIA_DIR);
    return { files, bytes };
}

// Removes the empty folders (media/YYYY/MM/DD) under `dir`, never `dir` itself
function pruneEmptyDirs(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const sub = `${dir}/${entry.name}`;
        pruneEmptyDirs(sub);
        if (!fs.readdirSync(sub).length) fs.rmdirSync(sub);
    }
}

/**
 * @param {object} o
 * @param {string[]} o.words    the words typed (the chat, the period, pN)
 * @param {number|null} o.n     the -N: the last N messages
 * @param {string|null} o.search  the -q text, and o.home its compiled test
 */
async function showHistory({ msg, opts, chatId, chatName: currentName, words, n, search, home }) {
    const read = readPeriod(words);
    if (read.error) {
        await msg.reply(read.error);
        return;
    }
    const { period, page, rest } = read;
    if (period.hour && !period.day) {
        await msg.reply(tr('show.history.hourNeedsDay', { cmd: '/show -a' }));
        return;
    }

    // The chat: given (name, @mention, /regex/) or this one; in your private chat without a chat, all of them
    let target = null;
    if (rest.length) {
        target = await resolverTarget(msg, rest.join(' '), { chats: await historyChats() });
        if (!target) return;
    }
    const myId = client.info.wid._serialized;
    const ids = target ? target.ids : await chatCurrentIds(chatId);
    const allChats = !target && ids.includes(myId);

    // With no chat and no period/search/-N, in your private chat: which chats have history
    if (allChats && !search && n == null && !period.month && !period.day && !opts.opt.flush) {
        await listHistoryChats(msg);
        return;
    }

    const scope = allChats ? '' : `AND chat_id IN (${marksOf(ids)})`;
    const params = allChats ? [] : ids;
    const rows = await dbAll(
        `SELECT id, timestamp, has_media, revoked, media_path${search ? ', body, transcription' : ''}
           FROM messages
          WHERE chat_id IS NOT NULL AND chat_id <> '${STATUS}' AND ${NOT_MY_COMMAND} ${scope}
          ORDER BY timestamp, id`, params);

    const name = target?.name ?? (allChats ? tr('show.history.allChats') : null);
    let items = rows.map(r => ({ ...r, ms: paraMs(r.timestamp), when: whenOf(paraMs(r.timestamp)) }));
    if (home) items = await matchingRows(home, items, r => [r.body, r.transcription].filter(Boolean));
    const slice = items.filter(r => (!period.month || r.when.month === period.month) && (!period.day || r.when.day === period.day) &&
        (!period.hour || r.when.hour === period.hour));

    const whereAlt = allChats ? tr('show.history.allChats') : target ? tr('show.whereChat', { name: target.name }) : tr('show.whereHere');
    const sentence = periodLabel(period) ? ` · ${periodLabel(period)}` : '';

    // -flush -all: removes the history of the scope (only with -yes)
    if (opts.opt.flush) {
        await flushHistory({ msg, ids, allChats, slice, where: whereAlt, cmd: `/show -f -a ${rest.length ? `/${target.name}/ ` : ''}${periodLabel(period)}`.trim() }, Boolean(opts.opt.yes));
        return;
    }

    if (!slice.length) {
        await msg.reply(tr('show.history.none', { where: `${whereAlt}${search ? tr('show.history.query', { query: search }) : ''}`, period: sentence }));
        return;
    }

    const max = getSetting('show.max');
    const chatName = name ?? currentName ?? tr('show.whereHere');
    const cmdBase = `/show -a${search ? ` -q ${/\s/.test(search) ? `"${search}"` : search}` : ''}${target ? ` /${target.name}/` : ''}`;
    const media = slice.filter(r => r.has_media).length;
    const queryAlt = search ? tr('show.history.query', { query: search }) : '';

    // The last N
    if (n != null) {
        const last = slice.slice(-Math.min(n, max));
        await sendHistoryMessages({ msg, chatId, items: last, head: tr('show.history.leafLast', { msgs: msgsAlt(last.length), name: chatName }) + queryAlt });
        return;
    }

    // Few messages (or the hour): the messages themselves, in parts of show.max
    if (slice.length <= max || period.hour) {
        const pages = Math.ceil(slice.length / max);
        const p = Math.min(page, pages);
        const part = slice.slice((p - 1) * max, p * max);
        const head = tr('show.history.leaf', {
            msgs: msgsAlt(slice.length), name: chatName, period: periodLabel(period) || tr('show.history.allPeriod'), page: pages > 1 ? tr('show.history.page', { p, pages }) : ''
        }) + queryAlt;
        const next = p < pages ? tr('show.history.next', { cmd: `${cmdBase} ${periodLabel(period)} p${p + 1}`.replace(/\s+/g, ' ') }) : '';
        await sendHistoryMessages({ msg, chatId, items: part, head: head + next });
        return;
    }

    // Many: the next level, by month, day or hour
    const level = period.day ? 'hour' : period.month ? 'day' : 'month';
    const buckets = new Map();
    for (const r of slice) {
        const key = r.when[level];
        const b = buckets.get(key) ?? { n: 0, media: 0 };
        b.n++;
        if (r.has_media) b.media++;
        buckets.set(key, b);
    }
    const keys = [...buckets.keys()].sort().reverse();
    const labelOf = (k) => (level === 'hour' ? `${k}h` : k);
    const lines = keys.map(k => `${labelOf(k)} · ${buckets.get(k).n}${buckets.get(k).media ? ` · 🖼️ ${buckets.get(k).media}` : ''}`).join('\n');
    const from = slice[0].when.day;
    const to = slice.at(-1).when.day;
    const title = period.month || period.day
        ? tr('show.history.titleOf', { name: chatName, period: periodLabel(period), msgs: msgsAlt(slice.length), media: mediaAlt(media) })
        : tr('show.history.title', { name: chatName, msgs: msgsAlt(slice.length), media: mediaAlt(media), from, to });
    const first = keys[0];
    const example = level === 'hour' ? `${period.day} ${first}h` : first;
    let textAlt = `${title}${queryAlt}\n\n${lines}\n`;
    textAlt += tr('show.history.hintDown', { cmd: `${cmdBase} ${example}` });
    textAlt += tr('show.history.hintFormats');
    if (level === 'month') {
        textAlt += tr('show.history.keeps', { days: Math.round(getSetting('cache.messageRetentionHours') / 24) });
    }
    await msg.reply(textAlt);
}

// The chats that have history (the numbered list of -a in your private chat)
async function listHistoryChats(msg) {
    const chats = await historyChats();
    if (!chats.length) {
        await msg.reply(tr('show.history.none', { where: tr('show.history.allChats'), period: '' }));
        return;
    }
    const total = chats.reduce((sum, c) => sum + c.total, 0);
    const media = chats.reduce((sum, c) => sum + (c.with_media ?? 0), 0);
    const LIMIT = 20;
    let textAlt = tr('show.history.chatsTitle', { chats: countAlt('show.history.chats', chats.length), msgs: msgsAlt(total), media: mediaAlt(media) });
    chats.sort((a, b) => b.total - a.total).slice(0, LIMIT).forEach((c, i) => {
        textAlt += tr('show.history.chatsLine', { n: i + 1, chat: describeChat(c), msgs: msgsAlt(c.total), media: mediaAlt(c.with_media ?? 0), date: formatData(c.last) });
    });
    if (chats.length > LIMIT) textAlt += tr('show.history.chatsMore', { count: chats.length - LIMIT });
    textAlt += tr('show.history.chatsHint') + tr('show.history.keeps', { days: Math.round(getSetting('cache.messageRetentionHours') / 24) });
    await msg.reply(textAlt);
}

// The header and then each message (the full row, with the media and the sender), spaced by show.delayMs
async function sendHistoryMessages({ msg, chatId, items, head }) {
    const full = items.length
        ? await dbAll(`SELECT * FROM messages WHERE id IN (${marksOf(items)}) ORDER BY timestamp, id`, items.map(r => r.id))
        : [];
    await msg.reply(head);
    for (const [i, row] of full.entries()) {
        try {
            await resendHistory(chatId, row, i, full.length);
        } catch (err) {
            printError(`/show -a: failed to resend ${row.id}:`, err.message);
            await client.sendMessage(chatId, tr('show.resendFailed', { i: i + 1, total: full.length, error: err.message }));
        }
        if (i < full.length - 1) await wait(getSetting('show.delayMs'));
    }
}

// /show -f -a [chat] [period]: deletes the history of the scope (the messages and their media files); asks for -yes
async function flushHistory({ msg, ids, allChats, slice, where, cmd }, yes) {
    if (!slice.length) {
        await msg.reply(tr('show.history.none', { where, period: '' }));
        return;
    }
    const full = await dbAll(`SELECT id, media_path FROM messages WHERE id IN (${marksOf(slice)})`, slice.map(r => r.id));
    const withFiles = full.filter(r => mediaIsPath(r.media_path));
    const size = withFiles.reduce((sum, r) => { try { return sum + fs.statSync(r.media_path).size; } catch { return sum; } }, 0);

    if (!yes) {
        await msg.reply(tr('show.history.flushAsk', { msgs: msgsAlt(slice.length), where, files: withFiles.length, size: humanSize(size), cmd }));
        return;
    }
    const removed = deleteMediaFiles(full);
    for (let i = 0; i < full.length; i += 400) {
        const part = full.slice(i, i + 400);
        await dbRun(`DELETE FROM messages WHERE id IN (${marksOf(part)})`, part.map(r => r.id));
    }
    printInfo(`/show -f -a (${allChats ? 'all' : ids[0]}): ${full.length} messages, ${removed.files} files removed`);
    await msg.reply(tr('show.history.flushed', { msgs: msgsAlt(full.length), where, files: removed.files, size: removed.bytes ? ` _(${humanSize(removed.bytes)})_` : '' }));
}

async function cmdShow({ msg, opts, chatId, chatName, admin }) {
    await dbReady;

    const syntax = () => msg.reply(commandUsage('/show'));

    // The "-3" is opts.number (the parser reads it); the rest of argv is the chat
    let n = opts.number;
    if (n === 0) return syntax();
    const words = opts.argv.filter(Boolean);

    const requests = Object.keys(TYPES).filter(type => opts.opt[TYPES[type].opt]);
    const cmd = ['/show', ...requests.map(type => TYPES[type].flag)].join(' ');

    // -q <text|/regex/flags>: searches the requested types; does not combine with -f and -l
    // -yes only widens the -flush
    if (opts.opt.yes && !opts.opt.flush) {
        await msg.reply(tr('show.yesNeedsFlush', { cmd }));
        return;
    }

    const search = opts.given.has('query') ? String(opts.opt.query ?? '').trim() : null;
    if (search !== null && (!search || opts.opt.flush || opts.opt.list)) {
        await msg.reply(search
            ? tr('show.queryNoCombine')
            : tr('show.queryEmpty', { cmd }));
        return;
    }
    let home = null;
    if (search !== null) {
        try {
            home = compileSearch(search);
        } catch (err) {
            await msg.reply(tr('show.queryInvalid', { error: err.message }));
            return;
        }
    }

    // -all (-a): the general history of the chat
    if (opts.opt.all) {
        if (requests.length || opts.opt.list) {
            await msg.reply(tr('show.history.noCombine'));
            return;
        }
        await showHistory({ msg, opts, chatId, chatName, words, n, search, home });
        return;
    }

    const privateWithoutParams = /@(c\.us|lid)$/.test(chatId) &&
        !opts.given.size && !opts.argv.length;
    // Whoever received /show sees only the current chat: no private-chat list (-l and the chat already went through execute.js)
    if (opts.opt.list || (privateWithoutParams && admin)) {
        await listCache({ msg, chatId, filter: words.join(' ') || null });
        return;
    }

    // The requested chat (works in any chat)
    let target = null;
    if (words.length) {
        target = await resolverTarget(msg, words.join(' '));
        if (!target) return;
    }

    const myId = client.info.wid._serialized;
    const ids = target ? target.ids : await chatCurrentIds(chatId);
    const inMyPrivate = !target && ids.includes(myId);

    // In your private chat, without a chat: the search and the status cover all chats
    const allAlt2 = inMyPrivate && !opts.opt.flush && (search !== null || requests.includes('status'));

    // Without -d/-e/-s/-r: with a chat (or in all), everything together; otherwise, only the deleted ones
    // -flush -yes (-y): everything of the scope (deleted, edited, status and reactions, with the media files)
    const types = opts.opt.yes && opts.opt.flush ? Object.keys(TYPES)
        : requests.length ? requests : target || allAlt2 ? Object.keys(TYPES) : ['apagadas'];

    if (opts.opt.flush) {
        await cacheClean({ msg, types, target, ids, general: inMyPrivate, cmd });
        return;
    }
    const u = types.length === 1 ? TYPES[types[0]] : TOGETHER;

    n ??= search ? SEARCH_DEFAULT : 1;

    let notice = '';
    const max = getSetting('show.max');
    if (n > max) {
        notice = tr('show.limited', { max });
        n = max;
    }

    // The most recent of each type, then the most recent of all
    let rows = [];
    for (const type of types) {
        const t = TYPES[type];
        const { where, params } = whereAltAlt(t, allAlt2 ? null : ids);
        const typeAlt = await dbAll(
            `SELECT *, '${type}' AS type, ${t.when} AS "when"
               FROM ${t.table}
              WHERE ${where}
              ORDER BY ${t.order}
              ${search ? '' : 'LIMIT ?'}`,
            search ? params : [...params, n]
        );

        rows.push(...(home ? await matchingRows(home, typeAlt, r => t.texts(r)) : typeAlt));
    }

    rows.sort((a, b) => paraMs(b.when) - paraMs(a.when));
    const foundAlt5 = rows.length;
    rows = rows.slice(0, n);

    if (!rows.length) {
        const whereAlt = allAlt2 ? tr('show.whereNone') : target ? tr('show.whereChat', { name: target.name }) : tr('show.whereHere');

        // In private, without a chat, the intent was almost always to see another chat
        await msg.reply(search
            ? tr('show.noneWithQuery', { icon: u.icon, none: tx(u, 'none'), query: search, where: whereAlt })
            : target || allAlt2
                ? tr('show.noneWhere', { icon: u.icon, none: tx(u, 'none'), where: whereAlt })
                : inMyPrivate
                    ? tr('show.noneOtherChat', { icon: u.icon, none: tx(u, 'none'), cmd })
                    : tr('show.noneHere', { icon: u.icon, none: tx(u, 'none'), registered: tx(u, 'registered') }));
        return;
    }

    // Fetches the most recent, shows from oldest to newest
    rows.reverse();

    const missing = !search && n > rows.length ? tr('show.missing', { n, found: rows.length }) : '';
    let summary = `${itemsSummary(types, rows)}${missing}${notice}`;

    if (search) {
        summary += tr('show.withQuery', { query: search }) + (foundAlt5 > rows.length ? tr('show.queryMore', { shown: rows.length, found: foundAlt5 }) : '');
    }

    if (allAlt2) summary += tr('show.allChats');
    if (target) summary += tr(target.ids.every(isChannelAlt) ? 'show.channelLabel' : 'show.chatLabel', { name: target.name });

    await msg.reply(summary);

    for (const [i, row] of rows.entries()) {
        try {
            await RESEND_CACHE[row.type](chatId, row, i, rows.length);
        } catch (err) {
            printError(`/show: failed to resend ${row.id}:`, err.message);
            await client.sendMessage(chatId, tr('show.resendFailed', { i: i + 1, total: rows.length, error: err.message }));
        }

        if (i < rows.length - 1) await wait(getSetting('show.delayMs'));
    }
}

module.exports = {
    cmdShow,
    resolverTarget
};
