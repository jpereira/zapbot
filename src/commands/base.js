/*
 * Command utilities: active commands, search by name/alias, help text and errors.
 */

const { botConfig } = require('../botConfig');
const { BACKUP_DIR, CACHE_DIR, MEDIA_DIR, TMP_DIR } = require('../constants');
const { getSetting } = require('../settings');

// Active commands: those in commands.json minus those in the 'commands.disabled' setting (via /set)
function activeCommands() {
    const disabled = getSetting('commands.disabled');
    return botConfig.commands.filter(c => !disabled.includes(c.cmd));
}

function findCommand(name) {
    return activeCommands().find(c => c.cmd === name || c.aliases?.includes(name));
}

/*
 * Variables the commands.json texts may cite (e.g.: "Shows the space
 * used in ${CACHE_DIR}"): the JSON has no template strings, so the help
 * swaps each known ${NAME} for the value. An unknown ${NAME} stays as it is.
 */
const HELP_VARIABLES = { BACKUP_DIR, CACHE_DIR, MEDIA_DIR, TMP_DIR };

const interpolar = (textAlt) => String(textAlt ?? '')
    .replace(/\$\{(\w+)\}/g, (original, nameAlt) => HELP_VARIABLES[nameAlt] ?? original);

/*
 * The help is read on the phone: each sentence on a line, and the "Ex:" always on the line of
 * below, on the left, with one example per line ("Ex: /a 1, /a 2"). End of sentence is
 * ". " followed by an uppercase letter (or "{"): "Max. 20" and "(e.g.: -rates 50)" do not break.
 */
const PHRASE_END = /(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ{])/u;

/**
 * @param {string} texto
 * @param {string} inicio  what comes before the 1st sentence ("" or the option column)
 * @param {string} recuo   the start of the following lines
 */
function textLines(textAlt, start = '', indent = '') {
    const m = String(textAlt ?? '').match(/^(.*?)\s*Ex\.?:\s*(.+)$/s);
    const phrases = (m ? m[1] : String(textAlt ?? '')).split(PHRASE_END).filter(Boolean);
    const examples = m ? m[2].split(/,\s+(?=[/-])/) : [];

    return [
        `${start}${phrases[0] ?? ''}`,
        ...phrases.slice(1).map(f => `${indent}${f}`),
        ...examples.map((e, k) => `${indent}${k ? '    ' : 'Ex: '}${e}`)
    ];
}

function formatCommandHelp(command) {
    // Each usage form ("... or ...") on a line, aligned below the first
    const forms = interpolar(command.usage ?? command.cmd).split(/\s{2}ou\s{2}/);
    const lines = forms.map((f, i) => `${i ? '       ' : 'Usage: '}${f}`);

    if (command.help) lines.push(...textLines(interpolar(command.help)));

    const cmdOpts = command.cmd_opts ?? [];
    const notEmpty = v => v != null && v !== '';

    const options = cmdOpts
        .filter(o => o?.opts?.length)
        .map(o => {
            // signs: ['+', '-'] joins the pair on a single line (+o, -o), instead of one in each section
            const opts = o.opts.filter(Boolean)
                .flatMap(opt => (o.sinais ?? ['-']).map(signalAlt => `${signalAlt}${opt}`)).join(', ');
            const values = (o.values ?? []).filter(notEmpty).join(' ');
            return { syntax: values ? `${opts} ${values}` : opts, desc: interpolar(o.desc) };
        });

    const positional = cmdOpts
        .filter(o => o?.argv?.length)
        .map(o => ({ syntax: o.argv.filter(Boolean).join(' '), desc: interpolar(o.desc) }));

    // A single column so Options and Arguments line up
    const width = Math.max(0, ...[...options, ...positional].map(o => o.syntax.length));
    const line = (o) => textLines(o.desc, `  ${o.syntax.padEnd(width)}  `, '    ');

    // "spaced": a blank line between the options (long helps, like the one for /bot)
    if (options.length) {
        lines.push('', 'Options:');
        options.forEach((o, i) => lines.push(...(command.espacado && i ? [''] : []), ...line(o)));
    }

    if (positional.length) {
        lines.push('', 'Arguments:');
        positional.forEach(a => lines.push(...line(a)));
    }

    if (command.aliases?.length) {
        lines.push('', `Aliases: ${command.aliases.join(', ')}`);
    }

    return lines.join('\n');
}

function getCommandSyntax(cmd) {
    const command = findCommand(cmd);
    return command ? formatCommandHelp(command) : null;
}

// Default error reply of the /get and /cache commands
function formatErrorCommand(e) {
    let textAlt = `⚠️💥 ${e.message}.`;

    if (e?.cause?.cmd) textAlt += `\n🛠️ *Cmd*:    ${e.cause.cmd}`;
    if (e?.cause?.inner) textAlt += `\n⛓️‍💥 *Inner*:  ${e.cause.inner.message || e.cause.inner}`;

    return `${textAlt}\n`;
}

module.exports = {
    activeCommands,
    findCommand,
    formatCommandHelp,
    formatErrorCommand,
    getCommandSyntax,
    interpolar
};
