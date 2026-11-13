/*
 * /noffa: Floreia o texto com emojis de arco-íris
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/noffa',
    usage: '/noffa [text]',
    aliases: [],
    summary: 'Joke: decorates the text with rainbow emojis',
    help: 'A joke: decorates the text with rainbow emojis (the reply says it is a joke). Accepts text or a reply to a message.',
    digitando: false, // responde na hora: sem o "digitando..."
    role: USER
};
