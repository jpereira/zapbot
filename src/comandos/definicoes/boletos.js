/*
 * /boletos: Sorteia 2 membros do grupo para pagar um boleto
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/boletos',
    usage: '/boletos',
    summary: 'Sorteia 2 membros do grupo para pagar um boleto',
    help: 'Sorteia 2 membros do grupo para pagar um boleto.',
    role: USER
};
