/*
 * /show command: deleted messages, edited ones, deleted status and removed or changed reactions.
 */

const fs = require('fs-extra');

const { client, completeNotice } = require('../client');
const { commandUsage } = require('./base');
const { DAY_MS } = require('../constants');
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
        chave: 'apagadas',
        opt: 'deleted',
        flag: '-d',
        tabela: 'messages',
        filtro: `revoked = 1 AND chat_id <> '${STATUS}'`,
        doChat: 'chat_id',          // which chat it is (in status: which person)
        nome: 'chat_name',
        grupo: 'is_group',
        quando: 'revoked_at',
        ordem: 'revoked_at DESC, timestamp DESC',
        retencao: 'cache.revokedRetentionDays',
        comMidia: true,
        textos: (r) => [r.body],
        icone: '♻️',
        iconeLista: '🗑️'
    },
    editadas: {
        chave: 'editadas',
        opt: 'edited',
        flag: '-e',
        tabela: 'message_edits',
        filtro: '1 = 1',
        doChat: 'chat_id',
        nome: 'chat_name',
        grupo: 'is_group',
        quando: 'edited_at',
        ordem: 'edited_at DESC, id DESC',
        retencao: 'cache.editedRetentionDays',
        comMidia: false,
        textos: (r) => [r.old_body, r.new_body],
        icone: '✏️',
        iconeLista: '✏️'
    },
    status: {
        chave: 'status',
        opt: 'status',
        flag: '-s',
        tabela: 'messages',
        filtro: `revoked = 1 AND chat_id = '${STATUS}'`,
        doChat: 'sender_jid',
        nome: 'sender_name',
        grupo: '0',
        quando: 'revoked_at',
        ordem: 'revoked_at DESC, timestamp DESC',
        retencao: 'cache.revokedRetentionDays',
        comMidia: true,
        textos: (r) => [r.body],
        icone: '📸',
        iconeLista: '📸'
    },
    reacoes: {
        chave: 'reacoes',
        opt: 'reaction',
        flag: '-r',
        tabela: 'reaction_changes',
        filtro: '1 = 1',
        doChat: 'chat_id',
        nome: 'chat_name',
        grupo: 'is_group',
        quando: 'changed_at',
        ordem: 'changed_at DESC, id DESC',
        retencao: 'cache.reactionRetentionDays',
        comMidia: false,
        textos: (r) => [r.old_reaction, r.new_reaction, r.body],
        icone: '😶',
        iconeLista: '😶'
    }
};

// Several types together: what changes in the texts
const TOGETHER = { chave: 'juntos', icone: '🗄️' };

// The texts of a type (or of JUNTOS): show.<key>.<field>
const tx = (type, campo, vars) => tr(`show.${type.chave}.${campo}`, vars);

// The type filter, only on the ids (null: of all chats)
function whereAltAlt(t, ids) {
    if (!ids) return { where: t.filtro, params: [] };
    const marks = ids.map(() => '?').join(', ');
    return { where: `${t.filtro} AND ${t.doChat} IN (${marks})`, params: ids };
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
        `SELECT ${t.doChat} AS chat_id, ${t.nome} AS chat_name, ${t.grupo} AS is_group,
                '${type}' AS tipo, ${t.quando} AS quando
           FROM ${t.tabela}
          WHERE ${t.filtro}`);

    return dbAll(
        `SELECT chat_id,
                MAX(chat_name) AS chat_name,
                MAX(is_group) AS is_group,
                ${Object.keys(TYPES).map(type => `SUM(tipo = '${type}') AS ${type},`).join('\n                ')}
                COUNT(*) AS total,
                MAX(quando) AS ultima
           FROM (${partsAlt.join(' UNION ALL ')})
          WHERE chat_id IS NOT NULL
          GROUP BY chat_id
          ORDER BY total DESC, ultima DESC`
    );
}

const chatNameAlt = (c) => c.chat_name || c.chat_id.split('@')[0];
const describeChat = (c) => `${isChannelAlt(c.chat_id) ? '📰' : c.is_group ? '👥' : '👤'} ${chatNameAlt(c)}`;
// Like withoutAccents, but without touching case: \D and \d are very different things in a regex
const removeAccents = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const paraTarget = async (c) => ({ ids: await chatCurrentIds(c.chat_id), nome: chatNameAlt(c) });

