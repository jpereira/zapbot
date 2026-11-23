/*
 * /calendar: A text with an appointment becomes a calendar event
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/calendar',
    usage: '/calendar [-quiet|-q] [-gpt|-g] [-local|-l] [-status|-s] [-dest|-d] [<text>]',
    aliases: ['/cal'],
    summary: 'A text with an appointment becomes a calendar event',
    help: 'Reads an appointment from the text (or from the replied message) and sends an .ics file, which opens in Google Calendar, Apple Calendar and Outlook, with a link that adds it to Google Calendar. It finds the date, the time, the place and the professional by the labels of a confirmation ("Data:", "Horario:", "Endereco:", "Medico:"...) and by their shape (25/11/2026, 10:45h, "25 de novembro"). By default it reads locally; with -gpt (-g) ChatGPT reads the text and answers with the event in the Google Calendar JSON, which goes through the same checks. You can also just type the event in a sentence ("criar evento para dia 21 de maio as 22h, gere avisos", "dentista sexta as 15h", "meeting tomorrow at 9am"): the date can be a day ("dia 25"), "hoje", "amanha", a day of the week or a full date, the title is what is left after the verbs, the date and the time, and "gere avisos" or "me avise 30 minutos antes" set the reminders. The title starts with an emoji of the kind of event (calendar.addEmoji). Reminders: 1 day, 6 hours and 15 minutes before (and before the arrival time, when the text says "chegar 20 minutos antes").',
    ex: ['/calendar (replying to a confirmation message)', '/calendar Consulta dia 25/11/2026 as 10:45 no Centro Medico', '/calendar criar evento para dia 21 de maio as 22h, gere avisos', '/calendar dentista sexta as 15h, me avise 30 minutos antes', '/calendar -g (replying)', '/cal -q (replying)'],
    cmd_opts: [
        {
            opts: ['quiet', 'q'],
            values: [],
            desc: 'Only the .ics file: no notice, no summary, no link and no footer.',
            ex: ['/calendar -q (replying)']
        },
        {
            opts: ['gpt', 'g'],
            values: [],
            desc: 'ChatGPT reads the text and answers with the event in the Google Calendar JSON (spends your OpenAI account). Without -gpt or -local, the calendar.engine setting.',
            ex: ['/calendar -gpt (replying)']
        },
        {
            opts: ['local', 'l'],
            values: [],
            desc: 'Reads locally (no key, by the labels and the shape of the dates and times), even when calendar.engine is gpt.',
            ex: ['/calendar -local (replying)']
        },
        {
            // Off the help for now: still parsed, just not advertised
            opts: ['json', 'j'],
            values: [],
            desc: 'Also sends the event as the Google Calendar API wants it (Events resource, to save through events.insert).',
            ex: ['/calendar -json (replying)'],
            hidden: true
        },
        {
            opts: ['status', 's'],
            values: [],
            desc: 'With -gpt: adds the call usage to the reply footer: bytes sent (TX) and received (RX), tokens spent, estimated cost, and balance.',
            ex: ['/calendar -g -s (replying)'],
            cron: false
        },
        {
            opts: ['dest', 'd'],
            values: [],
            desc: 'Send feedback and the event to this chat. Replies go to your private chat by default.',
            ex: ['/calendar -d (replying)']
        },
        {
            argv: ['[<text>]'],
            desc: 'The text with the appointment. Typed text wins; without it, the replied message.'
        }
    ],
    // Local is free; with ChatGPT it spends the OpenAI key: only the admins, or a user with a limit for the command
    usageCounts: (opts) => require('../../engines').countsOnlyGpt('calendar.engine')(opts),
    role: USER
};
