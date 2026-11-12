/*
 * /everybody: Responde marcando todos do grupo
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/everybody',
    usage: '/everybody',
    aliases: ['/todos', '/todes'],
    summary: 'Responde marcando todos do grupo',
    help: 'Responde marcando todos do grupo (exceto você).',
    delegavel: true,
    role: ADMIN // delegável: marca o grupo atual
};
