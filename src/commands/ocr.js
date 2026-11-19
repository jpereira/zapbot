/*
 * /ocr command: the text of an image, read by Tesseract (local, default) or ChatGPT (vision, -gpt).
 * /ocr, replying to a photo      → the text of the photo
 * photo with the caption "/ocr"       → its text
 */

const { completeNotice } = require('../client');
const { isPhoto, messageImage } = require('./openaiCommon');
const { CHATGPT, engineProcessing, pickEngine, withEngineTip } = require('../engines');
const { t } = require('../i18n');
const { printError } = require('../log');
const { readLocal } = require('../ocrLocal');
const { WITHOUT_KEY, keyOpenAi, errorOpenAi, measureConsumption, askOnChat, consumptionFooter } = require('../openaiChat');

// What the model replies when the image has no text (so the bot swaps it for the language's message)
const WITHOUT_TEXT = 'NO_TEXT';

async function extract({ msg, quotedMsg, opts }) {
    let engine;
    try {
        engine = pickEngine(opts, 'ocr.engine');
    } catch (err) {
        await msg.reply(err.message);
        return;
    }
    const isGpt = engine === 'gpt';

    if (isGpt && !keyOpenAi()) {
        await msg.reply(WITHOUT_KEY('/ocr'));
        return;
    }

    const origin = [quotedMsg, msg].find(isPhoto);
    if (!origin) {
        await msg.reply(t('ocr.usage'));
        return;
    }

    const photo = await messageImage(origin, '/ocr');
    if (photo.erro) {
        await msg.reply(photo.erro);
        return;
    }

    const name = isGpt ? CHATGPT : 'Tesseract';
    const notice = await msg.reply(engineProcessing('ocr', name), null, { linkPreview: false });
    try {
        const textAlt = isGpt
            ? await askOnChat({ cmd: '/ocr', sistema: t('ocr.instructions', { vazio: WITHOUT_TEXT }), texto: t('ocr.prompt'), imagem: photo.imagem })
            : await readLocal(photo.imagem);
        // The 📝 in front also guarantees the reply never starts with "/" (see markSentByBot)
        const reply = !textAlt.trim() || textAlt.trim() === WITHOUT_TEXT ? t('ocr.noText') : `📝 ${textAlt.trim()}`;
        await completeNotice(msg, notice, withEngineTip(reply, 'ocr', name) + (isGpt ? await consumptionFooter() : ''));
    } catch (err) {
        if (isGpt) {
            await completeNotice(msg, notice, errorOpenAi(err, '/ocr'));
            return;
        }
        printError('/ocr:', err.message);
        await completeNotice(msg, notice, t('ocr.localFailed', { error: err.message }));
    }
}

const cmdOcr = (ctx) => measureConsumption(ctx.opts?.given.has('status'), () => extract(ctx));

module.exports = { cmdOcr };
