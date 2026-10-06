/*
 * The notice's origin: a channel is not a contact with a huge phone number.
 */
const isChannelAlt = (id) => typeof id === 'string' && id.endsWith('@newsletter');
const channelId = (...ids) => ids.find(isChannelAlt) || null;

function headerOrigin({ chatId, chatName, isGroup, senderName, senderNumber }) {
    if (isChannelAlt(chatId)) return `📰 *Canal:* ${chatName}\n`;
    return (isGroup ? `👥 *Grupo:* ${chatName}\n` : '') +
        `👤 *Nome:* ${senderName}\n` +
        `📱 *Número:* ${senderNumber ? `+${senderNumber}` : 'Número indisponível'}\n`;
}

module.exports = { headerOrigin, isChannelAlt, channelId };
