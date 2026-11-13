/*
 * /set: Lista, exibe e altera as configurações do bot
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/set',
    usage: '/set [OPTION] [<key> [<value>]]',
    aliases: [],
    summary: 'Lists, shows and changes the bot settings',
    help: 'Lists, shows and changes the bot settings; on lists, -append (-a) and -rm add and remove items. In your private chat, also shows config/.env (read-only).',
    cmd_opts: [
        {
            opts: ['append', 'a'],
            values: ['<key>'],
            desc: 'On a list, adds the items that come after the key. In bot.admins and bot.users, the contact name works (in bot.users, the group name too).',
            ex: ['/set -a bot.admins /Jorge Pereira/']
        },
        {
            opts: ['rm'],
            values: ['<key>'],
            desc: 'On a list, removes the items that come after the key.',
            ex: ['/set -rm commands.disabled noffa']
        },
        { opts: ['reset', 'r'], values: ['<key>'], desc: 'Resets the key to its default value.' },
        { argv: ['<key>'], desc: 'Shows the key\'s value, default and description.' },
        {
            argv: ['<snippet|/regex/>'],
            desc: 'If it is not a key: lists the keys that match.',
            ex: ['/set alerta']
        },
        {
            argv: ['<key> <value>'],
            desc: 'Changes it. Lists: items separated by comma or space (watch.rules: one rule per line; bot.users.cmds: separated by space, since each item has commas).'
        }
    ],
    digitando: true, // responde na hora: sem o "digitando..."
    role: ADMIN // altera as configurações
};