/**
 * The cache chats that match the text: @mention, the no. from the last
 * -l, /regex/ or the name (all the words), regardless of case or
 * accents. Replies the error when none matches.
 * @returns {Promise<{ casam: object[], exato?: object, mencao?: object } | null>} null: already replied
 */
async function chatsThatMatch(msg, textAlt, chats, { numero: numberAlt = true } = {}) {
    if (/^@\d+$/.test(textAlt)) {
        const r = await resolverDestination(textAlt, { mencoes: msg.mentionedIds ?? [] });
        if (r.erro) {
            await msg.reply(r.erro);
            return null;
        }
        const ids = await chatCurrentIds(r.id);
        return { casam: chats.filter(c => ids.includes(c.chat_id)), mencao: { ids, nome: r.nome } };
    }

    if (numberAlt && /^\d+$/.test(textAlt)) {
        const list = chatsLastList.length ? chatsLastList : chats.map(c => c.chat_id);
        const chat = chats.find(c => c.chat_id === list[Number(textAlt) - 1]);
        if (!chat) {
            await msg.reply(tr('show.chatNotFound', { n: textAlt }));
            return null;
        }
        return { casam: [chat], exato: chat };
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
        match = chats.filter(c => re.test(removeAccents(chatNameAlt(c))));
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
    return { casam: match, exato: exact };
}

/**
 * O chat pedido (veja o chatsQueCasam; o nome exato ganha).
 * Several: lists and waits for the no., as in /stats.
 * `chats` swaps the list to search from (/tldr uses the chats with stored messages, without the -l no.).
 * @returns {Promise<{ ids: string[], nome: string } | null>} null: already replied
 */
async function resolverTarget(msg, textAlt, { chats: yourChats } = {}) {
    // The mention counts even with nothing in the cache: the reply says there is nothing of theirs
    const chats = yourChats ?? await chatsDoCache();
    if (!chats.length && !/^@\d+$/.test(textAlt)) {
        await msg.reply(tr('show.cacheEmpty'));
        return null;
    }

    const r = await chatsThatMatch(msg, textAlt, chats, { numero: !yourChats });
    if (!r) return null;
    if (r.mencao) return r.mencao;

    const { casam: match, exato: exact } = r;
    if (exact || match.length === 1) return paraTarget(exact ?? match[0]);

    const optionsAlt = match.slice(0, 10);
    const question = await msg.reply(tr('show.multiMatch', { text: textAlt, count: match.length }) +
        optionsAlt.map((c, i) => `${i + 1}. ${describeChat(c)}`).join('\n') +
        tr('show.multiMatchFooter'));

    const chosen = await waitChoice(msg.id?.remote ?? msg.from, optionsAlt, {
        autor: authorAlt(msg),
        aoExpirar: () => completeNotice(msg, question, tr('show.choiceExpired', { text: textAlt }))
    });
    return chosen ? paraTarget(chosen) : null;
}

/*
 * /show -list [chat] (the types do not change the list)
 * What is in the cache, by type, and the numbered chats (the /show <no.> number),
 * with the current chat marked. With a chat (no., name, @mention or /regex/): only the
 * that match, with the full list no., and the calculations of only those.
 */
async function listCache({ msg, chatId, filtro: filter }) {
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
            ...(r.mencao?.ids ?? []),
            ...(await Promise.all(r.casam.map(c => chatCurrentIds(c.chat_id)))).flat()
        ])];
        chats = allOsChats.filter(c => ids.includes(c.chat_id));
        // A single chat: its name (the "2" of -l 2 says nothing); several: what was typed
        de = r.mencao?.nome ?? (r.casam.length === 1 ? chatNameAlt(r.casam[0]) : filter);
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
                    ${t.comMidia ? 'COALESCE(SUM(has_media), 0)' : '0'} AS com_midia,
                    MIN(${t.quando}) AS mais_antiga
               FROM ${t.tabela}
              WHERE ${where}`,
            params
        );

        const details = [];
        if (summary.com_midia > 0) details.push(tr('show.withMedia', { count: summary.com_midia }));

        if (summary.total > 0 && summary.mais_antiga) {
            const expiresIn = paraMs(summary.mais_antiga) + getSetting(t.retencao) * DAY_MS;
            const daysAlt = Math.max(0, Math.ceil((expiresIn - Date.now()) / DAY_MS));
            details.push(tr('show.oldestExpires', { days: countAlt('show.days', daysAlt) }));
        }

        textAlt += `${t.iconeLista} *${tx(t, 'label')}:* ${summary.total}`;
        textAlt += details.length ? ` _(${details.join(' · ')})_\n` : '\n';
    }

    // The numbering is always that of the full list: /show <no.> works with or without a filter
    chatsLastList = allOsChats.map(c => c.chat_id);

    const line = (c) => {
        const accounts = Object.entries(TYPES)
            .filter(([type]) => c[type] > 0)
            .map(([type, t]) => `${t.iconeLista} ${c[type]}`)
            .join(' · ');
        const current = idsDoChat.includes(c.chat_id) ? tr('show.thisChat') : '';
        const n = chatsLastList.indexOf(c.chat_id) + 1;
        return tr('show.listLine', { n, chat: describeChat(c), counts: accounts, date: formatData(c.ultima), current: current });
    };

    if (chats.length) {
        textAlt += '\n';
        chats.forEach((c) => { textAlt += line(c); });

        textAlt += tr('show.listHint', { max: getSetting('show.max') });
    }

    await msg.reply(textAlt);
}

/*
 * /show -flush: removes the requested types from the cache (media leaves the disk too):
 * - with a chat (/show -f Trabalho) → only its own;
 * - in any chat            → only those of THIS chat;
 * - in your own private chat       → those of ALL chats.
 * Destructive: -flush is for the owner and admins (role in commands.js), even if /show is opened up.
 */
async function cacheClean({ msg, tipos: types, alvo: target, ids, geral: general, cmd }) {
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
                        MAX(${t.nome}) AS chat_name,
                        MAX(${t.grupo}) AS is_group,
                        COUNT(*) AS total
                   FROM ${t.tabela}
                  WHERE ${where}
                  GROUP BY ${t.doChat}`,
                params
            );
            for (const c of chats) {
                const beforeAlt = byChat.get(c.chat_id)?.total ?? 0;
                byChat.set(c.chat_id, { ...c, total: c.total + beforeAlt });
            }
        }

        if (t.comMidia) {
            const mediaAltAlt = await dbAll(
                `SELECT media_path FROM ${t.tabela} WHERE ${where} AND media_path IS NOT NULL`, params);

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

        const res = await dbRun(`DELETE FROM ${t.tabela} WHERE ${where}`, params);
        removed.push({ t, n: res.changes });
    }

    const total = removed.reduce((sum, r) => sum + r.n, 0);
    const u = types.length === 1 ? TYPES[types[0]] : TOGETHER;

    if (!total) {
        await msg.reply(general
            ? tr('show.noneAll', { icon: u.icone, none: tx(u, 'none') })
            : target
                ? tr('show.noneOf', { icon: u.icone, none: tx(u, 'none'), name: target.nome })
                : tr('show.noneHere', { icon: u.icone, none: tx(u, 'none'), registered: tx(u, 'registered') }));
        return;
    }

    const accounts = removed.map(r => `${r.n} ${tx(r.t, 'label').toLowerCase()}`).join(', ');
    printInfo(`/show -flush (${general ? 'geral' : target?.nome ?? ids[0]}): ${accounts}; ${files} arquivos removidos`);

    let textAlt = general
        ? tr('show.flushAll')
        : target
            ? tr('show.flushOf', { name: target.nome })
            : tr('show.flushHere');

    for (const { t, n } of removed) {
        textAlt += `${t.iconeLista} ${tx(t, 'label')}: *${countAlt(`show.${t.chave}.count`, n)}*\n`;
    }

    if (removed.some(r => r.t.comMidia)) {
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
        titulo: tr(isStatus(row) ? 'show.deletedStatusTitle' : 'show.deletedTitle', { i: i + 1, total }),
        extras: [tr('show.deletedAt', { date: formatData(row.revoked_at) })]
    });
}

