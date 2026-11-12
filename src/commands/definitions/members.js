/*
 * /members: Lists the group members
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/members',
    usage: '/members',
    aliases: ['/listageral', '/list'],
    summary: 'Lista os membros do grupo',
    help: 'Lista os membros do grupo (número, nome, admins).',
    delegavel: true,
    role: ADMIN // delegable: lists the current group
};
