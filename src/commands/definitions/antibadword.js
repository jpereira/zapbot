/*
 * /antibadword: Deletes messages from non-admins with banned words
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/antibadword',
    usage: '/antibadword [-off|-delete|-warn|-remove] [-add <word>] [-rm <word>] [-list]',
    aliases: [],
    summary: 'Deletes messages from non-admins with banned words',
    help: 'Deletes the messages sent by people who are not admins of the group that have a word (or phrase) from the group list. It ignores case, accents and punctuation, and only the whole word counts ("cu" does not catch "cuidado"). Per group, off by default: -delete only deletes, -warn deletes and adds a /warn warning (the limit of warn.max removes the person), -remove deletes and removes the person right away. Group admins, you and the bot admins are never caught. The bot has to be an admin of the group. Without options, shows the current mode and how many words there are. Works only in groups.',
    ex: [
        '/antibadword -add idiota',
        '/antibadword -delete',
        '/antibadword -list'
    ],
    cmd_opts: [
        { opts: ['off'], values: [], desc: 'Turns it off in this group (the default).' },
        { opts: ['delete'], values: [], desc: 'Deletes the message, for everyone.' },
        { opts: ['warn'], values: [], desc: 'Deletes and adds a /warn warning; at the limit (warn.max) the person is removed.' },
        { opts: ['remove'], values: [], desc: 'Deletes and removes the person from the group right away.' },
        {
            opts: ['add'],
            values: ['<word>'],
            desc: 'Adds a word to the list (up to 100), one per command. For a phrase, use quotes.',
            ex: ['/antibadword -add idiota', '/antibadword -add "vai se ferrar"']
        },
        {
            opts: ['rm'],
            values: ['<word>'],
            desc: 'Takes a word off the list.',
            ex: ['/antibadword -rm idiota']
        },
        { opts: ['list', 'l'], values: [], desc: 'Shows the words of the list.' }
    ],
    delegavel: true,
    role: ADMIN // Touches the current group: delegable
};
