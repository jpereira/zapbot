/*
 * /tts command: the text as voice (voice note), with the local Piper voice or, with -gpt, through
 * OpenAI's voice API (like /gpt -voice).
 *   /tts <text>           → speaks the text
 * /tts, replying     → speaks the replied message (audio is transcribed first); what was
 * typed becomes the speech style ("speak like a robot", only with -gpt)
 *   /tts The dollar is {/stocks USD}   → the {/command}s of the text run first and their reply is spoken
 *                                        ({stocks USD} works too: the slash is optional)
 */

const { talkText } = require('./gpt');
const { t } = require('../i18n');
const { gptAllowed, pickEngine } = require('../engines');
const { WITHOUT_KEY, keyOpenAi, measureConsumption } = require('../openaiChat');
const { withoutOption } = require('./openaiCommon');
const { listVoices, readVoiceOptions } = require('../ttsVoice');
const { maskMarks } = require('../commandMarks');
const { assembleText, commandsError } = require('../textCommands');
const { speakable } = require('../util/speech');

const VALUE_OPTIONS = /(^|\s)-(?:voice|v|speed|sp|pitch|pi|volume|vol)\s+\S+/gi;

async function cmdTts({ msg, args, opts, quotedMsg, chatId, chatName, isGroup, nivel: level, admin, podeUsar: canUse, senderContact, senderName, senderNumber }) {
    let engine;
    try {
        engine = pickEngine(opts, 'tts.engine');
    } catch (e) {
        await msg.reply(e.message);
        return;
    }
    // -voice without a name (/tts -v, /tts -g -v): lists the voices of the engine
    if (opts?.given.has('voice') && opts.opt.voice == null) {
        await msg.reply(listVoices(engine));
        return;
    }
    let voice;
    try {
        voice = readVoiceOptions(opts, engine);
    } catch (e) {
        await msg.reply(e.message);
        return;
    }
    // ChatGPT spends the key: only the admins, or a user with a limit for the /tts (/bot +cmd /tts +limit N)
    if (!gptAllowed({ engine, admin, cmd: '/tts', senderNumber, chatId, isGroup })) {
        await msg.reply(t('tts.gptNeedsLimit'));
        return;
    }
    // The options with a value (-voice, -speed, -pitch, -volume) leave the text as well as the flags
    // (the {/command}s are protected while the options leave: "{/crypto -s}" is not the -s of the /tts)
    const { masked, restore } = maskMarks(args);
    let text = restore(withoutOption(masked.replace(VALUE_OPTIONS, ' '), 'status|s|quiet|q|gpt|g|local|l').trim());

    // The {/command}s of the text run and their reply, cleaned to be spoken, goes in their place
    const errorAlt = await commandsError(text, '/tts');
    if (errorAlt) {
        await msg.reply(errorAlt);
        return;
    }
    ({ texto: text } = await assembleText(text, { chat_id: chatId, chat_name: chatName, is_group: isGroup }, {
        onde: '/tts', transform: speakable, origem: msg.body,
        quem: { nivel: level, admin, podeUsar: canUse, senderContact, senderName, senderNumber }
    }));

    if (engine === 'local') {
        await talkText(msg, text, quotedMsg, '/tts', { local: true, quiet: opts.opt.quiet, voice });
        return;
    }
    if (!keyOpenAi()) {
        await msg.reply(WITHOUT_KEY('/tts'));
        return;
    }
    await measureConsumption(opts?.given.has('status'), () => talkText(msg, text, quotedMsg, '/tts', { quiet: opts.opt.quiet, voice }));
}

module.exports = { cmdTts };
