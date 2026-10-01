/*
 * Comando /agendar (aliases /agenda, /cron, /lembrete e /lemb; a lógica fica no agenda.js).
 */

const { tratarAgenda } = require('../agenda');

async function cmdAgendar(ctx) {
    await tratarAgenda(ctx);
}

module.exports = {
    cmdAgendar
};
