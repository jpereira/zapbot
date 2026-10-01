/*
 * Comando /agendar (a lógica fica no agenda.js, junto com a do /lembrete).
 */

const { tratarAgenda } = require('../agenda');

async function cmdAgendar(ctx) {
    await tratarAgenda('agendar', ctx);
}

module.exports = {
    cmdAgendar
};
