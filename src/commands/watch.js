/*
 * Comando /watch.
 */

const { commandUsage } = require('./base');
const { resolverMentions, channelResolverName, groupResolverName } = require('../contacts');
const { dbAll, dbGet, dbReady, dbRun } = require('../db');
const {
    destinationColumns, describeDestinations, lineDestination, destinationsSaved, recipientsDe,
    resolverDestinations, resolverOrChoose
} = require('../destinations');
const { printInfo } = require('../log');
const { t } = require('../i18n');
const { getSetting, setSetting } = require('../settings');
const { countAlt } = require('../util/count');
const { formatData, summarizeText, withoutAccents } = require('../util/format');
const { isChannelAlt } = require('../util/origin');
const { maskPhones } = require('../util/phone');
const { RULE_REGEX, compileSearch, compileRuleWatch } = require('../watch/rules');
const { readOptionsWatch } = require('../watch/options');

/*
 * Direct rules; -in restricts the origin and -to picks where the notice will be sent.
 * -N is the number of matches. -s/-r/-f take the rule number without a hyphen
 * or the rule itself (/watch -s /Jorge/). -q filters the matches by text or
 * /regex/flags (/watch -s 3 -q carro).
 */
// The notice destinations of a watch_destinations row
const lineDestinations = (r) => destinationsSaved(r.recipients, lineDestination(r));

// rule → the destinations of its notices (only those with -to)
async function rulesDestinations() {
    const linesAlt = await dbAll('SELECT * FROM watch_destinations');
    return new Map(linesAlt.map(r => [r.rule, lineDestinations(r)]));
}

// Without destinations ([]): the row goes away, and the notices go back to your private chat
async function recordDestinations(rule, destinations) {
    if (!destinations.length) {
        await dbRun('DELETE FROM watch_destinations WHERE rule = ?', [rule]);
        return;
    }

    const c = destinationColumns(destinations[0]);
    await dbRun(
        `INSERT INTO watch_destinations (rule, dest_id, dest_name, dest_is_group, dest_email, recipients) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(rule) DO UPDATE SET dest_id = excluded.dest_id, dest_name = excluded.dest_name,
            dest_is_group = excluded.dest_is_group, dest_email = excluded.dest_email, recipients = excluded.recipients`,
        [rule, c.dest_id, c.dest_name, c.dest_is_group, c.dest_email, recipientsDe(destinations)]
    );
}

// Rules with the 🔒 (-mask N): notices and occurrences come out with obfuscated phones
async function rulesLocked() {
    return new Set((await dbAll('SELECT rule FROM watch_masks')).map(r => r.rule));
}

const whereWarn = (destinations) => (destinations.length ? describeDestinations(destinations) : t('watch.yourPrivate'));

/**
 * The -to destinations: "off" (or "ownerOnly") goes back to your private chat; otherwise, each one
 * is a contact, group, number or email (several with the name: you choose from the list).
 * @returns {Promise<{ destinations: object[] } | null>}  null: already replied the error
 */
async function toReadDestinations(msg, texts) {
    if (texts.some(x => /^(off|privado|private)$/i.test(String(x ?? '').trim()))) {
        if (texts.length > 1) {
            await msg.reply(t('watch.toOffAlone'));
            return null;
        }
        return { destinations: [] };
    }
    const destinations = await resolverDestinations(msg, texts, { acceptsEmail: true });
    return destinations ? { destinations } : null;
}


/**
 * The rule no. by its text: equal; equal ignoring case and
 * accents; or contained in a single rule.
 * @returns {Promise<number|null>} null: already replied the error
 */
async function ruleNumber(msg, ref, rules) {
    const exact = rules.indexOf(ref);
    if (exact >= 0) return exact + 1;
    const equal = rules.findIndex(r => withoutAccents(r) === withoutAccents(ref));
    if (equal >= 0) return equal + 1;

    const contains = rules.map((r, i) => ({ r, n: i + 1 })).filter(({ r }) => withoutAccents(r).includes(withoutAccents(ref)));
    if (contains.length === 1) return contains[0].n;

    await msg.reply(contains.length
        ? t('watch.multiMatch', { ref, count: contains.length }) +
            contains.map(({ r, n }) => `#${n}  ${r}`).join('\n') +
            t('watch.multiMatchFooter')
        : t('watch.noRuleMatches', { ref }));
    return null;
}

const tips = () => t('watch.tips');

