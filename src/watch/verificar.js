/*
 * Watch: testa as mensagens recebidas contra as regras e avisa no seu privado
 * (ou nos destinos dos -to de cada regra: outros chats ou e-mails).
 */

const { findCommand } = require('../comandos/base');
const { resolverMencoes } = require('../contatos');
const { dbAll, dbRun } = require('../db');
const { destinoDaLinha, destinosSalvos, enviarAoDestino } = require('../destinos');
const { printError, printInfo } = require('../log');
const { getSetting } = require('../settings');
const { formatarData } = require('../util/formatar');
const { compilarRegraWatch } = require('./regras');
const { cabecalhoOrigem } = require('../util/origem');

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

    const detalhes =
        cabecalhoOrigem({ chatId, chatName, isGroup, senderName, senderNumber }) +
        `📅 *Enviada em:* ${formatarData(timestamp)}\n` +
        `💬 *Texto:* "${await resolverMencoes(body, msg.mentionedIds)}"`;

    /*
     * Um aviso por destino, só com as regras dele (sem -to: o seu privado). Uma
     * regra com vários -to entra no aviso de cada um.
     */
    const linhas = await dbAll(
        `SELECT * FROM watch_destinations WHERE rule IN (${novas.map(() => '?').join(', ')})`, novas.map(c => c.regra));
    const destinosDe = new Map(linhas.map(r => [r.rule, destinosSalvos(r.recipients, destinoDaLinha(r))]));
    const porDestino = new Map();
    for (const c of novas) {
        const destinos = destinosDe.get(c.regra) ?? [];
        for (const d of destinos.length ? destinos : [null]) {
            const chave = d ? (d.email ? `email:${d.email}` : d.id) : 'privado';
            if (!porDestino.has(chave)) porDestino.set(chave, { destino: d, regras: [] });
            porDestino.get(chave).regras.push(c);
        }
    }

    printInfo(`/watch: regra(s) ${novas.map(c => `#${c.n}`).join(',')} casaram em '${chatName}' (${senderName})`);

    for (const { destino, regras } of porDestino.values()) {
        const texto = '👀 *WATCH: MENSAGEM DETECTADA*\n\n' +
            regras.map(c => `🔎 *Regra #${c.n}:* ${c.regra}\n`).join('') + detalhes;

        await enviarAoDestino(destino, texto, {
            assunto: `👀 Watch: ${regras.map(c => `#${c.n} ${c.regra}`).join(', ')}`,
            opcoes: { linkPreview: false }
        }).catch(err => printError('/watch: falha ao avisar:', err.message));
    }
}

module.exports = {
    verificarWatch
};
