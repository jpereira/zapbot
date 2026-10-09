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
const { withoutAccents } = require('../util/format');

const RULE_REGEX = /^\/(.+)\/([a-z]*)$/s;
const RULE_MAX_LEN = 200;

// rule -> test function (compiled once, not on every message)
const rulesCompiled = new Map();

/**
 * Text ("contains", case and accent insensitive) or /regex/flags →
 * test function. It is also the -q of /show and /watch.
 * @throws {Error} invalid regex
 */
function compileSearch(search) {
    const m = search.match(RULE_REGEX);

    if (m) {
        let re;
        try {
            re = new RegExp(m[1], m[2].replace(/[gy]/g, ''));
        } catch (e) {
            throw new Error(`regex inválida: ${e.message}`, { cause: e });
        }
        return (textAlt) => re.test(String(textAlt ?? ''));
    }

    const target = withoutAccents(search);
    return (textAlt) => withoutAccents(textAlt).includes(target);
}

function compileRuleWatch(rule) {
    if (rulesCompiled.has(rule)) return rulesCompiled.get(rule);

    if (!rule || rule.length > RULE_MAX_LEN) {
        throw new Error(`a regra precisa ter de 1 a ${RULE_MAX_LEN} caracteres`);
    }

    const test = compileSearch(rule);
    rulesCompiled.set(rule, test);
    return test;
}

module.exports = {
    RULE_REGEX,
    compileSearch,
    compileRuleWatch
};
