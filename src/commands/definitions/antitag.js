/*
 * /antitag: Deletes messages from non-admins that tag lots of people
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/antitag',
    usage: '/antitag [-off|-delete|-warn|-remove] [-min <n>]',
    aliases: [],
    summary: 'Deletes messages from non-admins that tag lots of people',
    help: 'Deletes the messages sent by people who are not admins of the group that tag lots of people at once (the "tag everyone" abuse). Per group, off by default: -delete only deletes, -warn deletes and adds a /warn warning (the limit of warn.max removes the person), -remove deletes and removes the person right away. Group admins, you and the bot admins are never caught. The bot has to be an admin of the group. Without options, shows the current mode and the minimum. Works only in groups.',
    ex: [
        '/antitag -delete',
        '/antitag -min 6',
        '/antitag'
    ],
    cmd_opts: [
        { opts: ['off'], values: [], desc: 'Turns it off in this group (the default).' },
        { opts: ['delete'], values: [], desc: 'Deletes the message, for everyone.' },
        { opts: ['warn'], values: [], desc: 'Deletes and adds a /warn warning; at the limit (warn.max) the person is removed.' },
        { opts: ['remove'], values: [], desc: 'Deletes and removes the person from the group right away.' },
        {
            opts: ['min'],
            values: ['<n>'],
            desc: 'From how many tags a message is caught (3 to 1000; default 10). In a small group, 80% of its members, but never less than 3.',
            ex: ['/antitag -min 6']
        }
    ],
    isDelegable: true,
    role: ADMIN // Touches the current group: delegable
};
