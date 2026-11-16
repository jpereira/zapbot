/*
 * /ascii: the text in big ASCII letters, inside a code block (monospaced in the
 * WhatsApp). The letters are 3 columns wide and 5 lines tall, and the text wraps in
 * several lines of letters to fit the phone screen (30 columns by default). The break is at the
 * spaces (the whole word goes down); only a word longer than the line is broken letter by letter.
 */
const { t } = require('../i18n');
const { getSetting } = require('../settings');

const MAX_TEXT = 40;
const WIDTH_DEFAULT = 30;
const WIDTH_MIN = 10;
const WIDTH_MAX = 60;

// "#" is the stroke and "." the blank; each glyph has 5 lines
const GLYPHS = {
    A: ['.#.', '#.#', '###', '#.#', '#.#'],
    B: ['##.', '#.#', '##.', '#.#', '##.'],
    C: ['.##', '#..', '#..', '#..', '.##'],
    D: ['##.', '#.#', '#.#', '#.#', '##.'],
    E: ['###', '#..', '##.', '#..', '###'],
    F: ['###', '#..', '##.', '#..', '#..'],
    G: ['.##', '#..', '#.#', '#.#', '.##'],
    H: ['#.#', '#.#', '###', '#.#', '#.#'],
    I: ['###', '.#.', '.#.', '.#.', '###'],
    J: ['..#', '..#', '..#', '#.#', '.#.'],
    K: ['#.#', '#.#', '##.', '#.#', '#.#'],
    L: ['#..', '#..', '#..', '#..', '###'],
    M: ['#.#', '###', '###', '#.#', '#.#'],
    N: ['##.', '#.#', '#.#', '#.#', '#.#'],
    O: ['###', '#.#', '#.#', '#.#', '###'],
    P: ['###', '#.#', '###', '#..', '#..'],
    Q: ['###', '#.#', '#.#', '###', '..#'],
    R: ['##.', '#.#', '##.', '#.#', '#.#'],
    S: ['.##', '#..', '.#.', '..#', '##.'],
    T: ['###', '.#.', '.#.', '.#.', '.#.'],
    U: ['#.#', '#.#', '#.#', '#.#', '###'],
    V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
    W: ['#.#', '#.#', '###', '###', '#.#'],
    X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
    Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
    Z: ['###', '..#', '.#.', '#..', '###'],
    0: ['###', '#.#', '#.#', '#.#', '###'],
    1: ['.#.', '##.', '.#.', '.#.', '###'],
    2: ['##.', '..#', '.#.', '#..', '###'],
    3: ['##.', '..#', '.#.', '..#', '##.'],
    4: ['#.#', '#.#', '###', '..#', '..#'],
    5: ['###', '#..', '##.', '..#', '##.'],
    6: ['.##', '#..', '###', '#.#', '###'],
    7: ['###', '..#', '.#.', '.#.', '.#.'],
    8: ['###', '#.#', '###', '#.#', '###'],
    9: ['###', '#.#', '###', '..#', '##.'],
    '!': ['#', '#', '#', '.', '#'],
    '?': ['##.', '..#', '.#.', '...', '.#.'],
    '.': ['.', '.', '.', '.', '#'],
    ',': ['.', '.', '.', '#', '#'],
    ':': ['.', '#', '.', '#', '.'],
    '-': ['...', '...', '###', '...', '...'],
    '+': ['...', '.#.', '###', '.#.', '...'],
    '_': ['...', '...', '...', '...', '###'],
    '/': ['..#', '..#', '.#.', '#..', '#..'],
    ' ': ['..', '..', '..', '..', '..']
};

// Uppercase, without accent; whatever has no glyph is dropped
function textGlyphs(textAlt) {
    return [...String(textAlt).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()]
        .filter(c => GLYPHS[c]);
}

// Width of a glyph sequence, with 1 space column between the letters
const width = (cs) => cs.reduce((n, c, i) => n + (i ? 1 : 0) + GLYPHS[c][0].length, 0);

