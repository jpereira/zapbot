/*
 * /version: Shows the bot version
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/version',
    usage: '/version',
    aliases: ['/versao'],
    summary: 'Shows the bot version',
    help: 'Shows the bot version (same banner as /uptime).',
    digitando: false, // replies right away: without the "typing..."
    role: USER,
    cron: true
};
