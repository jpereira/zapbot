/*
 * /joke: Random joke
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/joke',
    usage: '/joke',
    aliases: [],
    summary: 'Random joke',
    help: 'Random joke in Portuguese (none repeats until all have been told).',
    cmd_opts: [
        {
            opts: ['tts'],
            values: [],
            desc: 'Speaks the reply as a voice note, with the default voice of /tts. Same as /tts -q {/joke ...}, with only the voice note. The /tts settings (tts.*) apply.',
            ex: ['/joke -tts'],
            cron: false
        }
    ],
    tts: true,   // -tts: speaks the reply (it is /tts {/joke -q ...})
    role: USER,
    cron: true
};
