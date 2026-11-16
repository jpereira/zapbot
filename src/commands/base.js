/*
 * Command utilities: active commands, search by name/alias, help text and errors.
 */

const { botConfig } = require('../botConfig');
const { language, t } = require('../i18n');
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
 * The help (-h) is read on the phone, in a code block of about 46 characters: only the essentials. The command
 * shows the one-line summary, the options with the 1st sentence of each (the rest stays on the site page, whose
 * link comes at the end) and at most 2 examples. End of sentence is ". " followed by an uppercase letter (or "{"): "Max. 20"
 * and "(e.g.: -fees 50)" do not break.
 */
const PHRASE_END = /(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ{])/u;
const WIDTH = 46;        // block columns on the phone
const MAX_PHRASE = 70;      // the 1st sentence of an option goes over that: cuts at a comma (or at a word, with "…")
const MAX_EXAMPLES = 2;
const SITE = 'https://jpereira.github.io/zapbot';

// The 1st sentence, only up to the first ":", ";" or " (" (what comes after stays on the site) and not exceeding MAX_PHRASE
function firstPhrase(textAlt) {
    let phrase = String(textAlt ?? '').split(PHRASE_END).filter(Boolean)[0]?.trim() ?? '';
    const cut = [...phrase.matchAll(/:\s|;\s|\s\(|\s[—–]\s/g)].find(m => m.index >= 12)?.index;
    if (cut != null) phrase = phrase.slice(0, cut);
    if (phrase.length > MAX_PHRASE) {
        const ate = phrase.slice(0, MAX_PHRASE);
        const virgula = ate.lastIndexOf(', ');
        phrase = virgula >= 24 ? ate.slice(0, virgula) : `${ate.replace(/\s+\S*$/, '')}…`;
    }
    // Without an open parenthesis or quote at the end
    const open = phrase.lastIndexOf('(');
    if (open > 0 && open > phrase.lastIndexOf(')')) phrase = phrase.slice(0, open).trim();
    return phrase.replace(/[.,;:]$/, '');
}

// The text broken into lines of up to `largura` characters, between words
function lineBreak(textAlt, widthAlt) {
    const linesAlt = [];
    let current = '';
    for (const word of String(textAlt).split(/\s+/).filter(Boolean)) {
        if (current && current.length + 1 + word.length > widthAlt) {
            linesAlt.push(current);
            current = word;
        } else {
            current = current ? `${current} ${word}` : word;
        }
    }
    return current ? [...linesAlt, current] : linesAlt;
}

/*
 * An option or argument: if the name and the 1st sentence fit on a line, they stay together (names aligned); otherwise,
 * the name stays alone and the description comes below, indented.
 * @param {number} coluna  the width of the name column that fits next to the description
 */
function optionLine({ syntax, desc, cabe: fits }, column) {
    const phrase = firstPhrase(desc);
    if (!phrase) return [`  ${syntax}`];
    if (fits) return [`  ${syntax.padEnd(column)}  ${phrase}`];
    return [`  ${syntax}`, ...lineBreak(phrase, WIDTH - 4).map(r => `    ${r}`)];
}

// The command's examples; without them, the options' (the full-command ones first; a piece like
// "-ss 1.5" gets the command in front), at most MAX_EXAMPLES
function examplesAlt(command, cmdOpts) {
    let list = command.ex ?? [];
    if (!list.length) {
        const optionsAltAlt = cmdOpts.flatMap(o => o.ex ?? []);
        const integers = optionsAltAlt.filter(e => e.startsWith('/'));
        list = integers.length ? integers : optionsAltAlt.map(e => `${command.cmd} ${e}`);
    }
    return [...new Set(list)].slice(0, MAX_EXAMPLES);
}

// The link to the command page on the site (the pt-BR one is under /pt-BR/)
const commandPage = (cmd) => `${SITE}${language() === 'pt_BR' ? '/pt-BR' : ''}/commands/${cmd.replace(/^\//, '')}/`;

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
    const original = command;
    command = locate(command);
    const protocolAlt = protocol ? command.protocolos?.[protocol] : null;
    if (protocolAlt) command = { ...command, usage: protocolAlt.usage, summary: firstPhrase(protocolAlt.help), ex: protocolAlt.ex };
    const isWorthHere = (o) => !protocolAlt || !o.protocolos?.length || o.protocolos.includes(protocol);

    // Each usage form ("... or ...") on a line, aligned below the first
    const forms = String(command.usage ?? command.cmd).split(/\s{2}(?:or|ou)\s{2}/);
    const indent = ' '.repeat(t('help.usage').length);
    const lines = forms.map((f, i) => `${i ? indent : t('help.usage')}${f}`);

    // What the command does, on one line (the long text stays on the site)
    const summary = command.summary ?? firstPhrase(command.help);
    if (summary) lines.push(...lineBreak(summary, WIDTH));

    const cmdOpts = (command.cmd_opts ?? []).filter(isWorthHere);
    const notEmpty = v => v != null && v !== '';

    const options = cmdOpts
        .filter(o => o?.opts?.length)
        .map(o => {
            // signs: ['+', '-'] joins the pair on a single line (+o, -o), instead of one in each section
            const opts = o.opts.filter(Boolean)
                .flatMap(opt => (o.sinais ?? ['-']).map(signalAlt => `${signalAlt}${opt}`)).join(', ');
            const values = (o.values ?? []).filter(notEmpty).join(' ');
            return { syntax: values ? `${opts} ${values}` : opts, desc: o.desc, o };
        });

    // A protocol's help does not need the protocol argument
    const positional = cmdOpts
        .filter(o => o?.argv?.length && !protocolAlt)
        .map(o => ({ syntax: o.argv.filter(Boolean).join(' '), desc: o.desc }));

    // Do they fit on one line (name + 1st sentence)? Those stay aligned in a column; the others, name and description below
    const allAlt = [...options, ...positional];
    for (const o of allAlt) o.cabe = 2 + o.syntax.length + 2 + firstPhrase(o.desc).length <= WIDTH;
    const column = Math.max(0, ...allAlt.filter(o => o.cabe).map(o => o.syntax.length));
    for (const o of allAlt) o.cabe = o.cabe && 2 + column + 2 + firstPhrase(o.desc).length <= WIDTH;
    const line = (o) => optionLine(o, column);

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
        options.forEach(o => lines.push(...line(o)));
    }

    if (positional.length) {
        lines.push('', t('help.arguments'));
        positional.forEach(a => lines.push(...line(a)));
    }

    const examples = examplesAlt(command, cmdOpts);
    if (examples.length) {
        lines.push('');
        examples.forEach((e, k) => lines.push(`${k ? '    ' : 'Ex: '}${e}`));
    }

    if (command.aliases?.length) {
        lines.push('', t('help.aliases', { list: command.aliases.join(', ') }));
    }

    lines.push('', t('help.more', { url: commandPage(original.cmd) }));

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
