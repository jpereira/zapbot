/*
 * /debug: Debug logs with levels and filter
 */

const { OWNER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/debug',
    usage: '/debug [OPTION]',
    aliases: [],
    summary: 'Debug logs with levels and filter',
    help: 'Debug logs with cumulative levels DEBUG0 to DEBUG3, a /regex/flags filter and a copy to a WhatsApp chat. The settings are saved in the debug.* settings.',
    ex: ['/debug -on', '/debug -on -lvl 2 -f /sapato/ -copy-to /Jorge Pereira/'],
    cmd_opts: [
        {
            opts: ['copy-to', 'ct'],
            values: ['[destination]'],
            desc: 'Copies the logs to a contact, group, mention or number, as in -to; does not accept email. With no destination, uses this chat.',
            ex: ['-copy-to /Jorge Pereira/', '-copy-to @Jorge (mention)', '-copy-to']
        },
        {
            opts: ['filter', 'f'],
            values: ['[/regex/flags]'],
            desc: 'Shows and copies only the lines that match the regex. Matches are highlighted in the console. Startup logs appear unfiltered, including the bot-started email notice. Accepts JavaScript flags (i, g, m, s, u, y...). With no regex, clears the filter.',
            ex: ['-f /chatName.*Jorge/i', '-f']
        },
        {
            opts: ['level', 'lvl'],
            values: ['<0|1|2|3>'],
            desc: 'Level: 0 (default) basic logs and command arguments; 1 what the bot is calling, one line each with the duration (commands, database queries, HTTP requests, external processes, email, WhatsApp); 2 the same calls with their arguments and every exported function of the modules, with depth and duration; 3 results and the execution in Chromium (the most verbose). Needs debug on or -on in the same command.',
            ex: ['-lvl 2', '-on -lvl 3']
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
    role: OWNER // the bot logs show everything: owner only
};
