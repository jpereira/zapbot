/*
 * Command utilities: active commands, search by name/alias, help text and errors.
 */

const { botConfig } = require('../botConfig');
const { t } = require('../i18n');
const { getSetting } = require('../settings');
const { locate } = require('./localize');

// Active commands: those in commands.js minus those in the 'commands.disabled' setting (via /set)
function activeCommands() {
    const disabled = getSetting('commands.disabled');
    return botConfig.commands.filter(c => !disabled.includes(c.cmd));
}

function findCommand(name) {
    return activeCommands().find(c => c.cmd === name || c.aliases?.includes(name));
}

// Active commands whose name or alias starts with what was typed (e.g.: /watc → /watch), without repeating
function commandsByPrefix(name) {
    if (!/^\/./.test(name)) return [];
    return activeCommands().filter(c => [c.cmd, ...(c.aliases ?? [])].some(n => n.startsWith(name)));
}

/*
 * The help is read on the phone: each sentence on a line, and the "Ex:" (the `ex` of commands.js) always on the
 * line below, on the left, with one example per line ("Ex: /a 1, /a 2"). End of sentence is
 * ". " followed by an uppercase letter (or "{"): "Max. 20" and "(e.g.: -rates 50)" do not break.
 */
const PHRASE_END = /(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ{])/u;

/**
 * @param {string} texto
 * @param {string[]} exemplos  the `ex` from commands.js: one per line, after the sentences
 * @param {string} inicio  what comes before the 1st sentence ("" or the option column)
 * @param {string} recuo   the start of the following lines
 */
function textLines(textAlt, examples = [], start = '', indent = '') {
    const phrases = String(textAlt ?? '').split(PHRASE_END).filter(Boolean);

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
    if (!o.protocolos?.length) return { chave: '', ordem: Infinity, titulo: t('help.groupAll') };
    const names = o.protocolos.map(p => command.protocolos[p]?.nome ?? p);
    const title = names.length > 1 ? `${names.slice(0, -1).join(', ')}${t('help.and')}${names.at(-1)}` : names[0];
    return { chave: o.protocolos.join(','), ordem: o.protocolos.length, titulo: title };
}

/**
 * @param {object} command  the commands.js entry
 * @param {object} [o]
 * @param {string} [o.protocolo]  only this protocol's help (the command.protocolos keys)
 */
function formatCommandHelp(command, { protocolo: protocol } = {}) {
    command = locate(command);
    const protocolAlt = protocol ? command.protocolos?.[protocol] : null;
    if (protocolAlt) command = { ...command, usage: protocolAlt.usage, help: protocolAlt.help, ex: protocolAlt.ex };
    const isWorthHere = (o) => !protocolAlt || !o.protocolos?.length || o.protocolos.includes(protocol);

    // Each usage form ("... or ...") on a line, aligned below the first
    const forms = String(command.usage ?? command.cmd).split(/\s{2}(?:or|ou)\s{2}/);
    const indent = ' '.repeat(t('help.usage').length);
    const lines = forms.map((f, i) => `${i ? indent : t('help.usage')}${f}`);

    if (command.help) lines.push(...textLines(command.help, command.ex));

    const cmdOpts = (command.cmd_opts ?? []).filter(isWorthHere);
    const notEmpty = v => v != null && v !== '';

    const options = cmdOpts
        .filter(o => o?.opts?.length)
        .map(o => {
            // signs: ['+', '-'] joins the pair on a single line (+o, -o), instead of one in each section
            const opts = o.opts.filter(Boolean)
                .flatMap(opt => (o.sinais ?? ['-']).map(signalAlt => `${signalAlt}${opt}`)).join(', ');
            const values = (o.values ?? []).filter(notEmpty).join(' ');
            return { syntax: values ? `${opts} ${values}` : opts, desc: o.desc, ex: o.ex, o };
        });

    // A protocol's help does not need the protocol argument
    const positional = cmdOpts
        .filter(o => o?.argv?.length && !protocolAlt)
        .map(o => ({ syntax: o.argv.filter(Boolean).join(' '), desc: o.desc, ex: o.ex }));

    // A single column so options and arguments line up.
    const width = Math.max(0, ...[...options, ...positional].map(o => o.syntax.length));
    const line = (o) => textLines(o.desc, o.ex, `  ${o.syntax.padEnd(width)}  `, '    ');

    // "spaced": a blank line between the options (long helps, like the one for /bot)
    if (options.length && command.protocolos && !protocolAlt) {
        // Grouped: those of a single protocol first, those that apply to all at the end
        const groups = new Map();
        for (const o of options) {
            const g = optionGroup(command, o.o);
            if (!groups.has(g.chave)) groups.set(g.chave, { ...g, opcoes: [] });
            groups.get(g.chave).opcoes.push(o);
        }
        lines.push('', t('help.options'));
        [...groups.values()].sort((a, b) => a.ordem - b.ordem).forEach((g, i) => {
            lines.push(...(i ? [''] : []), ` > ${g.titulo}`);
            g.opcoes.forEach(o => lines.push(...line(o)));
        });
    } else if (options.length) {
        lines.push('', t('help.options'));
        options.forEach((o, i) => lines.push(...(command.espacado && i ? [''] : []), ...line(o)));
    }

    if (positional.length) {
        lines.push('', t('help.arguments'));
        positional.forEach(a => lines.push(...line(a)));
    }

    lines.push('', t('help.helpLine'));

    if (command.aliases?.length) {
        lines.push('', t('help.aliases', { list: command.aliases.join(', ') }));
    }

    return lines.join('\n');
}

// The command help (with the protocol, only its own: /defi orca -help)
function getCommandSyntax(cmd, protocol) {
    const command = findCommand(cmd);
    return command ? formatCommandHelp(command, { protocolo: protocol }) : null;
}

// The protocol requested together with -help (/defi orca -help or, through the alias, /defi liqswp -help)
const helpProtocol = (command, words) => {
    const protocols = command?.protocolos ?? {};
    for (const p of words.map(x => String(x ?? '').toLowerCase())) {
        const keyAlt = protocols[p] ? p : Object.keys(protocols).find(k => protocols[k].aliases?.includes(p));
        if (keyAlt) return keyAlt;
    }
    return undefined;
};

// Default error reply of the /get and /cache commands
function formatErrorCommand(e) {
    let textAlt = `⚠️💥 ${e.message}.`;

    const cmd = e?.cmd ?? e?.cause?.cmd;
    if (cmd) textAlt += `\n🛠️ *Cmd*:    ${cmd}`;
    const inner = e?.cause?.inner ?? e?.cause;
    if (inner) textAlt += `\n⛓️‍💥 *Inner*:  ${inner.message || inner}`;

    return `${textAlt}\n`;
}

module.exports = {
    activeCommands,
    commandsByPrefix,
    findCommand,
    formatCommandHelp,
    formatErrorCommand,
    getCommandSyntax,
    helpProtocol
};
