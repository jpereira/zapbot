/*
 * /bot: Liga/desliga o bot e diz quem usa os comandos
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/bot',
    usage: '/bot [-on|-off]  or  /bot +a|-a|+u|-u [+cmd|-cmd <commands>] [person...]  or  /bot -status|-info|-test|-reset  or  /bot -passwd|-login <password>',
    aliases: [],
    summary: 'Turns the bot on/off and sets who uses the commands',
    help: 'Turns the bot on/off and sets who uses the commands: you and the admins use everything; users, the common commands. Without an option, shows the status (same as -status). -info shows the versions of what it uses.',
    cmd_opts: [
        { opts: ['on'], values: [], desc: 'Turns the bot on.', cron: false },
        {
            opts: ['off'],
            values: [],
            desc: 'Turns off all bot commands, except /bot. Admins and users stay on the lists.',
            cron: false
        },
        {
            opts: ['a'],
            sinais: ['+', '-'],
            values: ['[person...]'],
            desc: 'Adds (+a) and removes (-a) admins, who use all commands: /name/, @mention, or +number (not a group). Without a parameter, the person of the private chat where the command was typed. Owner only.',
            ex: ['/bot +a /Jorge Pereira/', '/bot -a'],
            cron: false
        },
        {
            opts: ['u'],
            sinais: ['+', '-'],
            values: ['[person|group...]'],
            desc: 'Adds (+u) and removes (-u) users for common commands: people, in any chat, and groups, anyone inside them. Typed in a group, the +u of a person applies only in that group (in private, they cannot use it). With nobody, the current chat: the group or the person of the private chat. Owner only.',
            ex: ['/bot +u /Maria Lucia/ /Grupo Familia/', '/bot -u'],
            cron: false
        },
        {
            opts: ['cmd'],
            sinais: ['+', '-'],
            values: ['<commands>'],
            desc: 'The commands of a user (comma between them). With +u, it sets: +u +cmd /a,/b, only those; +u -cmd /a, all but that one. Alone, +cmd allows and -cmd removes (whoever is not a user gets in with only those); +cmd all allows all again. In the list, below the person: → Apenas: ... /help and /whois always go through. Owner only.',
            ex: [
                '/bot +cmd /rates,/crypto +u /Sofia Izabel/',
                '/bot -cmd /meme /Fulano/',
                '/bot +u +cmd /rates'
            ],
            cron: false
        },
        {
            opts: ['list-users', 'lu'],
            values: ['[all]'],
            desc: 'The users of this chat: in a group, who takes part in it (and the group); in someone\'s private chat, only the person; in your private chat, everyone. The all option shows everything anywhere (in a group, also people who are not from there, with the phone hidden: be careful not to expose anyone). Together with +a/+u, the reply brings everyone. Accepts -mask.',
            ex: ['/bot -list-users', '/bot -lu all'],
            cron: false
        },
        {
            opts: ['reset', 'r'],
            values: ['[force]'],
            desc: 'Removes all users (and their limits), from any chat and group: only you and the extra admins remain. The admins, the on/off state, and the daily -status delivery do not change. With force, everything goes back to default: also removes the extra admins and turns the bot on. Both ask first: reply sim within 10 s. Accepts -mask; the other options are refused. Owner only.',
            ex: ['/bot -r', '/bot -r force'],
            cron: false
        },
        {
            opts: ['status', 's'],
            values: ['[<time>|off]'],
            desc: 'The status (same as /bot without an option): the report of the last 24 h (uptime, cache, /watch, deleted, edited, deleted statuses, /mute, and last backup), the users, and the daily delivery. With a time (Brasília: 06h, 6h30, 06:00, or às 18h), sends every day at that time, to your private chat or the -to destinations. With -to and no time, sends now. With off, turns off the daily delivery. Accepts -to and -mask; the other options are refused.',
            ex: ['/bot -s', '/bot -s 06h', '/bot -s 06h -to you@example.com', '/bot -s off'],
            cron: false
        },
        {
            opts: ['to'],
            values: ['<destination>'],
            desc: 'Where the report goes, instead of your private chat (with -status). A person, a group, or an email (email = the QRCODE_EMAIL_SMTP_TO); repeat for several. At the end of the report, the daily delivery shows the destinations: 👤 person, 👥 group, or 📧 email.',
            ex: ['-to /Jorge Pereira/', '-to /Grupo Familia/ -to email'],
            cron: false
        },
        {
            opts: ['info', 'i'],
            values: [],
            desc: 'Versions of the bot and of what it uses (Node.js, whatsapp-web.js, WhatsApp Web, SQLite, Chromium, yt-dlp, ffmpeg), with a new-version notice, and the system (host, CPU, memory, and how long they have been up). Accepts -mask; the other options are refused.'
        },
        {
            opts: ['test', 't'],
            values: [],
            desc: 'Tests everything: cache write/read, disk space, SQLite database, WhatsApp connection, DNS and internet, speed (downloads 8 MB and uploads 1 MB at speed.cloudflare.com), SMTP login, IMAP login (if configured), and the external programs (Chromium, yt-dlp, ffmpeg). Each item comes out with ✅ or ❌ (➖ = not configured). Alone: the other options are refused.',
            cron: false
        },
        {
            opts: ['passwd'],
            values: ['<password|off>'],
            desc: 'Owner only: sets the password for /bot -login (min. 8 characters; only the scrypt hash is kept in the database, setting bot.login). With off, turns off the login.',
            ex: ['/bot -passwd mypassword'],
            cron: false
        },
        {
            opts: ['login'],
            values: ['<password>'],
            desc: 'For outsiders, in private only: with the right password, becomes admin (goes into bot.admins) and the owner is notified by WhatsApp and email. Get it wrong 5 times, blocked for 15 min. The password is deleted from the message database.',
            ex: ['/bot -login mypassword'],
            cron: false
        },
        {
            opts: ['flush-email', 'fe'],
            values: ['[true]'],
            desc: 'Connects to the email IMAP (QRCODE_EMAIL_IMAP_HOST, with the SMTP login) and shows how many messages there are in Sent and Trash. With true, deletes all those in Sent and Trash and finishes by showing how many were cleaned (⏳ while cleaning). Only the owner deletes. Alone: the other options are refused.',
            ex: ['/bot -flush-email', '/bot -flush-email true'],
            cron: 'dono'
        },
        {
            opts: ['mask', 'm'],
            values: [],
            desc: 'Obfuscates phone numbers in the output (e.g. +55219****44). Saved data and destinations use the full numbers.',
            ex: ['/bot -mask'],
            cron: false
        }
    ],
    mask: true,
    role: ADMIN, // permissões, senha e liga/desliga
    cron: 'dono'
};
