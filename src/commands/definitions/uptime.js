/*
 * /uptime: How long the bot has been running
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/uptime',
    usage: '/uptime',
    aliases: [],
    summary: 'Há quanto tempo o bot está rodando',
    help: 'Exibe há quanto tempo o bot está rodando e conectado.',
    digitando: false, // replies right away: without the "typing..."
    role: USER,
    cron: true
};
