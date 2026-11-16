/*
 * /notes: Notes saved in the database
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/notes',
    usage: '/notes #tag <text>  or  /notes [-list|-l] [#tag...] [-to <destination>]...  or  /notes -search|-view|-update|-export|-move|-desc|-rm|-alert <...>',
    summary: 'Notes saved in the database',
    help: 'Notes saved in the database. To add one, the syntax is /notes #tag <text>: without the #tag it errors, and just /notes #tag lists the tag\'s notes. Replying to a message, its text becomes the note, with ↩️ (/notes #lembrete); media (image, document, audio, video...) in the message itself or in the replied one is saved to disk along with the note. With nothing, shows the tags with the count and description of each; -l lists all notes, with the ID, grouped by #tag (one message per tag). The -alert reminds you of a note at a date/time (once; the note stays): in your private chat or at the -to destinations.',
    ex: [
        '/notes #casa buy milk',
        '/notes #casa',
        '/notes -s /pão|leite/i',
        '/notes -v 76',
        '/notes #idei (finds #ideias)',
        '/notes -m #casa #lar',
        '/notes -d #casa Home stuff',
        '/notes -u 3 new text',
        '/notes -e #casa',
        '/notes -r #casa',
        '/notes #lembrete call João -alert amanhã 9h',
        '/notes -alert 3 +2h -to /Família/',
        '/notes -alert #casa 18h -to /Família/',
        '/notes -r 2'
    ],
    cmd_opts: [
        {
            opts: ['add', 'a'],
            values: ['#tag <text>'],
            desc: 'Adds a note: the #tag is required and comes first (the text goes up to the -alert, if any).',
            ex: ['/notes -a #casa buy milk'],
            cron: false
        },
        {
            opts: ['list', 'l'],
            values: ['[#tag...]'],
            desc: 'Lists the notes, each with its ID, grouped by #tag. With tags, only theirs (the tag can be partial: #idei finds #ideias).',
            ex: ['/notes -l #casa', '/notes -l #idei']
        },
        {
            opts: ['compact', 'c'],
            values: ['[#tag...]'],
            desc: 'Lists one line per note (title, icons 🖼️ media, ⏰ alert and 🔗 link, and the time), grouped by day. Also works as /notes #tag -c or -l -c.',
            ex: ['/notes -c', '/notes #pt -c']
        },
        {
            opts: ['search', 's'],
            values: ['[#tag...] <text|/regex/flags>'],
            desc: 'Only the notes that match: text (case/accent-insensitive) or /regex/flags, like the -q of /show. Also matches the tag name.',
            ex: ['/notes -s /pão|leite/i', '/notes -s #casa milk'],
            cron: false
        },
        {
            opts: ['update', 'u'],
            values: ['<id> [#tag] <new text>'],
            desc: 'Replaces the note text (and the tag, if one is given).',
            ex: ['/notes -u 3 buy bread and milk'],
            cron: false
        },
        {
            opts: ['view', 'v'],
            values: ['<id...|#tag...>'],
            desc: 'Shows the note with its image (the text goes in the caption; without an image, just the text). Accepts several IDs or tags (the tag can be partial). With -to, sends to the destination; by email, the image is attached.',
            ex: ['/notes -v 76', '/notes -v 3 5', '/notes -v #idei', '/notes -v 76 -to /Família/'],
            cron: false
        },
        {
            opts: ['move', 'm'],
            values: ['#tag #newtag'],
            desc: 'Renames the tag in all notes (if the new one already exists, the two merge). The tag must be complete, and its description goes along.',
            ex: ['/notes -m #casa #lar'],
            cron: false
        },
        {
            opts: ['desc', 'd'],
            values: ['#tag [<description>|-rm]'],
            desc: 'Tag description, shown in the list and in plain /notes. Without text, shows the current one; with -rm, deletes it. The tag can be partial.',
            ex: ['/notes -d #casa Home stuff', '/notes -d #casa', '/notes -d #casa -r'],
            cron: false
        },
        {
            opts: ['export', 'e'],
            values: ['[#tag...]'],
            desc: 'Sends the notes in a PDF, with the images and the text as caption (ZapBot_notes_YYYYMMDD_HHMM.pdf), or only those of the tags (ZapBot_notes_tag-casa_YYYYMMDD_HHMM.pdf). The tag can be partial, and its description (-desc) comes at the start of the document. With -to, the PDF goes to the destination.',
            ex: ['/notes -e', '/notes -e #casa', '/notes -e #casa -to /Família/'],
            cron: false
        },
        {
            opts: ['rm', 'r'],
            values: ['<id...|#tag...|all>'],
            desc: 'Removes the notes with those IDs (-rm 1 2 3 or -rm 1,2,3), of a tag (-rm #casa) or all (all). If any ID or tag does not exist, none is removed. The tag must be complete. Together with -alert, removes only the alert, keeping the notes.',
            ex: [
                '/notes -r 2',
                '/notes -r 1 2 3',
                '/notes -r #casa',
                '/notes -r all',
                '/notes -alert -r 3'
            ],
            cron: false
        },
        {
            opts: ['alert'],
            values: ['<when>'],
            desc: 'Reminds you of the note at a date/time. With -add: /notes -a text -alert amanhã 9h. With ID: /notes -alert 3 +2h. With #tag: reminds of all the tag\'s notes (/notes -alert #casa 18h -to /Família/). Alone, lists the notes with an alert (with #tag, only the tag\'s); with -rm <id...|#tag...|all>, removes the alert. The when accepts +2h, 30m, 18h, amanhã 9h, sexta 18:30, 25/12 10h.',
            cron: false
        },
        {
            opts: ['to'],
            values: ['<destination>'],
            desc: 'Sends to the destination instead of replying here (list, -view and -export), or notifies it (-alert). Repeat for several.',
            ex: [
                '/notes -e #casa -to /Família/',
                '-to /Jorge Pereira/',
                '-to @Fulano',
                '-to /Grupo L200/ -to /Família/',
                '-to +5521999999999',
                '-to email'
            ]
        }
    ],
    role: ADMIN // the owner's personal notes
};
