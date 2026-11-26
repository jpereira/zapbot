/*
 * /qr: Makes the QR Code of a text
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/qr',
    pipeIn: true, // reads the text or the media of a pipe (/a | /b) as its replied message
    usage: '/qr [-decode|-d] [<text>]',
    aliases: [],
    summary: 'Makes the QR Code of a text',
    help: 'Makes the QR Code (PNG image) of the text, up to 1000 characters. With no text, uses the replied message\'s. Replying to a photo with /qr (or sending a photo with /qr as the caption) does the opposite: it reads the QR Code and replies with its text, the same as -decode. Typed text always makes a QR Code.',
    ex: ['/qr https://example.com', '/qr -d'],
    cmd_opts: [
        {
            opts: ['decode', 'd'],
            values: [],
            desc: 'Reads the QR Code in a photo instead of making one (automatic when you reply to a photo with no text).',
            ex: ['/qr -d']
        },
        {
            argv: ['[<text>]'],
            desc: 'The text of the QR Code (up to 1000 characters; without it, the replied message\'s).'
        }
    ],
    role: USER // Generates (qrcode) or reads (jsqr) the QR Code
};
