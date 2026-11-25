/*
 * /join: Joins a group through an invite link
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/join',
    usage: '/join <invite link>  or  /join -info|-i <link>  or  /join -l',
    summary: 'Joins a group through an invite link',
    help: 'Joins a WhatsApp group through the invite link (chat.whatsapp.com/<code>, with or without https://, or just the code). With -info, shows the group name, participants and description without joining. With -list, lists the groups you are in (same as /leave -l). To leave, use /leave.',
    ex: [
        '/join https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv',
        '/join -i chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv',
        '/join -l'
    ],
    cmd_opts: [
        {
            argv: ['<invite link>'],
            desc: 'The group link (https://chat.whatsapp.com/<code>) or just the code.',
            ex: ['/join https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv']
        },
        {
            opts: ['info', 'i'],
            values: [],
            desc: 'Shows the invited group (name, participants and description) without joining.',
            ex: ['/join -i chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv']
        },
        {
            opts: ['list', 'l'],
            values: [],
            desc: 'Lists the groups you are in, numbered for /leave <no.>.'
        }
    ],
    role: ADMIN // joins groups
};
