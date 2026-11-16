/*
 * /usage: Your usage limits (/bot +limit): what you have left and when it renews
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/usage',
    usage: '/usage [OPTION] [person...]',
    aliases: [],
    summary: 'Your usage limits: used, left and when they renew',
    help: 'Shows the usage limits the owner set for you (/bot +cmd /gpt +limit 5/day): for each command, how many calls you used, the limit, and when it renews. Only successful calls count: help, usage and errors do not. The owner and the admins have no limits. With -log, your last calls: when, command and parameters. The owner and admins can look up other people.',
    ex: ['/usage', '/usage -log', '/usage /Rafael Silva/'],
    cmd_opts: [
        {
            opts: ['log', 'l'],
            values: [],
            desc: 'The last calls that counted: when, command and parameters.',
            ex: ['/usage -l']
        },
        {
            argv: ['[person...]'],
            desc: 'Whose limits to show (owner and admins only): /name/, @mention or +number. Without it, yours.',
            ex: ['/usage /Rafael Silva/', '/usage -l +5521999999999']
        }
    ],
    role: USER
};
