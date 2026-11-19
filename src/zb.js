/*
 * .zb files (ZapBot): the commands you would type in WhatsApp, saved in a file. They are in examples/ and
 * the bot loads each one once, on the first boot after it appears (the alias.examples setting keeps which ones
 * were loaded: an alias you removed does not come back). /alias -examples lists them, shows what one creates and, with -yes, loads it by hand.
 *
 * Format:
 *   # a comment: a line that starts with # (after spaces) is left out; \# at the start is a literal #
 *   /alias /dollar /stocks ${1:-USD}      a command starts at a line that begins with / (no indentation)
 *       /tts ...                          any other line belongs to the command above, as typed
 *                                         (a blank line between two of them stays: a /me with paragraphs)
 *   /alias /x /notes a very long \        a \ at the end of the line joins the next line (with one space)
 *       text
 *
 * A "# @manual" comment in the first lines: the file is not loaded on the boot, only with /alias -examples <name>.
 * Only the registration form runs: /alias [-q] <name> [-desc "text"] <command or text>. The options of /alias
 * that act on other aliases (-rm, -move...) are refused, a file is limited in size and blocks, and a symlink
 * is not read: a .zb is trusted code (read it before adding one), but it cannot do more than define shortcuts.
 */

const fs = require('fs');
const path = require('path');

const { dbGet, dbReady } = require('./db');
const { printError, printInfo } = require('./log');
const { getSetting, setSetting } = require('./settings');

// (read at each call: the tests point it to another folder)
const examplesDir = () => process.env.ZAPBOT_EXAMPLES_DIR || path.join(__dirname, '..', 'examples');

/**
 * The text of a .zb file as a list of commands (one string each, indented lines kept with \n).
 * @param {string} text
 * @returns {string[]}
 */
