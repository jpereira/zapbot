/*
 * Edited messages: 'message_edit' event and the renderer also used by /show -e.
 */

const { client, sentByBot } = require('../client');
const { dbGet, dbReady, dbRun } = require('../db');
const { resolveDeletedAuthor } = require('./deleted');
const { printError, printInfo } = require('../log');
const { t } = require('../i18n');
const { ignoreNotice, registerNotice } = require('../mute');
const { getSetting } = require('../settings');
const { countStats } = require('../stats');
const { formatData } = require('../util/format');
const { headerOrigin, channelId } = require('../util/origin');
const { appendMentions, resolveMessageMentions } = require('../mentions');

/*
 * Mensagens edited
 *
 * Same idea as the deleted ones: the 'message_edit' event saves the edit (text of
 * before and after) in the message_edits table and notifies you in private (setting
 * 'show.alert.edited'); o /show -e reexibe sob demanda.
 */
async function sendMessageEdited(destination, row, info, { title = t('editadas.titulo') } = {}) {
    let textAlt = `${title}\n\n`;

    textAlt += headerOrigin({
        chatId: row.chat_id, chatName: info.chatName, isGroup: row.is_group,
        senderName: info.senderName, senderNumber: info.senderNumber
    }) +
        t('editadas.corpo', {
            sent: formatData(row.timestamp), editada: formatData(row.edited_at),
            before: await resolveMessageMentions(row.old_body, row.message_id) || t('editadas.vazio'),
            after: await resolveMessageMentions(row.new_body, row.message_id) || t('editadas.vazio')
        });

    // Records where it came from (/mute replying to the notice)
    const sent = await client.sendMessage(destination, textAlt, { linkPreview: false });
    const sender = info.senderNumber || row.sender_number;
    await registerNotice(sent, { chatId: row.chat_id, sender });
}

client.on('message_edit', async (msg, newBody, prevBody) => {
    try {
        /*
         * whatsapp-web.js emits this event on any 'change:body/caption',
         * including when WhatsApp Web only finishes loading the text. An edit
         * for real brings latestEditSenderTimestampMs/latestEditMsgKey.
         */
        if (!msg.latestEditSenderTimestampMs && !msg.latestEditMsgKey) return;

        // The bot's own edits (the notice that becomes the result) are not edits of a conversation. Yours are saved
        // (the web interface shows them), but they do not notify you: you know what you edited
        if (msg.fromMe && sentByBot(msg)) return;

        const beforeAlt = String(prevBody ?? '');
        const afterAlt = String(newBody ?? '');
        if (beforeAlt === afterAlt) return;

        const messageId = msg.id?.id;
        const chatId = channelId(msg.from, msg.id?.remote, msg.to) || msg.id?.remote || msg.from;

        if (!messageId || !chatId) {
            printError('[Edit] Could not identify the edited message.');
            return;
        }

        await dbReady;

        // What we already know about the original message (stored on message_create)
        const original = await dbGet('SELECT * FROM messages WHERE id = ?', [messageId]);

        const row = {
            message_id: messageId,
            chat_id: chatId,
            chat_name: original?.chat_name || null,
            is_group: chatId.endsWith('@g.us') ? 1 : 0,
            sender_name: original?.sender_name || null,
            sender_number: original?.sender_number || null,
            type: msg.type,
            old_body: beforeAlt,
            new_body: afterAlt,
            timestamp: original?.timestamp || msg.timestamp,
            edited_at: Number(msg.latestEditSenderTimestampMs) || Date.now()
        };

        const info = await resolveDeletedAuthor(row, { after: msg, before: msg });
        row.chat_name = info.chatName;
        row.sender_name = info.senderName;
        row.sender_number = info.senderNumber;

        const res = await dbRun(
            `INSERT OR IGNORE INTO message_edits
                (message_id, chat_id, chat_name, is_group, sender_name, sender_number,
                 type, old_body, new_body, timestamp, edited_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [row.message_id, row.chat_id, row.chat_name, row.is_group, row.sender_name, row.sender_number,
             row.type, row.old_body, row.new_body, row.timestamp, row.edited_at]
        );

        // Same edit notified again (body and caption): already saved and notified
        if (!res.changes) return;

        // If the message is deleted later, /show shows the final text
        await dbRun('UPDATE messages SET body = ? WHERE id = ? AND revoked = 0', [afterAlt, messageId]);
        // The edit may tag new people: their ids go along with the message's
        await appendMentions(messageId, msg.mentionedIds);

        printInfo(`[Edit] Message ${messageId} edited in ${row.chat_name}`);

        await countStats({
            chatId, chatName: row.chat_name, isGroup: row.is_group,
            senderId: original?.sender_number || original?.sender_jid || row.sender_number,
            senderName: row.sender_name,
            fields: { edited: 1 }
        });

        // /mute: this chat's or this person's notice is muted (the edit stays saved for /show -e)
        const senders = [original?.sender_jid, original?.sender_number, row.sender_number];
        if (!msg.fromMe && getSetting('show.alert.edited') && !(await ignoreNotice('editada', { chatId, senders }))) {
            await sendMessageEdited(client.info.wid._serialized, row, info);
        }
    } catch (err) {
        printError('[Edit] Error processing the edited message:', err.message);
    }
});

module.exports = {
    sendMessageEdited
};
