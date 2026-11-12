/*
 * /ping: Verifica se o bot está respondendo
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/ping',
    usage: '/ping',
    aliases: [],
    summary: 'Checks whether the bot is responding',
    help: 'Checks whether the bot is responding (replies pong).',
    digitando: false, // responde na hora: sem o "digitando..."
    role: USER
};
