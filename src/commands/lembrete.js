/*
 * /lembrete command (the logic is in schedule.js).
 */

const { handleSchedule } = require('../schedule');

async function cmdReminder(ctx) {
    await handleSchedule('lembrete', ctx);
}

module.exports = {
    cmdReminder
};
