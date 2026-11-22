/*
 * Formatting of dates, numbers and texts.
 */

const { language } = require('../i18n');

// 'pt_BR' → 'pt-BR'; qualquer outro language → 'en-US'
const localeCurrent = () => (language() === 'pt_BR' ? 'pt-BR' : 'en-US');

// Timestamp stored in seconds (WhatsApp) or milliseconds (Date.now())
function paraMs(valueAlt) {
    const n = Number(valueAlt);
    return n < 10_000_000_000 ? n * 1000 : n;
}

function formatData(valueAlt) {
    return new Date(paraMs(valueAlt)).toLocaleString(localeCurrent(), { timeZone: 'America/Sao_Paulo', hourCycle: 'h23' });
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

const plural = (n, um, several) => `${n} ${n === 1 ? um : several}`;

const fmtInA = (n) => Number(n).toLocaleString(localeCurrent());

// Without accents and lowercase: comparisons that do not tell "promoção" from "PROMOCAO"
const withoutAccents = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const summarizeText = (textAlt, max = 100) => {
    const t = String(textAlt ?? '').replace(/\s+/g, ' ').trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/*
 * The option escape: "\-foo" is the text "-foo", not an option. It only counts with the "\" at the start of the word
 * (after a space or at the start). The free-text commands call this when using the text,
 * after removing the options; the options' regexes no longer catch the "\-foo" (they require a space before the "-").
 */
const unescape = (textAlt) => String(textAlt ?? '').replace(/(^|\s)\\(?=-)/g, '$1');

/*
 * A command typed over several lines: a "\" at the end of a line joins it with the next one (the indentation of the
 * next goes away), as in the .zb files. Only for a message that starts with "/" (a command): in any other text a "\"
 * at the end of a line stays as it is.
 *   /alias -q /x -desc "text" \
 *       /notes -v #x            →  /alias -q /x -desc "text" /notes -v #x
 */
const joinContinuedLines = (text) => {
    const s = String(text ?? '');
    return s.startsWith('/') ? s.replace(/[ \t]*\\[ \t]*\r?\n[ \t]*/g, ' ') : s;
};

module.exports = {
    joinContinuedLines,
    unescape,
    wait,
    fmtInA,
    formatData,
    localeCurrent,
    paraMs,
    plural,
    summarizeText,
    withoutAccents
};
