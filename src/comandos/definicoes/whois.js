/*
 * /whois: Mostra quem é e o que pode no bot, neste chat
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/whois',
    usage: '/whois [person...]',
    aliases: [],
    summary: 'Shows who someone is and what they can do in the bot, in this chat',
    help: 'Shows who someone is and what they can do in the bot, in this chat: 🤖 owner, 👑 admin (+a), 🗣️ user (+u) or 🚫 no permission; who has limited commands (/bot +cmd), with their list. Alone, shows you. With people (or replying to a message), shows them, but only for the owner and admins.',
    ex: ['/whois', '/whois /Rafael Silva/'],
    cmd_opts: [
        {
            argv: ['[person...]'],
            desc: 'Who to look up (owner and admins only): /name/, @mention or +number, several at once. Replying to a message, without a person: whoever wrote it.',
            ex: ['/whois @Fulano', '/whois +5521999999999']
        }
    ],
    role: USER
};