// The word longer than the line in equal-size pieces (NAZARENO → NAZA / RENO, not NAZAREN / O)
function fromWord(cs, widthAlt) {
    let linesAlt = 1;
    for (let i = 0, used = 0; i < cs.length; i++) {
        const w = GLYPHS[cs[i]][0].length;
        if (used && used + 1 + w > widthAlt) { linesAlt++; used = w; } else used += (used ? 1 : 0) + w;
    }
    const size = Math.ceil(cs.length / linesAlt);
    const pieces = Array.from({ length: linesAlt }, (_, i) => cs.slice(i * size, (i + 1) * size)).filter(p => p.length);
    if (pieces.every(p => width(p) <= widthAlt)) return pieces;

    // Glyphs of very different widths: goes back to filling the line as far as it fits
    const greedy = [[]];
    for (const c of cs) {
        if (greedy.at(-1).length && width([...greedy.at(-1), c]) > widthAlt) greedy.push([]);
        greedy.at(-1).push(c);
    }
    return greedy;
}

/*
 * A line of text into lines of letters that fit `largura`: breaks at spaces, with the word
 * whole on the line below when it does not fit. Only a word longer than the line is broken letter by letter.
 */
function breakInLines(part, widthAlt) {
    const linesAlt = [[]];
    const current = () => linesAlt.at(-1);
    const fits = (extras) => width([...current(), ...extras]) <= widthAlt;

    for (const word of part.split(/\s+/)) {
        const cs = textGlyphs(word);
        if (!cs.length) continue;

        const withSpace = current().length ? [' ', ...cs] : cs;
        if (fits(withSpace)) {
            current().push(...withSpace);
            continue;
        }

        if (current().length) linesAlt.push([]);
        for (const piece of fromWord(cs, widthAlt)) {
            if (current().length) linesAlt.push([]);
            current().push(...piece);
        }
    }
    return linesAlt;
}

/**
 * @param {string} texto
 * @param {object} [o]
 * @param {number} [o.largura]  columns per line of letters
 * @param {string} [o.traco]    the dash character
 * @returns {string} the lines of letters, separated by a blank line
 */
function generateAscii(textAlt, { largura: widthAlt = WIDTH_DEFAULT, traco = '#' } = {}) {
    // "\n" (typed) and a real line break start a new line of letters
    const groups = String(textAlt).split(/\\n|\r?\n/).flatMap(part => breakInLines(part, widthAlt));

    return groups.filter(g => g.length).map(g => Array.from({ length: 5 }, (_, line) =>
        [...g.map(c => GLYPHS[c][line]).join('.')].map(p => (p === '#' ? traco : ' ')).join('').trimEnd()
    ).join('\n')).join('\n\n');
}

async function cmdAscii({ msg, opts, quotedMsg }) {
    const typed = opts.argv.join(' ').trim();
    const textAlt = typed || String(quotedMsg?.body ?? '').trim();
    const usage = t('ascii.usage');

    if (!textAlt) return msg.reply(usage);
    if (textAlt.length > MAX_TEXT) return msg.reply(t('ascii.tooLong', { max: MAX_TEXT }));

    let widthAlt = WIDTH_DEFAULT;
    if (opts.given.has('width')) {
        widthAlt = /^\d+$/.test(opts.opt.width ?? '') ? Number(opts.opt.width) : 0;
        if (widthAlt < WIDTH_MIN || widthAlt > WIDTH_MAX) {
            return msg.reply(t('ascii.width', { min: WIDTH_MIN, max: WIDTH_MAX }));
        }
    }

    let traco = getSetting('ascii.defaultChar');
    if (opts.given.has('char')) {
        const c = opts.opt.char ?? '';
        if ([...c].length !== 1) return msg.reply(t('ascii.char'));
        traco = c;
    }

    const art = generateAscii(textAlt, { largura: widthAlt, traco });
    if (!art) return msg.reply(t('ascii.nothing'));

    return msg.reply(`\`\`\`\n${art}\n\`\`\``);
}

module.exports = { cmdAscii, generateAscii };
