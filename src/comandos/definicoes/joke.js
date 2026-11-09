/*
 * /joke: Piada aleatória
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/joke',
    usage: '/joke',
    aliases: ['/piada', '/humor'],
    summary: 'Piada aleatória',
    help: 'Piada aleatória em português (nenhuma se repete até todas saírem).',
    role: USER,
    cron: true
};
