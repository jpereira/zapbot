/*
 * /forward: Forwards the replied message to people, groups or emails
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/forward',
    usage: '/forward [-q] [-N] <recipient>... [-to <destination>]...',
    aliases: [],
    summary: 'Forwards the replied message to people, groups or emails',
    help: 'Forwards the message you replied to (text, photo, video, audio, document, sticker, location...) to the recipients. Without a reply, give the position of the messages above first: -1 is the one right above, -1 -4 -6 or -1,-4,-6 are several, -3..-1 is a range (up to forward.max, sent from the oldest to the newest; the header goes once, before them). It only sends if every recipient is found; otherwise nothing is sent and the bot says which one failed. It replies right away with who will receive it and, when done, edits that message with the status (a ❌ and the reason for any that failed); with -quiet, no status is shown. By default the message comes with the header "Message forwarded by ZapBot!" (setting forward.header).',
    ex: ['/forward /Fulano de Tal/', '/forward /Jorge Pereira/ @Maria -to fulano@example.com', '/forward -to root@example.org -to /Family/'],
    cmd_opts: [
        {
            argv: ['[/contact/|@mention|+number]...'],
            desc: 'Who receives it: name, /Name Here/, @mention, number or email, separated by spaces. If several match, you pick from the list.'
        },
        {
            argv: ['[-N|-N,-N|-N..-N]'],
            desc: 'Positions of the messages above, without a reply: -1 is the one right above; -1 -4 -6, -1,-4,-6 or -3..-1. The bot\'s own messages do not count.',
            ex: ['/forward -1 /Fulano/', '/forward -1 -4 -6 /Fulano/ /Family/', '/forward -3..-1 /Fulano/']
        },
        {
            opts: ['to'],
            values: ['<destination>'],
            desc: 'One more recipient: a contact, a group, a number or an email (several with the name: you pick from the list). Repeat for several.',
            ex: ['-to fulano@example.com', '-to /Jorge Pereira/ -to @Maria']
        },
        {
            opts: ['quiet', 'q'],
            values: [],
            desc: 'Shows no status: neither the notice nor the list. Only failures are reported.',
            ex: ['/forward -q /Jorge Pereira/']
        }
    ],
    role: ADMIN // manda mensagens em nome da sua conta
};
