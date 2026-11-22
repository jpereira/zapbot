/*
 * /members: Lists the group members
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/members',
    usage: '/members',
    aliases: [],
    summary: 'Lists the group members',
    help: 'Lists the group members (number, name, admins).',
    isDelegable: true,
    role: ADMIN // delegable: lists the current group
};
