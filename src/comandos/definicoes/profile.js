/*
 * /profile: A contact's profile picture
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/profile',
    usage: '/profile [/contact/|@mention|+number]...',
    aliases: ['/perfil'],
    summary: 'A contact\'s profile picture',
    help: 'A contact\'s profile picture, with the caption Contato: name in your address book <phone>. With nobody, shows the one of the person in the private chat (in your own private chat, yours) or, in a group, the group picture; replying to a message, the one of whoever wrote it. With no picture, or with the picture hidden by the contact\'s privacy, only the text is sent.',
    ex: ['/profile', '/profile /Jorge Pereira/', '/profile @Fulano', '/profile +5521999999999'],
    cmd_opts: [
        {
            argv: ['[/contact/|@mention|+number]...'],
            desc: 'The people: an address book contact by name or part of it (a name with spaces goes between /.../ or quotes; if several match, you pick from the list), someone mentioned with @, or a number. With nobody, the one of the person in the private chat (in your own, yours), the group picture in a group, or the one of whoever wrote the replied message.',
            outrosChats: true
        },
        {
            opts: ['mask', 'm'],
            values: [],
            desc: 'Obfuscates phone numbers with 10 to 15 consecutive digits in this run\'s output, keeping the first five and the last two (like +55219****44).',
            ex: ['/profile -mask /Fulano/']
        }
    ],
    mask: true,
    delegavel: true,
    role: ADMIN // delegável: só o chat atual
};
