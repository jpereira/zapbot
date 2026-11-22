/*
 * /ocr command: the text of an image, read by ChatGPT (vision).
 * /ocr, replying to a photo      → the text of the photo
 * photo with the caption "/ocr"       → its text
 */

const { completeNotice } = require('../client');
const { notifyProcessing, isPhoto, messageImage } = require('./openaiCommon');
const { t } = require('../i18n');
const { WITHOUT_KEY, keyOpenAi, errorOpenAi, measureConsumption, askOnChat, consumptionFooter } = require('../openaiChat');

// What the model replies when the image has no text (so the bot swaps it for the language's message)
const WITHOUT_TEXT = 'NO_TEXT';

async function extract({ msg, quotedMsg }) {
    if (!keyOpenAi()) {
        await msg.reply(WITHOUT_KEY('/ocr'));
        return;
    }

    const origin = [quotedMsg, msg].find(isPhoto);
    if (!origin) {
        await msg.reply(t('ocr.usage'));
        return;
    }

    const photo = await messageImage(origin, '/ocr');
    if (photo.error) {
        await msg.reply(photo.error);
        return;
    }

    const notice = await notifyProcessing(msg, '/ocr');
    try {
        const textAlt = await askOnChat({
            cmd: '/ocr', system: t('ocr.instructions', { empty: WITHOUT_TEXT }), text: t('ocr.prompt'), image: photo.image
        });
        // The 📝 in front also guarantees the reply never starts with "/" (see markSentByBot)
        const reply = textAlt.trim() === WITHOUT_TEXT ? t('ocr.noText') : `📝 ${textAlt}`;
        await completeNotice(msg, notice, `${reply}${await consumptionFooter()}`);
    } catch (err) {
        await completeNotice(msg, notice, errorOpenAi(err, '/ocr'));
    }
}

const cmdOcr = (ctx) => measureConsumption(ctx.opts?.given.has('status'), () => extract(ctx));

module.exports = { cmdOcr };
