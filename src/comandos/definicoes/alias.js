/*
 * /alias: Salva atalhos para comandos com argumentos
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/alias',
    usage: '/alias <name> [-quiet|-q] [-desc|-d "Description"] </command arguments>  or  /alias <name> [-quiet|-q] [-desc|-d "Description"] <text with {/command}>  or  /alias [-list|-l]  or  /alias -move|-m <current name> <new name>  or  /alias -rm <name...|all>',
    aliases: [],
    summary: 'Saves shortcuts for commands with arguments',
    help: 'Saves shortcuts for commands with arguments or for a text with several {/command}, like in /cron: each one runs and the reply takes its place, in a single message. In the text, \\n becomes a line break. With no option, lists the registered aliases. In a command shortcut, $1, $2... take the typed arguments (e.g. /alias /rec /sticker -ss $1 -es $2; /rec 10 20 url); the syntax with braces and :- sets a default value (see the /alias documentation).  When running the shortcut, the bot prints the called command, appends the additional arguments and respects the permissions of the target commands. The name accepts letters, numbers, _, - and ., with or without a slash when registering. Registering the same name replaces the command and the description. The target must be an active bot command, including its fixed aliases; it cannot be /alias or another registered shortcut. Command names and all are reserved. Use /help alias to list the shortcuts available to you.',
    ex: [
        '/alias /dolar /crypto USD',
        '/alias orca Verificando Orca {/defi orca}\\n Verificando Prjx {/defi prjx}'
    ],
    cmd_opts: [
        {
            opts: ['quiet', 'q'],
            values: [],
            desc: 'When running the shortcut, does not print the "🔗 Alias /nome -> comando" header.',
            ex: ['/alias -q /haha /me Hahaha!']
        },
        {
            opts: ['desc', 'd'],
            values: ['<text>'],
            desc: 'Optional description in straight or curly quotes, even mixed, before the command or the text. Without a command, updates only the description of an alias that already exists.',
            ex: ['/alias /eita -desc "Dollar" /rates USD', '/alias /eita -d "New text"']
        },
        { opts: ['list', 'l'], values: [], desc: 'Lists the registered shortcuts.' },
        {
            opts: ['move', 'm'],
            values: ['<current name>', '<new name>'],
            desc: 'Renames an alias, keeping the command, the description and the quiet flag; the new name must not exist.',
            ex: ['/alias -move /dolar /usd']
        },
        {
            opts: ['rm'],
            values: ['<name...|all>'],
            desc: 'Removes one or more aliases (separated by space or comma), with or without the slash; all removes all of them.',
            ex: ['/alias -rm /eita', '/alias -rm eita eita2 /dolar', '/alias -rm all']
        }
    ],
    argumentosLivres: true,
    digitando: false, // responde na hora: sem o "digitando..."
    role: ADMIN // cria atalhos para qualquer comando
};
