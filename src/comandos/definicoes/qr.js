/*
 * /qr: Makes the QR Code of a text
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/qr',
    usage: '/qr [-decode|-d] [<text>]',
    aliases: [],
    summary: 'Makes the QR Code of a text',
    help: 'Makes the QR Code (PNG image) of the text, up to 1000 characters. With no text, uses the replied message\'s. With -decode, it does the opposite: reads the QR Code in a photo (replied, or sent with /qr -d as the caption) and replies with its text (same as /decodeqr).',
    ex: ['/qr https://example.com', '/qr -d'],
    cmd_opts: [
        {
            opts: ['decode', 'd'],
            values: [],
            desc: 'Reads the QR Code in a photo instead of making one (same as /decodeqr).',
            ex: ['/qr -d']
        },
        {
            argv: ['[<text>]'],
            desc: 'The text of the QR Code (up to 1000 characters; without it, the replied message\'s).'
        }
    ],
    role: USER // Gera (qrcode) ou lê (jsqr) o QR Code
};
