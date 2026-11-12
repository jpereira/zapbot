/*
 * /ascii: The text in big ASCII letters
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/ascii',
    usage: '/ascii [-width|-w <columns>] [-char|-c <character>] <text>',
    aliases: [],
    summary: 'The text in big ASCII letters',
    help: 'The text in big ASCII letters, in a monospaced block that fits the phone screen (wraps into several lines of letters). Accepts letters (no accents), numbers and ! ? . , : - + _ /, up to 40 characters. With no text, uses the replied message\'s.',
    ex: ['/ascii Jorge!', '/ascii -w 20 Happy birthday', '/ascii -c @ Hi'],
    cmd_opts: [
        {
            opts: ['width', 'w'],
            values: ['<columns>'],
            desc: 'Columns per line of letters, from 10 to 60 (default 30, what fits the phone screen).',
            ex: ['/ascii -w 20 Happy birthday'],
            cron: false
        },
        {
            opts: ['char', 'c'],
            values: ['<character>'],
            desc: 'The character used to draw the letters (default: setting ascii.defaultChar, #).',
            ex: ['/ascii -c @ Hi'],
            cron: false
        }
    ],
    digitando: false, // responde na hora: sem o "digitando..."
    role: USER,
    cron: true
};
