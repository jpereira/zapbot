/*
 * /ping: Verifica se o bot está respondendo
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/ping',
    usage: '/ping',
    aliases: [],
    summary: 'Verifica se o bot está respondendo',
    help: 'Verifica se o bot está respondendo (responde pong).',
    digitando: false, // responde na hora: sem o "digitando..."
    role: USER
};
