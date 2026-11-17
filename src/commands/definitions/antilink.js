/*
 * /antilink: Deletes links from non-admins in the group
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/antilink',
    usage: '/antilink [-off|-delete|-warn|-remove] [-allow <domain>] [-deny <domain>]',
    aliases: [],
    summary: 'Deletes links sent by non-admins in the group',
    help: 'Deletes the links sent by people who are not admins of the group. Per group, off by default: -delete only deletes, -warn deletes and adds a /warn warning (the limit of warn.max removes the person), -remove deletes and removes the person right away. Group admins, you and the bot admins are never caught. The bot has to be an admin of the group. Without options, shows the current mode and the allowed domains. Works only in groups.',
    ex: [
        '/antilink -delete',
        '/antilink -allow youtube.com',
        '/antilink'
    ],
    cmd_opts: [
        { opts: ['off'], values: [], desc: 'Turns it off in this group (the default).' },
        { opts: ['delete'], values: [], desc: 'Deletes the message with the link, for everyone.' },
        { opts: ['warn'], values: [], desc: 'Deletes and adds a /warn warning; at the limit (warn.max) the person is removed.' },
        { opts: ['remove'], values: [], desc: 'Deletes and removes the person from the group right away.' },
        {
            opts: ['allow'],
            values: ['<domain>'],
            desc: 'Allows a domain (and its subdomains): links to it are not deleted.',
            ex: ['/antilink -allow youtube.com']
        },
        {
            opts: ['deny'],
            values: ['<domain>'],
            desc: 'Takes a domain off the allowed list.',
            ex: ['/antilink -deny youtube.com']
        }
    ],
    delegavel: true,
    role: ADMIN // Touches the current group: delegable
};
