/*
 * /noffa: Decorates the text with rainbow emojis
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/noffa',
    usage: '/noffa [text]',
    aliases: ['/🌈', '/🏳️‍🌈'],
    summary: 'Decorates the text with rainbow emojis',
    help: 'Decorates the text with rainbow emojis. Accepts text or a reply to a message.',
    digitando: false, // replies right away: without the "typing..."
    role: USER
};
