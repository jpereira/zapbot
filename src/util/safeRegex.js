/*
 * ReDoS protection (catastrophic backtracking) on regexes coming from the
 * user (/watch, /show -q, /set, /watch -q). The JavaScript engine is synchronous
 * and runs on the bot's single thread: a regex like /(x+)+y/ against "xxxx…" (without the
 * "y") causes exponential backtracking and freezes the whole bot (heartbeat, reconnection,
 * all the commands). The tested text comes from any received message, so
 * does not even need to be an admin to trigger it.
 */

// Above this the tested text is truncated: limits the cost of regexes that escape
// of the static check (e.g.: overlapping alternation) without ever hanging the bot.
const MAX_TEXT_TESTED = 20_000;

/*
 * A quantifier that repeats (>1 time) from position i: "*", "+" or
 * "{n,…}"/"{n,m}" with a limit > 1. "?" and "{0,1}" do not repeat and do not matter.
 * @returns {number} characters consumed (0 if none)
 */
function readQuantifier(src, i) {
    const c = src[i];
    if (c === '*' || c === '+') return 1 + (src[i + 1] === '?' ? 1 : 0); // inclui o lazy "+?"
    if (c === '{') {
        const m = src.slice(i).match(/^\{(\d*)(?:,(\d*))?\}/);
        if (!m) return 0;
        const [raw, , max] = m;
        const repeat = max === undefined ? false // {n} repeats n fixed times: star height does not grow
            : max === '' ? true                   // {n,}
                : Number(max) > 1;                // {n,m}
        if (!repeat) return 0;
        return raw.length + (src[i + raw.length] === '?' ? 1 : 0);
    }
    return 0;
}

/*
 * "Star height > 1" heuristic: a repeating quantifier applied to a
 * group that already contains a repeating quantifier — the classic case and by far
 * most common catastrophic backtracking, like (x+)+ or ([a-z]+) repeated.
 * Does a single pass, respecting escapes and character classes.
 *
 * Does not detect overlapping alternation (like "(a|ab)+") — that is why the tested text is
 * truncated at MAX_TEXT_TESTED as defense in depth.
 */
function regexDangerous(source) {
    const stack = []; // one frame per open group: { hasRepetition }
    let i = 0;

    while (i < source.length) {
        const c = source[i];

        if (c === '\\') { // escape (e.g.: \d): skips the pair and checks whether a quantifier follows
            i += 2;
            const q = readQuantifier(source, i);
            if (q) { if (stack.length) stack[stack.length - 1].temRepeticao = true; i += q; }
            continue;
        }

        if (c === '[') { // character class: skips up to the unescaped "]"
            i++;
            if (source[i] === '^') i++;
            if (source[i] === ']') i++; // "]" right at the start is literal
            while (i < source.length && source[i] !== ']') {
                i += source[i] === '\\' ? 2 : 1;
            }
            i++;
            const q = readQuantifier(source, i);
            if (q) { if (stack.length) stack[stack.length - 1].temRepeticao = true; i += q; }
            continue;
        }

        if (c === '(') { stack.push({ temRepeticao: false }); i++; continue; }

        if (c === ')') {
            const group = stack.pop() ?? { temRepeticao: false };
            i++;
            const q = readQuantifier(source, i);
            if (q) {
                // A repeating quantifier over a group that already repeats inside → dangerous
                if (group.temRepeticao) return true;
                if (stack.length) stack[stack.length - 1].temRepeticao = true;
                i += q;
            }
            continue;
        }

        // Common atom (one character); if a repeating quantifier comes, the current group repeats
        i++;
        const q = readQuantifier(source, i);
        if (q) { if (stack.length) stack[stack.length - 1].temRepeticao = true; i += q; }
    }

    return false;
}

module.exports = { MAX_TEXT_TESTED, regexDangerous };
