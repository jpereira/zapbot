/*
 * /noffa: Floreia o texto com emojis de arco-íris
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/noffa',
    usage: '/noffa [texto]',
    aliases: ['/🌈', '/🏳️‍🌈'],
    summary: 'Floreia o texto com emojis de arco-íris',
    help: 'Dá uma floreada no texto com emojis de arco-íris. Aceita texto ou resposta a uma mensagem.',
    digitando: false, // responde na hora: sem o "digitando..."
    role: USER
};
