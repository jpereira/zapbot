/*
 * /tts command: the text as voice (voice note), with the local Piper voice or, with -gpt, through
 * OpenAI's voice API (like /gpt -voice).
 *   /tts <text>           → speaks the text
 * /tts, replying     → speaks the replied message (audio is transcribed first); what was
 * typed becomes the speech style ("speak like a robot", only with -gpt)
 *   /tts The dollar is {/stocks USD}   → the {/command}s of the text run first and their reply is spoken
 *                                        ({stocks USD} works too: the slash is optional)
 */

const { MessageMedia } = require('whatsapp-web.js');

const { findCommand } = require('./base');
const { talkText } = require('./gpt');
const { completeNotice } = require('../client');
const { t } = require('../i18n');
const { printError } = require('../log');
const { engineProcessing, gptAllowed, pickEngine, withEngineTip } = require('../engines');
const { WITHOUT_KEY, keyOpenAi, measureConsumption } = require('../openaiChat');
const { withoutOption } = require('./openaiCommon');
const { listVoices, readVoiceOptions } = require('../ttsVoice');
const { getSetting } = require('../settings');
const { maskMarks } = require('../commandMarks');
const { assembleText, commandsError } = require('../textCommands');
const { speakable } = require('../util/speech');
const { speakLocal } = require('../ttsLocal');
const { concatVoices, mixBeat } = require('../ttsMix');
const { FLAG_OPTIONS, VALUE_OPTIONS, readBeat, readSegments } = require('../ttsSegments');

/*
 * /tts with several lines: each one is spoken with its own options and everything goes out as one voice note
 * (see src/ttsSegments.js). Local voice only: with ChatGPT each line would be a paid call.
 */
async function talkSegments(msg, segments, { quiet, beat, prepare }) {
    // Everything is checked before the notice: a wrong voice or number fails without spending anything
    const prepared = [];
    for (const segment of segments) {
        const text = await prepare(segment.text);
        if (text.error) {
            await msg.reply(text.error);
            return;
        }
        prepared.push({ ...segment, text: text.text, voice: readVoiceOptions(segment.opts, 'local') }); // (already checked in cmdTts)
    }
    const total = prepared.reduce((n, s) => n + s.text.length, 0);
    const maxChars = getSetting('tts.maxChars');
    if (total > maxChars) {
        await msg.reply(t('gpt.voiceTooLong', { n: total, max: maxChars }));
        return;
    }

    const notice = quiet ? null : await msg.reply(engineProcessing('tts', 'Piper'), null, { linkPreview: false });
    try {
        const voices = [];
        for (const segment of prepared) voices.push(await speakLocal(segment.text, segment.voice));
        let spoken = await concatVoices(voices, prepared.map(s => s.pauseMs));
        if (beat) spoken = await mixBeat(spoken, beat);
        if (!quiet) await completeNotice(msg, notice, withEngineTip(t('gpt.voiceBelow'), 'tts', 'Piper', { sep: '\n', command: 'tts' }));
        await msg.reply(new MessageMedia('audio/ogg; codecs=opus', spoken.toString('base64'), 'voz.ogg'), null, { sendAudioAsVoice: true });
    } catch (err) {
        printError('/tts:', err.message);
        await completeNotice(msg, notice, t('tts.localFailed', { error: err.message }));
    }
}

async function cmdTts({ msg, args, opts, quotedMsg, chatId, chatName, isGroup, level, admin, canUse, senderContact, senderName, senderNumber }) {
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
    let beat;
    let segmentsText;
    try {
        voice = readVoiceOptions(opts, engine);
        beat = readBeat(opts);
        segmentsText = readSegments(args, opts, findCommand('/tts'));
        // Every line is checked (voice, speed, pitch, volume) before anything is spoken
        for (const segment of segmentsText?.segments ?? []) readVoiceOptions(segment.opts, engine === 'gpt' ? 'local' : engine);
    } catch (e) {
        await msg.reply(e.message);
        return;
    }
    // ChatGPT spends the key: only the admins, or a user with a limit for the /tts (/bot +cmd /tts +limit N)
    if (!gptAllowed({ engine, admin, cmd: '/tts', senderNumber, chatId, isGroup })) {
        await msg.reply(t('tts.gptNeedsLimit'));
        return;
    }
    // The options with a value (-voice, -speed, -pitch, -volume...) leave the text as well as the flags
    // (the {/command}s are protected while the options leave: "{/crypto -s}" is not the -s of the /tts)
    const who = { level, admin, canUse, senderContact, senderName, senderNumber };
    const chat = { chat_id: chatId, chat_name: chatName, is_group: isGroup };
    // The {/command}s of the text run and their reply, cleaned to be spoken, goes in their place
    const prepare = async (raw) => {
        const { masked, restore } = maskMarks(raw);
        let text = restore(withoutOption(masked.replace(VALUE_OPTIONS, ' '), FLAG_OPTIONS).trim());
        const error = await commandsError(text, '/tts');
        if (error) return { error };
        ({ text } = await assembleText(text, chat, { where: '/tts', transform: speakable, origin: msg.body, who }));
        return { text };
    };

    // Several lines: one speech per line, in a single voice note (local voice only)
    if (segmentsText) {
        if (engine !== 'local') {
            await msg.reply(t('tts.segmentsLocalOnly'));
            return;
        }
        await talkSegments(msg, segmentsText.segments, { quiet: opts.opt.quiet, beat, prepare });
        return;
    }

    const prepared = await prepare(args);
    if (prepared.error) {
        await msg.reply(prepared.error);
        return;
    }
    const { text } = prepared;

    if (engine === 'local') {
        await talkText(msg, text, quotedMsg, '/tts', { local: true, quiet: opts.opt.quiet, voice, beat });
        return;
    }
    if (!keyOpenAi()) {
        await msg.reply(WITHOUT_KEY('/tts'));
        return;
    }
    await measureConsumption(opts?.given.has('status'), () => talkText(msg, text, quotedMsg, '/tts', { quiet: opts.opt.quiet, voice, beat }));
}

module.exports = { cmdTts };
