/*
 * Watch: testa as mensagens recebidas contra as regras e avisa no seu privado.
 */

const { client } = require('../cliente');
const { findCommand } = require('../comandos/base');
const { resolverMencoes } = require('../contatos');
const { dbRun } = require('../db');
const { printInfo } = require('../log');
const { getSetting } = require('../settings');
const { formatarData } = require('../util/formatar');
const { compilarRegraWatch } = require('./regras');

async function verificarWatch({ msg, msgIdPure, body, chatId, chatName, isGroup, senderName, senderNumber, timestamp }) {
    // As suas mensagens ficam de fora: inclusive os próprios avisos do /watch no seu privado
    if (msg.fromMe || !body) return;
    if (!findCommand('/watch')) return;

    const regras = getSetting('watch.rules');
    if (!regras.length) return;

    const casadas = regras
        .map((regra, i) => ({ regra, n: i + 1 }))
        .filter(({ regra }) => {
            try {
                return compilarRegraWatch(regra)(body);
            } catch {
                return false;
            }
        });

    if (!casadas.length) return;

    // Só avisa das ocorrências novas (o WhatsApp pode reenviar a mesma mensagem)
    const novas = [];

    for (const c of casadas) {
        const res = await dbRun(
            `INSERT OR IGNORE INTO watch_hits
                (rule, message_id, chat_id, chat_name, is_group, sender_name, sender_number, body, timestamp)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [c.regra, msgIdPure, chatId, chatName, isGroup, senderName, senderNumber, body, timestamp]
        );

        if (res.changes) novas.push(c);
    }

    if (!novas.length) return;

    let texto = '👀 *WATCH: MENSAGEM DETECTADA*\n\n';

    for (const c of novas) {
        texto += `🔎 *Regra #${c.n}:* ${c.regra}\n`;
    }

    if (isGroup) {
        texto += `👥 *Grupo:* ${chatName}\n`;
    }

    texto +=
        `👤 *Nome:* ${senderName}\n` +
        `📱 *Número:* ${senderNumber ? `+${senderNumber}` : 'Número indisponível'}\n` +
        `📅 *Enviada em:* ${formatarData(timestamp)}\n` +
        `💬 *Texto:* "${await resolverMencoes(body, msg.mentionedIds)}"`;

    printInfo(`/watch: regra(s) ${novas.map(c => `#${c.n}`).join(',')} casaram em '${chatName}' (${senderName})`);
    await client.sendMessage(client.info.wid._serialized, texto, { linkPreview: false });
}

module.exports = {
    verificarWatch
};
