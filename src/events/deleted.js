/*
 * Deleted messages: 'message_revoke_everyone' event and the renderer also used by /show.
 */

const { MessageMedia, Location } = require('whatsapp-web.js');
const fs = require('fs-extra');

const { client } = require('../client');
const { resolveLidToPhone } = require('../contacts');
const { dbGet, dbReady, dbRun } = require('../db');
const { printDebug, printError } = require('../log');
const { getSetting } = require('../settings');
const { countStats, myIdStats } = require('../stats');
const { mediaIsPath } = require('../util/files');
const { formatData } = require('../util/format');

/*
 * Deleted message recovery
 *
 * The same renderer is used in two places:
 * - event 'message_revoke_everyone' → sends to yourself, right away;
 * - command /show                    → resends in the current chat, on demand.
 */

// Status (stories) arrive through the 'status@broadcast' chat
const isStatus = (row) => row.chat_id === 'status@broadcast';

/**
 * Finds the chat and sender names of a deleted message.
 * With the event objects (after/before) it gets more precise names;
 * without them (/show) uses what was stored in the database.
 */
async function resolverAuthorDeleted(row, { after, before, protocolKey } = {}) {
    let nameChat = row.chat_name || 'Conversa desconhecida';
    let nameSender = row.sender_name || 'Desconhecido';
    let numberSender = row.sender_number || null;

    // Real name of the chat where the deletion happened
    if (after) {
        try {
            const chat = await after.getChat();
            if (chat?.name) nameChat = chat.name;
        } catch (chatError) {
            printError('[Revoke] Não foi possível recuperar o chat:', chatError.message);
        }
    }

    // Sender from the original message, when available
    if (before) {
        try {
            const contactAlt = await before.getContact();

            nameSender = contactAlt.pushname || contactAlt.name || contactAlt.shortName || nameSender;

            const contactId = contactAlt.id?._serialized || '';

            if (contactId.endsWith('@c.us')) {
                numberSender = contactId.split('@')[0];
            } else if (contactAlt.number) {
                numberSender = contactAlt.number;
            }
        } catch (contactError) {
            printError('[Revoke] Não foi possível recuperar o contato original:', contactError.message);
        }
    }

    // Converts @lid to a real phone, if possible
    const senderId = before?.author || protocolKey?.participant;

    if (senderId?.endsWith('@lid')) {
        const phoneId = await resolveLidToPhone(senderId);

        if (phoneId) {
            numberSender = phoneId.replace('@c.us', '').replace(/\D/g, '');

            const contactAlt = await client.getContactById(phoneId).catch(() => null);
            nameSender = contactAlt?.pushname || contactAlt?.name || contactAlt?.shortName || nameSender;
        }
    }

    return { nomeChat: nameChat, nomeRemetente: nameSender, numeroRemetente: numberSender };
}

/**
 * Sends a deleted message (text, media, location or contact) to `destino`.
 *
 * @param {string} destino              chat that will receive
 * @param {object} row                  row of the messages table
 * @param {object} info                 { nomeChat, nomeRemetente, numeroRemetente }
 * @param {object} [opcoes]
 * @param {string} [opcoes.titulo]      first line of the alert
 * @param {string[]} [opcoes.extras]    extra lines after "Enviada em"
 */
