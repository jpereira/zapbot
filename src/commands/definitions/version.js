/*
 * /version: Shows the bot version
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/version',
    usage: '/version',
    aliases: ['/versao'],
    summary: 'Exibe a versão do bot',
    help: 'Exibe a versão do bot (mesmo banner do /uptime).',
    digitando: false, // replies right away: without the "typing..."
    role: USER,
    cron: true
};
