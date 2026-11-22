/*
 * The voice of /tts (and /gpt -voice): voice, speed, pitch and volume, from the options of the call or,
 * without them, from the tts.* settings. Speed and volume are percentages (100 = normal) and the pitch
 * is in semitones (0 = normal). The pitch and the volume are an ffmpeg filter, the same for both
 * engines; the speed is the engine's (Piper length_scale, OpenAI speed).
 */

const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const { BIN_FFMPEG } = require('./constants');
const { t } = require('./i18n');
const { OPENAI_VOICES } = require('./openai');
const { PIPER_REGIONS, piperVoicesByName, resolvePiperVoice } = require('./ttsVoices');
const { getSetting } = require('./settings');
const { captureOutput } = require('./util/processes');

const LIMITS = {
    speed: { min: 50, max: 200 },
    pitch: { min: -12, max: 12 },
    volume: { min: 20, max: 300 }
};

// "120", "120%", "+3", "-2.5": a number (the % is optional)
function readNumber(valueAlt, name) {
    const n = Number(String(valueAlt).trim().replace(/%$/, ''));
    const { min, max } = LIMITS[name];
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(t('tts.badOption', { name: `-${name}`, value: valueAlt, min, max }));
    return n;
}

/**
 * @param {object} opts    the parsed options of the command
 * @param {'local'|'gpt'} engine
 * @returns {{ voice: string|null, speed: number, pitch: number, volume: number }} voice null: the default one
 * @throws {Error} with the message for the user when a value is out of the limits or the voice does not exist
 */
function readVoiceOptions(opts, engine) {
    const given = (name) => opts?.given?.has(name) && opts.opt[name] != null;
    // The default speed is per engine: tts.speed (Piper) or gpt.tts.speed (ChatGPT)
    const setting = (name) => (name === 'speed' && engine === 'gpt' ? 'gpt.tts.speed' : `tts.${name}`);
    const pick = (name) => (given(name) ? readNumber(opts.opt[name], name) : Number(getSetting(setting(name))));

    let voice = given('voice') ? String(opts.opt.voice).trim() : null;
    if (voice && engine === 'gpt') {
        voice = voice.toLowerCase();
        if (!OPENAI_VOICES.includes(voice)) throw new Error(t('tts.badVoice', { value: voice, voices: OPENAI_VOICES.join(', ') }));
    }
    if (voice && engine === 'local') {
        voice = resolvePiperVoice(voice);
        if (!voice) throw new Error(t('tts.badVoiceLocal', { value: opts.opt.voice }));
    }
    return { voice, speed: pick('speed'), pitch: pick('pitch'), volume: pick('volume') };
}

/**
 * The message of /tts -v (Piper voices) and /tts -g -v (ChatGPT voices): the default is marked with ✅.
 * @param {'local'|'gpt'} engine
 */
function listVoices(engine) {
    if (engine === 'gpt') {
        const current = getSetting('gpt.tts.voice');
        return t('tts.voicesGpt', { voices: OPENAI_VOICES.map(v => `• ${v}${v === current ? ' ✅' : ''}`).join('\n') });
    }
    // Only the name of the person (the qualities in parentheses when there is more than one); ✅ on the default
    const defaults = [getSetting('tts.voice.pt'), getSetting('tts.voice.en')];
    const lines = (region) => piperVoicesByName(region).map(({ name, qualities, ids }) => {
        const shown = qualities.map((q, i) => `${q}${defaults.includes(ids[i]) && qualities.length > 1 ? ' ✅' : ''}`);
        const isDefault = ids.some(id => defaults.includes(id));
        return qualities.length > 1 ? `• ${name} (${shown.join(', ')})` : `• ${name}${isDefault ? ' ✅' : ''}`;
    }).join('\n');
    return t('tts.voicesLocal', Object.fromEntries(PIPER_REGIONS.map(r => [r, lines(r)])));
}

// The ffmpeg -af chain for the pitch and the volume (null: nothing to change)
function voiceFilters({ pitch = 0, volume = 100 }) {
    const filters = [];
    if (pitch) {
        // Raises the pitch by speeding the sample rate up, then brings the time back
        const ratio = 2 ** (pitch / 12);
        filters.push(`asetrate=48000*${ratio.toFixed(6)}`, 'aresample=48000', `atempo=${(1 / ratio).toFixed(6)}`);
    }
    if (volume !== 100) filters.push(`volume=${(volume / 100).toFixed(2)}`);
    return filters.length ? filters.join(',') : null;
}

const ENCODE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Encodes an audio file to the WhatsApp voice note (Ogg/Opus), with the pitch and the volume.
 * @returns {Promise<void>}
 */
async function encodeVoice(input, output, voice) {
    const filters = voiceFilters(voice);
    await captureOutput(BIN_FFMPEG, ['-y', '-i', input, ...(filters ? ['-af', filters] : []),
        '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1', output], ENCODE_TIMEOUT_MS, { log: true });
}

/** A voice that came ready (the OpenAI one, in Ogg/Opus) with the pitch or the volume changed; without them, as it is. */
async function adjustVoice(buffer, voice) {
    if (!voiceFilters(voice)) return buffer;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zapbot-voice-'));
    const [input, output] = ['in.ogg', 'out.ogg'].map(n => path.join(dir, n));
    try {
        fs.writeFileSync(input, buffer);
        await encodeVoice(input, output, voice);
        return fs.readFileSync(output);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

/**
 * Splits a long text into parts of up to `max` characters for a voice API, at the end of a paragraph or of a sentence
 * (and, for a sentence that is longer, at a space), so that nothing is cut in the middle of a word.
 * @returns {string[]}
 */
function splitSpeech(text, max) {
    const parts = [];
    let current = '';
    const push = (piece) => {
        if (current && current.length + piece.length + 1 > max) {
            parts.push(current.trim());
            current = '';
        }
        current += (current ? ' ' : '') + piece;
    };
    // paragraphs, then sentences (. ! ? … and the line breaks)
    for (const sentence of String(text).split(/(?<=[.!?…])\s+|\n+/).map(x => x.trim()).filter(Boolean)) {
        if (sentence.length <= max) {
            push(sentence);
            continue;
        }
        // A sentence over the limit: at the spaces
        for (const word of sentence.split(/\s+/)) {
            if (word.length > max) {
                for (let i = 0; i < word.length; i += max) push(word.slice(i, i + max));
            } else {
                push(word);
            }
        }
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
}

/** Joins voice notes (Ogg/Opus buffers) into one, in order. */
async function joinVoices(buffers) {
    if (buffers.length === 1) return buffers[0];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zapbot-voice-'));
    try {
        const files = buffers.map((b, i) => {
            const f = path.join(dir, `part${i}.ogg`);
            fs.writeFileSync(f, b);
            return f;
        });
        const output = path.join(dir, 'all.ogg');
        const inputs = files.flatMap(f => ['-i', f]);
        const filter = `${files.map((_, i) => `[${i}:a]`).join('')}concat=n=${files.length}:v=0:a=1[out]`;
        await captureOutput(BIN_FFMPEG, ['-y', ...inputs, '-filter_complex', filter, '-map', '[out]',
            '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1', output], ENCODE_TIMEOUT_MS * 2, { log: true });
        return fs.readFileSync(output);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

module.exports = { LIMITS, joinVoices, splitSpeech, adjustVoice, encodeVoice, listVoices, readVoiceOptions, voiceFilters };
