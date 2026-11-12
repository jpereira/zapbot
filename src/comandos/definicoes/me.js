/*
 * /me: Envia a mensagem digitada
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/me',
    usage: '/me [-repeat|-r <n>] <message>',
    aliases: [],
    summary: 'Sends the typed message',
    help: 'Sends the typed message. {/command args} runs right away and the reply takes its place (query commands only, as in /cron). A typed \\n becomes a line break.',
    ex: ['/me Bitcoin is at {/crypto BTC}', '/me Line 1\\nLine 2', '/me -r 3 Haha!'],
    cmd_opts: [
        {
            opts: ['repeat', 'r'],
            values: ['<n>'],
            desc: 'Repeats the text n times (1 to me.maxRepeat, default 500), joined together, in a single message; the {/command}s run only once.',
            ex: ['/me -r 3 Haha! sends Haha!Haha!Haha!']
        }
    ],
    role: USER
};
