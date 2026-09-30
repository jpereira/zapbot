/*
 * Watch: tests the received messages against the rules and notifies you in private.
 */

const { client } = require('../client');
const { findCommand } = require('../commands/base');
const { resolverMentions } = require('../contacts');
const { dbRun } = require('../db');
const { printInfo } = require('../log');
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

    let textAlt = '👀 *WATCH: MENSAGEM DETECTADA*\n\n';

    for (const c of freshAlt2) {
        textAlt += `🔎 *Regra #${c.n}:* ${c.regra}\n`;
    }

    if (isGroup) {
        textAlt += `👥 *Grupo:* ${chatName}\n`;
    }

    textAlt +=
        `👤 *Nome:* ${senderName}\n` +
        `📱 *Número:* ${senderNumber ? `+${senderNumber}` : 'Número indisponível'}\n` +
        `📅 *Enviada em:* ${formatData(timestamp)}\n` +
        `💬 *Texto:* "${await resolverMentions(body, msg.mentionedIds)}"`;

    printInfo(`/watch: regra(s) ${freshAlt2.map(c => `#${c.n}`).join(',')} casaram em '${chatName}' (${senderName})`);
    await client.sendMessage(client.info.wid._serialized, textAlt, { linkPreview: false });
}

module.exports = {
    checkWatch
};
