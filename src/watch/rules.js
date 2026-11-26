/*
 * /watch rules: text (case and accent insensitive) or /regex/flags.
 */

/*
 * Watch: every received message (except yours and the commands) is tested against
 * the rules from the 'watch.rules' setting. Each rule is:
 * text        → "contains", case and accent insensitive
 * /regex/flags → JavaScript RegExp (the g and y flags are ignored)
 * When it matches, the occurrence goes to watch_hits and you are notified in private.
 */
const { t } = require('../i18n');
const { withoutAccents } = require('../util/format');
const { regexDangerous } = require('../util/safeRegex');
const { matchBatch, regexTest } = require('../util/regexRunner');

const RULE_REGEX = /^\/(.+)\/([a-z]*)$/s;
const RULE_MAX_LEN = 200;

// rule -> test function (compiled once, not on every message)
const rulesCompiled = new Map();

/**
 * Text ("contains", case and accent insensitive) or /regex/flags →
 * test function. It is also the -q of /show and /watch.
 * @throws {Error} invalid regex
 */
function compileSearch(search, options) {
    const m = search.match(RULE_REGEX);

    if (m) {
        if (regexDangerous(m[1])) {
            // Backtracking exponencial travaria o bot inteiro (ver util/regexSeguro)
            throw new Error(t('watch.err.riskyRegex'));
        }
        let re;
        try {
            re = new RegExp(m[1], m[2].replace(/[gy]/g, ''));
        } catch (e) {
            throw new Error(t('watch.err.invalidRegex', { error: e.message }), { cause: e });
        }
        return regexTest(re, options);
    }

    const target = withoutAccents(search);
    return (textAlt) => withoutAccents(textAlt).includes(target);
}

/**
 * Where the rule matches in a text (to mark it on the page): { start, end } in the text as it is, or null.
 * A text rule ignores the case and the accents, as the rule does.
 */
async function findMatch(rule, text) {
    const original = String(text ?? '');
    const m = String(rule ?? '').match(RULE_REGEX);
    if (m) {
        if (regexDangerous(m[1])) return null;
        try {
            const [found] = await matchBatch(new RegExp(m[1], m[2].replace(/[gy]/g, '')), [original]);
            return found && found.end > found.start ? found : null;
        } catch {
            return null;
        }
    }
    // The text without accents, remembering which character of the original each piece came from
    let normalized = '';
    const origin = [];
    for (let i = 0; i < original.length; i++) {
        const piece = withoutAccents(original[i]);
        normalized += piece;
        for (let k = 0; k < piece.length; k++) origin.push(i);
    }
    const target = withoutAccents(rule);
    const at = target ? normalized.indexOf(target) : -1;
    return at < 0 ? null : { start: origin[at], end: origin[at + target.length - 1] + 1 };
}

function compileRuleWatch(rule) {
    if (rulesCompiled.has(rule)) return rulesCompiled.get(rule);

    if (!rule || rule.length > RULE_MAX_LEN) {
        throw new Error(t('watch.err.ruleLength', { max: RULE_MAX_LEN }));
    }

    // The rule checks every arriving message: its regex goes ahead of the searches (src/util/regexRunner.js)
    const test = compileSearch(rule, { urgent: true });
    if (rulesCompiled.size >= 256) rulesCompiled.delete(rulesCompiled.keys().next().value);
    rulesCompiled.set(rule, test);
    return test;
}

module.exports = {
    RULE_REGEX,
    compileSearch,
    compileRuleWatch,
    findMatch
};
