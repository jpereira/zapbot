/*
 * /version: Shows the bot version
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/version',
    usage: '/version',
    summary: 'Shows the bot version',
    help: 'Shows the bot version (same banner as /uptime).',
    digitando: false, // replies right away: without the "typing..."
    cmd_opts: [
        {
            opts: ['tts'],
            values: [],
            desc: 'Speaks the reply as a voice note, with the default voice of /tts. Same as /tts -q {/version ...}, with only the voice note. The /tts settings (tts.*) apply.',
            ex: ['/version -tts'],
            cron: false
        }
    ],
    tts: true,   // -tts: speaks the reply (it is /tts {/version -q ...})
    role: USER,
    cron: true
};
