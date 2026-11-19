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
    digitando: false, // replies right away: without the "typing..."
    cmd_opts: [
        {
            opts: ['tts'],
            values: [],
            desc: 'Speaks the reply as a voice note, with the default voice of /tts. Same as /tts -q {/uptime ...}, with only the voice note. The /tts settings (tts.*) apply.',
            ex: ['/uptime -tts'],
            cron: false
        }
    ],
    tts: true,   // -tts: speaks the reply (it is /tts {/uptime -q ...})
    role: USER,
    cron: true
};
