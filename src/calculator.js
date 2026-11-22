/*
 * /calc: the calculations and the sum of lists ("437 maromba / 351 corrida"). Pure functions: the command is in
 * commands/calc.js.
 *
 * The numbers: "1.234,56" (pt) and "1,234.56" (en) both work. When there is only one separator and after it
 * exactly 3 digits come ("1.234"), the bot language decides whether it is thousands (pt: dot, en: comma) or
 * decimal. The sign counts if stuck to the number ("-50", "+30", "R$ -50"); a loose dash ("Dia 1 - 437") is just
 * separator. Dates, times and huge numbers (phones) are ignored.
 */

// The symbols: R$, US$, USD$, EUR$, $, €, £ and the codes USD and EUR (with or without the $, upper or lowercase)
const CURRENCY = String.raw`(?:R\$|US\$|[Uu][Ss][Dd]\$?|[Ee][Uu][Rr]\$?|\$|€|£)`;
// "usd$" and "USD" are the same currency: the symbol comes out standardized (USD, EUR), the others as written
const symbolAlt = (s) => (s && /^(?:usd|eur)\$?$/i.test(s) ? s.replace('$', '').toUpperCase() : s);
const SIGNAL = '[+\\-−–]';
// The sign works stuck to the number ("-50") or before the currency, even with a space ("- R$ 50"); after the currency too ("R$ -50")
const NUMBER = new RegExp(`(?<![\\p{L}\\d.,])(?:(${SIGNAL})(?:\\s*(?=${CURRENCY})|(?=\\d)))?(?:(${CURRENCY})\\.?\\s*(${SIGNAL})?)?(\\d[\\d.,]*\\d|\\d)(?!\\d)`, 'gu');
// The invisibles WhatsApp puts in lists (word joiner, zero-width space...) and the bullets
const INVISIBLE = /[\u200B-\u200F\u2060-\u2064\uFEFF\u00AD]/g;
const MARKERS = /^[\s•·▪◦‣●○]+/;
// The line that declares the text's own total ("R$664,89 = Total Divida"): does not enter the sum
const TOTAL_LINE = /\b(?:total|soma|somat[óo]ria)\b/i;
const DATES = /\b\d{1,4}\/\d{1,2}(?:\/\d{1,4})?\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}:\d{2}(?::\d{2})?\b|\b\d{1,2}h(?:\d{2})?\b/gi;
const DIGITS_OTHERS = 11; // phones and ids: they are never values

const isLess = (s) => s === '-' || s === '−' || s === '–';

/**
 * "1.234,56" → 1234.56. `pt`: the bot language is Portuguese (the dot is thousands and the comma, decimal).
 */
function paraNumber(textAlt, pt) {
    const commas = (textAlt.match(/,/g) ?? []).length;
    const points = (textAlt.match(/\./g) ?? []).length;
    let decimal = null;

    if (commas && points) {
        decimal = textAlt.lastIndexOf(',') > textAlt.lastIndexOf('.') ? ',' : '.';
    } else if (commas + points === 1) {
        const sep = commas ? ',' : '.';
        const [integer, fraction] = textAlt.split(sep);
        const looksThousand = fraction.length === 3 && integer.length <= 3 && !integer.startsWith('0');
        const languageThousand = pt ? '.' : ',';
        decimal = looksThousand && sep === languageThousand ? null : sep;
    }
    // several equal separators (1.234.567) are thousands: no decimal

    const cleanAlt = textAlt.replace(/[.,]/g, (c) => (c === decimal ? '.' : ''));
    return Number(cleanAlt);
}

