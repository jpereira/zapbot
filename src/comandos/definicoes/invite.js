/*
 * /invite: The group invite link
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/invite',
    usage: '/invite [-revoke|-r]',
    aliases: [],
    summary: 'The group invite link',
    help: 'Replies with the invite link of the group. The bot (your account) has to be an admin of the group. With -revoke, the current link stops working and a new one is made. Works only in groups.',
    ex: ['/invite', '/invite -r'],
    cmd_opts: [
        {
            opts: ['revoke', 'r'],
            values: [],
            desc: 'Invalidates the current link and makes a new one.',
            ex: ['/invite -r']
        }
    ],
    role: ADMIN // O link do grupo: o WhatsApp só deixa um admin
};
