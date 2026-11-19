/*
 * /ocr: The text in an image (OCR)
 */

const { ADMIN } = require('../../roles').ROLES;

const { OPTION_QUIET_TIP } = require('./_options');

module.exports = {
    cmd: '/ocr',
    usage: '/ocr [-gpt|-g] [-local|-l] [-status|-s]',
    aliases: [],
    summary: 'The text in an image (OCR), local or by ChatGPT (-gpt)',
    help: 'Reads the text in a photo and replies with it: by default locally with Tesseract (no key, languages in ocr.language), or with -gpt (-g) by ChatGPT (vision), which needs the OpenAI key. Replying to the photo, or sending the photo with /ocr as the caption. -gpt requires OPENAI_API_KEY in config/.env or the gpt.api.key setting.',
    ex: ['/ocr'],
    cmd_opts: [
        OPTION_QUIET_TIP,
        {
            opts: ['gpt', 'g'],
            values: [],
            desc: 'Reads with ChatGPT (OpenAI vision, spends your account) instead of the local Tesseract. Without -gpt or -local, the ocr.engine setting decides.',
            ex: ['/ocr -gpt']
        },
        {
            opts: ['local', 'l'],
            values: [],
            desc: 'Reads with the local Tesseract (no key, runs on the server CPU), even when ocr.engine is gpt.',
            ex: ['/ocr -local']
        },
        {
            opts: ['status', 's'],
            values: [],
            desc: 'With -gpt: adds the call usage to the reply footer: bytes sent (TX) and received (RX), tokens spent, estimated cost, and balance. To keep it always on: /set gpt.status true.',
            ex: ['/ocr -s'],
            cron: false
        }
    ],
    delegavel: true,
    role: ADMIN // Spends the OpenAI key: delegable, like /gpt
};
