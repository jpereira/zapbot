/*
 * /welcome: Message when someone joins the group
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/welcome',
    usage: '/welcome [-on|-off|-test] [<text>]',
    aliases: [],
    summary: 'Message when someone joins the group',
    help: 'Sets the message the bot sends in the group when someone joins (by invite link or added by an admin). It is per group: with nothing, shows this group\'s. {name} is the person (a mention) and {group}, the group name. Works only in groups.',
    ex: [
        '/welcome',
        '/welcome Welcome to {group}, {name}! 🎉',
        '/welcome -off'
    ],
    cmd_opts: [
        {
            opts: ['on'],
            values: [],
            desc: 'Turns it on with the default text.',
            ex: ['/welcome -on']
        },
        {
            opts: ['off'],
            values: [],
            desc: 'Turns it off in this group.',
            ex: ['/welcome -off']
        },
        {
            opts: ['test', 't'],
            values: [],
            desc: 'Sends the message as it would look, with you in place of whoever joins (with the text you gave, or the current one).',
            ex: ['/welcome -test']
        },
        {
            argv: ['[<text>]'],
            desc: 'The message ({name} = the person, {group} = the group name; up to 1000 characters). It can have several lines.'
        }
    ],
    delegavel: true,
    role: ADMIN // As boas-vindas de cada grupo (src/saudacoes.js)
};
