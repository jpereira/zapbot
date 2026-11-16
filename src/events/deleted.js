/*
 * Deleted messages: 'message_revoke_everyone' event and the renderer also used by /show.
 */

const { MessageMedia, Location } = require('whatsapp-web.js');
const fs = require('fs-extra');

const { client } = require('../client');
const { contactName, resolveLidToPhone, channelResolverName } = require('../contacts');
const { dbGet, dbReady, dbRun } = require('../db');
const { printDebug, printError } = require('../log');
const { t } = require('../i18n');
const { ignoreNotice, registerNotice } = require('../mudo');
const { getSetting } = require('../settings');
const { countStats, myIdStats } = require('../stats');
const { mediaIsPath } = require('../util/files');
const { formatData } = require('../util/format');
const { headerOrigin, isChannelAlt } = require('../util/origin');

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
    if (isChannelAlt(row.chat_id)) {
        const nameAlt = (await channelResolverName(row.chat_id)) || row.chat_name ||
            `Canal ${row.chat_id.split('@')[0]}`;
        return { nomeChat: nameAlt, nomeRemetente: nameAlt, numeroRemetente: null };
    }
    let nameChat = row.chat_name || 'Conversa desconhecida';
    let nameSender = row.sender_name || t('core.desconhecido');
    let numberSender = row.sender_number || null;

    // Real name of the chat where the deletion happened
    if (after) {
        try {
            const chat = await after.getChat();
            if (chat?.name) nameChat = chat.name;
        } catch (chatError) {
            printError('[Revoke] Could not retrieve the chat:', chatError.message);
        }
    }

    // Sender from the original message, when available
    if (before) {
        try {
            const contactAlt = await before.getContact();

            // The name from your address book comes first; the pushname (what the person chose) only if there is none
            nameSender = contactName(contactAlt) || nameSender;

            const contactId = contactAlt.id?._serialized || '';

            if (contactId.endsWith('@c.us')) {
                numberSender = contactId.split('@')[0];
            } else if (contactAlt.number) {
                numberSender = contactAlt.number;
            }
        } catch (contactError) {
            printError('[Revoke] Could not retrieve the original contact:', contactError.message);
        }
    }

    // Converts @lid to a real phone, if possible
    const senderId = before?.author || protocolKey?.participant;

    if (senderId?.endsWith('@lid')) {
        const phoneId = await resolveLidToPhone(senderId);

        if (phoneId) {
            numberSender = phoneId.replace('@c.us', '').replace(/\D/g, '');

            const contactAlt = await client.getContactById(phoneId).catch(() => null);
            nameSender = contactName(contactAlt) || nameSender;
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
async function sendMessageDeleted(destination, row, info, { titulo: title = t('apagadas.titulo'), extras = [] } = {}) {
    // Each notice message records where it came from (/mute replying to it)
    const sender = info.numeroRemetente || row.sender_number || row.sender_jid;
    const origin = { chatId: row.chat_id, remetente: sender };
    const send = async (...a) => registerNotice(await client.sendMessage(...a), origin);

    let alertText = `${title}\n\n`;

    alertText += headerOrigin({
        chatId: row.chat_id, chatName: info.nomeChat, isGroup: row.is_group,
        senderName: info.nomeRemetente, senderNumber: info.numeroRemetente
    }) +
        t('apagadas.enviadaEm', { data: formatData(row.timestamp) });

    for (const line of extras) {
        alertText += `${line}\n`;
    }

    // Location
    if (row.type === 'location' && row.location_lat !== null && row.location_lng !== null) {
        const latitude = Number(row.location_lat);
        const longitude = Number(row.location_lng);

        alertText +=
            t('apagadas.localizacao', { url: `https://www.google.com/maps?q=${latitude},${longitude}` });

        await send(destination, alertText);
        const local = new Location(latitude, longitude, row.body || t('apagadas.localizacaoCompartilhada'));
        await send(destination, local);
        return;
    }

    // Contato / vCard
    if (['vcard', 'contact', 'multi_vcard'].includes(row.type)) {
        alertText +=
            t('apagadas.contato');

        // The body comes from whoever sent it: it only goes raw if it really is a vCard (never a text like "/cache -a")
        if (!row.body || /^BEGIN:VCARD/i.test(row.body.trim())) {
            await send(destination, alertText);
            if (row.body) await send(destination, row.body, { parseVCards: true });
        } else {
            await send(destination, `${alertText}${t('apagadas.conteudo', { texto: row.body })}`);
        }
        return;
    }

    // Physical file
    if (row.has_media && mediaIsPath(row.media_path) && fs.existsSync(row.media_path)) {
        const mediaAttachment = MessageMedia.fromFilePath(row.media_path);
        const mimetype = mediaAttachment.mimetype || '';
        const captionAlt = row.body || t('apagadas.semTexto');

        if (row.type === 'audio' || row.type === 'ptt' || mimetype.startsWith('audio/')) {
            alertText += t('apagadas.audio');

            await send(destination, alertText);
            await send(destination, mediaAttachment, { sendAudioAsVoice: true });
            return;
        }

        if (row.type === 'video' || row.type === 'image' || mimetype.startsWith('image/') || mimetype.startsWith('video/')) {
            alertText +=
                t('apagadas.midia', { tipo: String(row.type).toUpperCase(), legenda: captionAlt });

            await send(destination, mediaAttachment, { caption: alertText });
            return;
        }

        alertText +=
            t('apagadas.documento', { legenda: captionAlt });

        await send(destination, mediaAttachment, { caption: alertText, sendMediaAsDocument: true });
        return;
    }

    // Media that existed but the file is no longer on disk
    if (row.has_media) {
        alertText += t('apagadas.arquivoIndisponivel', { tipo: String(row.type).toUpperCase() });
    }

    // Texto
    alertText += t('apagadas.texto', { texto: row.body || t('apagadas.semConteudo') });

    await send(destination, alertText, { linkPreview: true });
}

client.on('message_revoke_everyone', async (after, before) => {
    const protocolKey = after._data?.protocolMessageKey;
    const targetId = protocolKey?.id || before?.id?.id || after?.id?.id;

    if (!targetId) {
        printError('[Revoke] Could not identify the deleted message.');
        return;
    }

    let row;
    try {
        await dbReady;
        row = await dbGet('SELECT * FROM messages WHERE id = ?', [targetId]);
    } catch (err) {
        printError('[Revoke] Error querying the database:', err.message);
        return;
    }

    if (!row) {
        printError(`[Revoke] Deleted message ID ${targetId} not found in the database.`);
        return;
    }

    if (isStatus(row) && !getSetting('show.alert.status')) {
        printDebug(`[Revoke] Deleted status ID ${targetId} ignored (show.alert.status off).`);
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
            senderName: deMim ? (client.info?.pushname || t('core.voce')) : info.nomeRemetente,
            campos: { deleted: 1 }
        });

        // show.alert.deleted off or /mute: no notice (the message stays stored for /show)
        // Deleted by you: in private the stored sender is the other one, so it includes your id (/mute on yourself)
        const senders = [row.sender_jid, row.sender_number, info.numeroRemetente, deMim ? client.info.wid._serialized : null];
        if (!isStatus(row) && !getSetting('show.alert.deleted')) return;
        if (await ignoreNotice(isStatus(row) ? 'status' : 'apagada', { chatId: row.chat_id, remetentes: senders })) return;

        await sendMessageDeleted(client.info.wid._serialized, row, info, {
            titulo: isStatus(row) ? t('apagadas.tituloStatus') : t('apagadas.titulo')
        });
    } catch (sendError) {
        printError('[Revoke] Error processing the deleted item:', sendError.message);
    }
});

module.exports = {
    sendMessageDeleted,
    isStatus,
    resolverAuthorDeleted
};
