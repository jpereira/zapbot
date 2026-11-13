/*
 * /cron: Agenda um texto ou comando para uma hora marcada
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/cron',
    usage: '/cron <when> [OPTION] <text>  or  /cron -edit <n> [when] [text]',
    aliases: [],
    summary: 'Schedules a text or command for a set time',
    help: 'At the set time, sends the text as if you typed it (in the current chat or the -to one) or, with -lembrete, a ⏰ Lembrete in this chat or in your private chat (-pv). In the text, {/command args} runs at send time and the reply takes its place (query commands only: /crypto, /rates, /weather...). A typed \\n becomes a line break.',
    ex: [
        '/cron 09h -r diario -to /Família/ Good morning! {/crypto BTC}',
        '/cron 8h -r diario Orca {/defi orca}\\n Prjx {/defi prjx}'
    ],
    cmd_opts: [
        {
            opts: ['edit'],
            values: ['<n>'],
            desc: 'Edits item N of the list: whatever comes after changes the time, the text and/or the -repetir (-r nao removes the repetition).',
            ex: ['/cron -edit 2 18h', '/cron -edit 2 new text']
        },
        {
            opts: ['lembrete', 'lem'],
            values: [],
            desc: 'Reminder mode: ⏰ Lembrete replying to the command message.'
        },
        {
            opts: ['list', 'l'],
            values: [],
            desc: 'Lists the reminders and scheduled messages, with the full text (also without arguments).'
        },
        {
            opts: ['pause'],
            values: ['<n...|all>'],
            desc: 'Pauses item N, several (-pause 1 3 or 1,3) or all: it stays in the list, but is not sent until -resume. If any number does not exist, none is paused.'
        },
        {
            opts: ['pv'],
            values: [],
            desc: 'In reminder mode: reminds you in your private chat instead of the current chat.'
        },
        {
            opts: ['repetir', 'r'],
            values: ['<diario|semanal|mensal>'],
            desc: 'Repeats at the same time: every day, every week or every month.'
        },
        {
            opts: ['resume'],
            values: ['<n...|all>'],
            desc: 'Resumes paused items (one, several or all). A repeating one that came due while paused skips to the next time; a one-off is sent right away.'
        },
        {
            opts: ['rm'],
            values: ['<n...|all>'],
            desc: 'Removes item N from the list, several at once (-rm 1 3 5 or -rm 1,3,5) or all. If any number does not exist, none is removed.'
        },
        {
            opts: ['test'],
            values: ['<n>'],
            desc: 'Builds item N now, running the {/command}s in the text, and shows here how it would go out (does not send to the destination nor change the time).'
        },
        {
            opts: ['to'],
            values: ['<destination>'],
            desc: 'In message mode: sends to a contact, a group or a number instead of the current chat (not email: the message goes out on WhatsApp). Repeat for several: a single item, sent to all of them; several matching the name: you pick from the list.',
            ex: [
                '-to /Jorge Pereira/',
                '-to @Fulano (mention)',
                '-to /Grupo L200/ -to /Família/',
                '-to +5521999999999'
            ]
        },
        {
            argv: ['<when>'],
            desc: '6h, 07h, 18:30 or às 18h (time: today or tomorrow), +2h, em 2h, 30m or 1h30m (from now), amanhã [9h], sexta [18h], 25/12 [10:00] or 25/12/2027 [10h]. Without a time: 9h.'
        }
    ],
    role: ADMIN // agenda comandos em nome do dono
};
