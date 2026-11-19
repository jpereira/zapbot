/*
 * /tts command: the text as voice (voice note), with the local Piper voice or, with -gpt, through
 * OpenAI's voice API (like /gpt -voice).
 *   /tts <text>           → speaks the text
 * /tts, replying     → speaks the replied message (audio is transcribed first); what was
 * typed becomes the speech style ("speak like a robot", only with -gpt)
 */

const { talkText } = require('./gpt');
const { pickEngine } = require('../engines');
const { WITHOUT_KEY, keyOpenAi, measureConsumption } = require('../openaiChat');
const { withoutOption } = require('./openaiCommon');

async function cmdTts({ msg, args, opts, quotedMsg }) {
    let engine;
    try {
        engine = pickEngine(opts, 'tts.engine');
    } catch (e) {
        await msg.reply(e.message);
        return;
    }
    const text = withoutOption(args, 'status|s|quiet|q|gpt|g|local|l');

    if (engine === 'local') {
        await talkText(msg, text, quotedMsg, '/tts', { local: true, quiet: opts.opt.quiet });
        return;
    }
    if (!keyOpenAi()) {
        await msg.reply(WITHOUT_KEY('/tts'));
        return;
    }
    await measureConsumption(opts?.given.has('status'), () => talkText(msg, text, quotedMsg, '/tts', { quiet: opts.opt.quiet }));
}

module.exports = { cmdTts };
