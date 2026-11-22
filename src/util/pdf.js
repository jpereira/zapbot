/*
 * Simple PDF, no dependencies: A4, Helvetica (the PDF base font), text with line wrapping,
 * pagination and header/footer on all pages and JPEG (RGB) images. Latin-1 only: emojis and whatever
 * does not fit, they leave.
 */

const { t } = require('../i18n');

const WIDTH = 595;
const HEIGHT = 842;
const MARGIN = 50;
const TOP_BODY = HEIGHT - 80;
const BASE_BODY = 70;
const IMAGE_MAX_L = 300;  // the image fits in a 300 x 260 point box
const IMAGE_MAX_A = 260;

// Helvetica widths (1/1000 em) of the ASCII characters 32..126
const WIDTHS = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
];
const BOLD = 1.06;  // Helvetica-Bold is a bit wider: spare for safety

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


/*
 * Hand-drawn icons (Helvetica has no emoji): each one is a function (x, y, t) → commands
 * of the PDF, in a square of side t with the bottom-left corner at (x, y).
 */
const circle = (cx, cy, r) => {
    const k = 0.5523 * r;
    const f = (n) => n.toFixed(2);
    return `${f(cx + r)} ${f(cy)} m ${f(cx + r)} ${f(cy + k)} ${f(cx + k)} ${f(cy + r)} ${f(cx)} ${f(cy + r)} c ` +
        `${f(cx - k)} ${f(cy + r)} ${f(cx - r)} ${f(cy + k)} ${f(cx - r)} ${f(cy)} c ` +
        `${f(cx - r)} ${f(cy - k)} ${f(cx - k)} ${f(cy - r)} ${f(cx)} ${f(cy - r)} c ` +
        `${f(cx + k)} ${f(cy - r)} ${f(cx + r)} ${f(cy - k)} ${f(cx + r)} ${f(cy)} c h `;
};

const ICONS = {
    // 🔗 two interlocked rings
    link: (x, y, t) => `q 0.15 0.4 0.8 RG ${(t * 0.14).toFixed(2)} w ${circle(x + t * 0.34, y + t * 0.5, t * 0.22)}S ` +
        `${circle(x + t * 0.66, y + t * 0.5, t * 0.22)}S Q\n`,
    // 🏷️ yellow tag with a hole
    tag: (x, y, t) => `q 0.96 0.65 0.12 rg ${x + t * 0.05} ${y + t * 0.15} m ${x + t * 0.6} ${y + t * 0.15} l ` +
        `${x + t} ${y + t * 0.5} l ${x + t * 0.6} ${y + t * 0.85} l ${x + t * 0.05} ${y + t * 0.85} l h f ` +
        `1 g ${circle(x + t * 0.25, y + t * 0.5, t * 0.08)}f Q\n`,
    // 🕐 clock
    clock: (x, y, t) => `q 0.35 0.35 0.35 RG 1 g ${(t * 0.09).toFixed(2)} w ${circle(x + t / 2, y + t / 2, t * 0.42)}B ` +
        `${x + t / 2} ${y + t / 2} m ${x + t / 2} ${y + t * 0.78} l S ${x + t / 2} ${y + t / 2} m ${x + t * 0.72} ${y + t / 2} l S Q\n`,
    // 📝 sheet with lines
    note: (x, y, t) => `q 0.45 0.45 0.45 RG 1 g ${(t * 0.07).toFixed(2)} w ${x + t * 0.15} ${y + t * 0.05} ${t * 0.7} ${t * 0.9} re B ` +
        `0.2 0.45 0.75 RG ${[0.3, 0.5, 0.7].map(h => `${x + t * 0.28} ${y + t * h} m ${x + t * 0.72} ${y + t * h} l S `).join('')}Q\n`
};

function width(textAlt, size, bold = false) {
    let w = 0;
    for (const c of textAlt) {
        const base = c.normalize('NFD')[0];
        const cod = base.charCodeAt(0);
        w += cod >= 32 && cod <= 126 ? WIDTHS[cod - 32] : 556;
    }
    return (w * size * (bold ? BOLD : 1)) / 1000;
}

