/*
 * Removed or changed reactions: 'message_reaction' event and the renderer also used by /show -r.
 */

const { client } = require('../client');
const { contactName, resolveLidToPhone } = require('../contacts');
const { messageResolverMentions } = require('../mentions');
const { dbGet, dbReady, dbRun } = require('../db');
const { printError, printInfo } = require('../log');
const { t } = require('../i18n');
const { ignoreNotice, registerNotice } = require('../mudo');
const { getSetting } = require('../settings');
const { formatData, paraMs } = require('../util/format');
const { headerOrigin, isChannelAlt } = require('../util/origin');

/*
 * Same idea as the edited ones: 'message_reaction' brings only the NEW reaction of
 * who reacted (empty = removed). The reactions table stores each person's current one
 * person in each message; when it disappears or changes, the previous one goes to the
 * reaction_changes and the notice goes to your private chat (setting
 * 'show.alert.reaction'); o /show -r reexibe sob demanda.
 * A reaction whose previous one the bot did not know (made before it ran) does not
 * generates nothing when removed: there is nothing to show.
 */
const SNIPPET = 300;

/*
 * The reacted message: { id, chatId, fromMe }. The key comes from WhatsApp Web
 * as an object (remote may come as a string or as a wid); without the fields, it goes out
 * of _serialized ("false_<chat>_<id>[_<participant>]").
 */
function messageKey(key) {
    if (!key) return null;
    const remote = key.remote?._serialized ?? key.remote;
    if (key.id && remote) return { id: key.id, chatId: remote, fromMe: Boolean(key.fromMe) };

    const partsAlt = String(key._serialized ?? '').split('_');
    if (partsAlt.length < 3) return null;
    return { id: partsAlt[2], chatId: partsAlt[1], fromMe: partsAlt[0] === 'true' };
}

async function sendReactionUndone(destination, row, { count = null } = {}) {
    const removed = !row.new_reaction;
    const title = t(`reacoes.${removed ? 'removida' : 'trocada'}${count ? 'Contagem' : 'Detectada'}`, { count });

    // Raw mentions (@265472113143884) become the name only on display; the original text stays in the database
    const body = await messageResolverMentions(row.body, row.message_id);
    const messageAlt = row.body == null ? t('reacoes.foraDoCache')
        : `"${body.length > SNIPPET ? `${body.slice(0, SNIPPET)}…` : body || t('reacoes.semTexto')}"`;

    const textAlt = `${title}\n\n` +
        headerOrigin({
            chatId: row.chat_id, chatName: row.chat_name, isGroup: row.is_group,
            senderName: row.sender_name, senderNumber: row.sender_number
        }) +
        t('reacoes.corpo', {
            reacted: formatData(row.reacted_at),
            whenLabel: t(removed ? 'reacoes.removidaEm' : 'reacoes.trocadaEm'),
            when: formatData(row.changed_at),
            reaction: removed ? row.old_reaction : `${row.old_reaction} → ${row.new_reaction}`,
            inMessage: t(row.msg_from_me ? 'reacoes.naSuaMensagem' : 'reacoes.naMensagem'),
            message: messageAlt
        });

    // Records where it came from (/mute replying to the notice)
    const sent = await client.sendMessage(destination, textAlt, { linkPreview: false });
    await registerNotice(sent, { chatId: row.chat_id, sender: row.sender_number || row.sender_jid });
}

// Saves the undone reaction (with the name of who reacted and the message text) and notifies
async function registerReactionUndone({ key: keyAlt, sender, before: beforeAlt, fresh, when }) {
    const phoneAlt = sender.endsWith('@lid') ? await resolveLidToPhone(sender) : sender;
    const numberAlt = phoneAlt?.endsWith('@c.us') ? phoneAlt.split('@')[0] : null;
    const contactAlt = await client.getContactById(phoneAlt || sender).catch(() => null);
    const nameSender = contactName(contactAlt) || (numberAlt ? `+${numberAlt}` : t('core.desconhecido'));

    const isGroup = keyAlt.chatId.endsWith('@g.us');
    const original = await dbGet('SELECT body, chat_name FROM messages WHERE id = ?', [keyAlt.id]);
    const chat = isGroup && !original?.chat_name ? await client.getChatById(keyAlt.chatId).catch(() => null) : null;

    const row = {
        message_id: keyAlt.id,
        chat_id: keyAlt.chatId,
        chat_name: original?.chat_name || chat?.name || (isGroup ? t('reacoes.grupoDesconhecido') : nameSender),
        is_group: isGroup ? 1 : 0,
        sender_name: nameSender,
        sender_number: numberAlt,
        sender_jid: sender,
        old_reaction: beforeAlt.reaction,
        new_reaction: fresh,
        body: original?.body ?? null,
        msg_from_me: keyAlt.fromMe ? 1 : 0,
        reacted_at: beforeAlt.reacted_at,
        changed_at: when
    };

    const res = await dbRun(
        `INSERT OR IGNORE INTO reaction_changes
            (message_id, chat_id, chat_name, is_group, sender_name, sender_number, sender_jid,
             old_reaction, new_reaction, body, msg_from_me, reacted_at, changed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.message_id, row.chat_id, row.chat_name, row.is_group, row.sender_name, row.sender_number, row.sender_jid,
            row.old_reaction, row.new_reaction, row.body, row.msg_from_me, row.reacted_at, row.changed_at]
    );
    // The same change notified again: already saved and notified
    if (!res.changes) return;

    printInfo(`[Reaction] ${nameSender} ${fresh ? `changed ${beforeAlt.reaction} to ${fresh}` : `removed ${beforeAlt.reaction}`} in ${row.chat_name}`);

    // /mute: this chat's or this person's notice is muted (the reaction stays saved for /show -r)
    const senders = [sender, phoneAlt, numberAlt];
    if (getSetting('show.alert.reaction') && !(await ignoreNotice('reacao', { chatId: keyAlt.chatId, senders }))) {
        await sendReactionUndone(client.info.wid._serialized, row);
    }
}

client.on('message_reaction', async (reaction) => {
    try {
        const keyAlt = messageKey(reaction.msgId);
        const sender = reaction.senderId;
        if (!keyAlt || !sender) return;

        // Your reactions (and the bot's own) do not matter; in channels, they are anonymous
        if (reaction.id?.fromMe || sender === client.info.wid._serialized || isChannelAlt(keyAlt.chatId)) return;

        await dbReady;

        const fresh = String(reaction.reaction ?? '');
        const when = Math.round(paraMs(reaction.timestamp)) || Date.now();
        const beforeAlt = await dbGet('SELECT * FROM reactions WHERE message_id = ? AND sender_jid = ?', [keyAlt.id, sender]);

        if (fresh) {
            await dbRun(
                `INSERT OR REPLACE INTO reactions (message_id, sender_jid, chat_id, reaction, reacted_at)
                 VALUES (?, ?, ?, ?, ?)`,
                [keyAlt.id, sender, keyAlt.chatId, fresh, beforeAlt?.reaction === fresh ? beforeAlt.reacted_at : when]
            );
        } else if (beforeAlt) {
            await dbRun('DELETE FROM reactions WHERE message_id = ? AND sender_jid = ?', [keyAlt.id, sender]);
        }

        // New reaction (or the same one notified again): only stores
        if (!beforeAlt || beforeAlt.reaction === fresh) return;

        await registerReactionUndone({ key: keyAlt, sender, before: beforeAlt, fresh, when });
    } catch (err) {
        printError('[Reaction] Error processing the reaction:', err.message);
    }
});

module.exports = {
    messageKey,
    sendReactionUndone
};