async function sendMessageDeleted(destination, row, info, { titulo: title = '❌ *MENSAGEM APAGADA DETECTADA*', extras = [] } = {}) {
    let alertText = `${title}\n\n`;

    if (row.is_group === 1) {
        alertText += `👥 *Grupo:* ${info.nomeChat}\n`;
    }

    alertText +=
        `👤 *Nome:* ${info.nomeRemetente}\n` +
        `📱 *Número:* ${info.numeroRemetente ? `+${info.numeroRemetente}` : 'Número indisponível'}\n` +
        `📅 *Enviada em:* ${formatData(row.timestamp)}\n`;

    for (const line of extras) {
        alertText += `${line}\n`;
    }

    // Location
    if (row.type === 'location' && row.location_lat !== null && row.location_lng !== null) {
        const latitude = Number(row.location_lat);
        const longitude = Number(row.location_lng);

        alertText +=
            '🗺️ *Tipo:* LOCALIZAÇÃO\n' +
            `🔗 *Link do mapa:* https://www.google.com/maps?q=${latitude},${longitude}`;

        await client.sendMessage(destination, alertText);
        await client.sendMessage(destination, new Location(latitude, longitude, row.body || 'Localização compartilhada'));
        return;
    }

    // Contato / vCard
    if (['vcard', 'contact', 'multi_vcard'].includes(row.type)) {
        alertText +=
            '📇 *Tipo:* CARTÃO DE CONTATO\n' +
            '💡 *Nota:* O contato está anexado abaixo.';

        // The body comes from whoever sent it: it only goes raw if it really is a vCard (never a text like "/cache -a")
        if (!row.body || /^BEGIN:VCARD/i.test(row.body.trim())) {
            await client.sendMessage(destination, alertText);
            if (row.body) await client.sendMessage(destination, row.body, { parseVCards: true });
        } else {
            await client.sendMessage(destination, `${alertText}\n💬 *Conteúdo:* "${row.body}"`);
        }
        return;
    }

    // Physical file
    if (row.has_media && mediaIsPath(row.media_path) && fs.existsSync(row.media_path)) {
        const mediaAttachment = MessageMedia.fromFilePath(row.media_path);
        const mimetype = mediaAttachment.mimetype || '';
        const captionAlt = row.body || 'Sem texto';

        if (row.type === 'audio' || row.type === 'ptt' || mimetype.startsWith('audio/')) {
            alertText += '🎵 *Tipo:* ÁUDIO / NOTA DE VOZ';

            await client.sendMessage(destination, alertText);
            await client.sendMessage(destination, mediaAttachment, { sendAudioAsVoice: true });
            return;
        }

        if (row.type === 'video' || row.type === 'image' || mimetype.startsWith('image/') || mimetype.startsWith('video/')) {
            alertText +=
                `🎬 *Tipo:* ${String(row.type).toUpperCase()}\n` +
                `💬 *Legenda:* "${captionAlt}"`;

            await client.sendMessage(destination, mediaAttachment, { caption: alertText });
            return;
        }

        alertText +=
            '📄 *Tipo:* DOCUMENTO\n' +
            `💬 *Legenda:* "${captionAlt}"`;

        await client.sendMessage(destination, mediaAttachment, { caption: alertText, sendMediaAsDocument: true });
        return;
    }

    // Media that existed but the file is no longer on disk
    if (row.has_media) {
        alertText += `📎 *Tipo:* ${String(row.type).toUpperCase()} _(arquivo não disponível no cache)_\n`;
    }

    // Texto
    alertText += `💬 *Texto:* "${row.body || 'Mensagem sem conteúdo'}"`;

    await client.sendMessage(destination, alertText, { linkPreview: true });
}

client.on('message_revoke_everyone', async (after, before) => {
    const protocolKey = after._data?.protocolMessageKey;
    const targetId = protocolKey?.id || before?.id?.id || after?.id?.id;

    if (!targetId) {
        printError('[Revoke] Não foi possível identificar a mensagem apagada.');
        return;
    }

    let row;
    try {
        await dbReady;
        row = await dbGet('SELECT * FROM messages WHERE id = ?', [targetId]);
    } catch (err) {
        printError('[Revoke] Erro ao consultar banco:', err.message);
        return;
    }

    if (!row) {
        printError(`[Revoke] Mensagem apagada ID ${targetId} não encontrada no banco.`);
        return;
    }

    if (isStatus(row) && !getSetting('revoke.status')) {
        printDebug(`[Revoke] Status apagado ID ${targetId} ignorado (revoke.status off).`);
        return;
    }

    try {
        const info = await resolverAuthorDeleted(row, { after, before, protocolKey });

        // Marks as deleted BEFORE sending: even if the send fails, /show finds it.
        // Also stores the names resolved now, which are more precise than those from receiving.
        await dbRun(
            `UPDATE messages
                SET revoked = 1,
                    revoked_at = ?,
                    chat_name = ?,
                    sender_name = ?,
                    sender_number = COALESCE(?, sender_number)
              WHERE id = ?`,
            [Date.now(), info.nomeChat, info.nomeRemetente, info.numeroRemetente, row.id]
        );

        // Deleted by you: counts for your number (in private, the stored sender is the other participant)
        const deMim = Boolean(after?.fromMe || before?.fromMe);

        await countStats({
            chatId: row.chat_id, chatName: info.nomeChat, isGroup: row.is_group,
            senderId: deMim ? myIdStats() : (row.sender_number || row.sender_jid),
            senderName: deMim ? (client.info?.pushname || 'Você') : info.nomeRemetente,
            campos: { deleted: 1 }
        });

        await sendMessageDeleted(client.info.wid._serialized, row, info, {
            titulo: isStatus(row) ? '📸 *STATUS APAGADO DETECTADO*' : '❌ *MENSAGEM APAGADA DETECTADA*'
        });
    } catch (sendError) {
        printError('[Revoke] Erro ao processar item apagado:', sendError.message);
    }
});

module.exports = {
    sendMessageDeleted,
    isStatus,
    resolverAuthorDeleted
};
