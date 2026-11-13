/*
 * /qr and /decodeqr commands: generate and read QR Codes.
 * /qr <text>            → the QR Code of the text (without text: the replied message's)
 * /qr -decode            → reads the QR Code of an image (replied, or the photo with the caption)
 * /decodeqr              → the same as /qr -decode
 * /decodeqr -encode <t>  → the same as /qr <text>
 */

const jsQR = require('jsqr');
const qrcode = require('qrcode');
const sharp = require('sharp');
const { MessageMedia } = require('whatsapp-web.js');

const { isPhoto } = require('./openaiCommon');
const { t } = require('../i18n');
const { printError } = require('../log');

const MAX_CHARACTERS = 1000;
const SIDE_MAX = 1600; // a QR Code photo does not need more

// The command text without the mode option (preserves the line breaks of what was typed)
const withoutMode = (args) => args.replace(/(^|\s)-(?:decode|d|encode|e)(?=\s|$)/g, ' ').trim();

async function generate({ msg, args, quotedMsg }) {
    const textAlt = withoutMode(args) || String(quotedMsg?.body ?? '').trim();
    if (!textAlt) {
        await msg.reply(t('qr.usage'));
        return;
    }
    if (textAlt.length > MAX_CHARACTERS) {
        await msg.reply(t('qr.tooLong', { n: textAlt.length, max: MAX_CHARACTERS }));
        return;
    }

    const png = await qrcode.toBuffer(textAlt, { type: 'png', width: 512, margin: 2 });
    await msg.reply(new MessageMedia('image/png', png.toString('base64'), 'qrcode.png'));
}

/**
 * An image's QR Code text (null: found none).
 * @param {Buffer} imagem
 */
async function readQr(image) {
    const { data, info } = await sharp(image)
        .resize({ width: SIDE_MAX, height: SIDE_MAX, fit: 'inside', withoutEnlargement: true })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    return jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data ?? null;
}

async function read({ msg, quotedMsg }) {
    const origin = [quotedMsg, msg].find(isPhoto);
    if (!origin) {
        await msg.reply(t('qr.decodeUsage'));
        return;
    }

    const mediaAlt = await origin.downloadMedia().catch(() => null);
    if (!mediaAlt?.data) {
        await msg.reply(t('qr.download'));
        return;
    }

    try {
        const textAlt = await readQr(Buffer.from(mediaAlt.data, 'base64'));
        // The 📱 in front also guarantees the reply never starts with "/" (see markSentByBot)
        await msg.reply(textAlt ? `📱 ${textAlt}` : t('qr.notFound'));
    } catch (err) {
        printError('/qr: não consegui ler a imagem:', err.message);
        await msg.reply(t('qr.notFound'));
    }
}

const cmdQr = (ctx) => (ctx.opts?.given.has('decode') ? read(ctx) : generate(ctx));
const cmdDecodeqr = (ctx) => (ctx.opts?.given.has('encode') ? generate(ctx) : read(ctx));

module.exports = { cmdDecodeqr, cmdQr, readQr };
