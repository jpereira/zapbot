/*
 * A origem do aviso: um canal não é um contato com um telefone grandão.
 */
const ehCanal = (id) => typeof id === 'string' && id.endsWith('@newsletter');
const idDoCanal = (...ids) => ids.find(ehCanal) || null;

function cabecalhoOrigem({ chatId, chatName, isGroup, senderName, senderNumber }) {
    if (ehCanal(chatId)) return `📰 *Canal:* ${chatName}\n`;
    return (isGroup ? `👥 *Grupo:* ${chatName}\n` : '') +
        `👤 *Nome:* ${senderName}\n` +
        `📱 *Número:* ${senderNumber ? `+${senderNumber}` : 'Número indisponível'}\n`;
}

module.exports = { cabecalhoOrigem, ehCanal, idDoCanal };
