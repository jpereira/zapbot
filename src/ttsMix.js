/*
 * The ffmpeg part of /tts with several lines: the voice notes of the lines become one (with a pause
 * between them) and, with -beat, a hip-hop beat made by ffmpeg itself plays under the voice (no audio file).
 */

const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const { BIN_FFMPEG } = require('./constants');
const { captureOutput } = require('./util/processes');

const TIMEOUT_MS = 5 * 60 * 1000;
const RATE = 48000;
const ENCODE = ['-c:a', 'libopus', '-b:a', '32k', '-ar', String(RATE), '-ac', '1'];

const BEAT_LIMITS = { bpm: { min: 60, max: 180 }, volume: { min: 5, max: 100 } };

// ffmpeg's number: no exponent notation, which its expressions do not read
const num = (x) => Number(x.toFixed(6)).toString();

async function inTemp(work) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zapbot-mix-'));
    try {
        return await work(dir);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

/**
 * Joins voice notes into one, with a silence after each (the last one has none).
 * @param {Buffer[]} voices      Ogg/Opus
 * @param {number[]} pausesMs    the silence after each voice, in ms
 * @returns {Promise<Buffer>}    Ogg/Opus
 */
async function concatVoices(voices, pausesMs) {
    if (voices.length === 1) return voices[0];
    return inTemp(async (dir) => {
        const inputs = voices.map((buffer, i) => {
            const file = path.join(dir, `part${i}.ogg`);
            fs.writeFileSync(file, buffer);
            return file;
        });
        const output = path.join(dir, 'joined.ogg');
        const parts = voices.map((_, i) => {
            const pause = i < voices.length - 1 ? (pausesMs[i] ?? 0) : 0;
            return `[${i}:a]aresample=${RATE},aformat=channel_layouts=mono${pause > 0 ? `,apad=pad_dur=${num(pause / 1000)}` : ''}[a${i}]`;
        });
        const graph = `${parts.join(';')};${voices.map((_, i) => `[a${i}]`).join('')}concat=n=${voices.length}:v=0:a=1[out]`;
        await captureOutput(BIN_FFMPEG, ['-y', ...inputs.flatMap(f => ['-i', f]), '-filter_complex', graph, '-map', '[out]', ...ENCODE, output], TIMEOUT_MS, { log: true });
        return fs.readFileSync(output);
    });
}

/**
 * The beat as an ffmpeg expression of the time t (one bar = 4 beats): kick on beats 1 and 3, snare on 2 and 4,
 * hi-hat on the eighth notes and a bass note per beat (A, A, C, G).
 * @param {number} bpm
 */
function beatExpression(bpm) {
    const B = 60 / bpm;
    const b = num(B);
    const kick = `sin(2*PI*(50*mod(t,2*${b})+2*(1-exp(-40*mod(t,2*${b})))))*exp(-9*mod(t,2*${b}))`;
    const snare = `(random(1)*2-1)*exp(-20*mod(t+${b},2*${b}))*0.5`;
    const hat = `(random(2)*2-1)*exp(-90*mod(t,${b}/2))*0.2`;
    const bar = `mod(t,4*${b})`;
    const note = `if(lt(${bar},2*${b}),55,if(lt(${bar},3*${b}),65.41,49))`;
    const bass = `sin(2*PI*${note}*t)*exp(-3*mod(t,${b}))*0.35`;
    return `0.8*(${kick}+${snare}+${hat}+${bass})`;
}

/**
 * Puts the beat under the voice: it starts one bar before the voice and goes on one bar after it.
 * @param {Buffer} voice  Ogg/Opus
 * @param {{ bpm: number, volume?: number }} beat  tempo and volume (% of the beat; 100 = as it is made)
 * @returns {Promise<Buffer>} Ogg/Opus
 */
async function mixBeat(voice, { bpm, volume = 35 }) {
    const bar = (60 / bpm) * 4;
    const barMs = Math.round(bar * 1000);
    return inTemp(async (dir) => {
        const [input, output] = ['voice.ogg', 'mixed.ogg'].map(n => path.join(dir, n));
        fs.writeFileSync(input, voice);
        const graph = `[0:a]aresample=${RATE},aformat=channel_layouts=mono,adelay=${barMs}:all=1,apad=pad_dur=${num(bar)}[v];` +
            `aevalsrc=exprs='${beatExpression(bpm)}':s=${RATE}:c=mono,volume=${num(volume / 100)}[b];` +
            '[v][b]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[out]';
        await captureOutput(BIN_FFMPEG, ['-y', '-i', input, '-filter_complex', graph, '-map', '[out]', ...ENCODE, output], TIMEOUT_MS, { log: true });
        return fs.readFileSync(output);
    });
}

module.exports = { BEAT_LIMITS, beatExpression, concatVoices, mixBeat };
