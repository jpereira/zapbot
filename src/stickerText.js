/*
 * /sticker -txt: animated sticker with a text that blinks swapping the colors of the
 * -fg (letter) and -bg (background). The frames come out as PNG through sharp (Pango: wrap
 * the lines and fits the font to the area) and ffmpeg joins into an animated WEBP, which the
 * WhatsApp accepts as a sticker without conversion.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const { BIN_FFMPEG, TMP_DIR } = require('./constants');
const { runCommand } = require('./util/processes');

const SIZE = 512;
const MARGIN = 40;           // the text stays in a 432x432 area, away from the edge
const MAX_CHARACTERS = 200;
const FRAMES_PER_SECOND = 2;   // blinks every half second

// "#fff", "FFFFFF" or "#ffffff" → "#FFFFFF"; invalid → null
function readColor(valueAlt) {
    const m = String(valueAlt ?? '').trim().replace(/^#/, '').match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return null;
    const hex = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1];
    return `#${hex.toUpperCase()}`;
}

// Pango reads markup (<b>, &...): the user's text goes escaped
const escape = (textAlt) => textAlt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The two frames: fg letter on the bg background, and the reverse.
 * @returns {Promise<Buffer[]>} PNGs 512x512
 */
async function textFrames(textAlt, { fg, bg }) {
    const frame = async (letter, background) => {
        const area = SIZE - 2 * MARGIN;
        const written = await sharp({
            text: {
                text: `<span foreground="${letter}">${escape(textAlt)}</span>`,
                font: 'sans bold',
                width: area,
                height: area,
                align: 'centre',
                wrap: 'word-char',
                rgba: true
            }
        }).png().toBuffer();

        return sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: background } })
            .composite([{ input: written, gravity: 'centre' }])
            .png()
            .toBuffer();
    };

    return [await frame(fg, bg), await frame(bg, fg)];
}

/**
 * The animated WEBP (base64) of the text, ready to go as a sticker.
 */
async function textSticker(textAlt, colors) {
    const folder = path.join(TMP_DIR, `sticker-${crypto.randomBytes(6).toString('hex')}`);
    fs.mkdirSync(folder, { recursive: true });

    try {
        const frames = await textFrames(textAlt, colors);
        frames.forEach((png, i) => fs.writeFileSync(path.join(folder, `quadro_${i}.png`), png));

        const outputAlt = path.join(folder, 'sticker.webp');
        await runCommand(BIN_FFMPEG, [
            '-y', '-loglevel', 'error',
            '-framerate', String(FRAMES_PER_SECOND),
            '-i', path.join(folder, 'quadro_%d.png'),
            '-c:v', 'libwebp', '-lossless', '0', '-q:v', '75',
            '-loop', '0', '-an',
            outputAlt
        ], 'ignore', 30_000);

        return fs.readFileSync(outputAlt).toString('base64');
    } finally {
        fs.rmSync(folder, { recursive: true, force: true });
    }
}

module.exports = {
    MAX_CHARACTERS,
    readColor,
    textFrames,
    textSticker
};
