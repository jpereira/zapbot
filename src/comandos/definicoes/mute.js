/*
 * /mute: Silencia os avisos de apagadas, editadas e reações de uma pessoa
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/mute',
    usage: '/mute [OPTION]... [/contact or group/|@mention|+number]',
    aliases: [],
    summary: 'Mutes the notices of deleted, edited and reactions from a person',
    help: 'Mutes the notices of deleted, edited, deleted status and/or removed or changed reactions from a person, a group or a community. Just the target, with no option, mutes everything (the -a). Replying to a notice mutes where it came from: the person (private and status), the group or the community. The messages stay saved for /show. /watch also does not notify your private chat about muted ones, of any type (the -to destinations still receive). With nothing, lists the muted ones.',
    cmd_opts: [
        {
            opts: ['all', 'a'],
            values: [],
            desc: 'Mutes everything: deleted, edited, status and reactions. It is the default: just the target, with no option, does the same.'
        },
        { opts: ['deleted', 'd'], values: [], desc: 'Mutes the notices of deleted messages.' },
        { opts: ['edited', 'e'], values: [], desc: 'Mutes the notices of edits.' },
        {
            opts: ['list', 'l'],
            values: [],
            desc: 'Lists the muted ones (also with no arguments), with how many notices were ignored.'
        },
        {
            opts: ['reaction', 'r'],
            values: [],
            desc: 'Mutes the notices of removed or changed reactions.'
        },
        {
            opts: ['rm'],
            values: ['<no.|all>'],
            desc: 'Undoes the mute of no. N in the list (or of all): same as /unmute.'
        },
        { opts: ['status', 's'], values: [], desc: 'Mutes the notices of deleted status.' },
        {
            argv: ['[/contact or group/|@mention|+number]'],
            desc: 'Contact or group by name or part of it, with priority for exact names (several: you pick from the list), someone mentioned with @ or a number. Replying to a notice mutes the origin: group first; with no group, the person\'s number or name.',
            ex: [
                '/mute /Grupo L200/',
                '/mute /Jorge Pereira/',
                '/m @John',
                '/mute -s +5521999999999',
                '/mute -r /Grupo L200/'
            ]
        }
    ],
    role: ADMIN // silencia os avisos do dono
};
