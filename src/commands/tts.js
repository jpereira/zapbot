/*
 * /tts command: the text as voice (voice note), through OpenAI's voice API, like /gpt -voice.
 *   /tts <text>          → speech o text
 * /tts, replying     → speaks the replied message (audio is transcribed first); what was
 * typed becomes the speech style ("speak like a robot")
 */

const { talkText } = require('./gpt');
const { WITHOUT_KEY, keyOpenAi, measureConsumption } = require('../openaiChat');
const { withoutOption } = require('./openaiCommon');

async function cmdTts({ msg, args, opts, quotedMsg }) {
    if (!keyOpenAi()) {
        await msg.reply(WITHOUT_KEY('/tts'));
        return;
    }
    await measureConsumption(opts?.given.has('status'), () => talkText(msg, withoutOption(args, 'status|s'), quotedMsg, '/tts'));
}

module.exports = { cmdTts };
