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

/*
 * Command with protocols (/defi): each option says which ones it is for ("protocolos":
 * ["orca"]); without the list, it applies to all. With the protocol (/defi orca -help),
 * the help is only for it: the usage, the text and the options that apply there. Without it, all of them,
 * grouped by protocol (" > Orca", " > Project X and Morpho", " > All").
 */
function optionGroup(command, o) {
    if (!o.protocolos?.length) return { chave: '', ordem: Infinity, titulo: 'Todos' };
    const names = o.protocolos.map(p => command.protocolos[p]?.nome ?? p);
    const title = names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : names[0];
    return { chave: o.protocolos.join(','), ordem: o.protocolos.length, titulo: title };
}

/**
 * @param {object} command  the commands.json entry
 * @param {object} [o]
 * @param {string} [o.protocolo]  only this protocol's help (the command.protocolos keys)
 */
function formatCommandHelp(command, { protocolo: protocol } = {}) {
    const protocolAlt = protocol ? command.protocolos?.[protocol] : null;
    if (protocolAlt) command = { ...command, usage: protocolAlt.usage, help: protocolAlt.help };
    const isWorthHere = (o) => !protocolAlt || !o.protocolos?.length || o.protocolos.includes(protocol);

    // Each usage form ("... or ...") on a line, aligned below the first
    const forms = interpolar(command.usage ?? command.cmd).split(/\s{2}ou\s{2}/);
    const lines = forms.map((f, i) => `${i ? '       ' : 'Usage: '}${f}`);

    if (command.help) lines.push(...textLines(interpolar(command.help)));

    const cmdOpts = (command.cmd_opts ?? []).filter(isWorthHere);
    const notEmpty = v => v != null && v !== '';

    const options = cmdOpts
        .filter(o => o?.opts?.length)
        .map(o => {
            // signs: ['+', '-'] joins the pair on a single line (+o, -o), instead of one in each section
            const opts = o.opts.filter(Boolean)
                .flatMap(opt => (o.sinais ?? ['-']).map(signalAlt => `${signalAlt}${opt}`)).join(', ');
            const values = (o.values ?? []).filter(notEmpty).join(' ');
            return { syntax: values ? `${opts} ${values}` : opts, desc: interpolar(o.desc), o };
        });

    // A protocol's help does not need the protocol argument
    const positional = cmdOpts
        .filter(o => o?.argv?.length && !protocolAlt)
        .map(o => ({ syntax: o.argv.filter(Boolean).join(' '), desc: interpolar(o.desc) }));

    // A single column so Options and Arguments line up
    const width = Math.max(0, ...[...options, ...positional].map(o => o.syntax.length));
    const line = (o) => textLines(o.desc, `  ${o.syntax.padEnd(width)}  `, '    ');

    // "spaced": a blank line between the options (long helps, like the one for /bot)
    if (options.length && command.protocolos && !protocolAlt) {
        // Grouped: those of a single protocol first, those that apply to all at the end
        const groups = new Map();
        for (const o of options) {
            const g = optionGroup(command, o.o);
            if (!groups.has(g.chave)) groups.set(g.chave, { ...g, opcoes: [] });
            groups.get(g.chave).opcoes.push(o);
        }
        lines.push('', 'Options:');
        [...groups.values()].sort((a, b) => a.ordem - b.ordem).forEach((g, i) => {
            lines.push(...(i ? [''] : []), ` > ${g.titulo}`);
            g.opcoes.forEach(o => lines.push(...line(o)));
        });
    } else if (options.length) {
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

// The command help (with the protocol, only its own: /defi orca -help)
function getCommandSyntax(cmd, protocol) {
    const command = findCommand(cmd);
    return command ? formatCommandHelp(command, { protocolo: protocol }) : null;
}

// The protocol requested together with -help (/defi orca -help), if the command has protocols
const helpProtocol = (command, words) => words
    .map(p => String(p ?? '').toLowerCase())
    .find(p => command?.protocolos?.[p]);

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
    interpolar,
    helpProtocol
};