const RESEND_CACHE = {
    apagadas: resendDeleted,
    status: resendDeleted,
    editadas: async (destination, row, i, total) => {
        await sendMessageEdited(destination, row, {
            nomeChat: row.chat_name || tr('show.unknownChat'),
            nomeRemetente: row.sender_name || tr('show.unknownSender'),
            numeroRemetente: row.sender_number || null
        }, { titulo: tr('show.editedTitle', { i: i + 1, total }) });
    },
    reacoes: (destination, row, i, total) => sendReactionUndone(destination, row, { contagem: `${i + 1}/${total}` })
};

// "♻️ *2 mensagens apagadas*" (one type) or "🗄️ *3 mensagens* (🗑️ 2 · 📸 1)" (several)
function itemsSummary(types, rows) {
    if (types.length === 1) {
        const t = TYPES[types[0]];
        return `${t.icone} *${countAlt(`show.${t.chave}.summary`, rows.length)}*`;
    }

    const accounts = Object.entries(TYPES)
        .map(([type, t]) => [t, rows.filter(r => r._tipo === type).length])
        .filter(([, n]) => n)
        .map(([t, n]) => `${t.iconeLista} ${n}`);
    const total = countAlt('show.juntos.summary', rows.length);
    return `${TOGETHER.icone} *${total}* (${accounts.join(' · ')})`;
}

