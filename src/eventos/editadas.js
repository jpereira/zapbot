/*
 * Mensagens editadas: evento 'message_edit' e o renderizador usado também pelo /show -e.
 */

const { client } = require('../cliente');
const { dbGet, dbPronto, dbRun } = require('../db');
const { resolverAutorApagada } = require('./apagadas');
const { printError, printInfo } = require('../log');
const { ignorarAviso } = require('../mudo');
const { getSetting } = require('../settings');
const { contarStats } = require('../stats');
const { formatarData } = require('../util/formatar');

/*
 * Mensagens editadas
 *
 * Mesma ideia das apagadas: o evento 'message_edit' grava a edição (texto de
 * antes e de depois) na tabela message_edits e avisa você no privado (setting
 * 'show.alert.edited'); o /show -e reexibe sob demanda.
 */
async function enviarMensagemEditada(destino, row, info, { titulo = '✏️ *MENSAGEM EDITADA DETECTADA*' } = {}) {
    let texto = `${titulo}\n\n`;

    if (row.is_group === 1) {
        texto += `👥 *Grupo:* ${info.nomeChat}\n`;
    }

    texto +=
        `👤 *Nome:* ${info.nomeRemetente}\n` +
        `📱 *Número:* ${info.numeroRemetente ? `+${info.numeroRemetente}` : 'Número indisponível'}\n` +
        `📅 *Enviada em:* ${formatarData(row.timestamp)}\n` +
        `✏️ *Editada em:* ${formatarData(row.edited_at)}\n` +
        `📝 *Antes:* "${row.old_body || '(vazio)'}"\n` +
        `💬 *Depois:* "${row.new_body || '(vazio)'}"`;

    await client.sendMessage(destino, texto, { linkPreview: false });
}

client.on('message_edit', async (msg, newBody, prevBody) => {
    try {
        /*
         * O whatsapp-web.js emite este evento em qualquer 'change:body/caption',
         * inclusive quando o WhatsApp Web só termina de carregar o texto. Edição
         * de verdade traz latestEditSenderTimestampMs/latestEditMsgKey.
         */
        if (!msg.latestEditSenderTimestampMs && !msg.latestEditMsgKey) return;

        // As suas edições (e as do próprio bot) não interessam
        if (msg.fromMe) return;

        const antes = String(prevBody ?? '');
        const depois = String(newBody ?? '');
        if (antes === depois) return;

        const messageId = msg.id?.id;
        const chatId = msg.id?.remote || msg.from;

        if (!messageId || !chatId) {
            printError('[Edit] Não foi possível identificar a mensagem editada.');
            return;
        }

        await dbPronto;

        // O que já sabemos da mensagem original (gravada no message_create)
        const original = await dbGet('SELECT * FROM messages WHERE id = ?', [messageId]);

        const row = {
            message_id: messageId,
            chat_id: chatId,
            chat_name: original?.chat_name || null,
            is_group: chatId.endsWith('@g.us') ? 1 : 0,
            sender_name: original?.sender_name || null,
            sender_number: original?.sender_number || null,
            type: msg.type,
            old_body: antes,
            new_body: depois,
            timestamp: original?.timestamp || msg.timestamp,
            edited_at: Number(msg.latestEditSenderTimestampMs) || Date.now()
        };

        const info = await resolverAutorApagada(row, { after: msg, before: msg });
        row.chat_name = info.nomeChat;
        row.sender_name = info.nomeRemetente;
        row.sender_number = info.numeroRemetente;

        const res = await dbRun(
            `INSERT OR IGNORE INTO message_edits
                (message_id, chat_id, chat_name, is_group, sender_name, sender_number,
                 type, old_body, new_body, timestamp, edited_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [row.message_id, row.chat_id, row.chat_name, row.is_group, row.sender_name, row.sender_number,
             row.type, row.old_body, row.new_body, row.timestamp, row.edited_at]
        );

        // Mesma edição avisada de novo (body e caption): já gravada e avisada
        if (!res.changes) return;

        // Se a mensagem for apagada depois, o /show mostra o texto final
        await dbRun('UPDATE messages SET body = ? WHERE id = ? AND revoked = 0', [depois, messageId]);

        printInfo(`[Edit] Mensagem ${messageId} editada em ${row.chat_name}`);

        await contarStats({
            chatId, chatName: row.chat_name, isGroup: row.is_group,
            senderId: original?.sender_number || original?.sender_jid || row.sender_number,
            senderName: row.sender_name,
            campos: { edited: 1 }
        });

        // /mudo: o aviso deste chat ou desta pessoa está em silêncio (a edição fica guardada para o /show -e)
        const remetentes = [original?.sender_jid, original?.sender_number, row.sender_number];
        if (getSetting('show.alert.edited') && !(await ignorarAviso('editada', { chatId, remetentes }))) {
            await enviarMensagemEditada(client.info.wid._serialized, row, info);
        }
    } catch (err) {
        printError('[Edit] Erro ao processar mensagem editada:', err.message);
    }
});

module.exports = {
    enviarMensagemEditada
};
