/*
 * /ascii: the text in big ASCII letters, inside a code block (monospaced in the
 * WhatsApp). The letters are 3 columns wide and 5 lines tall, and the text wraps in
 * several lines of letters to fit the phone screen (30 columns by default).
 */
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

/**
 * @param {string} texto
 * @param {object} [o]
 * @param {number} [o.largura]  columns per line of letters
 * @param {string} [o.traco]    the dash character
 * @returns {string} the lines of letters, separated by a blank line
 */
function generateAscii(textAlt, { largura: widthAlt = WIDTH_DEFAULT, traco = '#' } = {}) {
    const groups = [[]];
    let used = 0;

    for (const c of textGlyphs(textAlt)) {
        const w = GLYPHS[c][0].length;
        if (used && used + 1 + w > widthAlt) {
            groups.push([]);
            used = 0;
        }
        if (c === ' ' && !groups.at(-1).length) continue; // a space at the start of the line does not count
        used += (groups.at(-1).length ? 1 : 0) + w;
        groups.at(-1).push(c);
    }

    return groups.filter(g => g.length).map(g => Array.from({ length: 5 }, (_, line) =>
        [...g.map(c => GLYPHS[c][line]).join('.')].map(p => (p === '#' ? traco : ' ')).join('').trimEnd()
    ).join('\n')).join('\n\n');
}

async function cmdAscii({ msg, opts, quotedMsg }) {
    const typed = opts.argv.join(' ').trim();
    const textAlt = typed || String(quotedMsg?.body ?? '').trim();
    const usage = '❌ Use: /ascii [-width|-w <colunas>] [-char|-c <caractere>] <texto>';

    if (!textAlt) return msg.reply(usage);
    if (textAlt.length > MAX_TEXT) return msg.reply(`❌ O texto tem no máximo ${MAX_TEXT} caracteres.`);

    let widthAlt = WIDTH_DEFAULT;
    if (opts.given.has('width')) {
        widthAlt = /^\d+$/.test(opts.opt.width ?? '') ? Number(opts.opt.width) : 0;
        if (widthAlt < WIDTH_MIN || widthAlt > WIDTH_MAX) {
            return msg.reply(`❌ -width precisa de um número de ${WIDTH_MIN} a ${WIDTH_MAX}`);
        }
    }

    let traco = '#';
    if (opts.given.has('char')) {
        const c = opts.opt.char ?? '';
        if ([...c].length !== 1) return msg.reply('❌ -char precisa de um único caractere, ex: -char @');
        traco = c;
    }

    const art = generateAscii(textAlt, { largura: widthAlt, traco });
    if (!art) return msg.reply('❌ Nada para desenhar: use letras, números ou ! ? . , : - + _ /');

    return msg.reply(`\`\`\`\n${art}\n\`\`\``);
}

module.exports = { cmdAscii, generateAscii };
