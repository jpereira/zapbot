/*
 * /bills: Sorteia 2 membros do grupo para pagar um boleto
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
