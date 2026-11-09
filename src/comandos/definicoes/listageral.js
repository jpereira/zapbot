/*
 * /listageral: Lista os membros do grupo
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/listageral',
    usage: '/listageral',
    aliases: ['/list'],
    summary: 'Lista os membros do grupo',
    help: 'Lista os membros do grupo (número, nome, admins).',
    delegavel: true,
    role: ADMIN // delegável: lista o grupo atual
};
