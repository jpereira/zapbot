/*
 * From the Markdown that ChatGPT writes to WhatsApp formatting.
 *
 * WhatsApp understands *bold*, _italic_, ~strikethrough~, `code`, blocks between ``` , lists with "- " or
 * "1. " and quotes with "> ". It does not understand headings (#), **double bold**, tables, "---" lines or
 * [links](url): show up as loose symbols. Tables become an aligned code block (it is the only
 * way to keep the columns), and what is inside a code block stays as it is.
 */

const ABOUT = /(```[\s\S]*?```)/g;

// Width on screen: an emoji counts as one letter (WhatsApp's monospace draws it wider, but that is the best we can do)
const widthAlt = (textAlt) => Array.from(textAlt).length;

// "**Nome**" or "`x`" inside a table cell: without the markup, which does not render there
const cellClean = (textAlt) => textAlt.replace(/\*\*|__|`/g, '').trim();

const isSeparator = (cells) => cells.length > 0 && cells.every(c => /^:?-+:?$/.test(c));

// A Markdown table (the lines that start with "|") → the aligned code block
function tableInCode(linesAlt) {
    const tableLines = linesAlt.map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
    const dataAlt = tableLines.filter(c => !isSeparator(c)).map(c => c.map(cellClean));
    const columns = Math.max(...dataAlt.map(c => c.length));
    const widths = Array.from({ length: columns }, (_, i) => Math.max(...dataAlt.map(c => widthAlt(c[i] ?? ''))));
    const line = (cel) => cel.map((c, i) => c + ' '.repeat(widths[i] - widthAlt(c))).join('  ').trimEnd();

    const [header, ...rest] = dataAlt;
    const dash = widths.map(n => '-'.repeat(n)).join('  ');
    return '```\n' + [line(header), dash, ...rest.map(line)].join('\n') + '\n```';
}

// The text's tables (outside code blocks) become code blocks
function tables(prose) {
    const linesAlt = prose.split('\n');
    const outputAlt = [];
    for (let i = 0; i < linesAlt.length;) {
        if (/^\s*\|.*\|\s*$/.test(linesAlt[i])) {
            const start = i;
            while (i < linesAlt.length && /^\s*\|.*\|\s*$/.test(linesAlt[i])) i++;
            outputAlt.push(tableInCode(linesAlt.slice(start, i)));
        } else {
            outputAlt.push(linesAlt[i++]);
        }
    }
    return outputAlt.join('\n');
}

// The running text: headings, bold, strikethrough, links, lists and lines
function prose(textAlt) {
    return textAlt
        // Title: becomes a bold line
        .replace(/^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/gm, (_, t) => `*${t.replace(/\*\*|__/g, '').replace(/\*/g, '')}*`)
        // "---", "***" and "___" alone on the line
        .replace(/^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$/gm, '')
        // Lists with "*" and "+" become "-" (before bold, so "* item" is not taken for it); the "•" already works
        .replace(/^([ \t]*)[*+][ \t]+/gm, '$1- ')
        // Bold and italic: ***x*** → *_x_*; **x** and __x__ → *x*; ~~x~~ → ~x~
        .replace(/\*\*\*(.+?)\*\*\*/g, '*_$1_*')
        .replace(/\*\*(.+?)\*\*/g, '*$1*')
        .replace(/__(.+?)__/g, '*$1*')
        .replace(/~~(.+?)~~/g, '~$1~')
        // An image becomes the address; a link becomes "text (address)"
        .replace(/!\[[^\]]*\]\((\S+?)\)/g, '$1')
        .replace(/\[([^\]]+)\]\((\S+?)\)/g, (_, label, url) => (label === url ? url : `${label} (${url})`))
        // Markdown line break (two spaces at the end) and too many blank lines
        .replace(/[ \t]+$/gm, '')
        .replace(/\n{3,}/g, '\n\n');
}

/**
 * @param {string} text  Markdown
 * @returns {string}  the same text in WhatsApp formatting
 */
function paraWhatsapp(textAlt) {
    // 1st the tables (they become code blocks); 2nd the rest, without touching inside the blocks
    const withTables = String(textAlt ?? '').split(ABOUT)
        .map((part, i) => (i % 2 ? part : tables(part))).join('');

    return withTables.split(ABOUT)
        // The code block without the language name (```text): on WhatsApp it would show up in the text
        .map((part, i) => (i % 2 ? part.replace(/^```[^\n`]*\n/, '```\n') : prose(part)))
        .join('')
        .trim();
}

module.exports = {
    paraWhatsapp
};
