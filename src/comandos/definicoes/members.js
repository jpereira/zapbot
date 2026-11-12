/*
 * /members: Lista os membros do grupo
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/members',
    usage: '/members',
    aliases: ['/listageral', '/list'],
    summary: 'Lists the group members',
    help: 'Lists the group members (number, name, admins).',
    delegavel: true,
    role: ADMIN // delegável: lista o grupo atual
};