async function cmdShow({ msg, opts, chatId, admin }) {
    await dbReady;

    const syntax = () => msg.reply(commandUsage('/show'));

    // The "-3" is opts.numero (the parser reads it); the rest of argv is the chat
    let n = opts.numero;
    if (n === 0) return syntax();
    const words = opts.argv.filter(Boolean);

    const requests = Object.keys(TYPES).filter(type => opts.opt[TYPES[type].opt]);
    const cmd = ['/show', ...requests.map(type => TYPES[type].flag)].join(' ');

    // -q <text|/regex/flags>: searches the requested types; does not combine with -f and -l
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

    const privateWithoutParams = /@(c\.us|lid)$/.test(chatId) &&
        !opts.given.size && !opts.argv.length;
    // Whoever received /show sees only the current chat: no private-chat list (-l and the chat already went through execute.js)
    if (opts.opt.list || (privateWithoutParams && admin)) {
        await listCache({ msg, chatId, filtro: words.join(' ') || null });
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
    const types = requests.length ? requests : target || allAlt2 ? Object.keys(TYPES) : ['apagadas'];

    if (opts.opt.flush) {
        await cacheClean({ msg, tipos: types, alvo: target, ids, geral: inMyPrivate, cmd });
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
            `SELECT *, '${type}' AS _tipo, ${t.quando} AS _quando
               FROM ${t.tabela}
              WHERE ${where}
              ORDER BY ${t.ordem}
              ${search ? '' : 'LIMIT ?'}`,
            search ? params : [...params, n]
        );

        rows.push(...(home ? typeAlt.filter(r => t.textos(r).some(home)) : typeAlt));
    }

    rows.sort((a, b) => paraMs(b._quando) - paraMs(a._quando));
    const foundAlt5 = rows.length;
    rows = rows.slice(0, n);

    if (!rows.length) {
        const whereAlt = allAlt2 ? tr('show.whereNone') : target ? tr('show.whereChat', { name: target.nome }) : tr('show.whereHere');

        // In private, without a chat, the intent was almost always to see another chat
        await msg.reply(search
            ? tr('show.noneWithQuery', { icon: u.icone, none: tx(u, 'none'), query: search, where: whereAlt })
            : target || allAlt2
                ? tr('show.noneWhere', { icon: u.icone, none: tx(u, 'none'), where: whereAlt })
                : inMyPrivate
                    ? tr('show.noneOtherChat', { icon: u.icone, none: tx(u, 'none'), cmd })
                    : tr('show.noneHere', { icon: u.icone, none: tx(u, 'none'), registered: tx(u, 'registered') }));
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
    if (target) summary += tr(target.ids.every(isChannelAlt) ? 'show.channelLabel' : 'show.chatLabel', { name: target.nome });

    await msg.reply(summary);

    for (const [i, row] of rows.entries()) {
        try {
            await RESEND_CACHE[row._tipo](chatId, row, i, rows.length);
        } catch (err) {
            printError(`/show: falha ao reenviar ${row.id}:`, err.message);
            await client.sendMessage(chatId, tr('show.resendFailed', { i: i + 1, total: rows.length, error: err.message }));
        }

        if (i < rows.length - 1) await wait(getSetting('show.delayMs'));
    }
}

module.exports = {
    cmdShow,
    resolverTarget
};
