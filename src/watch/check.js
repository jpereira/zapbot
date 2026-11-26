/*
 * Watch: tests the received messages against the rules and notifies you in private
 * (or in the -to destinations of each rule: other chats or emails).
 */

const { findCommand } = require('../commands/base');
const { resolveMentions } = require('../contacts');
const { dbAll, dbRun } = require('../db');
const { lineDestination, destinationsSaved, sendOnDestination } = require('../destinations');
const { pushNotice } = require('../webPush');
const { printError, printInfo } = require('../log');
const { ignoreNotice } = require('../mute');
const { t } = require('../i18n');
const { getSetting } = require('../settings');
const { formatData } = require('../util/format');
const { maskPhones } = require('../util/phone');
const { compileRuleWatch } = require('./rules');
const { headerOrigin } = require('../util/origin');

async function checkWatch({
    msg, msgIdPure, body, chatId, chatName, isGroup, senderName, senderJid, senderNumber, timestamp
}) {
    // Your messages are left out: including /watch's own notices in your private chat
    if (msg.fromMe || !body) return;
    if (!findCommand('/watch')) return;

    const rules = getSetting('watch.rules');
    if (!rules.length) return;
    const origins = new Map((await dbAll('SELECT * FROM watch_sources')).map(r => [r.rule, r]));

    const matched = [];
    for (const [i, rule] of rules.entries()) {
        const origin = origins.get(rule);
        if (origin) {
            const matches = origin.source_kind === 'contato'
                ? origin.source_id === senderJid ||
                    origin.source_id === `${senderNumber}@c.us`
                : origin.source_id === chatId;
            if (!matches) continue;
        }
        try {
            if (await compileRuleWatch(rule)(body)) matched.push({ rule, n: i + 1 });
        } catch {
            // The configuration can contain an invalid rule.
        }
    }

    if (!matched.length) return;

    // Only notifies about new occurrences (WhatsApp may resend the same message)
    const freshAlt2 = [];

    for (const c of matched) {
        const res = await dbRun(
            `INSERT OR IGNORE INTO watch_hits
                (rule, message_id, chat_id, chat_name, is_group, sender_name, sender_number, body, timestamp)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [c.rule, msgIdPure, chatId, chatName, isGroup, senderName, senderNumber, body, timestamp]
        );

        if (res.changes) freshAlt2.push(c);
    }

    if (!freshAlt2.length) return;

    // A rule with its notice turned off keeps the occurrence (above) and tells nobody
    const muted = new Set((await dbAll('SELECT rule FROM watch_muted')).map(r => r.rule));
    const toNotify = freshAlt2.filter(c => !muted.has(c.rule));
    if (!toNotify.length) return;

    const details =
        headerOrigin({ chatId, chatName, isGroup, senderName, senderNumber }) +
        t('watch.sentAt', { date: formatData(timestamp) }) +
        t('watch.text', { text: await resolveMentions(body, msg.mentionedIds) });

    /*
     * One notice per destination, with only its rules (without -to: your private chat). A
     * a rule with several -to goes into each one's notice.
     */
    const linesAlt = await dbAll(
        `SELECT * FROM watch_destinations WHERE rule IN (${toNotify.map(() => '?').join(', ')})`, toNotify.map(c => c.rule));
    const destinationsAlt = new Map(linesAlt.map(r => [r.rule, destinationsSaved(r.recipients, lineDestination(r))]));
    const byDestination = new Map();
    for (const c of toNotify) {
        const destinations = destinationsAlt.get(c.rule) ?? [];
        for (const d of destinations.length ? destinations : [null]) {
            const keyAlt = d ? (d.email ? `email:${d.email}` : d.id) : 'privado';
            if (!byDestination.has(keyAlt)) byDestination.set(keyAlt, { destination: d, rules: [] });
            byDestination.get(keyAlt).rules.push(c);
        }
    }

    printInfo(`/watch: rule(s) ${toNotify.map(c => `#${c.n}`).join(',')} matched in '${chatName}' (${senderName})`);

    // /mute: the notice in your private chat is muted (the occurrence stays saved and the -to receive it)
    if (byDestination.has('privado') &&
        await ignoreNotice('watch', { chatId, senders: [senderJid, senderNumber] })) {
        byDestination.delete('privado');
    }

    // 🔒 (-mask N): if any rule of the notice has the padlock, the whole notice goes out with obfuscated phones
    const locked = new Set((await dbAll('SELECT rule FROM watch_masks')).map(r => r.rule));

    // The notice of your private chat also goes to the browsers with the web notices on; a click opens the message
    const mine = byDestination.get('privado');
    if (mine) {
        const obfuscate = mine.rules.some(c => locked.has(c.rule));
        const mask = (s) => obfuscate ? maskPhones(s) : s;
        pushNotice('watch', {
            title: mask(`👀 ${mine.rules.map(c => c.rule).join(', ')}`),
            body: mask(`${chatName}${isGroup ? ` · ${senderName}` : ''}: ${String(body ?? '').slice(0, 300)}`),
            url: `/?chat=${encodeURIComponent(chatId)}&msg=${encodeURIComponent(msgIdPure)}&at=${timestamp}`, tag: `watch:${msgIdPure}`
        });
    }

    for (const { destination, rules } of byDestination.values()) {
        const obfuscate = rules.some(c => locked.has(c.rule));
        const mask = (s) => obfuscate ? maskPhones(s) : s;
        const textAlt = mask(t('watch.detected') +
            rules.map(c => t('watch.ruleLine', { n: c.n, rule: c.rule })).join('') + details);

        await sendOnDestination(destination, textAlt, {
            subject: mask(`👀 Watch: ${rules.map(c => `#${c.n} ${c.rule}`).join(', ')}`),
            options: { linkPreview: false }
        }).catch(err => printError('/watch: failed to notify:', err.message));
    }
}

module.exports = {
    checkWatch
};
