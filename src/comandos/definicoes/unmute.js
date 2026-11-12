/*
 * /unmute: Desfaz o silêncio do /mute
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/unmute',
    usage: '/unmute [/contact or group/|@mention|+number|#]  or  /unmute -all',
    aliases: ['/desmutar'],
    summary: 'Undoes the /mute silence',
    help: 'Undoes the /mute silence: the notices for deleted and edited messages, statuses and reactions from the person, group or community come back. Replying to a notice, unmutes where it came from. With nothing, lists the muted ones.',
    cmd_opts: [
        { opts: ['all', 'a'], values: [], desc: 'Unmutes everyone muted.' },
        {
            argv: ['[/contact or group/|@mention|+number|#]'],
            desc: 'Who: searched as in /mute, or the # from the /mute list. Without it, replying to a notice, where the notice came from.',
            ex: ['/unmute /Jorge Pereira/', '/unmute 2', '/unmute -all']
        }
    ],
    role: ADMIN // silencia os avisos do dono
};
