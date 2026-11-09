/*
 * /uptime: Há quanto tempo o bot está rodando
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/uptime',
    usage: '/uptime',
    aliases: [],
    summary: 'Há quanto tempo o bot está rodando',
    help: 'Exibe há quanto tempo o bot está rodando e conectado.',
    digitando: false, // responde na hora: sem o "digitando..."
    role: USER,
    cron: true
};
