/*
 * /carbon: The code in an editor-window image
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/carbon',
    usage: '/carbon [-theme|-t <dark|light>] <code>',
    aliases: [],
    summary: 'The code in an editor-window image',
    help: 'Draws the code in an image that looks like an editor window (syntax colors for comments, strings, numbers and keywords), made on the bot itself. Several lines work, and the Markdown fence (```) is dropped. With no code, uses the replied message\'s. Up to 60 lines of 120 columns.',
    ex: ['/carbon console.log("hi")', '/carbon -t light print(42)'],
    cmd_opts: [
        {
            opts: ['theme', 't'],
            values: ['<dark|light>'],
            desc: 'The color theme: dark (default) or light. Only counts at the start of the command (the rest is code).',
            ex: ['/carbon -t light print(42)']
        }
    ],
    argumentosLivres: true,
    role: USER // Os trechos de código viram imagem no próprio bot (SVG + sharp)
};
