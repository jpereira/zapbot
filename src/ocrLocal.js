/*
 * Local OCR (Tesseract, on the CPU): /ocr without -gpt. The languages come from the ocr.language
 * setting (the image has by and eng). The photo goes through sharp to PNG first: Tesseract
 * does not read every format WhatsApp sends (webp, for instance).
 */

const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

const { BIN_TESSERACT } = require('./constants');
const { getSetting } = require('./settings');
const { captureOutput } = require('./util/processes');

const OCR_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * @param {{ data: string }} image  the photo, in base64
 * @returns {Promise<string>} the text (empty when there is none)
 */
async function readLocal(image) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zapbot-ocr-'));
    const file = path.join(dir, 'image.png');
    try {
        fs.writeFileSync(file, await sharp(Buffer.from(image.data, 'base64')).png().toBuffer());
        const output = await captureOutput(BIN_TESSERACT, [file, 'stdout', '-l', getSetting('ocr.language')], OCR_TIMEOUT_MS);
        return output.trim();
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

module.exports = { readLocal };
