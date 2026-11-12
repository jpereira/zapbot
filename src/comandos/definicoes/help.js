/*
 * /help: Lista os comandos ou detalha um deles
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/help',
    usage: '/help [-role|-r] [command] [protocol]',
    aliases: ['/h'],
    summary: 'Lists the commands or details one of them',
    help: 'Shows the help menu, only with the commands you can use (the owner and admins see all of them); with a command, only its help.',
    ex: ['/help show'],
    cmd_opts: [
        {
            opts: ['role', 'r'],
            values: [],
            desc: 'Lists the commands grouped by role (owner, admin and user), only the ones you can use.',
            ex: ['/help -r']
        },
        { argv: ['[command]'], desc: 'Command (with or without /, name or alias).', ex: ['/help get'] },
        {
            argv: ['[protocol]'],
            desc: 'In /defi, only the help for one protocol: orca, prjx, liquidswap, morpho or aave. Same as /defi <protocol> -help.',
            ex: ['/help defi aave']
        }
    ],
    digitando: false, // responde na hora: sem o "digitando..."
    role: USER
};
