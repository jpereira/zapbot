/*
 * /ascii: o texto em letras grandes de ASCII, dentro de um bloco de código (monoespaçado no
 * WhatsApp). As letras têm 3 colunas de largura e 5 linhas de altura, e o texto quebra em
 * várias linhas de letras para caber na tela do celular (30 colunas por padrão).
 */
const { getSetting } = require('../settings');

const MAX_TEXTO = 40;
const LARGURA_PADRAO = 30;
const LARGURA_MIN = 10;
const LARGURA_MAX = 60;

// "#" é o traço e "." o vazio; cada glifo tem 5 linhas
const GLIFOS = {
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

// Maiúscula, sem acento; o que não tem glifo sai
function glifosDoTexto(texto) {
    return [...String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()]
        .filter(c => GLIFOS[c]);
}

/**
 * @param {string} texto
 * @param {object} [o]
 * @param {number} [o.largura]  colunas por linha de letras
 * @param {string} [o.traco]    o caractere do traço
 * @returns {string} as linhas de letras, separadas por uma linha em branco
 */
function gerarAscii(texto, { largura = LARGURA_PADRAO, traco = '#' } = {}) {
    const grupos = [[]];
    let usado = 0;

    for (const c of glifosDoTexto(texto)) {
        const w = GLIFOS[c][0].length;
        if (usado && usado + 1 + w > largura) {
            grupos.push([]);
            usado = 0;
        }
        if (c === ' ' && !grupos.at(-1).length) continue; // espaço no começo da linha não conta
        usado += (grupos.at(-1).length ? 1 : 0) + w;
        grupos.at(-1).push(c);
    }

    return grupos.filter(g => g.length).map(g => Array.from({ length: 5 }, (_, linha) =>
        [...g.map(c => GLIFOS[c][linha]).join('.')].map(p => (p === '#' ? traco : ' ')).join('').trimEnd()
    ).join('\n')).join('\n\n');
}

async function cmdAscii({ msg, opts, quotedMsg }) {
    const digitado = opts.argv.join(' ').trim();
    const texto = digitado || String(quotedMsg?.body ?? '').trim();
    const uso = '❌ Use: /ascii [-width|-w <colunas>] [-char|-c <caractere>] <texto>';

    if (!texto) return msg.reply(uso);
    if (texto.length > MAX_TEXTO) return msg.reply(`❌ O texto tem no máximo ${MAX_TEXTO} caracteres.`);

    let largura = LARGURA_PADRAO;
    if (opts.given.has('width')) {
        largura = /^\d+$/.test(opts.opt.width ?? '') ? Number(opts.opt.width) : 0;
        if (largura < LARGURA_MIN || largura > LARGURA_MAX) {
            return msg.reply(`❌ -width precisa de um número de ${LARGURA_MIN} a ${LARGURA_MAX}`);
        }
    }

    let traco = getSetting('ascii.defaultChar');
    if (opts.given.has('char')) {
        const c = opts.opt.char ?? '';
        if ([...c].length !== 1) return msg.reply('❌ -char precisa de um único caractere, ex: -char @');
        traco = c;
    }

    const arte = gerarAscii(texto, { largura, traco });
    if (!arte) return msg.reply('❌ Nada para desenhar: use letras, números ou ! ? . , : - + _ /');

    return msg.reply(`\`\`\`\n${arte}\n\`\`\``);
}

module.exports = { cmdAscii, gerarAscii };
