/*
 * /group: See and change the group
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/group',
    usage: '/group [-info|-admins] [-name <text>] [-desc [text]] [-pic|-rmpic] [-send|-edit|-add <admins|all>] [-for <time>]',
    aliases: [],
    summary: 'Shows and changes the group',
    help: 'Shows and changes the group where it was typed. With no options, shows the info (members, admins, creator, creation date, description and who can send, edit and add). The changes ask that your account is an admin of the group. The invite link is in /invite. Works only in groups.',
    ex: [
        '/group',
        '/group -name L200 Friends',
        '/group -send admins -for 30m'
    ],
    cmd_opts: [
        { opts: ['info', 'i'], values: [], desc: 'Shows the info of the group (the same as /group with nothing).' },
        { opts: ['admins', 'a'], values: [], desc: 'Lists the admins (👑 creator, ⭐ admin).' },
        {
            opts: ['name'],
            values: ['<text>'],
            desc: 'Changes the group name. It runs to the end of the command (may have spaces).',
            ex: ['/group -name L200 Friends']
        },
        {
            opts: ['desc'],
            values: ['[text]'],
            desc: 'Changes the group description. With no text, clears it.',
            ex: ['/group -desc Rules: be nice', '/group -desc']
        },
        { opts: ['pic'], values: [], desc: 'Sets the group photo from the image you reply to (or the one sent with the command as the caption).' },
        { opts: ['rmpic', 'rp'], values: [], desc: 'Removes the group photo.' },
        {
            opts: ['send'],
            values: ['<admins|all>'],
            desc: 'Who can send messages: admins (the group is closed for the others) or all. With -for, it reopens by itself.',
            ex: ['/group -send admins', '/group -send all']
        },
        {
            opts: ['edit'],
            values: ['<admins|all>'],
            desc: 'Who can change the name, description and photo of the group.',
            ex: ['/group -edit admins']
        },
        {
            opts: ['add'],
            values: ['<admins|all>'],
            desc: 'Who can add people to the group.',
            ex: ['/group -add admins']
        },
        {
            opts: ['for'],
            values: ['<time>'],
            desc: 'With -send admins: closes only for this time (30m, 2h, 1d, 1h30m) and reopens by itself, even if the bot restarts.',
            ex: ['/group -send admins -for 30m']
        }
    ],
    isDelegable: true,
    role: ADMIN // Touches the current group: delegable
};
