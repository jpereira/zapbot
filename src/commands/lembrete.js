/*
 * /lembrete command (the logic is in schedule.js, together with the /agendar one).
 */

const { handleSchedule } = require('../schedule');

async function cmdReminder(ctx) {
    await handleSchedule('lembrete', ctx);
}

module.exports = {
    cmdReminder
};