async function listRules(rules) {
    const count = new Map((await dbAll('SELECT rule, COUNT(*) AS total FROM watch_hits GROUP BY rule'))
        .map(r => [r.rule, r.total]));
    const destinations = await rulesDestinations();
    const origins = new Map((await dbAll('SELECT * FROM watch_sources')).map(r => [r.rule, r]));
    const locked = await rulesLocked();
    const width = String(rules.length).length + 1;
    const list = rules.map((r, i) => {
        const origin = origins.get(r);
        const only = origin ? t('watch.onlyIn', { icon: origin.source_kind === 'canal' ? '📰'
            : origin.source_kind === 'grupo' ? '👥' : '👤', name: origin.source_name }) : '';
        return `${`#${i + 1}`.padEnd(width)}  ${r}  (${count.get(r) ?? 0})${locked.has(r) ? ' 🔒' : ''}${only}` +
            (destinations.get(r)?.length ? `  → ${describeDestinations(destinations.get(r))}` : '');
    });
    return t('watch.listTitle', { count: rules.length, max: getSetting('watch.max') }) +
        (list.length ? list.join('\n') : t('watch.noRules'));
}

/*
 * The rule's occurrences (null: of all), most recent first. With a search, only the
 * that match: text, case and accent insensitive, or /regex/flags
 * (filtered here: SQLite neither ignores accents nor has regex).
 */
async function listOccurrences(rule, rules, limitAlt, complete = false, search = null) {
    const filter = rule === null ? '' : 'WHERE rule = ?';
    const params = rule === null ? [] : [rule];
    const max = Math.min(limitAlt ?? getSetting('watch.showMax'), getSetting('watch.showMax'));
    let total;
    let rows;
    if (search === null) {
        ({ total } = await dbGet(`SELECT COUNT(*) AS total FROM watch_hits ${filter}`, params));
        rows = await dbAll(
            `SELECT * FROM watch_hits ${filter} ORDER BY timestamp DESC, id DESC LIMIT ?`, [...params, max]);
    } else {
        const home = compileSearch(search);
        const allAlt = await dbAll(`SELECT * FROM watch_hits ${filter} ORDER BY timestamp DESC, id DESC`, params);
        const match = allAlt.filter(h => home(h.body));
        total = match.length;
        rows = match.slice(0, max);
    }
    const locked = await rulesLocked();
    let textAlt = t('watch.hitsTitle') + (rule === null ? t('watch.rulesAll')
        : t('watch.ruleLine', { n: rules.indexOf(rule) + 1, rule: rule }));
    if (search !== null) textAlt += t('watch.searchLine', { query: search });
    textAlt += t('watch.total', { total, shown: total > rows.length ? t('watch.showingLatest', { count: rows.length }) : '' });
    if (!rows.length) {
        textAlt += search === null ? t('watch.noneYet') : t('watch.noneWith', { query: search });
    }
    for (const [i, h] of rows.entries()) {
        const group = h.is_group ? (await groupResolverName(h.chat_id)) || h.chat_name : null;
        const channel = isChannelAlt(h.chat_id)
            ? (await channelResolverName(h.chat_id)) || h.chat_name : null;
        const whereAlt = channel ? `📰 ${channel}`
            : h.is_group ? `👥 ${group} · 👤 ${h.sender_name}` : `👤 ${h.sender_name}`;
        const n = rules.indexOf(h.rule) + 1;
        const which = rule === null ? ` · 🔎 ${n ? `#${n}` : t('watch.removed')}` : '';
        const resolved = await resolverMentions(h.body);
        const body = locked.has(h.rule) ? maskPhones(resolved) : resolved;
        textAlt += t('watch.hitLine', { i: i + 1, date: formatData(h.timestamp), which: which, where: whereAlt,
            body: complete ? body : summarizeText(body) });
    }
    return { total, text: textAlt };
}

