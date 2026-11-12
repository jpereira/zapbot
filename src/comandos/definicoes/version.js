/*
 * /version: Exibe a versão do bot
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/version',
    usage: '/version',
    summary: 'Shows the bot version',
    help: 'Shows the bot version (same banner as /uptime).',
    digitando: false, // responde na hora: sem o "digitando..."
    role: USER,
    cron: true
};
