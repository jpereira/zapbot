/*
 * /joke: Piada aleatória
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/joke',
    usage: '/joke',
    aliases: ['/piada', '/humor'],
    summary: 'Random joke',
    help: 'Random joke in Portuguese (none repeats until all have been told).',
    role: USER,
    cron: true
};
