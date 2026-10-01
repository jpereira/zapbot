/*
 * /cron command (aliases /agenda and /lembrete; the logic is in schedule.js).
 */

const { handleSchedule } = require('../schedule');

async function cmdCron(ctx) {
    await handleSchedule(ctx);
}

module.exports = {
    cmdCron
};
