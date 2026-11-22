/*
 * /everybody: Replies tagging everyone in the group
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/everybody',
    usage: '/everybody',
    aliases: [],
    summary: 'Replies mentioning everyone in the group',
    help: 'Replies mentioning everyone in the group (except you).',
    isDelegable: true,
    role: ADMIN // delegable: tags the current group
};
