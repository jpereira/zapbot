/*
 * /ocr: The text in an image (OCR)
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/ocr',
    usage: '/ocr [-status|-s]',
    aliases: [],
    summary: 'The text in an image (OCR)',
    help: 'Reads the text in a photo with ChatGPT (vision) and replies with it. Replying to the photo, or sending the photo with /ocr as the caption. Requires OPENAI_API_KEY in config/.env or the openai.api.key setting.',
    ex: ['/ocr'],
    cmd_opts: [
        {
            opts: ['status', 's'],
            values: [],
            desc: 'Adds the call usage to the reply footer: bytes sent (TX) and received (RX), tokens spent, estimated cost, and balance. To keep it always on: /set openai.status true.',
            ex: ['/ocr -s'],
            cron: false
        }
    ],
    delegavel: true,
    role: ADMIN // Gasta a chave da OpenAI: delegável, como o /gpt
};
