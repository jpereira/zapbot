/*
 * /decodeqr: Reads the QR Code in an image
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/decodeqr',
    usage: '/decodeqr [-encode|-e] [<text>]',
    aliases: [],
    summary: 'Reads the QR Code in an image',
    help: 'Reads the QR Code in a photo and replies with its text. Replying to the photo, or sending the photo with /decodeqr as the caption. With -encode, it does the opposite: makes the QR Code of the text (same as /qr).',
    ex: ['/decodeqr', '/decodeqr -e https://example.com'],
    cmd_opts: [
        {
            opts: ['encode', 'e'],
            values: [],
            desc: 'Makes the QR Code of the text instead of reading one (same as /qr).',
            ex: ['/decodeqr -e https://example.com']
        },
        {
            argv: ['[<text>]'],
            desc: 'With -encode, the text of the QR Code (up to 1000 characters; without it, the replied message\'s).'
        }
    ],
    role: USER // Lê (jsqr) ou gera (qrcode) o QR Code
};
