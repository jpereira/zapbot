/*
 * /carbon: the code in an "editor window" image, drawn in SVG and converted to PNG by sharp
 * (no external service). The highlighting is simple: comments, strings, numbers and keywords.
 */

const sharp = require('sharp');

const THEMES = {
    dark: {
        background: '#7c5cff', window: '#1e1e2e', bar: '#181825', text: '#cdd6f4',
        comment: '#6c7086', text_str: '#a6e3a1', number: '#fab387', word: '#cba6f7'
    },
    light: {
        background: '#ffb86b', window: '#fafafa', bar: '#ececec', text: '#383a42',
        comment: '#a0a1a7', text_str: '#50a14f', number: '#b76b01', word: '#a626a4'
    }
};

const SOURCE = 14;
const WIDTH_CHAR = SOURCE * 0.6; // monospaced font
const HEIGHT_LINE = 22;
const MARGIN = 32;         // between a image e a window
const FILLING = 24;  // inside the window
const BAR = 40;
const MAX_LINES = 60;
const MAX_COLUMNS = 120;

const WORDS = new Set((
    'abstract as async await break case catch class const continue def default defer do elif else enum except ' +
    'export extends false fi finally fn for from func function if impl import in interface lambda let loop match ' +
    'new nil none null package private public pub pass raise return self static struct switch then this throw ' +
    'true try type use var void while with yield'
).split(' '));

const TOKEN = /(\/\/.*|(?:^|\s)#.*|\/\*.*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_]\w*)\b/g;

const escape = (s) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * The code without the Markdown fence (```lang ... ```), with tabs as 4 spaces and within limits.
 * @returns {string[]} the lines
 */
function codeLines(codeAlt) {
    const cleanAlt = String(codeAlt).replace(/^\s*```[\w+-]*\n?/, '').replace(/\n?```\s*$/, '').replace(/\t/g, '    ');
    return cleanAlt.replace(/\s+$/, '').split('\n').slice(0, MAX_LINES).map(l => l.replace(/\s+$/, '').slice(0, MAX_COLUMNS));
}

// The colored <tspan>s of a line
function highlight(line, theme) {
    let outputAlt = '';
    let last = 0;
    for (const m of line.matchAll(TOKEN)) {
        outputAlt += escape(line.slice(last, m.index));
        last = m.index + m[0].length;

        const [integer, comment, textAlt, numberAlt, word] = m;
        if (comment) outputAlt += `<tspan fill="${theme.comment}">${escape(integer)}</tspan>`;
        else if (textAlt) outputAlt += `<tspan fill="${theme.text_str}">${escape(integer)}</tspan>`;
        else if (numberAlt) outputAlt += `<tspan fill="${theme.number}">${escape(integer)}</tspan>`;
        else if (WORDS.has(word)) outputAlt += `<tspan fill="${theme.word}">${escape(integer)}</tspan>`;
        else outputAlt += escape(integer);
    }
    return outputAlt + escape(line.slice(last));
}

/**
 * @param {string} code
 * @param {'dark'|'light'} [theme]
 * @returns {string}  o SVG
 */
function assembleSvg(codeAlt, theme = 'dark') {
    const colors = THEMES[theme] ?? THEMES.dark;
    const linesAlt = codeLines(codeAlt);
    const columns = Math.max(20, ...linesAlt.map(l => l.length));
    const widthWindow = Math.ceil(columns * WIDTH_CHAR + 2 * FILLING);
    const heightWindow = BAR + linesAlt.length * HEIGHT_LINE + 2 * FILLING;
    const widthAlt = widthWindow + 2 * MARGIN;
    const heightAlt = heightWindow + 2 * MARGIN;

    const textAlt = linesAlt.map((l, i) =>
        `<text x="${MARGIN + FILLING}" y="${MARGIN + BAR + FILLING + i * HEIGHT_LINE + SOURCE}" ` +
        `xml:space="preserve">${highlight(l, colors)}</text>`).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthAlt}" height="${heightAlt}" viewBox="0 0 ${widthAlt} ${heightAlt}">` +
        `<rect width="${widthAlt}" height="${heightAlt}" fill="${colors.background}"/>` +
        `<rect x="${MARGIN}" y="${MARGIN}" width="${widthWindow}" height="${heightWindow}" rx="10" fill="${colors.window}"/>` +
        `<path d="M${MARGIN} ${MARGIN + BAR}V${MARGIN + 10}a10 10 0 0 1 10-10H${MARGIN + widthWindow - 10}a10 10 0 0 1 10 10V${MARGIN + BAR}z" fill="${colors.bar}"/>` +
        ['#ff5f56', '#ffbd2e', '#27c93f'].map((c, i) =>
            `<circle cx="${MARGIN + 22 + i * 20}" cy="${MARGIN + BAR / 2}" r="6" fill="${c}"/>`).join('') +
        `<g font-family="FreeMono, DejaVu Sans Mono, Menlo, Consolas, monospace" font-size="${SOURCE}" fill="${colors.text}">${textAlt}</g>` +
        '</svg>';
}

/** @returns {Promise<Buffer>}  the PNG (at 2x, sharp on the phone) */
const generateImage = (codeAlt, theme) => sharp(Buffer.from(assembleSvg(codeAlt, theme)), { density: 192 }).png().toBuffer();

module.exports = { MAX_COLUMNS, MAX_LINES, THEMES, generateImage, codeLines, assembleSvg };
