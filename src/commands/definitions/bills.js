/*
 * /bills: Draws 2 group members to pay a bill
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/bills',
    usage: '/bills',
    aliases: [],
    summary: 'Picks 2 group members to pay a bill',
    help: 'Picks 2 group members to pay a bill.',
    role: USER
};
