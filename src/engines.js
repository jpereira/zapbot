/*
 * The engine of /stt and /tts: 'local' (no key: faster-whisper and Piper) or 'gpt' (the OpenAI API).
 * -gpt (-g) and -local (-l) pick it for one call; without them, the stt.engine / tts.engine setting.
 */

const { getSetting } = require('./settings');
const { t } = require('./i18n');

/**
 * @param {object} opts     the parsed options of the command
 * @param {string} setting  'stt.engine' or 'tts.engine'
 * @returns {'local'|'gpt'}
 * @throws {Error} when -gpt and -local come together
 */
function pickEngine(opts, setting) {
    const gpt = opts?.opt?.gpt;
    const local = opts?.opt?.local;
    if (gpt && local) throw new Error(t('engine.both'));
    if (gpt) return 'gpt';
    if (local) return 'local';
    return getSetting(setting);
}

module.exports = { pickEngine };
