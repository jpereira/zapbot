/*
 * /alias: Saves shortcuts for commands with arguments
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/alias',
    usage: '/alias <name> [-q] [-p] [-d "Description"] <command or text with {/command}>  or  /alias [<name>|-l]  or  /alias -m <name> <new name>  or  /alias -rm <name...|all>  or  /alias -ex [<file>]',
    aliases: [],
    summary: 'Saves shortcuts for commands with arguments',
    help: 'Saves shortcuts for commands with arguments or for a text with several {/command}, like in /cron: each one runs and the reply takes its place, in a single message. In the text, \\n becomes a line break. With no option, lists the registered aliases; with only a name (/alias /dolar), shows what that alias does; if it is not an alias, lists the ones with that text in the name (/alias dol finds /dolar, /dolar2 and /my.dol), or an error if none matches. In a command shortcut, $1, $2... take the typed arguments (e.g. /alias /rec /sticker -ss $1 -es $2; /rec 10 20 url); the syntax with braces and :- sets a default value (see the /alias documentation).  When running the shortcut, the bot prints the called command, appends the additional arguments and respects the permissions of the target commands. The name accepts letters, numbers, _, - and ., with or without a slash when registering. Registering the same name replaces the command and the description. The target must be an active bot command, including its fixed aliases; it cannot be /alias or another registered shortcut. Command names and all are reserved. Use /help alias to list the shortcuts available to you. A private alias (-p) is only for the owner.',
    ex: [
        '/alias /dollar /crypto USD',
        '/alias orca Checking Orca {/defi orca}\\n Checking Prjx {/defi prjx}'
    ],
    cmd_opts: [
        {
            opts: ['quiet', 'q'],
            values: [],
            desc: 'No "🔗 Alias" header when running the shortcut.',
            ex: ['/alias -q /haha /me Hahaha!']
        },
        {
            opts: ['private', 'p'],
            values: [],
            desc: 'Makes the alias private: only the bot owner sees and runs it (it is not in the lists, not in /help, and for anyone else it does not exist). Without a command, changes the alias that exists. Works with -q, in any order.',
            ex: ['/alias -q -p /meu /me only I see this', '/alias -p /end.froes']
        },
        {
            opts: ['public', 'pub'],
            values: [],
            desc: 'Takes the lock off a private alias (/alias -public /end.froes): whoever can run its target sees and runs it again.',
            ex: ['/alias -public /end.froes']
        },
        {
            opts: ['desc', 'd'],
            values: ['<text>'],
            desc: 'Optional description, in quotes, before the command or the text. Straight or curly quotes work, even mixed. Without a command, updates only the description of an alias that already exists.',
            ex: ['/alias /demo -d "Dollar" /rates USD', '/alias /demo -d "New text"']
        },
        { opts: ['list', 'l'], values: [], desc: 'Lists the registered shortcuts.' },
        {
            opts: ['examples', 'ex'],
            values: ['[<file>]'],
            desc: 'Without a name, lists the example files (examples/*.zb: aliases ready to use, loaded once on the first boot after they appear). With a name, loads that file; an alias that already exists stays as it is, unless -yes (-y): then the definition of the file replaces it (to apply a newer version of an example).',
            ex: ['/alias -examples', '/alias -examples tts-voices', '/alias -examples tts-voices -yes']
        },
        {
            opts: ['move', 'm'],
            values: ['<current name>', '<new name>'],
            desc: 'Renames an alias. Keeps the command, the description and the quiet flag; the new name must not exist.',
            ex: ['/alias -m /dollar /usd']
        },
        {
            opts: ['rm'],
            values: ['<name...|all>'],
            desc: 'Removes one or more aliases (separated by space or comma), with or without the slash; all removes all of them.',
            ex: ['/alias -rm /demo', '/alias -rm demo demo2 /dollar', '/alias -rm all']
        }
    ],
    freeArguments: true,
    typing: false, // replies right away: without the "typing..."
    role: ADMIN // creates shortcuts for any command
};