// The numbers of a line, in order: [{ value, start, end }]
function findNumbers(line, pt, { signOnLeft: signalALeft = false } = {}) {
    const clean = line.replace(INVISIBLE, '').replace(/\u00A0/g, ' ').replace(MARKERS, '').replace(/[*_~`]/g, '').replace(DATES, (m) => ' '.repeat(m.length));
    const foundAlt4 = [];
    for (const m of clean.matchAll(NUMBER)) {
        const digits = m[4].replace(/\D/g, '');
        if (digits.length >= DIGITS_OTHERS) continue;
        const valueAlt = paraNumber(m[4], pt);
        if (!Number.isFinite(valueAlt)) continue;
        let signalAlt = m[1] ?? m[3] ?? '';
        // A +/- at the start of the line, even loose ("- 144,93 Verdana"), is the sign of the first number
        if (!signalAlt && signalALeft && !foundAlt4.length) {
            const left = clean.match(/^\s*([+\-\u2212\u2013])\s*/);
            if (left && clean.slice(left[0].length, m.index).trim() === '') signalAlt = left[1];
        }
        const negative = isLess(signalAlt);
        foundAlt4.push({ value: negative ? -valueAlt : valueAlt, currency: symbolAlt(m[2]) ?? null, start: m.index, end: m.index + m[0].length, text: clean });
    }
    return foundAlt4;
}

/*
 * A calculation: a single line with numbers, operators (+ - * / % x × ÷ ^) and parentheses. "437 - 351" is a calculation;
 * "437 maromba" and "-50" are not.
 */
function looksAccount(line) {
    const l = line.trim();
    // A date alone on a line has slashes or dashes, but is not a calculation: "10/12/2026", "2026-11-15" and
    // "15/11" (day from 13 to 31 and month from 1 to 12). "10/4" stays as a division: it may be a date, but in a /calc it is the calculation.
    const dma = l.match(/^(\d{1,4})\/(\d{1,2})(?:\/(\d{1,4}))?$/);
    if (dma && (dma[3] || (dma[1] >= 13 && dma[1] <= 31 && dma[2] >= 1 && dma[2] <= 12))) return false;
    if (/^\d{4}-\d{2}-\d{2}$/.test(l)) return false;
    return /^[\d\s.,+\-*/x×÷^%()−–]+$/i.test(l) && (/[()]/.test(l) || /[\d)]\s*(?:\*\*|[+\-*/x×÷^%−–])\s*[\d(+\-−]/i.test(l));
}

/**
 * Evaluates the calculation (without eval): + - * / % x × ÷ ^ and parentheses, with unary minus and plus.
 * @throws {Error} 'divzero' or 'bad'
 */
function evaluate(account, pt) {
    const sourcesAlt = String(account).replace(/\*\*/g, '^').replace(/[x×]/gi, '*').replace(/÷/g, '/').replace(/[−–]/g, '-');
    const tokens = sourcesAlt.match(/\d[\d.,]*\d|\d|[+\-*/^%()]/g) ?? [];
    if (tokens.join('').length < sourcesAlt.replace(/\s/g, '').length) throw new Error('bad');

    let i = 0;
    const look = () => tokens[i];
    const read = () => tokens[i++];

    function atom() {
        const tk = read();
        if (tk === undefined) throw new Error('bad');
        if (tk === '(') {
            const v = sum();
            if (read() !== ')') throw new Error('bad');
            return v;
        }
        if (/^\d/.test(tk)) return paraNumber(tk, pt);
        throw new Error('bad');
    }
    function unary() {
        if (look() === '-') { read(); return -unary(); }
        if (look() === '+') { read(); return unary(); }
        return atom();
    }
    function power() {
        const base = unary();
        if (look() === '^') { read(); return base ** power(); }
        return base;
    }
    function product() {
        let v = power();
        while (look() === '*' || look() === '/' || look() === '%') {
            const op = read();
            const d = power();
            if ((op === '/' || op === '%') && d === 0) throw new Error('divzero');
            v = op === '*' ? v * d : op === '/' ? v / d : v % d;
        }
        return v;
    }
    function sum() {
        let v = product();
        while (look() === '+' || look() === '-') v = read() === '+' ? v + product() : v - product();
        return v;
    }

    const resultAlt = sum();
    if (i < tokens.length || !Number.isFinite(resultAlt)) throw new Error('bad');
    return resultAlt;
}

// What is left of the line without the chosen numbers: "437 maromba" → "maromba"
function labelAlt(chosen) {
    // The positions are those of the already cleaned line (without *_~` and with the dates and times blanked)
    let rest = chosen[0]?.text ?? '';
    for (const n of [...chosen].sort((a, b) => b.start - a.start)) rest = rest.slice(0, n.start) + ' ' + rest.slice(n.end);
    // Only trims the ends ('= Casaco' → 'Casaco'): hyphens and dots in the middle ('TC-Pro') stay as typed
    return rest.replace(/\s+/g, ' ').replace(/^[\s\-–—:;|,.()=+]+|[\s\-–—:;|,.()=+]+$/g, '');
}

/**
 * The total the text itself declares ("R$664,89 = Total Divida"), or null. It is the first number of the
 * first line with "total" (or "soma"), in absolute value.
 */
function totalDeclared(textAlt, pt) {
    for (const line of String(textAlt).split(/\r?\n/)) {
        if (!TOTAL_LINE.test(line)) continue;
        const n = findNumbers(line, pt)[0];
        if (n) return Math.abs(n.value);
    }
    return null;
}

/**
 * The values of a text, one per chosen number of each line.
 * @param {string} text
 * @param {object} o
 * @param {boolean} [o.all]   all the numbers of each line (the default is only one per line)
 * @param {number} [o.column]   which number of each line: 1 is the first, -1 the last
 * @param {boolean} o.pt
 * @returns {Array<{ value: number, label: string, line: string, account?: boolean }>}
 */
function valuesAlt(textAlt, { all: allAlt2 = false, column = 1, pt }) {
    const values = [];
    const linesAlt = String(textAlt).split(/\r?\n/);
    // A list where every line starts with "-" is a bulleted one ("- 437 maromba"), not negative signs
    const withNumber = linesAlt.filter((l) => findNumbers(l, pt).length && !TOTAL_LINE.test(l));
    const startsWithLess = (l) => /^[\s•·▪◦‣●○\u200B-\u200F\u2060-\u2064\uFEFF]*[-\u2212\u2013]/.test(l);
    const signalALeft = !(withNumber.length > 0 && withNumber.every(startsWithLess));
    for (const line of linesAlt) {
        if (!line.trim() || (TOTAL_LINE.test(line) && findNumbers(line, pt).length)) continue;

        if (looksAccount(line)) {
            // A single line of numbers and operators that does not close ("(1+2", "5 +") is a badly written calculation: error,
            // instead of summing the loose numbers
            values.push({ value: evaluate(line, pt), label: line.trim(), line: line.trim(), account: true });
            continue;
        }

        const numbers = findNumbers(line, pt, { signOnLeft: signalALeft });
        if (!numbers.length) continue;
        const chosen = allAlt2 ? numbers : [column > 0 ? numbers[column - 1] : numbers.at(column)].filter(Boolean);
        const label = labelAlt(chosen);
        for (const n of chosen) values.push({ value: n.value, label, line: line.trim(), currency: n.currency });
    }
    return values;
}

// Without the floating-point noise (0.1 + 0.2) and with at most 6 decimals
const round = (n) => Math.round(n * 1e6) / 1e6;

// 1234.5 → "1.234,5" (pt) ou "1,234.5" (en)
function format(n, pt, places = null) {
    const [integer, fraction] = (places === null ? String(round(n)) : Math.abs(n).toFixed(places)).replace('-', '').split('.');
    const thousand = integer.replace(/\B(?=(\d{3})+(?!\d))/g, pt ? '.' : ',');
    return (n < 0 && round(n) !== 0 ? '-' : '') + thousand + (fraction ? (pt ? ',' : '.') + fraction : '');
}

// Sum by label, from largest total to smallest: [{ label, total, n }]
function group(values) {
    const map = new Map();
    for (const v of values) {
        // Groups ignoring case ("Maromba" and "maromba"); shows the first as it was typed
        const keyAlt = v.label.toLowerCase();
        const g = map.get(keyAlt) ?? { label: v.label, total: 0, n: 0 };
        g.total += v.value;
        g.n++;
        map.set(keyAlt, g);
    }
    return [...map.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

module.exports = { findNumbers, group, round, evaluate, format, paraNumber, looksAccount, totalDeclared, valuesAlt };
