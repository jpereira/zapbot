/*
 * /promote: Makes someone a group admin
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/promote',
    usage: '/promote [/contact/|@mention|+number]...',
    aliases: [],
    summary: 'Makes someone a group admin',
    help: 'Makes people admins of the group. Replying to a message, it is whoever wrote it. The bot (your account) has to be an admin of the group. Works only in groups.',
    ex: [
        '/promote @Fulano',
        '/promote /Fulano de Tal/',
        '/promote +5521999999999'
    ],
    cmd_opts: [
        {
            argv: ['[/contact/|@mention|+number]...'],
            desc: 'The people, separated by spaces: an address book contact by name or part of it (a name with spaces goes between /.../ or quotes; if several match, you pick from the list), someone mentioned with @, or a number. With nobody, replying to a message, whoever wrote it.'
        }
    ],
    delegavel: true,
    role: ADMIN // Mexe no grupo atual: delegável
};
