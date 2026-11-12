/*
 * /uptime: Há quanto tempo o bot está rodando
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/uptime',
    usage: '/uptime',
    aliases: [],
    summary: 'How long the bot has been running',
    help: 'Shows how long the bot has been running and connected.',
    digitando: false, // responde na hora: sem o "digitando..."
    role: USER,
    cron: true
};
