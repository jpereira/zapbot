/*
 * Local transcription (faster-whisper, on the CPU): /stt and /get -stt. The Python script lives in
 * scripts/stt.py and the models in WHISPER_DIR (the default comes in the Docker image).
 */

const { BIN_PYTHON, SCRIPT_STT, WHISPER_DIR } = require('./constants');
const { t } = require('./i18n');
const { getSetting } = require('./settings');
const { captureOutput } = require('./util/processes');

// More than the download: the model may be downloaded the first time and the CPU is slow
const TRANSCRIPTION_TIMEOUT_MS = 15 * 60 * 1000;

const BEAM_MAX = 10;
const LANGUAGE = /^(auto|[a-z]{2,3}(-[a-z]{2,4})?)$/i;
const MODEL = /^[\w][\w.-]{0,59}$/;

/**
 * The options of the call (-lang, -model, -beam, -vad) of /stt: only the ones that came, validated; what is
 * missing comes from the stt.* settings when it transcribes.
 * @param {object} opts  the parsed options of the command
 * @returns {{ language?: string, model?: string, beam?: number, vad?: boolean }}
 * @throws {Error} with the message for the user
 */
function readSttOptions(opts) {
    const given = (name) => opts?.given?.has(name) && opts.opt[name] != null;
    const out = {};
    if (given('lang')) {
        const v = String(opts.opt.lang).trim();
        if (!LANGUAGE.test(v)) throw new Error(t('stt.badOption', { name: '-lang', value: v, hint: 'pt, en, es, pt-br... or auto' }));
        out.language = v.toLowerCase();
    }
    if (given('model')) {
        const v = String(opts.opt.model).trim();
        if (!MODEL.test(v)) throw new Error(t('stt.badOption', { name: '-model', value: v, hint: 'tiny, base, small, medium, large-v3-turbo...' }));
        out.model = v;
    }
    if (given('beam')) {
        const n = Number(opts.opt.beam);
        if (!Number.isInteger(n) || n < 1 || n > BEAM_MAX) throw new Error(t('stt.badOption', { name: '-beam', value: opts.opt.beam, hint: `1 to ${BEAM_MAX}` }));
        out.beam = n;
    }
    if (given('vad')) {
        const v = String(opts.opt.vad).trim().toLowerCase();
        if (['on', 'yes', 'true', '1'].includes(v)) out.vad = true;
        else if (['off', 'no', 'false', '0'].includes(v)) out.vad = false;
        else throw new Error(t('stt.badOption', { name: '-vad', value: v, hint: 'on or off' }));
    }
    return out;
}

// The script options: what came in the call or, if not, the settings
function sttSettings(o = {}) {
    return {
        model: o.model ?? getSetting('stt.model'),
        language: o.language ?? getSetting('stt.language'),
        beam: o.beam ?? getSetting('stt.beam'),
        vad: o.vad ?? getSetting('stt.vad')
    };
}

const transcriptionArgs = (fileAlt, o = {}) => {
    const s = sttSettings(o);
    return [SCRIPT_STT, '--input', fileAlt, '--model', s.model, '--dir', WHISPER_DIR, '--language', s.language,
        '--beam', String(s.beam), ...(s.vad ? [] : ['--no-vad'])];
};

// The full command, for -verbose
const transcriptionCommand = (fileAlt, o = {}) => [BIN_PYTHON, ...transcriptionArgs(fileAlt, o)].join(' ');

/**
 * Transcribes an audio file with the model and the language of the call or of the stt.* settings.
 * @param {string} arquivo
 * @param {object} [o]  see readSttOptions
 * @returns {Promise<{ texto: string, idioma: string, duracao: number }>}
 */
async function transcribeFile(fileAlt, o = {}) {
    const outputAlt = await captureOutput(BIN_PYTHON, transcriptionArgs(fileAlt, o), TRANSCRIPTION_TIMEOUT_MS, { log: true });

    // faster-whisper may write warnings before: the JSON is the last line
    const json = JSON.parse(outputAlt.split('\n').at(-1));
    return { texto: json.text, idioma: json.language, duracao: json.duration };
}

module.exports = { readSttOptions, sttSettings, transcriptionCommand, transcribeFile };
