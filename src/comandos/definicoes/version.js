/*
 * /version: Exibe a versão do bot
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/version',
    usage: '/version',
    aliases: ['/versao'],
    summary: 'Exibe a versão do bot',
    help: 'Exibe a versão do bot (mesmo banner do /uptime).',
    digitando: false, // responde na hora: sem o "digitando..."
    role: USER,
    cron: true
};
