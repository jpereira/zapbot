/*
 * /agendar command (aliases /agenda, /cron, /lembrete and /lemb; the logic is in schedule.js).
 */

const { handleSchedule } = require('../schedule');

async function cmdSchedule(ctx) {
    await handleSchedule(ctx);
}

module.exports = {
    cmdSchedule
};
