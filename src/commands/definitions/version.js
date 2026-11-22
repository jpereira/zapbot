/*
 * /version: Shows the bot version
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/version',
    usage: '/version',
    summary: 'Shows the bot version',
    help: 'Shows the bot version (same banner as /uptime).',
    typing: false, // replies right away: without the "typing..."
    role: USER,
    cron: true
};
