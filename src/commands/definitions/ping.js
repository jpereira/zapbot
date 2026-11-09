/*
 * /ping: Checks whether the bot is responding
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/ping',
    usage: '/ping',
    aliases: [],
    summary: 'Verifica se o bot está respondendo',
    help: 'Verifica se o bot está respondendo (responde pong).',
    digitando: false, // replies right away: without the "typing..."
    role: USER
};
