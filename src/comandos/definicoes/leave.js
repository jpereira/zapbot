/*
 * /leave: Leaves a group
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/leave',
    usage: '/leave <group|num>...  or  /leave -l',
    aliases: ['/sair'],
    summary: 'Leaves a group',
    help: 'Leaves one or more WhatsApp groups, separated by spaces or commas. Each group is looked up like in -to (by name or part of it; if several match, you pick from the list) or by its number in the /leave -l list. With nothing, lists the groups you are in. To come back, you need a new invite (/join).',
    ex: ['/leave /Grupo L200/', '/leave 3', '/leave 3 1 /Família/ 5', '/leave -l'],
    cmd_opts: [
        {
            argv: ['<group|num>...'],
            desc: 'The groups, separated by spaces or commas: by name (a name with spaces goes between /.../ or quotes) or by the number in the last -l list. Loose words, without a number, slashes or quotes, are a single name.',
            ex: ['/leave /Grupo L200/', '/leave 3 1 /Família/ 5']
        },
        {
            opts: ['list', 'l'],
            values: [],
            desc: 'Lists the groups you are in, numbered (same as /leave with nothing).'
        }
    ],
    role: ADMIN // sai de grupos
};
