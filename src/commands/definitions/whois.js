/*
 * /whois: Shows who you are and what you can do in the bot, in this chat
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/whois',
    usage: '/whois [-id] [person...]',
    aliases: [],
    summary: 'Shows who someone is and what they can do in the bot, in this chat',
    help: 'Shows who someone is and what they can do in the bot, in this chat: 🤖 owner, 👑 admin (+a), 🗣️ user (+u) or 🚫 no permission; who has limited commands (/bot +cmd), with their list. Alone, shows you. With people (or replying to a message), shows them, but only for the owner and admins.',
    ex: ['/whois', '/whois /Rafael Silva/', '/whois -id'],
    cmd_opts: [
        {
            opts: ['id'],
            values: [],
            desc: 'Shows the ids instead of the permission level: the chat\'s (the group id or the private chat\'s) and each person\'s (the phone, the @c.us and, when WhatsApp sent it, the internal @lid).',
            ex: ['/whois -id', '/whois -id +5521999999999']
        },
        {
            argv: ['[person...]'],
            desc: 'Who to look up (owner and admins only): /name/, @mention or +number, several at once. Replying to a message, without a person: whoever wrote it.',
            ex: ['/whois @Fulano', '/whois +5521999999999']
        }
    ],
    role: USER
};
