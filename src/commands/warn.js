/*
 * /warn: warnings to whoever breaks the group rules. On reaching 'warn.max' warnings, the person is removed
 * (if the bot is a group admin). Only in groups.
 * /warn @Fulano spam de link   → adds a warning (the reason is the rest of the text)
 * /warn, replying           → to whoever wrote the replied message
 * /warn -l [person]            → the group's warnings (or a person's, with the reasons)
 * /warn -c [person]            → resets a person's warnings
 */

const { readPerson, withoutDelimiters } = require('./block');
const { client } = require('../client');
const { resolveLidToPhone } = require('../contacts');
const { dbAll, dbGet, dbReady, dbRun } = require('../db');
const { t } = require('../i18n');
const { printError } = require('../log');
const { getSetting } = require('../settings');
const { fmtWhen } = require('../util/when');
const { commandUsage } = require('./base');

// The person at the start of the text: /Name/, @mention or +number; the rest is the reason
const PERSON_IN_START = /^\s*(\/[^/\n]+\/|@\S+|\+\d[\d()-]*)/;

// The group participant who is this person (the group id may be their @lid)
async function participantAlt(group, id) {
    const user = id.split('@')[0];
    const direct = group.participants.find(p => p.id._serialized === id || p.id.user === user);
    if (direct) return direct;

    for (const p of group.participants.filter(p => p.id._serialized.endsWith('@lid'))) {
        if ((await resolveLidToPhone(p.id._serialized).catch(() => null)) === id) return p;
    }
    return null;
}

const isAdmin = (p) => Boolean(p?.isAdmin || p?.isSuperAdmin);

/**
 * "@Fulano spam de link" → { person: "@Fulano", reason: "spam de link" }; without a person at the start, everything is the reason.
 */
function readTargetAndReason(textAlt) {
    const t0 = String(textAlt ?? '').trim();
    const m = t0.match(PERSON_IN_START);
    if (!m) return { person: '', reason: t0 };
    return { person: m[1], reason: t0.slice(m[0].length).trim() };
}

// The person (from the text or the replied message) already as a group participant; null: already replied the error
async function targetInGroup({ msg, group, personText, quotedMsg, cmd }) {
    const person = await readPerson(msg, withoutDelimiters(personText), personText ? null : quotedMsg, cmd);
    if (!person) return null;

    const participant = await participantAlt(group, person.id);
    if (!participant) {
        await msg.reply(t('grp.admin.notMember', { name: person.name }));
        return null;
    }
    return { person, participant, key: participant.id.user };
}

async function totalDe(chatId, keyAlt) {
    return (await dbGet('SELECT COUNT(*) AS n FROM warns WHERE chat_id = ? AND person = ?', [chatId, keyAlt])).n;
}

/**
 * Adds a warning and, if it reached the limit, removes the person. Used by /warn and by whoever warns on their own (/antilink).
 * @returns {Promise<{ n: number, max: number, removed: boolean, noAdmin: boolean }>}
 */
