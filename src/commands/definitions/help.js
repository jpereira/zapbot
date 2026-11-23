/*
 * /help: Lists the commands or details one of them
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/help',
    usage: '/help [-full|-f] [-role|-r] [category|command] [protocol]',
    aliases: [],
    summary: 'Lists the commands or details one of them',
    help: 'Shows the category index for commands you can use. Pick a category or request the details of one command.',
    ex: ['/help show'],
    cmd_opts: [
        {
            opts: ['full', 'f'],
            values: [],
            desc: 'Lists every available command by category.',
            ex: ['/help -f']
        },
        {
            opts: ['role', 'r'],
            values: [],
            desc: 'Lists the commands grouped by role (owner, admin and user), only the ones you can use.',
            ex: ['/help -r']
        },
        { argv: ['[category|command]'], desc: 'A category or command (with or without /).', ex: ['/help get'] },
        {
            argv: ['[protocol]'],
            desc: 'In /defi, only the help for one protocol: orca, prjx, liquidswap, morpho or aave. Same as /defi <protocol> -help.',
            ex: ['/help defi aave']
        }
    ],
    typing: false, // replies right away: without the "typing..."
    role: USER
};
