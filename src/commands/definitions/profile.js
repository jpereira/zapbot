/*
 * /profile: A contact's profile picture
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/profile',
    usage: '/profile [-about|-a] [/contact/|@mention|+number]...  or  /profile -set|-s [text]',
    aliases: [],
    summary: 'A contact\'s profile picture',
    help: 'A contact\'s profile picture, with the caption Contact: name in your address book <phone>. With nobody, shows the one of the person in the private chat (in your own private chat, yours) or, in a group, the group picture; replying to a message, the one of whoever wrote it. With no picture, or with the picture hidden by the contact\'s privacy, only the text is sent. With -set, changes the picture: the group\'s (in a group, if you are an admin of it) or your account\'s (in any other chat).',
    ex: ['/profile', '/profile /Jorge Pereira/', '/profile @Fulano', '/profile +5521999999999', '/profile -s', '/profile -a /Fulano/', '/profile -s Busy until Monday'],
    cmd_opts: [
        {
            opts: ['about', 'a'],
            values: [],
            desc: 'Shows the About text (the note under the name) of the people instead of the photo; with nobody, the one of the private chat (in a group, the group\'s description). Hidden by privacy settings or empty: it says so.',
            ex: ['/profile -a', '/profile -a /Fulano/', '/profile -a @Fulano']
        },
        {
            argv: ['[/contact/|@mention|+number]...'],
            desc: 'The people: an address book contact by name or part of it (a name with spaces goes between /.../ or quotes; if several match, you pick from the list), someone mentioned with @, or a number. With nobody, the one of the person in the private chat (in your own, yours), the group picture in a group, or the one of whoever wrote the replied message.',
            outrosChats: true
        },
        {
            opts: ['set', 's'],
            values: [],
            desc: 'Changes the picture to the image you replied to (or to the photo sent with /profile -set as the caption): the group\'s, in a group (the bot has to be an admin, unless the group lets everyone edit it), or your account\'s, in any other chat. With text and no image, it changes your **About** (the note under your name) instead: up to 139 characters, no line breaks or invisible characters. Owner and admins only, even if the command was delegated.',
            ex: ['/profile -s', '/profile -s Busy until Monday'],
            role: ADMIN,
            cron: false
        },
        {
            opts: ['mask', 'm'],
            values: [],
            desc: 'Obfuscates phone numbers in the output (e.g. +55219****44).',
            ex: ['/profile -m /Fulano/']
        }
    ],
    mask: true,
    delegavel: true,
    role: ADMIN // delegable: current chat only
};