async function notify({ group, participant, name: nameAlt, reason: reasonAlt, by }) {
    await dbReady;
    const chatId = group.id._serialized;
    const keyAlt = participant.id.user;
    await dbRun('INSERT INTO warns (chat_id, person, person_name, reason, by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [chatId, keyAlt, nameAlt, reasonAlt || null, by || null, Date.now()]);

    const n = await totalDe(chatId, keyAlt);
    const max = getSetting('warn.max');
    const r = { n, max, removed: false, noAdmin: false };
    if (!max || n < max) return r;

    const eu = await participantAlt(group, client.info.wid._serialized);
    if (!isAdmin(eu)) return { ...r, noAdmin: true };

    try {
        const res = await group.removeParticipants([participant.id._serialized]);
        if (res?.status && res.status !== 200) throw new Error(`status ${res.status}`);
        await dbRun('DELETE FROM warns WHERE chat_id = ? AND person = ?', [chatId, keyAlt]);
        return { ...r, removed: true };
    } catch (err) {
        printError('/warn: not removed:', err.message);
        return { ...r, noAdmin: true };
    }
}

function noticeText(nameAlt, reasonAlt, r) {
    const base = t('grp.warn.warned', { name: nameAlt, n: r.n, max: r.max || '∞', reason: reasonAlt ? t('grp.warn.reason', { reason: reasonAlt }) : '' });
    if (r.removed) return `${base}\n${t('grp.warn.removed', { name: nameAlt, max: r.max })}`;
    if (r.noAdmin) return `${base}\n${t('grp.warn.noAdmin', { name: nameAlt, max: r.max })}`;
    return base;
}

async function listAlt(msg, group, target) {
    const chatId = group.id._serialized;
    if (target) {
        const linesAlt = await dbAll('SELECT reason, created_at FROM warns WHERE chat_id = ? AND person = ? ORDER BY id', [chatId, target.key]);
        if (!linesAlt.length) {
            await msg.reply(t('grp.warn.noneOf', { name: target.person.name }));
            return;
        }
        const items = linesAlt.map((l, i) => `${i + 1}. ${fmtWhen(l.created_at)}${l.reason ? ` · ${l.reason}` : ''}`).join('\n');
        await msg.reply(t('grp.warn.listOf', { name: target.person.name, n: linesAlt.length, max: getSetting('warn.max') || '∞', list: items }));
        return;
    }

    const by = await dbAll(
        'SELECT person, MAX(person_name) AS name, COUNT(*) AS n FROM warns WHERE chat_id = ? GROUP BY person ORDER BY n DESC, MAX(created_at) DESC',
        [chatId]);
    if (!by.length) {
        await msg.reply(t('grp.warn.none'));
        return;
    }
    const items = by.map((p, i) => `${i + 1}. ${p.name || `+${p.person}`} — ${p.n}/${getSetting('warn.max') || '∞'}`).join('\n');
    await msg.reply(t('grp.warn.list', { n: by.length, list: items }));
}

async function cmdWarn({ msg, opts, quotedMsg, isGroup, senderNumber }) {
    await dbReady;
    const group = isGroup ? await msg.getChat().catch(() => null) : null;
    if (!group?.isGroup) {
        await msg.reply(t('grp.onlyGroups'));
        return;
    }

    const textAlt = opts.argv.join(' ').trim();
    const listing = opts.given.has('list');
    const zeroing = opts.given.has('clear');
    const { person: personText, reason: reasonAlt } = readTargetAndReason(textAlt);

    // Nobody: -l lists the whole group; the other forms need a person
    if (!personText && !quotedMsg) {
        if (listing) {
            await listAlt(msg, group, null);
            return;
        }
        await msg.reply(commandUsage('/warn'));
        return;
    }

    const target = await targetInGroup({ msg, group, personText, quotedMsg, cmd: '/warn' });
    if (!target) return;

    if (listing) {
        await listAlt(msg, group, target);
        return;
    }

    if (zeroing) {
        const n = await totalDe(group.id._serialized, target.key);
        await dbRun('DELETE FROM warns WHERE chat_id = ? AND person = ?', [group.id._serialized, target.key]);
        await msg.reply(t(n ? 'grp.warn.cleared' : 'grp.warn.noneOf', { name: target.person.name, n }));
        return;
    }

    if (target.person.id === client.info.wid._serialized) {
        await msg.reply(t('grp.warn.self'));
        return;
    }
    if (isAdmin(target.participant)) {
        await msg.reply(t('grp.warn.isAdmin', { name: target.person.name }));
        return;
    }

    const r = await notify({ group, participant: target.participant, name: target.person.name, reason: reasonAlt, by: senderNumber || 'dono' });
    await msg.reply(noticeText(target.person.name, reasonAlt, r));
}

module.exports = { notify, cmdWarn, readTargetAndReason, noticeText };