async function cmdWatch({ msg, args }) {
    await dbReady;
    let o;
    try {
        o = readOptionsWatch(args);
    } catch (err) {
        await msg.reply(t('watch.optionError', { error: err.message }) + commandUsage('/watch'));
        return;
    }
    const rules = getSetting('watch.rules');
    const help = () => msg.reply(commandUsage('/watch'));
    if (o.lock) {
        const { n, turnOn } = o.lock;
        const target = rules[n - 1];
        if (!target) {
            await msg.reply(t('watch.ruleMissing', { n, rules: countAlt('watch.rules', rules.length) }));
            return;
        }
        if (turnOn) await dbRun('INSERT OR IGNORE INTO watch_masks (rule) VALUES (?)', [target]);
        else await dbRun('DELETE FROM watch_masks WHERE rule = ?', [target]);
        await msg.reply(turnOn
            ? t('watch.maskOn', { n, rule: target })
            : t('watch.maskOff', { n, rule: target }));
        return;
    }
    if (o.rule) {
        if (o.limit !== null) { await help(); return; }
        try { compileRuleWatch(o.rule); } catch (err) {
            await msg.reply(t('watch.invalidRule', { error: err.message }));
            return;
        }
        if (rules.includes(o.rule)) {
            await msg.reply(t('watch.exists', { n: rules.indexOf(o.rule) + 1, rule: o.rule }));
            return;
        }
        if (rules.length >= getSetting('watch.max')) {
            await msg.reply(t('watch.limitReached', { max: getSetting('watch.max') }));
            return;
        }
        let origin;
        if (o.origin !== null) {
            origin = await resolverOrChoose(msg, o.origin, { acceptsChannel: true,
                noEmail: t('watch.inNoEmail') });
            if (!origin) return;
        }
        const wasRead = o.destinations.length ? await toReadDestinations(msg, o.destinations) : { destinations: [] };
        if (!wasRead) return;
        await setSetting('watch.rules', [...rules, o.rule]);
        // A recreated rule does not inherit an old origin left by /set.
        await dbRun('DELETE FROM watch_sources WHERE rule = ?', [o.rule]);
        await dbRun('DELETE FROM watch_masks WHERE rule = ?', [o.rule]);
        // /watch /rule/ -mask: is born with the 🔒
        if (o.mask) await dbRun('INSERT INTO watch_masks (rule) VALUES (?)', [o.rule]);
        if (origin) {
            await dbRun('INSERT INTO watch_sources VALUES (?, ?, ?, ?)',
                [o.rule, origin.id, origin.name, origin.channel ? 'canal' : origin.group
                    ? 'grupo' : 'contato']);
        }
        await recordDestinations(o.rule, wasRead.destinations);
        const type = t(RULE_REGEX.test(o.rule) ? 'watch.kindRegex' : 'watch.kindText');
        printInfo(`/watch: rule #${rules.length + 1} added: ${o.rule}`);
        await msg.reply(t('watch.added', { n: rules.length + 1, kind: type, rule: o.rule }) +
            (origin ? t('watch.addedOnlyIn', { where: describeDestinations([origin]) }) : '') +
            (o.mask ? t('watch.addedMask') : '') +
            t('watch.addedAlerts', { where: wasRead.destinations.length ? t('watch.alertsIn', { where: whereWarn(wasRead.destinations) })
                : t('watch.alertsPrivate') }));
        return;
    }
    if (o.search !== null) {
        try { compileSearch(o.search); } catch (err) {
            await msg.reply(t('watch.queryInvalid', { error: err.message }));
            return;
        }
    }
    if (o.ref !== null) {
        o.n = await ruleNumber(msg, o.ref, rules);
        if (o.n === null) return;
    }
    const n = o.n ?? (o.destinations.length ? o.limit : null);
    const rule = n === null ? null : rules[n - 1];
    if (n !== null && !rule) {
        await msg.reply(t('watch.ruleMissing', { n, rules: countAlt('watch.rules', rules.length) }));
        return;
    }
    if (o.destinations.length) {
        if (!rule || (o.action && o.action !== 'show')) {
            await msg.reply(t('watch.badTo'));
            return;
        }
        const wasRead = await toReadDestinations(msg, o.destinations);
        if (!wasRead) return;
        await recordDestinations(rule, wasRead.destinations);
        await msg.reply(t('watch.toSet', { n, rule: rule, where: whereWarn(wasRead.destinations) }));
        return;
    }
    if (o.action === 'rm') {
        if (!rule) { await help(); return; }
        await setSetting('watch.rules', rules.filter((_, i) => i !== n - 1));
        const res = await dbRun('DELETE FROM watch_hits WHERE rule = ?', [rule]);
        await recordDestinations(rule, []);
        await dbRun('DELETE FROM watch_sources WHERE rule = ?', [rule]);
        await dbRun('DELETE FROM watch_masks WHERE rule = ?', [rule]);
        await msg.reply(t('watch.removedRule', { n, rule: rule }) +
            t('watch.deletedHits', { count: res.changes }) +
            (n < rules.length ? t('watch.renumbered') : ''));
        return;
    }
    if (o.action === 'flush') {
        const res = rule === null ? await dbRun('DELETE FROM watch_hits')
            : await dbRun('DELETE FROM watch_hits WHERE rule = ?', [rule]);
        await msg.reply((rule === null ? t('watch.flushAll') : t('watch.flushOne', { n, rule: rule })) +
            t('watch.deletedHits', { count: res.changes }) + '\n' +
            t('watch.flushFooter'));
        return;
    }
    if (o.action === 'show') {
        await msg.reply((await listOccurrences(rule, rules, o.limit, true, o.search)).text + tips());
        return;
    }
    let textAlt = await listRules(rules);
    if (o.action !== 'list') {
        const occurrences = await listOccurrences(null, rules, o.limit, false, o.search);
        if (occurrences.total || o.search !== null) textAlt += '\n\n' + occurrences.text;
    }
    await msg.reply(textAlt + tips());
}

module.exports = { cmdWatch };
