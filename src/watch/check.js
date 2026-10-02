/*
 * Watch: tests the received messages against the rules and notifies you in private
 * (or in the -to destination of each rule: another chat or email).
 */

const { findCommand } = require('../commands/base');
const { resolverMentions } = require('../contacts');
const { dbAll, dbRun } = require('../db');
const { lineDestination, sendOnDestination } = require('../destinations');
const { printError, printInfo } = require('../log');
const { getSetting } = require('../settings');
const { formatData } = require('../util/format');
const { compileRuleWatch } = require('./rules');

async function checkWatch({ msg, msgIdPure, body, chatId, chatName, isGroup, senderName, senderNumber, timestamp }) {
    // Your messages are left out: including /watch's own notices in your private chat
    if (msg.fromMe || !body) return;
    if (!findCommand('/watch')) return;

    const rules = getSetting('watch.rules');
    if (!rules.length) return;

    const matched = rules
        .map((rule, i) => ({ regra: rule, n: i + 1 }))
        .filter(({ regra: rule }) => {
            try {
                return compileRuleWatch(rule)(body);
            } catch {
                return false;
            }
        });

    if (!matched.length) return;

    // Only notifies about new occurrences (WhatsApp may resend the same message)
    const freshAlt2 = [];

    for (const c of matched) {
        const res = await dbRun(
            `INSERT OR IGNORE INTO watch_hits
                (rule, message_id, chat_id, chat_name, is_group, sender_name, sender_number, body, timestamp)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [c.regra, msgIdPure, chatId, chatName, isGroup, senderName, senderNumber, body, timestamp]
        );

        if (res.changes) freshAlt2.push(c);
    }

    if (!freshAlt2.length) return;

    const details =
        (isGroup ? `👥 *Grupo:* ${chatName}\n` : '') +
        `👤 *Nome:* ${senderName}\n` +
        `📱 *Número:* ${senderNumber ? `+${senderNumber}` : 'Número indisponível'}\n` +
        `📅 *Enviada em:* ${formatData(timestamp)}\n` +
        `💬 *Texto:* "${await resolverMentions(body, msg.mentionedIds)}"`;

    // One notice per destination, with only its rules (without -to: your private chat)
    const linesAlt = await dbAll(
        `SELECT * FROM watch_destinations WHERE rule IN (${freshAlt2.map(() => '?').join(', ')})`, freshAlt2.map(c => c.regra));
    const destinationAlt = new Map(linesAlt.map(r => [r.rule, lineDestination(r)]));
    const byDestination = Map.groupBy(freshAlt2, (c) => {
        const d = destinationAlt.get(c.regra);
        return d ? (d.email ? `email:${d.email}` : d.id) : 'privado';
    });

    printInfo(`/watch: regra(s) ${freshAlt2.map(c => `#${c.n}`).join(',')} casaram em '${chatName}' (${senderName})`);

    for (const destinationAlt2 of byDestination.values()) {
        const destination = destinationAlt.get(destinationAlt2[0].regra) ?? null;
        const textAlt = '👀 *WATCH: MENSAGEM DETECTADA*\n\n' +
            destinationAlt2.map(c => `🔎 *Regra #${c.n}:* ${c.regra}\n`).join('') + details;

        await sendOnDestination(destination, textAlt, {
            assunto: `👀 Watch: ${destinationAlt2.map(c => `#${c.n} ${c.regra}`).join(', ')}`,
            opcoes: { linkPreview: false }
        }).catch(err => printError('/watch: falha ao avisar:', err.message));
    }
}

module.exports = {
    checkWatch
};