// Breaks a paragraph into the words that fit `max` points (a huge word is cut)
function lineBreak(paragraph, size, max, bold = false) {
    const linesAlt = [];
    let current = '';

    for (let word of paragraph.split(' ')) {
        while (width(word, size, bold) > max) {
            let n = word.length;
            while (n > 1 && width(word.slice(0, n), size, bold) > max) n--;
            if (current) linesAlt.push(current);
            linesAlt.push(word.slice(0, n));
            current = '';
            word = word.slice(n);
        }
        const test = current ? `${current} ${word}` : word;
        if (current && width(test, size, bold) > max) {
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
 * @param {string}   o.title     header, on the left
 * @param {string}   o.right    header, on the right (date/time)
 * @param {string}   o.footer     footer, on the left ("Página X de Y" goes on the right)
 * @param {object[]} o.blocks     { text, type: 'title' | 'text' | 'bold' | 'meta' | 'space', icon?: 'link' | 'tag' | 'clock' | 'note' } or
 * { type: 'image', jpeg: Buffer, width, height } (RGB JPEG, in pixels)
 * @returns {Buffer}
 */
function generatePdf({ title, right = '', footer = '', blocks }) {
    const STYLES = {
        title: { source: 'F2', size: 13, between: 18, before: 14, color: '0.1 0.3 0.5' },
        text: { source: 'F1', size: 10.5, between: 14, before: 0, color: '0 0 0' },
        bold: { source: 'F2', size: 10.5, between: 14, before: 0, color: '0 0 0' },
        meta: { source: 'F1', size: 8.5, between: 11, before: 0, color: '0.45 0.45 0.45' }
    };
    const pages = [[]];
    let y = TOP_BODY;

    const imageHeight = (b) => b.height * Math.min(1, IMAGE_MAX_L / b.width, IMAGE_MAX_A / b.height);

    for (const [indexAlt, b] of blocks.entries()) {
        if (b.type === 'space') {
            y -= b.height ?? 8;
            continue;
        }
        if (b.type === 'image') {
            const scale = Math.min(1, IMAGE_MAX_L / b.width, IMAGE_MAX_A / b.height);
            const [w, h] = [b.width * scale, b.height * scale];
            if (y - h < BASE_BODY && y !== TOP_BODY) {
                pages.push([]);
                y = TOP_BODY;
            }
            y -= h;
            pages.at(-1).push({ image: b, x: MARGIN, y, w, h });
            y -= 6;
            continue;
        }
        const e = STYLES[b.type ?? 'text'];
        const indent = b.indent ?? 0;
        const linesAlt = clean(b.text).split('\n')
            .flatMap(p => lineBreak(p, e.size, WIDTH - 2 * MARGIN - indent - (b.icon && ICONS[b.icon] ? e.size + 3 : 0), e.source === 'F2'));

        const shift = b.icon && ICONS[b.icon] ? e.size + 3 : 0;
        y -= e.before;
        // A title is never left alone at the end of the page (nor the text before an image)
        const image = blocks[indexAlt + 1]?.type === 'image' ? imageHeight(blocks[indexAlt + 1]) + 6 : 0;
        if (y - e.between * (b.type === 'title' ? 3 : 1) - image < BASE_BODY && y !== TOP_BODY) {
            pages.push([]);
            y = TOP_BODY;
        }
        for (const [i, line] of linesAlt.entries()) {
            if (y - e.between < BASE_BODY) {
                pages.push([]);
                y = TOP_BODY;
            }
            y -= e.between;
            // The icon only on the first line of the block; the text always aligned after it
            if (i === 0 && shift) pages.at(-1).push({ icon: b.icon, size: e.size, x: MARGIN + indent, y: y - 1.5 });
            if (line) pages.at(-1).push({ ...e, x: MARGIN + indent + shift, y, text: line });
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

    // Each image becomes a single object, even if the page cites it
    for (const it of pages.flat().filter(x => x.image)) {
        const b = it.image;
        b.object ??= freshAlt(`<< /Type /XObject /Subtype /Image /Width ${b.width} /Height ${b.height} ` +
            `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${b.jpeg.length} >>\n` +
            `stream\n${b.jpeg.toString('latin1')}\nendstream`);
    }

    const textAlt = (sourceAlt, tam, color, x, y, t) =>
        `BT /${sourceAlt} ${tam} Tf ${color} rg ${x.toFixed(2)} ${y.toFixed(2)} Td (${escape(t)}) Tj ET\n`;
    const lineHorizontal = (y) => `0.7 0.7 0.7 RG 0.5 w ${MARGIN} ${y} m ${WIDTH - MARGIN} ${y} l S\n`;
    const children = [];

    pages.forEach((items, i) => {
        let c = textAlt('F2', 11, '0.1 0.3 0.5', MARGIN, HEIGHT - 45, cab);
        c += textAlt('F1', 9, '0.4 0.4 0.4', WIDTH - MARGIN - width(dir, 9), HEIGHT - 45, dir);
        c += lineHorizontal(HEIGHT - 55);
        for (const it of items) {
            if (it.icon) c += ICONS[it.icon](it.x, it.y, it.size);
            else if (it.image) c += `q ${it.w.toFixed(2)} 0 0 ${it.h.toFixed(2)} ${it.x} ${it.y.toFixed(2)} cm /Im${it.image.object} Do Q\n`;
            else c += textAlt(it.source, it.size, it.color, it.x, it.y, it.text);
        }
        c += lineHorizontal(52);
        const pageLabel = t('pdf.pagina', { n: i + 1, total });
        c += textAlt('F1', 8, '0.4 0.4 0.4', MARGIN, 38, rod);
        c += textAlt('F1', 8, '0.4 0.4 0.4', WIDTH - MARGIN - width(pageLabel, 8), 38, pageLabel);

        const bytes = Buffer.from(c, 'latin1');
        const content = freshAlt(`<< /Length ${bytes.length} >>\nstream\n${bytes.toString('latin1')}endstream`);
        const used = [...new Set(items.filter(x => x.image).map(x => x.image.object))];
        const images = used.length ? ` /XObject << ${used.map(o => `/Im${o} ${o} 0 R`).join(' ')} >>` : '';
        const page = freshAlt(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${WIDTH} ${HEIGHT}] ` +
            `/Resources << /Font << /F1 3 0 R /F2 4 0 R >>${images} >> /Contents ${content} 0 R >>`);
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
