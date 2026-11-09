/*
 * /todos: Replies tagging everyone in the group
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/todos',
    usage: '/todos',
    aliases: ['/todes'],
    summary: 'Responde marcando todos do grupo',
    help: 'Responde marcando todos do grupo (exceto você).',
    delegavel: true,
    role: ADMIN // delegable: tags the current group
};
