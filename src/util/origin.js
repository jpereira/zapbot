/*
 * The notice's origin: a channel is not a contact with a huge phone number.
 */
const { t } = require('../i18n');

const isChannelAlt = (id) => typeof id === 'string' && id.endsWith('@newsletter');
const channelId = (...ids) => ids.find(isChannelAlt) || null;

function headerOrigin({ chatId, chatName, isGroup, senderName, senderNumber }) {
    if (isChannelAlt(chatId)) return t('origem.canal', { name: chatName });
    return (isGroup ? t('origem.grupo', { name: chatName }) : '') +
        t('origem.nome', { name: senderName }) +
        t('origem.numero', { number: senderNumber ? `+${senderNumber}` : t('origem.indisponivel') });
}

module.exports = { headerOrigin, isChannelAlt, channelId };
