/*
 * /notes: Notes saved in the database
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/notes',
    usage: '/notes #tag <text>  or  /notes [-list|-l] [#tag...] [-to <destination>]...  or  /notes [-view|-v] [-quiet|-q] <n...> #tag  or  /notes -search|-view|-update|-export|-move|-desc|-rm|-alert|-lock <...>',
    summary: 'Notes, with password-protected (encrypted) tags',
    help: 'Notes saved in the database. To add one, the syntax is /notes #tag <text>: without the #tag it errors, and just /notes #tag lists the tag\'s notes. Replying to a message, its text becomes the note, with ↩️ (/notes #reminder); with text typed along (/notes #reminder Remember this!), the typed text comes first and the replied message follows it, with ↩️ and its media; media (image, document, audio, video...) in the message itself or in the replied one is saved to disk along with the note. With nothing, shows the tags with the count and description of each; -l lists all notes, with the ID, grouped by #tag (one message per tag). The -alert reminds you of a note at a date/time (once; the note stays): in your private chat or at the -to destinations. PRIVACY: /notes -lock #tag protects a tag with a password (the text and the files are encrypted; the password is never stored); /notes -v -lock #tag asks it and shows; -lock #tag -now locks. A protected tag only unlocks and opens in your own private chat, locks again by itself after notes.lockMinutes, and is never sent with -to.',
    ex: [
        '/notes #home buy milk',
        '/notes #home',
        '/notes -s /bread|milk/i',
        '/notes -v 76',
        '/notes #idea (finds #ideas)',
        '/notes -m #home #house',
        '/notes -d #home Home stuff',
        '/notes -u 3 new text',
        '/notes -e #home',
        '/notes -r #home -yes',
        '/notes #reminder call John -alert tomorrow 9h',
        '/notes -alert 3 +2h -to /Family/',
        '/notes -alert #home 18h -to /Family/',
        '/notes -r 2',
        '/notes -lock #stash (protects it, or unlocks)',
        '/notes -v -lock #stash',
        '/notes -lock #stash -now'
    ],
    cmd_opts: [
        {
            opts: ['add', 'a'],
            values: ['#tag <text>'],
            desc: 'Adds a note: the #tag is required and comes first (the text goes up to the -alert, if any).',
            ex: ['/notes -a #home buy milk'],
            cron: false
        },
        {
            opts: ['list', 'l'],
            values: ['[#tag...]'],
            desc: 'Lists the notes, each with its ID, grouped by #tag. With tags, only theirs (the tag can be partial: #idea finds #ideas).',
            ex: ['/notes -l #home', '/notes -l #idea']
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
            ex: ['/notes -s /bread|milk/i', '/notes -s #home milk'],
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
            values: ['<id...|#tag...|n... #tag>'],
            desc: 'Shows the note with its image (the text goes in the caption; without an image, just the text). Accepts several IDs or tags (the tag can be partial); with one #tag, the numbers are the positions in its list (-v 1,4 #idea), and the header shows the position (2/5). With -to, sends to the destination; by email, the image is attached.',
            ex: ['/notes -v 76', '/notes -v #idea', '/notes -v 1 4 #idea', '/notes -v 1,2,5 #idea', '/notes -v 76 -to /Family/'],
            cron: false
        },
        {
            opts: ['quiet', 'q'],
            values: [],
            desc: 'Only the text (and the media), without the header, the date or the tips: /notes -q 1 #idea, /notes -v -q #idea.',
            ex: ['/notes -q 1,3 #idea', '/notes -v -q #idea'],
            cron: false
        },
        {
            opts: ['move', 'm'],
            values: ['#tag #newtag'],
            desc: 'Renames the tag in all notes (if the new one already exists, the two merge). The tag must be complete, and its description goes along.',
            ex: ['/notes -m #home #house'],
            cron: false
        },
        {
            opts: ['desc', 'd'],
            values: ['#tag [<description>|-rm]'],
            desc: 'Tag description, shown in the list and in plain /notes. Without text, shows the current one; with -rm, deletes it. The tag can be partial.',
            ex: ['/notes -d #home Home stuff', '/notes -d #home', '/notes -d #home -r'],
            cron: false
        },
        {
            opts: ['export', 'e'],
            values: ['[#tag...]'],
            desc: 'Sends the notes in a PDF, with the images and the text as caption (ZapBot_notes_YYYYMMDD_HHMM.pdf), or only those of the tags (ZapBot_notes_tag-casa_YYYYMMDD_HHMM.pdf). The tag can be partial, and its description (-desc) comes at the start of the document. With -to, the PDF goes to the destination.',
            ex: ['/notes -e', '/notes -e #home', '/notes -e #home -to /Family/'],
            cron: false
        },
        {
            opts: ['lock', 'lo'],
            values: ['[password] #tag'],
            desc: 'Protects a tag with a password (text and files encrypted) or unlocks it: the bot asks for the password and deletes the message you typed. It locks by itself after notes.lockMinutes without use. Beside a viewing option (-v, -e, -l, -s) it asks the password first and then shows: /notes -v -lock #foo. The password can come in the command (/notes -v -lock <password> #foo): the message is deleted, hidden in the logs and in the history, but it travels in a normal command: the question is safer. Protected notes only unlock and open in your own private chat (in a group or with -to they stay locked).',
            ex: ['/notes -lock #foo', '/notes -v -lock #foo', '/notes -v -lock <password> #foo'],
            cron: false
        },
        {
            opts: ['now', 'n', 'no'],
            values: [],
            desc: 'Locks the tag right now. Alone or with -lock, in any order: /notes -n #foo, /notes -lock #foo -now, /notes -n -lock #foo.',
            ex: ['/notes -lock #foo -now', '/notes -n #foo'],
            cron: false
        },
        {
            opts: ['clean'],
            values: [],
            desc: 'With -lock #tag: deletes from the history the old commands you typed for that tag (with -yes; without it, only counts).',
            ex: ['/notes -lock #foo -clean -yes'],
            cron: false
        },
        {
            opts: ['rm', 'r'],
            values: ['<id...|#tag...|all>'],
            desc: 'Removes the notes with those IDs (-rm 1 2 3 or -rm 1,2,3), of a tag (-rm #home) or all (all). With a #tag, the numbers are the positions in that tag\'s list (-rm #home 1 is the 1st of #home), not IDs. A whole tag or all asks for -yes. If any ID, position or tag does not exist, none is removed. The tag must be complete. Together with -alert, removes only the alert, keeping the notes.',
            ex: [
                '/notes -r 2',
                '/notes -r 1 2 3',
                '/notes -r #home 1 3',
                '/notes -r #home -yes',
                '/notes -r all -yes',
                '/notes -alert -r 3'
            ],
            cron: false
        },
        {
            opts: ['yes', 'y'],
            values: [],
            desc: 'With -rm: confirms removing a whole tag or all the notes (without it, the bot only says how many would go).',
            ex: ['/notes -rm #home -yes'],
            cron: false
        },
        {
            opts: ['alert'],
            values: ['<when>'],
            desc: 'Reminds you of the note at a date/time. With -add: /notes -a text -alert tomorrow 9h. With ID: /notes -alert 3 +2h. With #tag: reminds of all the tag\'s notes (/notes -alert #home 18h -to /Family/). Alone, shows each note with an alert in its own message (1/N), with when and where (with #tag, only the tag\'s); with -rm <id...|#tag...|all>, removes the alert. The when accepts +2h, 30m, 18h, tomorrow 9h, sexta 18:30, 25/12 10h.',
            cron: false
        },
        {
            opts: ['to'],
            values: ['<destination>'],
            desc: 'Sends to the destination instead of replying here (list, -view and -export), or notifies it (-alert). Repeat for several.',
            ex: [
                '/notes -e #home -to /Family/',
                '-to /Jorge Pereira/',
                '-to @Fulano',
                '-to /L200 Group/ -to /Family/',
                '-to +5521999999999',
                '-to email'
            ]
        }
    ],
    role: ADMIN // the owner's personal notes
};
