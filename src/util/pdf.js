/*
 * Simple PDF, no dependencies: A4, Helvetica (the PDF base font), text with line wrapping,
 * pagination and header/footer on all pages. Latin-1 only: emojis and whatever does not fit leave.
 */

const WIDTH = 595;
const HEIGHT = 842;
const MARGIN = 50;
const TOP_BODY = HEIGHT - 80;
const BASE_BODY = 70;

// Helvetica widths (1/1000 em) of the ASCII characters 32..126
const WIDTHS = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
];
const NEGRITO = 1.06;  // Helvetica-Bold is a bit wider: spare for safety

const SWAPS = { '“': '"', '”': '"', '‘': "'", '’': "'", '–': '-', '—': '-', '…': '...', '•': '\x95', '\t': '    ' };

// Text → only characters that WinAnsi has (Latin-1); emojis and the like disappear
function clean(textAlt) {
    return String(textAlt ?? '')
        .replace(/[“”‘’–—…•\t]/g, c => SWAPS[c])
        .replace(/\r/g, '')
        .replace(/‍|️|⃣/g, '')
        .replace(/[^\n\x20-\x7e\x95\xa0-\xff]/gu, '')
        .replace(/ +\n/g, '\n');
}

function width(textAlt, size, negrito = false) {
    let w = 0;
    for (const c of textAlt) {
        const base = c.normalize('NFD')[0];
        const cod = base.charCodeAt(0);
        w += cod >= 32 && cod <= 126 ? WIDTHS[cod - 32] : 556;
    }
    return (w * size * (negrito ? NEGRITO : 1)) / 1000;
}

// Breaks a paragraph into the words that fit `max` points (a huge word is cut)
function lineBreak(paragraph, size, max, negrito = false) {
    const linesAlt = [];
    let current = '';

    for (let word of paragraph.split(' ')) {
        while (width(word, size, negrito) > max) {
            let n = word.length;
            while (n > 1 && width(word.slice(0, n), size, negrito) > max) n--;
            if (current) linesAlt.push(current);
            linesAlt.push(word.slice(0, n));
            current = '';
            word = word.slice(n);
        }
        const test = current ? `${current} ${word}` : word;
        if (current && width(test, size, negrito) > max) {
            linesAlt.push(current);
            current = word;
        } else {
            current = test;
        }
    }
    linesAlt.push(current);
    return linesAlt;
}

const escape = (t) => t.replace(/[\\()]/g, '\\$&');

/*
 * @param {object}   o
 * @param {string}   o.titulo     header, on the left
 * @param {string}   o.direita    header, on the right (date/time)
 * @param {string}   o.rodape     footer, on the left ("Página X de Y" goes on the right)
 * @param {object[]} o.blocos     { texto, tipo: 'titulo' | 'texto' | 'meta' | 'espaco' }
 * @returns {Buffer}
 */
function generatePdf({ titulo: title, direita: right = '', rodape: footer = '', blocos: blocks }) {
    const STYLES = {
        titulo: { fonte: 'F2', tamanho: 13, entre: 18, antes: 14, cor: '0.1 0.3 0.5' },
        texto: { fonte: 'F1', tamanho: 10.5, entre: 14, antes: 0, cor: '0 0 0' },
        meta: { fonte: 'F1', tamanho: 8.5, entre: 11, antes: 0, cor: '0.45 0.45 0.45' }
    };
    const pages = [[]];
    let y = TOP_BODY;

    for (const b of blocks) {
        if (b.tipo === 'espaco') {
            y -= b.altura ?? 8;
            continue;
        }
        const e = STYLES[b.tipo ?? 'texto'];
        const indent = b.recuo ?? 0;
        const linesAlt = clean(b.texto).split('\n')
            .flatMap(p => lineBreak(p, e.tamanho, WIDTH - 2 * MARGIN - indent, e.fonte === 'F2'));

        y -= e.antes;
        // A title is never left alone at the end of the page
        if (y - e.entre * (b.tipo === 'titulo' ? 3 : 1) < BASE_BODY && y !== TOP_BODY) {
            pages.push([]);
            y = TOP_BODY;
        }
        for (const line of linesAlt) {
            if (y - e.entre < BASE_BODY) {
                pages.push([]);
                y = TOP_BODY;
            }
            y -= e.entre;
            if (line) pages.at(-1).push({ ...e, x: MARGIN + indent, y, texto: line });
        }
    }

    const total = pages.length;
    const cab = clean(title);
    const dir = clean(right);
    const rod = clean(footer);

    const objects = [];  // 1-indexed by the object number
    const freshAlt = (content) => objects.push(content);
    freshAlt('<< /Type /Catalog /Pages 2 0 R >>');
    freshAlt(null);  // /Pages, preenchido abaixo
    freshAlt('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    freshAlt('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

    const textAlt = (sourceAlt, tam, cor, x, y, t) =>
        `BT /${sourceAlt} ${tam} Tf ${cor} rg ${x.toFixed(2)} ${y.toFixed(2)} Td (${escape(t)}) Tj ET\n`;
    const lineHorizontal = (y) => `0.7 0.7 0.7 RG 0.5 w ${MARGIN} ${y} m ${WIDTH - MARGIN} ${y} l S\n`;
    const children = [];

    pages.forEach((items, i) => {
        let c = textAlt('F2', 11, '0.1 0.3 0.5', MARGIN, HEIGHT - 45, cab);
        c += textAlt('F1', 9, '0.4 0.4 0.4', WIDTH - MARGIN - width(dir, 9), HEIGHT - 45, dir);
        c += lineHorizontal(HEIGHT - 55);
        for (const it of items) c += textAlt(it.fonte, it.tamanho, it.cor, it.x, it.y, it.texto);
        c += lineHorizontal(52);
        const pag = `Página ${i + 1} de ${total}`;
        c += textAlt('F1', 8, '0.4 0.4 0.4', MARGIN, 38, rod);
        c += textAlt('F1', 8, '0.4 0.4 0.4', WIDTH - MARGIN - width(pag, 8), 38, pag);

        const bytes = Buffer.from(c, 'latin1');
        const content = freshAlt(`<< /Length ${bytes.length} >>\nstream\n${bytes.toString('latin1')}endstream`);
        const page = freshAlt(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${WIDTH} ${HEIGHT}] ` +
            `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${content} 0 R >>`);
        children.push(`${page} 0 R`);
    });
    objects[1] = `<< /Type /Pages /Kids [${children.join(' ')}] /Count ${total} >>`;

    let pdf = '%PDF-1.4\n';
    const offsets = [];
    objects.forEach((o, i) => {
        offsets.push(Buffer.byteLength(pdf, 'latin1'));
        pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xref = Buffer.byteLength(pdf, 'latin1');
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
        offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
        `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(pdf, 'latin1');
}

module.exports = { generatePdf };
