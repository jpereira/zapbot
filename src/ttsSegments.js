/*
 * /tts with several lines: each line is a segment, spoken with its own options, and the voice notes become
 * a single audio.
 *
 *   /tts -local -voice tugão -speed 50 -pause 300     ← the first line, with no text: the defaults
 *   Yeah... Yeah... Chegou a Paçoquita!                ← a segment (it keeps the defaults)
 *   -pitch 2 Direto da quebrada!                       ← a segment with its own options
 *   -speed 80                                          ← only options: they change the defaults of the next lines
 *   (a blank line doubles the pause)
 *
 * It is a segment text when the first line has no text or some other line starts with an option; a plain
 * multi-line text is still one speech.
 */

const { t } = require('./i18n');
const { getSetting } = require('./settings');
const { GetOptFromCommand } = require('./options');
const { BEAT_LIMITS } = require('./ttsMix');

const MAX_SEGMENTS = 60;
const PAUSE_LIMITS = { min: 0, max: 3000 };
const DEFAULT_BPM = 90;

// The options with a value (-voice, -speed, -pitch, -volume, -pause, -beat, -beatvol) leave the text as well as the flags
const VALUE_OPTIONS = /(^|\s)-(?:voice|v|speed|sp|pitch|pi|volume|vol|pause|pa|beat|b|beatvol|bv)\s+\S+/gi;
const FLAG_OPTIONS = 'status|s|quiet|q|gpt|g|local|l';
const STARTS_WITH_OPTION = /^-(?:voice|v|speed|sp|pitch|pi|volume|vol|pause|pa|beat|b|beatvol|bv|local|l|gpt|g)(?=\s|$)/i;

const withoutFlags = (text) => text.replace(new RegExp(`(^|\\s)-(?:${FLAG_OPTIONS})(?=\\s|$)`, 'g'), ' ');

/** The text of a line, without its options */
const lineText = (line) => withoutFlags(line.replace(VALUE_OPTIONS, ' ')).replace(/ {2,}/g, ' ').trim();

// Only what the line itself typed overrides the defaults (the parser fills the others with their empty values)
const mergeOptions = (base, line) => ({
    given: new Set([...base.given, ...line.given]),
    opt: { ...base.opt, ...Object.fromEntries([...line.given].map(name => [name, line.opt[name]])) }
});

function readNumber(value, name, { min, max }) {
    const n = Number(String(value).trim());
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(t('tts.badOption', { name: `-${name}`, value, min, max }));
    return n;
}

/** -pause (ms): the silence after the segment */
function readPause(opts) {
    if (opts.given.has('pause') && opts.opt.pause != null) return readNumber(opts.opt.pause, 'pause', PAUSE_LIMITS);
    return Number(getSetting('tts.pause'));
}

/**
 * -beat <bpm> (and -beatvol <%>): the beat under the voice; null without -beat.
 * @throws {Error} with the message for the user
 */
function readBeat(opts) {
    if (!opts?.given.has('beat')) return null;
    const bpm = opts.opt.beat == null ? DEFAULT_BPM : readNumber(opts.opt.beat, 'beat', BEAT_LIMITS.bpm);
    const volume = opts.given.has('beatvol') && opts.opt.beatvol != null ? readNumber(String(opts.opt.beatvol).replace(/%$/, ''), 'beatvol', BEAT_LIMITS.volume) : undefined;
    return { bpm, volume };
}

/**
 * The segments of a multi-line /tts; null when it is a single speech.
 * @param {string} args  everything typed after /tts (several lines)
 * @param {object} opts  the options of the first line (the framework reads only that one)
 * @param {object} config  the /tts definition (to read the options of each line)
 * @returns {{ segments: Array<{ text: string, opts: object, pauseMs: number }> } | null}
 * @throws {Error} with the message for the user (a number out of the limits, too many segments)
 */
function readSegments(args, opts, config) {
    const lines = String(args ?? '').split('\n').map(l => l.trim());
    if (lines.filter(Boolean).length < 2) return null;
    const firstText = lineText(lines[0]);
    if (firstText && !lines.slice(1).some(l => STARTS_WITH_OPTION.test(l))) return null;

    let defaults = opts;
    const segments = [];
    let blanks = 0;
    const add = (text, segmentOpts) => {
        if (segments.length) segments.at(-1).pauseMs *= 1 + blanks;
        blanks = 0;
        segments.push({ text, opts: segmentOpts, pauseMs: readPause(segmentOpts) });
    };

    lines.forEach((line, i) => {
        if (!line) {
            blanks++;
            return;
        }
        const text = lineText(line);
        if (i === 0) {
            if (text) add(text, defaults);
            return;
        }
        const lineOpts = GetOptFromCommand(line, config);
        if (!text) {
            defaults = mergeOptions(defaults, lineOpts); // only options: the next lines take them
            return;
        }
        add(text, mergeOptions(defaults, lineOpts));
    });

    if (segments.length > MAX_SEGMENTS) throw new Error(t('tts.tooManySegments', { n: segments.length, max: MAX_SEGMENTS }));
    return segments.length ? { segments } : null;
}

module.exports = { MAX_SEGMENTS, VALUE_OPTIONS, FLAG_OPTIONS, lineText, readBeat, readSegments };
