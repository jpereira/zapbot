/*
 * A origem do aviso: um canal não é um contato com um telefone grandão.
 */
const { t } = require('../i18n');

const ehCanal = (id) => typeof id === 'string' && id.endsWith('@newsletter');
const idDoCanal = (...ids) => ids.find(ehCanal) || null;

function cabecalhoOrigem({ chatId, chatName, isGroup, senderName, senderNumber }) {
    if (ehCanal(chatId)) return t('origem.canal', { nome: chatName });
    return (isGroup ? t('origem.grupo', { nome: chatName }) : '') +
        t('origem.nome', { nome: senderName }) +
        t('origem.numero', { numero: senderNumber ? `+${senderNumber}` : t('origem.indisponivel') });
}

module.exports = { cabecalhoOrigem, ehCanal, idDoCanal };
