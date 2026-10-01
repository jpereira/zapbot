/*
 * Comando /lembrete (a lógica fica no agenda.js).
 */

const { tratarAgenda } = require('../agenda');

async function cmdLembrete(ctx) {
    await tratarAgenda('lembrete', ctx);
}

module.exports = {
    cmdLembrete
};
