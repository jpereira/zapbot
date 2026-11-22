/*
 * /ping: Checks whether the bot is responding
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/ping',
    usage: '/ping',
    aliases: [],
    summary: 'Checks whether the bot is responding',
    help: 'Checks whether the bot is responding (replies pong).',
    typing: false, // replies right away: without the "typing..."
    role: USER
};
