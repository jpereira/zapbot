/*
 * /uptime: How long the bot has been running
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/uptime',
    usage: '/uptime',
    aliases: [],
    summary: 'How long the bot has been running',
    help: 'Shows how long the bot has been running and connected.',
    typing: false, // replies right away: without the "typing..."
    role: USER,
    cron: true
};