function parseZb(text) {
    // The \ at the end joins the next line; a comment line inside the join is dropped before
    const logical = [];
    let pending = null;
    for (const raw of String(text).replace(/\r\n?/g, '\n').split('\n')) {
        if (raw.trim().startsWith('#')) continue;
        const line = raw.replace(/^(\s*)\\#/, '$1#');
        if (pending !== null) {
            const joined = `${pending} ${line.trim()}`;
            if (/\\\s*$/.test(line)) pending = joined.replace(/\\\s*$/, '').trimEnd();
            else { logical.push(joined); pending = null; }
            continue;
        }
        if (/\\\s*$/.test(line)) pending = line.replace(/\\\s*$/, '').trimEnd();
        else logical.push(line);
    }
    if (pending !== null) logical.push(pending);

    // A blank line inside a block stays (the text of a /me with a paragraph); at the end of the block it goes away
    const blocks = [];
    let blanks = 0;
    for (const line of logical) {
        if (!line.trim()) { blanks++; continue; }
        if (/^\//.test(line)) blocks.push(line.trimEnd());
        else if (blocks.length) blocks[blocks.length - 1] += `${'\n'.repeat(blanks + 1)}${line.trimEnd()}`;
        blanks = 0;
    }
    return blocks;
}

const MAX_FILE_BYTES = 128 * 1024;
const MAX_BLOCKS = 200;
const MAX_BLOCK_CHARS = 8000;
const FILE_NAME = /^[a-z0-9][a-z0-9._-]*\.zb$/i;

// A name from a file, safe to log and to show in a reply (no control characters, no ANSI escape, short)
// eslint-disable-next-line no-control-regex
const safe = (text) => String(text).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

/**
 * The name an "/alias [-q] <name> [-desc "text"] <rest>" block registers, or null when the block is anything else:
 * the name cannot look like an option (/alias -rm all, -move, -list...), and before the command only -q, -p and -desc are allowed.
 */
function aliasNameOf(block) {
    const m = block.match(/^\/alias[ \t]+((?:-(?:q|quiet|p|private)[ \t]+)*)(\/?[\p{L}\p{N}_.][\p{L}\p{N}_.-]*)[ \t]+(\S[\s\S]*)$/u);
    if (!m) return null;
    let rest = m[3];
    for (let o; (o = rest.match(/^(?:-(?:q|quiet|p|private)(?=\s)|-(?:d|desc)\s+(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|“[^”]*”|‘[^’]*’))\s*/));) rest = rest.slice(o[0].length);
    if (!rest || /^-/.test(rest)) return null;
    return `/${m[2].replace(/^\//, '')}`;
}

// "# @manual" in the comments at the top: the file waits for /alias -examples <name> instead of loading on the boot
function isManual(file) {
    const head = fs.readFileSync(file, 'utf8').split('\n').slice(0, 12);
    return head.some(l => /^#\s*@manual\b/.test(l.trim()));
}

// A regular file inside the folder: a symlink (to a secret, to /dev/zero...) or a huge file is not read
function readable(file) {
    const stat = fs.lstatSync(file);
    return stat.isFile() && !stat.isSymbolicLink() && stat.size <= MAX_FILE_BYTES;
}

/** The example files: [{ name: 'tts-voices', file, manual }] in alphabetical order. */
function listExampleFiles() {
    const dir = examplesDir();
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => FILE_NAME.test(f) && readable(path.join(dir, f))).sort()
        .map(f => ({ name: f.slice(0, -3), file: path.join(dir, f), manual: isManual(path.join(dir, f)) }));
}

/** A msg that only keeps what the command replies (the /alias handler replies to whoever typed). */
function silentMsg(replies) {
    return { fromMe: true, reply: async (content) => { replies.push(String(content)); return { body: String(content) }; } };
}

/**
 * Registers the aliases of an example file. An alias that already exists stays as it is, unless `overwrite`
 * (/alias -yes -examples <file>): then the file's definition replaces it (`updated`). With `preview` every block is
 * checked as always but nothing is saved: `preview` has each alias as it would be saved, with `exists`.
 * @returns {Promise<{ loaded: string[], updated: string[], skipped: string[], failed: { name: string, error: string }[] }>}
 */
async function loadExample(example, { overwrite = false, preview = false } = {}) {
    const { cmdAlias } = require('./commands/alias'); // in here: alias imports the aliases
    await dbReady;
    const result = { loaded: [], updated: [], skipped: [], failed: [], preview: [] };
    if (!readable(example.file)) {
        result.failed.push({ name: example.name, error: `not read (a symlink, or bigger than ${MAX_FILE_BYTES / 1024} KB)` });
        return result;
    }
    const blocks = parseZb(fs.readFileSync(example.file, 'utf8'));
    if (blocks.length > MAX_BLOCKS) {
        result.failed.push({ name: example.name, error: `${blocks.length} blocks: the limit is ${MAX_BLOCKS}` });
        return result;
    }
    for (const [i, block] of blocks.entries()) {
        const name = aliasNameOf(block);
        if (!name || block.length > MAX_BLOCK_CHARS) {
            result.failed.push({ name: `block ${i + 1}`, error: name ? `longer than ${MAX_BLOCK_CHARS} characters` : 'only "/alias [-q] <name> [-desc ...] <command>" runs in a .zb file' });
            continue;
        }
        const existed = Boolean(await dbGet('SELECT 1 FROM command_aliases WHERE name = ?', [name]));
        if (existed && !overwrite && !preview) {
            result.skipped.push(name);
            continue;
        }
        const replies = [];
        if (preview) {
            const collected = [];
            await cmdAlias({ msg: silentMsg(replies), args: block.replace(/^\/alias\s+/, ''), collect: collected });
            if (collected.length) result.preview.push({ ...collected[0], exists: existed });
            else result.failed.push({ name, error: safe(replies.join(' ').split('\n')[0]) || 'not valid' });
            continue;
        }
        await cmdAlias({ msg: silentMsg(replies), args: block.replace(/^\/alias\s+/, '') });
        const saved = await dbGet('SELECT 1 FROM command_aliases WHERE name = ?', [name]);
        if (saved) (existed ? result.updated : result.loaded).push(name);
        else result.failed.push({ name, error: safe(replies.join(' ').split('\n')[0]) || 'not saved' });
    }
    return result;
}

/**
 * Boot: loads the example files that were never loaded and remembers them in alias.examples.
 * @returns {Promise<string[]>} the files processed now
 */
async function loadNewExamples() {
    try {
        return await loadNewExamplesNow();
    } catch (err) {
        printError('[examples]', err.message); // the boot goes on without the examples
        return [];
    }
}

async function loadNewExamplesNow() {
    const done = getSetting('alias.examples');
    const fresh = listExampleFiles().filter(e => !e.manual && !done.includes(e.name));
    for (const example of fresh) {
        try {
            const { loaded, failed } = await loadExample(example);
            printInfo(`[examples] ${example.name}.zb: ${loaded.length} alias(es) loaded`);
            for (const f of failed) printError(`[examples] ${example.name}.zb: ${safe(f.name)}: ${safe(f.error)}`);
        } catch (err) {
            printError(`[examples] ${example.name}.zb:`, err.message);
        }
    }
    if (fresh.length) await setSetting('alias.examples', [...done, ...fresh.map(e => e.name)]);
    return fresh.map(e => e.name);
}

module.exports = { MAX_BLOCKS, MAX_FILE_BYTES, aliasNameOf, listExampleFiles, loadExample, loadNewExamples, parseZb };
