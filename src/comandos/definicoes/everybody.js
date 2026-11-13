/*
 * /everybody: Responde marcando todos do grupo
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/everybody',
    usage: '/everybody',
    aliases: [],
    summary: 'Replies mentioning everyone in the group',
    help: 'Replies mentioning everyone in the group (except you).',
    delegavel: true,
    role: ADMIN // delegável: marca o grupo atual
};
