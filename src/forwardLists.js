/*
 * /forward recipient lists (like the /notes tags), stored in the forward_lists table:
 * -add | -a #list <recipients>... [-to ...]  → creates the list (or appends); resolves and saves the ids
 * -list | -l [#list...]                         → the lists (or the members of the requested ones; partial works)
 * -rm | -r #list...|all                         → deletes the list(s) (the whole thing, all or nothing)
 * -rm | -r #list <member>...                    → removes members (all or nothing); the last one deletes the list
 * -move | -m #list #new                        → renames (if #new exists, merges)
 * -copy | -c #list #new                        → the same, keeping #list (a faithful copy, or merged into #new)
 * -desc #list [<text>|-rm]                     → description (without text, shows it)
 * /forward #list ...                            → sends to the members (whole name; see expandLists)
 */

const { textPeople, withoutDelimiters } = require('./commands/block');
const { textItems } = require('./commands/set');
const { dbAll, dbGet, dbReady, dbRun } = require('./db');
const { describeDestination, destinationsForSave, destinationsSaved, extractDestinations, resolveDestinations } = require('./destinations');
const { t } = require('./i18n');
const { getSetting } = require('./settings');
const { withoutAccents } = require('./util/format');

const NAME = /^[a-z0-9_-]+$/;
const readName = (s) => String(s).replace(/^#/, '').toLowerCase();
const key = (d) => d.email ?? d.id;
const WITHOUT_PREVIEW = { linkPreview: false };

const listAll = () => dbAll('SELECT * FROM forward_lists ORDER BY list');
const membersAlt = (line) => destinationsSaved(line.recipients);
const list = (destinations) => destinations.map(describeDestination).join('\n');

// The order the members appear in (and are numbered): people, groups and emails
const sorted = (members) => [
    ...members.filter(d => !d.email && !d.group), ...members.filter(d => d.group), ...members.filter(d => d.email)
];

// Numbered from 1 on, in sections by type (the number works in -rm #list <no.>)
function sections(members) {
    const allAlt2 = sorted(members);
    const groups = [
        ['forward.list.people', allAlt2.filter(d => !d.email && !d.group)],
        ['forward.list.groups', allAlt2.filter(d => d.group)],
        ['forward.list.emails', allAlt2.filter(d => d.email)]
    ].filter(([, items]) => items.length);

    let n = 0;
    return groups.map(([keyAlt, items]) => `${t(keyAlt, { n: items.length })}\n${items.map(d => `${++n}. ${d.email ?? d.name}`).join('\n')}`)
        .join('\n\n');
}

// Without repeating whoever is already in (by id or email)
function join(current, freshAlt3) {
    const allAlt2 = [...current];
    for (const d of freshAlt3) if (!allAlt2.some(x => key(x) === key(d))) allAlt2.push(d);
    return allAlt2;
}

// Partial only to read: the exact one wins; otherwise starts with; otherwise contains
function find(nameAlt, existingAlt) {
    if (existingAlt.includes(nameAlt)) return [nameAlt];
    const starts = existingAlt.filter(e => e.startsWith(nameAlt));
    return starts.length ? starts : existingAlt.filter(e => e.includes(nameAlt));
}

async function save(nameAlt, destinations, description) {
    await dbRun(
        'INSERT INTO forward_lists (list, description, recipients) VALUES (?, ?, ?) ' +
        'ON CONFLICT(list) DO UPDATE SET recipients = excluded.recipients',
        [nameAlt, description ?? null, destinationsForSave(destinations)]
    );
}

// "#list" at the start: { name, rest } (name null: missing or invalid)
function firstList(textAlt) {
    const m = textAlt.trim().match(/^#(\S+)(?:\s+([\s\S]*))?$/);
    return m ? { name: readName(m[1]), rest: (m[2] ?? '').trim() } : { name: null, rest: textAlt.trim() };
}

async function addAlt(msg, textAlt) {
    const { name: nameAlt, rest } = firstList(textAlt);
    if (!nameAlt) return msg.reply(t('forward.list.addUsage'));
    if (!NAME.test(nameAlt)) return msg.reply(t('forward.list.badName', { name: nameAlt }));

    const { destinations: byTo, rest: withoutTo } = extractDestinations(rest);
    const texts = [...textPeople(withoutTo).map(withoutDelimiters), ...byTo];
    if (!texts.length) return msg.reply(t('forward.list.addUsage'));

    const destinations = await resolveDestinations(msg, texts, { acceptsEmail: true });
    if (!destinations) return;

    const existing = await dbGet('SELECT * FROM forward_lists WHERE list = ?', [nameAlt]);
    const current = existing ? membersAlt(existing) : [];
    const allAlt2 = join(current, destinations);
    const max = getSetting('forward.maxRecipients');
    if (allAlt2.length > max) return msg.reply(t('forward.list.tooMany', { name: nameAlt, n: allAlt2.length, max }));

    const freshAlt3 = allAlt2.length - current.length;
    if (existing && !freshAlt3) return msg.reply(t('forward.list.nothingNew', { name: nameAlt }));

    await save(nameAlt, allAlt2, existing?.description);
    await msg.reply(existing
        ? t('forward.list.updated', { name: nameAlt, added: freshAlt3, n: allAlt2.length, list: list(allAlt2) })
        : t('forward.list.created', { name: nameAlt, n: allAlt2.length, list: list(allAlt2) }), undefined, WITHOUT_PREVIEW);
}

async function listAlt(msg, textAlt) {
    const allAlt = await listAll();
    const requestedAlt = textAlt.split(/[\s,]+/).filter(Boolean).map(readName);

    if (!requestedAlt.length) {
        if (!allAlt.length) return msg.reply(t('forward.list.none'));
        const linesAlt = allAlt.map(l => t('forward.list.item', {
            name: l.list, n: membersAlt(l).length, desc: l.description ? ` — ${l.description}` : ''
        }));
        return msg.reply(`${t('forward.list.header')}\n\n${linesAlt.join('\n')}`, undefined, WITHOUT_PREVIEW);
    }

    const names = allAlt.map(l => l.list);
    const missing = requestedAlt.filter(p => !find(p, names).length);
    if (missing.length) return msg.reply(t('forward.list.notFound', { name: missing[0] }));

    const chosen = [...new Set(requestedAlt.flatMap(p => find(p, names)))];
    const blocks = chosen.map(n => {
        const l = allAlt.find(x => x.list === n);
        const members = membersAlt(l);
        return t('forward.list.show', {
            name: n, n: members.length, max: getSetting('forward.maxRecipients'),
            desc: l.description ? `\n_${l.description}_` : '', list: sections(members)
        });
    });
    // The tip only when it is a single list
    const tip = blocks.length === 1 ? `\n\n${t('forward.list.hint', { name: chosen[0] })}` : '';
    await msg.reply(blocks.join('\n\n') + tip, undefined, WITHOUT_PREVIEW);
}

// The member that matches the text: name (whole, then partial), email or number
function findMembers(members, textAlt) {
    const q = withoutAccents(textAlt).toLowerCase().trim();
    const digits = q.replace(/\D/g, '');
    const fields = (d) => [d.name, d.email].filter(Boolean).map(s => withoutAccents(s).toLowerCase());
    const exact = members.filter(d => fields(d).includes(q) || (digits.length >= 8 && d.id?.split('@')[0] === digits));
    return exact.length ? exact : members.filter(d => fields(d).some(c => c.includes(q)));
}

async function removeAlt2(msg, textAlt) {
    const allAlt = await listAll();
    const names = allAlt.map(l => l.list);
    const partsAlt = textAlt.trim().split(/\s+/).filter(Boolean);
    if (!partsAlt.length) return msg.reply(t('forward.list.rmUsage'));

    // The whole list: "-rm #a #b" or "-rm all" (all or nothing)
    if (partsAlt.length && (partsAlt[0].toLowerCase() === 'all' || partsAlt.every(p => p.startsWith('#')))) {
        const target = partsAlt[0].toLowerCase() === 'all' ? names : [...new Set(partsAlt.map(readName))];
        const missing = target.filter(n => !names.includes(n));
        if (missing.length || !target.length) {
            return msg.reply(t('forward.list.notFoundMany', { names: (missing.length ? missing : ['all']).map(n => `#${n}`).join(', ') }));
        }
        for (const n of target) await dbRun('DELETE FROM forward_lists WHERE list = ?', [n]);
        return msg.reply(target.length === 1 ? t('forward.list.removed', { name: target[0] }) : t('forward.list.removedMany', { n: target.length }));
    }

    // Members: "-rm #list /Jorge/ fulano@x.com"
    const { name: nameAlt, rest } = firstList(textAlt);
    if (!nameAlt) return msg.reply(t('forward.list.rmUsage'));
    const line = allAlt.find(l => l.list === nameAlt);
    if (!line) return msg.reply(t('forward.list.notFound', { name: nameAlt }));

    const members = membersAlt(line);
    const texts = textItems(rest);
    const remove = [];
    const absent = [];
    const order = sorted(members);
    for (const q of texts) {
        // A short number is the -l position (a phone has 8 digits or more)
        const foundAlt4 = /^\d{1,3}$/.test(q) ? [order[Number(q) - 1]].filter(Boolean) : findMembers(members, q);
        if (!foundAlt4.length) absent.push(q);
        else if (foundAlt4.length > 1) {
            return msg.reply(t('forward.list.memberAmbiguous', { name: nameAlt, text: q, names: foundAlt4.map(d => d.email ?? d.name).join(', ') }));
        } else remove.push(foundAlt4[0]);
    }
    if (absent.length) return msg.reply(t('forward.list.memberMissing', { name: nameAlt, names: absent.join(', ') }));

    const remaining = members.filter(d => !remove.some(x => key(x) === key(d)));
    const who = [...new Set(remove.map(describeDestination))].join(', ');
    if (!remaining.length) {
        await dbRun('DELETE FROM forward_lists WHERE list = ?', [nameAlt]);
        return msg.reply(`${t('forward.list.memberRemoved', { name: nameAlt, who: who })}\n${t('forward.list.emptied', { name: nameAlt })}`);
    }
    await save(nameAlt, remaining, line.description);
    await msg.reply(t('forward.list.memberRemoved', { name: nameAlt, who: who }));
}

// -move renames #list to #new (merges if #new exists); -copy does the same and keeps #list
async function transfer(msg, textAlt, { copy = false } = {}) {
    const m = textAlt.trim().match(/^#(\S+)\s+#(\S+)$/);
    if (!m) return msg.reply(t(copy ? 'forward.list.copyUsage' : 'forward.list.moveUsage'));
    const [fromName, toName] = [readName(m[1]), readName(m[2])];
    if (!NAME.test(toName)) return msg.reply(t('forward.list.badName', { name: toName }));
    if (fromName === toName) return msg.reply(t('forward.list.moveSame'));

    const origin = await dbGet('SELECT * FROM forward_lists WHERE list = ?', [fromName]);
    if (!origin) return msg.reply(t('forward.list.notFound', { name: fromName }));

    const destination = await dbGet('SELECT * FROM forward_lists WHERE list = ?', [toName]);
    const allAlt2 = join(destination ? membersAlt(destination) : [], membersAlt(origin));
    const max = getSetting('forward.maxRecipients');
    if (allAlt2.length > max) return msg.reply(t('forward.list.tooMany', { name: toName, n: allAlt2.length, max }));

    // The description of the existing one stays; otherwise the origin's goes
    await save(toName, allAlt2, destination?.description ?? origin.description);
    if (copy) {
        return msg.reply(destination
            ? t('forward.list.copyMerged', { from: fromName, to: toName, added: allAlt2.length - membersAlt(destination).length, n: allAlt2.length })
            : t('forward.list.copied', { from: fromName, to: toName, n: allAlt2.length }));
    }
    await dbRun('DELETE FROM forward_lists WHERE list = ?', [fromName]);
    await msg.reply(destination ? t('forward.list.merged', { from: fromName, to: toName, n: allAlt2.length }) : t('forward.list.moved', { from: fromName, to: toName }));
}

async function describe(msg, textAlt) {
    const { name: request, rest } = firstList(textAlt);
    if (!request) return msg.reply(t('forward.list.descUsage'));

    const allAlt = await listAll();
    const foundAlt3 = find(request, allAlt.map(l => l.list));
    if (foundAlt3.length !== 1) return msg.reply(t('forward.list.notFound', { name: request }));
    const line = allAlt.find(l => l.list === foundAlt3[0]);
    const nameAlt = line.list;

    if (!rest) {
        return msg.reply(line.description ? t('forward.list.descShown', { name: nameAlt, desc: line.description })
            : t('forward.list.descNone', { name: nameAlt }), undefined, WITHOUT_PREVIEW);
    }
    if (/^-rm$/i.test(rest)) {
        if (!line.description) return msg.reply(t('forward.list.descNone', { name: nameAlt }));
        await dbRun('UPDATE forward_lists SET description = NULL WHERE list = ?', [nameAlt]);
        return msg.reply(t('forward.list.descRemoved', { name: nameAlt }));
    }
    await dbRun('UPDATE forward_lists SET description = ? WHERE list = ?', [rest, nameAlt]);
    await msg.reply(t(line.description ? 'forward.list.descReplaced' : 'forward.list.descSaved', { name: nameAlt }), undefined, WITHOUT_PREVIEW);
}

/*
 * The #lists in a send's text (outside /.../ and "..."): removes them from the text and returns the members.
 * Whole name (no partial search). error: the message to reply with (a list that does not exist).
 * @returns {Promise<{ rest: string, destinations: object[] } | { error: string }>}
 */
async function expandLists(textAlt) {
    await dbReady;
    const mask = textAlt.replace(/\/[^/]*\/|"[^"]*"/g, (m) => ' '.repeat(m.length));
    const foundAlt4 = [...mask.matchAll(/(^|\s)#([^\s#]+)(?=\s|$)/g)];
    if (!foundAlt4.length) return { rest: textAlt, destinations: [] };

    let rest = textAlt;
    for (const m of [...foundAlt4].reverse()) {
        const marker = m.index + m[1].length;
        rest = rest.slice(0, marker) + ' '.repeat(m[0].length - m[1].length) + rest.slice(marker + m[0].length - m[1].length);
    }

    const names = [...new Set(foundAlt4.map(m => readName(m[2])))];
    const allAlt = await listAll();
    const missing = names.filter(n => !allAlt.some(l => l.list === n));
    if (missing.length) return { error: t('forward.list.notFound', { name: missing.join(', #') }) };

    const destinations = names.reduce((acc, n) => join(acc, membersAlt(allAlt.find(l => l.list === n))), []);
    return { rest: rest.replace(/[ \t]{2,}/g, ' ').trim(), destinations };
}

// The list-management options: true if the text was one of them (already handled), false if not
async function manage(msg, textAlt) {
    await dbReady;
    const [optionAlt = '', ...words] = textAlt.trim().split(/\s+/);
    const rest = textAlt.trim().slice(optionAlt.length).trim();
    const nameAlt = optionAlt.toLowerCase();

    const handlers = {
        '-add': () => addAlt(msg, rest), '-a': () => addAlt(msg, rest),
        '-list': () => listAlt(msg, rest), '-l': () => listAlt(msg, rest),
        '-rm': () => removeAlt2(msg, words.join(' ')), '-r': () => removeAlt2(msg, words.join(' ')),
        '-move': () => transfer(msg, rest), '-m': () => transfer(msg, rest),
        '-copy': () => transfer(msg, rest, { copy: true }), '-c': () => transfer(msg, rest, { copy: true }),
        '-desc': () => describe(msg, rest)
    };
    if (!Object.hasOwn(handlers, nameAlt)) return false;
    await handlers[nameAlt]();
    return true;
}

module.exports = { expandLists, manage };
