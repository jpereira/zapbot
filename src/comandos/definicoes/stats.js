/*
 * /stats: Ranking do chat: quem mais fala, apaga e edita
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/stats',
    usage: '/stats [-N] [/chat/] [-me]  or  /stats -l  or  /stats -flush </chat/>  or  /stats -flush-all',
    aliases: ['/estatisticas'],
    summary: 'Chat ranking: who talks, deletes and edits the most',
    help: 'Ranking of the current chat or another one (/Group/): who talks, deletes and edits the most, hours and peak day. With -me, your own stats. -l lists the chats with stats; -flush deletes those of a chat and -flush-all, all of them.',
    cmd_opts: [
        {
            opts: ['flush', 'f'],
            values: ['</chat/>'],
            desc: 'Deletes the stats of a chat: a group, or the private chat with a person, searched by name among those that have stats.',
            ex: ['/stats -flush /Grupo Família/'],
            cron: false,
            role: ADMIN
        },
        {
            opts: ['flush-all'],
            values: [],
            desc: 'Deletes the stats of all chats.',
            cron: false,
            role: ADMIN
        },
        {
            opts: ['list', 'l'],
            values: [],
            desc: 'Lists the chats with stats, from the most active to the least, with the total and the day of the last message.',
            outrosChats: true
        },
        {
            opts: ['me'],
            values: [],
            desc: 'Your messages, summed across all chats (or only in /chat/): where you talk the most, hours and peak.',
            outrosChats: true
        },
        {
            argv: ['-N'],
            desc: 'Period in days (default 7, max. stats.retentionDays). Goes before or after /chat/.',
            ex: ['/stats -30', '/stats /Grupo Família/ -10'],
            numero: true
        },
        {
            argv: ['</chat/>'],
            desc: 'Another chat instead of the current one: a group, or the private chat with a person, searched by name (case and accent insensitive) among those that have stats; several with the name: you pick from the list.',
            ex: ['/stats /Grupo Família/', '/stats -10 /Família/', '/stats -me /Família/'],
            outrosChats: true
        }
    ],
    estrito: true,
    delegavel: true,
    role: ADMIN, // delegável: só o chat atual (o -flush é só do dono)
    cron: true
};
