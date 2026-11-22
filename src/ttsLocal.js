/*
 * Local text to speech (Piper, on the CPU): /tts without -gpt. The Python script lives in scripts/tts.py
 * and the voices in PIPER_DIR (the default comes in the Docker image). The WAV becomes Ogg/Opus, the
 * WhatsApp voice note format.
 */

const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const { BIN_PYTHON, PIPER_DIR, SCRIPT_TTS } = require('./constants');
const { language } = require('./i18n');
const { getSetting } = require('./settings');
const { captureOutput } = require('./util/processes');
const { encodeVoice } = require('./ttsVoice');

// Words that tell Portuguese from English (the most common ones that the two languages do not share)
const WORDS_PT = new Set('o a os as um uma de do da dos das em no na nos nas que não nao é eu você voce ele ela nós nos para por com mais muito está esta estou são sao foi ser ter tem tudo bom dia boa noite obrigado obrigada oi olá ola como quando onde porque mas ou se já ja aqui isso isto esse essa meu minha seu sua'.split(' '));
const WORDS_EN = new Set('the a an and of to in is are was were be been i you he she it we they that this these those for with not have has had do does did will would can could my your his her our their what when where why how but or if so just here there good morning night hello hi thanks thank please'.split(' '));

/**
 * The language of a text, 'pt' or 'en': the one with more common words (an accent or ç counts as
 * Portuguese). A tie goes to the bot language.
 * @param {string} textAlt
 * @returns {'pt'|'en'}
 */
function detectSpeechLanguage(textAlt) {
    const words = textAlt.toLowerCase().match(/[\p{L}]+/gu) ?? [];
    let pt = (textAlt.match(/[ãõçáéíóúâêô]/gi) ?? []).length;
    let en = 0;
    for (const w of words) {
        if (WORDS_PT.has(w)) pt++;
        if (WORDS_EN.has(w)) en++;
    }
    if (pt === en) return language().startsWith('pt') ? 'pt' : 'en';
    return pt > en ? 'pt' : 'en';
}

// More than the synthesis: the voice may be downloaded the first time
const TTS_TIMEOUT_MS = 5 * 60 * 1000;
const MS_PER_CHARACTER = 40;   // a long text takes longer (the CPU speaks it a few times faster than a person)

/**
 * Speaks a text with the voice of its language (tts.voice.pt or tts.voice.en) or the one asked for.
 * @param {string} textAlt
 * @param {{ voice?: string|null, speed?: number, pitch?: number, volume?: number }} [voice]  see ttsVoice.js
 * @returns {Promise<Buffer>} the voice note, in Ogg/Opus
 */
async function speakLocal(textAlt, voice = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zapbot-tts-'));
    const [file, wav, ogg] = ['text.txt', 'voice.wav', 'voice.ogg'].map(n => path.join(dir, n));
    try {
        fs.writeFileSync(file, textAlt);
        const model = voice.voice || getSetting(`tts.voice.${detectSpeechLanguage(textAlt)}`);
        await captureOutput(BIN_PYTHON, [SCRIPT_TTS, '--input', file, '--voice', model, '--dir', PIPER_DIR, '--output', wav, '--speed', String((voice.speed ?? 100) / 100)], Math.max(TTS_TIMEOUT_MS, textAlt.length * MS_PER_CHARACTER), { log: true });
        await encodeVoice(wav, ogg, voice);
        return fs.readFileSync(ogg);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

module.exports = { detectSpeechLanguage, speakLocal };
