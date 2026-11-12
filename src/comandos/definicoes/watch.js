/*
 * /watch: Vigia mensagens recebidas com regras de texto ou regex
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/watch',
    usage: '/watch [text|/regex/flags] [-in <source>] [-to <destination>]...  or  /watch [-N] [-q <text|/regex/flags>]  or  /watch -s [N|rule] [-q <text|/regex/flags>] [-to <destination|off>]...  or  /watch -rm <N|rule>  or  /watch -flush [N|rule]  or  /watch -mask N  or  /watch -umask N',
    aliases: ['/vigiar'],
    summary: 'Watches incoming messages with text or regex rules',
    help: 'Watches incoming messages with text or regex rules. Location thumbnails are not text and are left out of the rules. A rule without -in applies everywhere; -in restricts it to a contact (sender), group or channel. With no parameters, lists rules and latest matches; -N sets the amount. @newsletter posts are identified with 📰 and the channel name. Anyone muted in /mute does not trigger an alert in your private chat (the -to destinations still receive it). The numbers after -s, -rm and -flush identify rules; in their place, the rule itself works, whole or a fragment. The number of matches comes from -N. With -mask N (🔒), the alerts and occurrences of rule N come out with obfuscated phone numbers; -umask N turns it off.',
    cmd_opts: [
        {
            opts: ['list', 'l'],
            values: [],
            desc: 'Lists only rules, sources, destinations and counts, without the match texts.',
            ex: ['/watch -l']
        },
        {
            opts: ['show', 's'],
            values: ['[N|rule]'],
            desc: 'Shows the full texts of the matches of rule N (or of the rule by its text); without N, of all rules. -N limits the number of matches up to watch.showMax.',
            ex: ['/watch -s 3 -10', '/watch -s /Jorge/']
        },
        {
            opts: ['query', 'q'],
            values: ['<text|/regex/flags>'],
            desc: 'Only the matches that contain the text (case- and accent-insensitive) or that match the /regex/flags. With -s or in the listing. With spaces, use quotes.',
            ex: ['/watch -s /Jorge/ -q "carro"', '/watch -s 3 -q /carr(o|ão)/i']
        },
        {
            opts: ['in'],
            values: ['<source>'],
            desc: 'Restricts a new rule to a contact, group or channel, by name, number, mention or @newsletter ID. Contact: their messages in any chat.',
            ex: ['/watch /chuva/i -in /Defesa Civil/']
        },
        {
            opts: ['rm', 'r'],
            values: ['<N|rule>'],
            desc: 'Removes rule N (or the rule by its text), its occurrences, source and destinations.',
            ex: ['/watch -rm 3', '/watch -rm /Jorge/']
        },
        {
            opts: ['flush', 'f'],
            values: ['[N|rule]'],
            desc: 'Clears the occurrences of rule N (or of the rule by its text); without N, clears all. Keeps rules, sources and destinations.',
            ex: ['/watch -flush 3', '/watch -flush /Jorge/']
        },
        {
            opts: ['to'],
            values: ['<destination|off>'],
            desc: 'Alert destination: contact, group, number, mention or email. When creating the rule or with -s N. Repeat for several; off goes back to your private chat.',
            ex: ['/watch /pix/i -to /Jorge/', '/watch -s 3 -to email']
        },
        {
            argv: ['-N'],
            desc: 'Number of recent matches in the listing or with -s, capped by watch.showMax (default 20).',
            ex: ['/watch -10', '/watch -s 3 -10']
        },
        {
            argv: ['[text|/regex/flags]'],
            desc: 'Creates a rule everywhere, or only at the -in source. Accepts spaces; keep the regex between slashes.',
            ex: ['/watch /Jorge Pereira/i', '/watch promoção']
        },
        {
            opts: ['mask', 'm'],
            values: ['[N]'],
            desc: 'Without N, obfuscates phone numbers with 10 to 15 consecutive digits in this run\'s output, keeping the first five and the last two (like +55219****44). With N, turns on the 🔒 of rule N: its alerts (private chat, -to and email) and occurrences come out obfuscated, until -umask. Saved data uses the full numbers.',
            ex: ['/watch -mask', '/watch -mask 3']
        },
        {
            opts: ['umask', 'u'],
            values: ['N'],
            desc: 'Turns off the 🔒 of rule N (phone numbers are shown again).',
            ex: ['/watch -umask 3']
        }
    ],
    mask: true,
    role: ADMIN // vigia as mensagens recebidas
};
