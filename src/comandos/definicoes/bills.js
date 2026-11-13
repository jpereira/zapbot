/*
 * /bills: Sorteia 2 membros do grupo para pagar um boleto
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/bills',
    usage: '/bills',
    aliases: [],
    summary: 'Joke: picks 2 group members to "pay a bill"',
    help: 'A joke: picks 2 group members to "pay a bill" (there is no bill, and the reply says so).',
    role: USER
};
