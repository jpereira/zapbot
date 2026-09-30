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
const RULE_REGEX = /^\/(.+)\/([a-z]*)$/s;
const RULE_MAX_LEN = 200;

const withoutAccents = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// rule -> test function (compiled once, not on every message)
const rulesCompiled = new Map();

function compileRuleWatch(rule) {
    if (rulesCompiled.has(rule)) return rulesCompiled.get(rule);

    if (!rule || rule.length > RULE_MAX_LEN) {
        throw new Error(`a regra precisa ter de 1 a ${RULE_MAX_LEN} caracteres`);
    }

    let test;
    const m = rule.match(RULE_REGEX);

    if (m) {
        let re;
        try {
            re = new RegExp(m[1], m[2].replace(/[gy]/g, ''));
        } catch (e) {
            throw new Error(`regex inválida: ${e.message}`);
        }
        test = (textAlt) => re.test(textAlt);
    } else {
        const target = withoutAccents(rule);
        test = (textAlt) => withoutAccents(textAlt).includes(target);
    }

    rulesCompiled.set(rule, test);
    return test;
}

module.exports = {
    RULE_REGEX,
    compileRuleWatch
};
