/*
 * /unblock: Desbloqueia pessoas bloqueadas
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/unblock',
    usage: '/unblock [/contact/|@mention|+number|#]  or  /unblock -all',
    aliases: ['/desbloquear'],
    summary: 'Unblocks blocked people',
    help: 'Unblocks a blocked person (via /block or on the phone), or everyone with -all. Replying to a message, unblocks whoever wrote it. With nothing, lists the blocked ones.',
    cmd_opts: [
        {
            opts: ['all', 'a'],
            values: [],
            desc: 'Unblocks everyone blocked (including the ones you blocked on the phone).',
            ex: ['/unblock -all']
        },
        {
            argv: ['[/contact/|@mention|+number|#]'],
            desc: 'The person, as in /block, or the # from the /block list.',
            ex: ['/unblock /Fulano/', '/unblock 2']
        }
    ],
    role: ADMIN // mexe na conta do WhatsApp
};
