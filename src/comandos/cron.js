/*
 * Comando /cron (a lógica fica no agenda.js).
 */

const { tratarAgenda } = require('../agenda');

async function cmdCron(ctx) {
    await tratarAgenda(ctx);
}

module.exports = {
    cmdCron
};
