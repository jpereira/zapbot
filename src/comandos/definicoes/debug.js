/*
 * /debug: Logs de depuração com níveis e filtro
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/debug',
    usage: '/debug [OPTION]',
    aliases: [],
    summary: 'Debug logs with levels and filter',
    help: 'Debug logs with cumulative levels DEBUG0 to DEBUG3, a /regex/flags filter and a copy to a WhatsApp chat. The settings are saved in the debug.* settings.',
    ex: ['/debug -on', '/debug -on -level 2 -filter /sapato/ -copy-to /Jorge Pereira/'],
    cmd_opts: [
        {
            opts: ['copy-to'],
            values: ['[destination]'],
            desc: 'Copies the logs to a contact, group, mention or number, as in -to; does not accept email. With no destination, uses this chat.',
            ex: ['-copy-to /Jorge Pereira/', '-copy-to @Jorge (mention)', '-copy-to']
        },
        {
            opts: ['filter', 'f'],
            values: ['[/regex/flags]'],
            desc: 'Shows and copies lines that match the regex, with matches highlighted in the console. Startup logs appear unfiltered, including the bot-started email notice. Accepts JavaScript flags (i, g, m, s, u, y...). With no regex, clears the filter.',
            ex: ['-filter /chatName.*Jorge/i', '-filter']
        },
        {
            opts: ['level', 'lvl'],
            values: ['<0|1|2|3>'],
            desc: 'Cumulative level: 0 (default) basic logs and command arguments; 1 received commands, parser calls and exported functions; 2 APIs and other integrations with parameters; 3 results, SQL and development diagnostics. Needs debug on or -on in the same command.',
            ex: ['-level 2', '-on -lvl 3']
        },
        {
            opts: ['off'],
            values: [],
            desc: 'Turns debug off and clears the filter and the copy destination.'
        },
        {
            opts: ['on'],
            values: [],
            desc: 'Turns debug on at the configured level. Can be combined with level, filter and copy.'
        }
    ],
    role: ADMIN // logs do bot
};
