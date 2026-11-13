/*
 * /noffa: Floreia o texto com emojis de arco-íris
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/noffa',
    usage: '/noffa [text]',
    aliases: [],
    summary: 'Decorates the text with rainbow emojis',
    help: 'Decorates the text with rainbow emojis. Accepts text or a reply to a message.',
    digitando: false, // responde na hora: sem o "digitando..."
    role: USER
};
