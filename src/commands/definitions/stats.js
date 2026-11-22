/*
 * /stats: Chat ranking: who talks, deletes and edits the most
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/stats',
    usage: '/stats [-N] [/chat/] [-me]  or  /stats -l  or  /stats -flush </chat/>  or  /stats -flush-all',
    summary: 'Chat ranking: who talks, deletes and edits the most',
    help: 'Ranking of the current chat or another one (/Group/): who talks, deletes and edits the most, hours and peak day. With -me, your own stats. -l lists the chats with stats; -flush deletes those of a chat and -flush-all, all of them.',
    cmd_opts: [
        {
            opts: ['flush', 'f'],
            values: ['</chat/>'],
            desc: 'Deletes the stats of a chat: a group, or the private chat with a person, searched by name among those that have stats.',
            ex: ['/stats -f /Family Group/'],
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
            desc: 'Lists the chats with stats, from the most active to the least. With the total and the day of the last message.',
            otherChats: true
        },
        {
            opts: ['me'],
            values: [],
            desc: 'Your messages, summed across all chats (or only in /chat/): where you talk the most, hours and peak.',
            otherChats: true
        },
        {
            argv: ['-N'],
            desc: 'Period in days (default 7, max. stats.retentionDays). Goes before or after /chat/.',
            ex: ['/stats -30', '/stats /Family Group/ -10'],
            number: true
        },
        {
            argv: ['</chat/>'],
            desc: 'Another chat instead of the current one: a group, or the private chat with a person, searched by name (case and accent insensitive) among those that have stats; several with the name: you pick from the list.',
            ex: ['/stats /Family Group/', '/stats -10 /Family/', '/stats -me /Family/'],
            otherChats: true
        }
    ],
    strict: true,
    isDelegable: true,
    role: ADMIN, // delegable: current chat only (-flush is owner only)
    cron: true
};
