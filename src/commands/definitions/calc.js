/*
 * /calc: Calculates and sums the numbers of a list
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/calc',
    pipeIn: 'text', // reads the text of a pipe (/a | /b) as its replied message
    usage: '/calc [OPTION]... <calculation>  or  /calc [OPTION]... (replying to a list of numbers)',
    aliases: ['/math', '/sum'],
    summary: 'Calculates and sums the numbers of a list',
    help: 'Does a calculation (+ - * / % x ^ and parentheses, like 100/2*6 or ((1+7)*8)/2) or sums the numbers of a list, from the text or the message you reply to. In a list it takes the first number of each line ("437 gym" and "351 running" give 788); a number with a sign stuck to it counts as positive or negative (-50, +30, R$ -20); currencies R$, US$, USD$, EUR$, $, €, £, USD and EUR are recognized, and a list with the same currency on every line shows it in the result. It understands 1.234,56 and 1,234.56, ignores dates, times and phone numbers, and shows the total, a tape with all the numbers it found (sign, amount and name, aligned) and the average (or, with positives and negatives, the balance, what came in, what went out and the biggest expense). A + or - at the start of a line counts as the sign of its number.',
    typing: false, // replies right away: without the "typing..."
    ex: [
        '/calc 100/2*6',
        '/calc ((1+7)*8)/2',
        '/calc 237,90/4',
        '/calc (replying to "437 gym / 351 running")',
        '/calc -group (replying to the list)',
        '/calc -short (replying to the list)',
        '/calc -col -1 (replying to "Day 3 - 437")',
        '/calc -all (replying to "trip 45 back 38")'
    ],
    cmd_opts: [
        {
            opts: ['all', 'a'],
            values: [],
            desc: 'Sums all the numbers of each line, not only the first.'
        },
        {
            opts: ['col', 'c'],
            values: ['<n>'],
            desc: 'Uses the number n of each line (1 is the first, -1 the last).',
            ex: ['/calc -col -1', '/calc -col 2']
        },
        {
            opts: ['short', 's'],
            values: [],
            desc: 'Only the total (and the check), without the tape of the numbers found.'
        },
        {
            opts: ['group', 'g'],
            values: [],
            desc: 'Subtotal by name: the lines with the same text (gym, running...) are added together.'
        },
        {
            argv: ['<calculation>'],
            desc: 'A calculation, or the text of a list; the replied message is added to it.',
            ex: ['/calc 1.234,50 - 200', '/calc (2+3)*4']
        }
    ],
    role: USER
};
