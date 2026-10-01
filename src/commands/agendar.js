/*
 * /agendar command (the logic is in schedule.js, together with the /lembrete one).
 */

const { handleSchedule } = require('../schedule');

async function cmdSchedule(ctx) {
    await handleSchedule('agendar', ctx);
}

module.exports = {
    cmdSchedule
};
