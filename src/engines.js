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

const CHATGPT = 'ChatGPT';

/**
 * The "⏳ ... with {engine}" notice of every command that has an engine (ChatGPT or local).
 * @param {string} cmd     'gpt' | 'tldr' | 'draw' | 'ocr' | 'tts' | 'stt'
 * @param {string} engine  the name shown: 'ChatGPT', 'Tesseract', 'Piper', 'faster-whisper'...
 * @param {object} [params]  extra values of the action text (the /tldr scope)
 */
const engineProcessing = (cmd, engine, params = {}) => t('engine.processing', { action: t(`engine.action.${cmd}`, params), engine });

/**
 * The "💡 Read by {engine}" line that ends the reply. -quiet (-q) and the <command>.footer setting off hide it.
 * @param {string} text   the reply
 * @param {string} sep    what goes between the reply and the tip
 * @param {boolean} [quiet]   the -quiet|-q of the call
 * @param {string} [command]  whose <command>.footer setting applies (default: cmd)
 */
function withEngineTip(text, cmd, engine, { sep = '\n\n', quiet = false, command = cmd } = {}) {
    if (quiet || !getSetting(`${command}.footer`)) return text;
    return `${text}${sep}${t('engine.tip', { verb: t(`engine.verb.${cmd}`), engine })}`;
}

/*
 * ChatGPT spends the OpenAI key. The commands with an engine (/tts, /ocr) are the user's, with the free local one; with
 * ChatGPT only the admins, or a user with a limit for the command (/bot +cmd /ocr +limit N), and only those calls
 * count toward the limit.
 */
const gptAllowed = ({ engine, admin, cmd, senderNumber, chatId, isGroup }) =>
    engine !== 'gpt' || Boolean(admin) || Boolean(require('./usageLimit').limitApplicable({ number: senderNumber, chatId, isGroup }, cmd));

// The `usageCounts` of the definition: the call spends the limit only when the engine is ChatGPT
const countsOnlyGpt = (setting) => (opts) => {
    try {
        return pickEngine(opts, setting) === 'gpt';
    } catch {
        return false; // -gpt with -local: the command itself refuses
    }
};

module.exports = { CHATGPT, countsOnlyGpt, engineProcessing, gptAllowed, pickEngine, withEngineTip };
