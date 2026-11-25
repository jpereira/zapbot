/*
 * /forward: Forwards the replied message to people, groups or emails
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/forward',
    usage: '/forward [-quiet|-q|-status|-s] [-dry|-d] [-nohdr] [#list]... [-N|-N,-N|-N..-N] [/contact/|@mention|+number]... [text] [-to <destination>]...  or  /forward -add|-a|-list|-l|-rm|-r|-move|-m|-desc <...>',
    aliases: [],
    summary: 'Forwards the replied message to people, groups or emails',
    help: 'Forwards the message you replied to (text, photo, video, audio, document, sticker, location...) to the recipients. Without a reply, give the position of the messages above first: -1 is the one right above, -1 -4 -6 or -1,-4,-6 are several, -3..-1 is a range (up to forward.max, sent from the oldest to the newest; the header goes once, before them). It only sends if every recipient is found; otherwise nothing is sent and the bot says which one failed. It replies right away with who will receive it and, when done, edits that message with the status (a ❌ and the reason for any that failed); with -quiet, nothing is shown (no status and no header). By default the message comes with the header "Message forwarded by ZapBot!" (setting forward.header) and the status is shown (setting forward.status); -status forces both and -nohdr drops only the header. After the recipients, a text can follow: it goes at the start and, with a reply, the replied message goes below it, after a blank line.',
    ex: ['/forward /Fulano de Tal/', '/forward /Jorge Pereira/ @Maria -to fulano@example.com', '/forward /My Contact/ #group /Family/ This goes to everyone!', '/forward -to root@example.org -to /Family/'],
    cmd_opts: [
        {
            argv: ['[/contact/|@mention|+number]...'],
            desc: 'Who receives it: name, /Name Here/, @mention, number or email, separated by spaces. If several match, you pick from the list. A #list (full name) sends to all its recipients; it can be mixed with the others.',
            ex: ['/forward #friends', '/forward #friends #work /Maria/']
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
            desc: 'Shows nothing: no status (neither the notice nor the list) and no header on what is sent. Only failures are reported.',
            ex: ['/forward -q /Jorge Pereira/']
        },
        {
            opts: ['status', 's'],
            values: [],
            desc: 'Forces the header on what is sent and the status (the notice and the summary of who received it), even with forward.header and forward.status off.',
            ex: ['/forward -s /Jorge Pereira/']
        },
        {
            opts: ['nohdr'],
            values: [],
            desc: 'Sends without the "Message forwarded by ZapBot!" header only (the status stays; -q drops both, the setting forward.header turns it off for all).',
            ex: ['/forward -nohdr /Jorge Pereira/', '/forward -q -nohdr #friends']
        },
        {
            opts: ['dry', 'd'],
            values: [],
            desc: 'Only validates the recipients: replies with who was found (or what is wrong) and sends nothing. Needs no reply or positions.',
            ex: ['/forward -d /Jorge Pereira/ ', '/forward -d -to fulano@example.com']
        },
        {
            opts: ['add', 'a'],
            values: ['#list <recipients>...'],
            desc: 'Creates the recipient list (or adds to it): the recipients are resolved now and saved with their ids, like the -to targets (name, /Name Here/, @mention, number, email). Never replaces. Up to forward.maxRecipients per list.',
            ex: ['/forward -a #friends /Jorge Pereira/ /Rossam Silva/ +5521999999999 a@b.com', '/forward -a #friends -to /Family/'],
            cron: false
        },
        {
            opts: ['list', 'l'],
            values: ['[#list...]'],
            desc: 'Without a name, shows all the lists with their size. With names, shows the recipients numbered and grouped (people, groups, emails), with the size against forward.maxRecipients (the name can be partial: #fri finds #friends).',
            ex: ['/forward -l', '/forward -l #friends'],
            cron: false
        },
        {
            opts: ['rm', 'r'],
            values: ['<#list...|all> or #list <recipient>...'],
            desc: 'Removes the whole list (or several, or all), or only the given recipients from a list (by the number shown in -list, or matched by name, email or phone among its members). If any does not exist, nothing is removed. The list needs its full name; removing the last recipient removes the list.',
            ex: ['/forward -r #friends', '/forward -r #friends /Jorge Pereira/', '/forward -r #friends 2', '/forward -r all'],
            cron: false
        },
        {
            opts: ['move', 'm'],
            values: ['#list #newlist'],
            desc: 'Renames the list (if the new name already exists, the two merge). The list needs its full name, and its description goes along.',
            ex: ['/forward -m #friends #team'],
            cron: false
        },
        {
            opts: ['desc'],
            values: ['#list [<description>|-rm]'],
            desc: 'List description, shown in -list. Without text, shows the current one; with -rm, deletes it. The list name can be partial.',
            ex: ['/forward -desc #friends The usual crowd', '/forward -desc #friends', '/forward -desc #friends -r'],
            cron: false
        }
    ],
    role: ADMIN // sends messages on behalf of your account
};
