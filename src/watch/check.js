/*
 * Watch: tests the received messages against the rules and notifies you in private
 * (or in the -to destinations of each rule: other chats or emails).
 */

const { findCommand } = require('../commands/base');
const { resolverMentions } = require('../contacts');
const { dbAll, dbRun } = require('../db');
const { lineDestination, destinationsSaved, sendOnDestination } = require('../destinations');
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

    /*
     * One notice per destination, with only its rules (without -to: your private chat). A
     * a rule with several -to goes into each one's notice.
     */
    const linesAlt = await dbAll(
        `SELECT * FROM watch_destinations WHERE rule IN (${freshAlt2.map(() => '?').join(', ')})`, freshAlt2.map(c => c.regra));
    const destinationsAlt = new Map(linesAlt.map(r => [r.rule, destinationsSaved(r.recipients, lineDestination(r))]));
    const byDestination = new Map();
    for (const c of freshAlt2) {
        const destinations = destinationsAlt.get(c.regra) ?? [];
        for (const d of destinations.length ? destinations : [null]) {
            const keyAlt = d ? (d.email ? `email:${d.email}` : d.id) : 'privado';
            if (!byDestination.has(keyAlt)) byDestination.set(keyAlt, { destino: d, regras: [] });
            byDestination.get(keyAlt).regras.push(c);
        }
    }

    printInfo(`/watch: regra(s) ${freshAlt2.map(c => `#${c.n}`).join(',')} casaram em '${chatName}' (${senderName})`);

    for (const { destino: destination, regras: rules } of byDestination.values()) {
        const textAlt = '👀 *WATCH: MENSAGEM DETECTADA*\n\n' +
            rules.map(c => `🔎 *Regra #${c.n}:* ${c.regra}\n`).join('') + details;

        await sendOnDestination(destination, textAlt, {
            assunto: `👀 Watch: ${rules.map(c => `#${c.n} ${c.regra}`).join(', ')}`,
            opcoes: { linkPreview: false }
        }).catch(err => printError('/watch: falha ao avisar:', err.message));
    }
}

module.exports = {
    checkWatch
};
