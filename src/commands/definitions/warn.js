/*
 * /warn: Warns someone in the group; at the limit, they are removed
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/warn',
    usage: '/warn [/contact/|@mention|+number] [reason]  or  /warn -list|-clear [person]',
    aliases: [],
    summary: 'Warns someone in the group; at the limit, they are removed',
    help: 'Adds a warning to someone in the group, with a reason if you want (the rest of the text). Replying to a message, it is whoever wrote it. When the person reaches the limit (setting warn.max, 3 by default), the bot removes them from the group and zeroes the count (it has to be an admin of the group). Group admins are not warned. Works only in groups.',
    ex: [
        '/warn @Fulano posted a link',
        '/warn -l',
        '/warn -c @Fulano'
    ],
    cmd_opts: [
        {
            opts: ['list', 'l'],
            values: [],
            desc: 'Lists the warnings of the group (who has how many) or, with a person, each one with date and reason.',
            ex: ['/warn -l', '/warn -l @Fulano']
        },
        {
            opts: ['clear', 'c'],
            values: [],
            desc: 'Zeroes the warnings of a person (or of whoever wrote the message you replied to).',
            ex: ['/warn -c @Fulano']
        },
        {
            argv: ['[/contact/|@mention|+number] [reason]'],
            desc: 'Who to warn: an address book contact (a name with spaces goes between /.../), someone mentioned with @ or a number, followed by the reason. Replying to a message, the person is its author and all the text is the reason.',
            ex: ['/warn @Fulano posted a link', '/warn /Fulano de Tal/ spam', '/warn off-topic (replying to a message)']
        }
    ],
    isDelegable: true,
    role: ADMIN // Touches the current group: delegable
};
