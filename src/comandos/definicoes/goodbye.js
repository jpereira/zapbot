/*
 * /goodbye: Message when someone leaves the group
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/goodbye',
    usage: '/goodbye [-on|-off|-test] [<text>]',
    aliases: [],
    summary: 'Message when someone leaves the group',
    help: 'Sets the message the bot sends in the group when someone leaves (or is removed). It is per group: with nothing, shows this group\'s. {name} is the person and {group}, the group name. Works only in groups.',
    ex: [
        '/goodbye',
        '/goodbye {name} left {group}. 👋',
        '/goodbye -off'
    ],
    cmd_opts: [
        {
            opts: ['on'],
            values: [],
            desc: 'Turns it on with the default text.',
            ex: ['/goodbye -on']
        },
        {
            opts: ['off'],
            values: [],
            desc: 'Turns it off in this group.',
            ex: ['/goodbye -off']
        },
        {
            opts: ['test', 't'],
            values: [],
            desc: 'Sends the message as it would look, with you in place of whoever leaves (with the text you gave, or the current one).',
            ex: ['/goodbye -test']
        },
        {
            argv: ['[<text>]'],
            desc: 'The message ({name} = the person, {group} = the group name; up to 1000 characters). It can have several lines.'
        }
    ],
    delegavel: true,
    role: ADMIN // A despedida de cada grupo (src/saudacoes.js)
};
