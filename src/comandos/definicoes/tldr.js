/*
 * /tldr: Summarizes the chat conversation with ChatGPT
 */

const { ADMIN } = require('../../roles').ROLES;
const { opcaoStatus } = require('./_opcoes');

module.exports = {
    cmd: '/tldr',
    usage: '/tldr [-status|-s] [OPTION] [period]',
    aliases: ['/resumo'],
    summary: 'Summarizes the chat conversation with ChatGPT',
    help: 'Summarizes the chat conversation with ChatGPT: topics, decisions and pending items. Audio messages (the most recent ones) are transcribed and included in the summary with who sent them and when.',
    cmd_opts: [
        {
            opts: ['chat', 'c'],
            values: ['<name>'],
            desc: 'Summarizes another chat, looked up by name (all the words, accent-insensitive).',
            outrosChats: true
        },
        {
            opts: ['pv'],
            values: [],
            desc: 'Sends it to your private chat instead of showing it in the current chat.',
            outrosChats: true
        },
        opcaoStatus('/tldr -s 2h'),
        {
            argv: ['[period]'],
            desc: 'A duration, like in /cron (30m, 2h, 1d, 1h30m, 2d4h): the messages from that time until now; a number (300): the last 300 (max tldr.maxMsgs). Default: the last 100. Replying to a message (without a period or -c): from the replied message until now.'
        }
    ],
    estrito: 'primeira',
    delegavel: true,
    role: ADMIN // delegável: gasta a API do dono, só o chat atual
};
