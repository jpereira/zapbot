/*
 * The {/command args} marks of a text (/cron, /alias, /me, /tts): where they are and how to protect them
 * while the rest of the text is read as options. The slash is optional for the commands that exist:
 * {/crypto USD} and {crypto USD} are the same; {name} (not a command) is just text. \{ keeps it literal.
 */

const { findCommand } = require('./commands/base');

const MARK = /(?<!\\)\{([^{}\n]+)\}/g;
const PLACEHOLDER = /(\d+)/g;

/**
 * @param {string} textAlt
 * @returns {{ mark: string, line: string }[]}  mark: as typed ("{crypto USD}"); line: "/crypto USD"
 */
function parseMarks(textAlt) {
    const marks = [];
    for (const m of String(textAlt ?? '').matchAll(MARK)) {
        const inner = m[1].trim();
        if (inner.startsWith('/')) {
            marks.push({ mark: m[0], line: inner });
        } else if (findCommand(`/${inner.split(/\s+/, 1)[0].toLowerCase()}`)) {
            marks.push({ mark: m[0], line: `/${inner}` });
        }
    }
    return marks;
}

/**
 * The text with each mark swapped for a placeholder, so the options parser and the strippers do not
 * see what is inside the braces ("{/crypto -s}" is not the /tts -s). `restore` puts them back.
 * @returns {{ masked: string, marks: { mark: string, line: string }[], restore: (s: string) => string }}
 */
function maskMarks(textAlt) {
    const marks = parseMarks(textAlt);
    let masked = String(textAlt ?? '');
    marks.forEach((m, i) => { masked = masked.replace(m.mark, `${i}`); });
    return { masked, marks, restore: (s) => String(s).replace(PLACEHOLDER, (_, i) => marks[Number(i)]?.mark ?? '') };
}

module.exports = { maskMarks, parseMarks };
