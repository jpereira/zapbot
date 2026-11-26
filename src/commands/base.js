/*
 * Command utilities: active commands, search by name/alias, help text and errors.
 */

const { botConfig } = require('../botConfig');
const { language, t } = require('../i18n');
const { getSetting } = require('../settings');
const { groupCommands, groupInput } = require('./groupNamespace');
const { locate } = require('./localize');

// Active commands: those in commands.js minus those in the 'commands.disabled' setting (via /set)
function activeCommands() {
    const disabled = getSetting('commands.disabled');
    return botConfig.commands.filter(c => !disabled.includes(c.cmd));
}

function activeGroupCommands() {
    const disabled = getSetting('commands.disabled');
    return groupCommands(activeCommands()).filter(c => !disabled.includes(c.cmd))
        .sort((a, b) => a.cmd.localeCompare(b.cmd));
}

function findCommand(name) {
    if (name.startsWith('/g.')) return activeGroupCommands().find(c => c.cmd === name);
    return activeCommands().find(c => c.cmd === name || c.aliases?.includes(name));
}

function resolveGroupInput(line, { partial = true } = {}) {
    const input = groupInput(line);
    if (!input) return null;
    if (input.menu) return { command: findCommand('/help'), args: 'g' };
    const key = `/g.${input.action}`;
    const candidates = activeGroupCommands();
    const exact = candidates.find(c => c.cmd === key);
    if (exact) return { command: exact, args: input.args };
    const matches = partial && input.action.length >= 2 ? candidates.filter(c => c.cmd.startsWith(key)) : [];
    return matches.length === 1 ? { command: matches[0], args: input.args } : { candidates: matches };
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
const MAX_PHRASE = 70;      // the 1st sentence of an option goes over that: cuts at a comma (or at a word, with "…")
const MAX_EXAMPLES = 2;
const SITE = 'https://jpereira.github.io/zapbot';

// "With -txt: the background color", "No modo lembrete: lembra no seu privado": the part before the ":" is only when it
// applies. Cut there, the help said "-cl · com -lock #tag"; the meaning comes first and the context goes in parentheses
const CONTEXT = /^((?:with|com|in|no|na|only with|s[óo] junto d[oa]|sem|without)\b[^:]{0,32}):\s+(\S.*)$/iu;

// The 1st sentence, only up to the first ":", ";" or " (" (what comes after stays on the site) and not exceeding MAX_PHRASE
function firstPhrase(textAlt) {
    const sentence = String(textAlt ?? '').split(PHRASE_END).filter(Boolean)[0]?.trim() ?? '';
    const context = sentence.match(CONTEXT);
    if (context) {
        const meaning = firstPhrase(context[2]);
        return meaning ? `${meaning} (${lowerFirst(context[1])})` : lowerFirst(context[1]);
    }
    let phrase = sentence;
    const cut = [...phrase.matchAll(/:\s|;\s|\s\(|\s[—–]\s/g)].find(m => m.index >= 12)?.index;
    if (cut != null) phrase = phrase.slice(0, cut);
    if (phrase.length > MAX_PHRASE) {
        const until = phrase.slice(0, MAX_PHRASE);
        const comma = until.lastIndexOf(', ');
        phrase = comma >= 24 ? until.slice(0, comma) : `${until.replace(/\s+\S*$/, '')}…`;
    }
    // Without an open parenthesis or quote at the end
    const open = phrase.lastIndexOf('(');
    if (open > 0 && open > phrase.lastIndexOf(')')) phrase = phrase.slice(0, open).trim();
    return phrase.replace(/[.,;:]$/, '');
}

// In WhatsApp, not in a block: `-x <v>` · what it does (the phone wraps it, nothing to align)
const code = (textAlt) => `\`${textAlt}\``;
const lowerFirst = (textAlt) => /^[A-ZÀ-Ý](?![A-ZÀ-Ý0-9])/.test(textAlt) ? textAlt[0].toLowerCase() + textAlt.slice(1) : textAlt;

function optionLine({ syntax, desc }) {
    const phrase = lowerFirst(firstPhrase(desc));
    return phrase ? `${code(syntax)} · ${phrase}` : code(syntax);
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
 * Command with protocols (/defi): each option says which ones it is for ("protocols":
 * ["orca"]); without the list, it applies to all. With the protocol (/defi orca -help),
 * the help is only for it: the usage, the text and the options that apply there. Without it, all of them,
 * grouped by protocol (" > Orca", " > Project X and Morpho", " > All").
 */
function optionGroup(command, o) {
    if (!o.protocols?.length) return { key: '', order: Infinity, title: t('help.groupAll') };
    const names = o.protocols.map(p => command.protocols[p]?.name ?? p);
    const title = names.length > 1 ? `${names.slice(0, -1).join(', ')}${t('help.and')}${names.at(-1)}` : names[0];
    return { key: o.protocols.join(','), order: o.protocols.length, title };
}

// Each usage form ("... or ...") on its own line, as code
function usageLines(command) {
    return String(command.usage ?? command.cmd).split(/\s{2}(?:or|ou)\s{2}/).map(code);
}

/**
 * The reply to whoever typed the command without what it needs: only the "Usage:" (the usage forms), in a
 * block, and the -h tip. Without ❌: a missing parameter is not an error. The summary, the options and the examples stay
 * no -h.
 * @param {string} cmd  the command name ('/qr')
 * @param {string} [protocol]  only this protocol's usage (/defi orca)
 */
function commandUsage(cmd, protocol) {
    const command = findCommand(cmd);
    if (!command) return t('help.hint', { cmd });
    let c = locate(command);
    const protocolAlt = protocol ? c.protocols?.[protocol] : null;
    if (protocolAlt) c = { ...c, usage: protocolAlt.usage };
    return [`*${t('help.usage')}*`, ...usageLines(c), t('help.hint', { cmd: command.cmd })].join('\n');
}

/**
 * @param {object} command  the commands.js entry
 * @param {object} [o]
 * @param {string} [o.protocol]  only this protocol's help (the command.protocols keys)
 */
function formatCommandHelp(command, { protocol } = {}) {
    const original = command;
    command = locate(command);
    const protocolAlt = protocol ? command.protocols?.[protocol] : null;
    if (protocolAlt) command = { ...command, usage: protocolAlt.usage, summary: firstPhrase(protocolAlt.help), ex: protocolAlt.ex };
    const isWorthHere = (o) => !o.hidden && (!protocolAlt || !o.protocols?.length || o.protocols.includes(protocol));

    // */cmd* · what it does, then the usage, the options, the arguments, the examples and the link
    const title = protocolAlt ? `${command.cmd} ${protocol}` : command.cmd;
    const summary = command.summary ?? firstPhrase(command.help);
    const lines = [summary ? `*${title}* · ${summary}` : `*${title}*`, '', `*${t('help.usage')}*`, ...usageLines(command)];

    const cmdOpts = (command.cmd_opts ?? []).filter(isWorthHere);
    const notEmpty = v => v != null && v !== '';

    const options = cmdOpts
        .filter(o => o?.opts?.length)
        .map(o => {
            // Only the shortest form (the long one is in the usage and on the site); signs: ['+', '-'] shows the pair (+o, -o)
            const short = o.opts.filter(Boolean).reduce((x, y) => (y.length < x.length ? y : x));
            const opts = (o.signs ?? ['-']).map(signalAlt => `${signalAlt}${short}`).join(', ');
            const values = (o.values ?? []).filter(notEmpty).join(' ');
            return { syntax: values ? `${opts} ${values}` : opts, desc: o.desc, o };
        });

    // A protocol's help does not need the protocol argument
    const positional = cmdOpts
        .filter(o => o?.argv?.length && !protocolAlt)
        .map(o => ({ syntax: o.argv.filter(Boolean).join(' '), desc: o.desc }));

    if (options.length && command.protocols && !protocolAlt) {
        // Grouped: those of a single protocol first, those that apply to all at the end
        const groups = new Map();
        for (const o of options) {
            const g = optionGroup(command, o.o);
            if (!groups.has(g.key)) groups.set(g.key, { ...g, options: [] });
            groups.get(g.key).options.push(o);
        }
        lines.push('', `*${t('help.options')}*`);
        [...groups.values()].sort((x, y) => x.order - y.order).forEach((g, i) => {
            lines.push(...(i ? [''] : []), `_${g.title}_`);
            g.options.forEach(o => lines.push(optionLine(o)));
        });
    } else if (options.length) {
        lines.push('', `*${t('help.options')}*`);
        options.forEach(o => lines.push(optionLine(o)));
    }

    if (positional.length) {
        lines.push('', `*${t('help.arguments')}*`);
        positional.forEach(o => lines.push(optionLine(o)));
    }

    const examples = examplesAlt(command, cmdOpts);
    if (examples.length) lines.push('', `*${t('help.category.examples')}*`, ...examples);

    if (command.aliases?.length) {
        lines.push('', t('help.aliases', { list: command.aliases.join(', ') }));
    }

    lines.push('', t('help.more', { url: commandPage(original.groupAction?.source.cmd ?? original.cmd) }));

    return lines.join('\n');
}

// The command help (with the protocol, only its own: /defi orca -help)
function getCommandSyntax(cmd, protocol) {
    const command = findCommand(cmd);
    return command ? formatCommandHelp(command, { protocol }) : null;
}

// The protocol requested together with -help (/defi orca -help or, through the alias, /defi liqswp -help)
const helpProtocol = (command, words) => {
    const protocols = command?.protocols ?? {};
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
    activeGroupCommands, resolveGroupInput,
    activeCommands,
    commandsByPrefix,
    findCommand,
    firstPhrase,
    formatCommandHelp,
    formatErrorCommand,
    getCommandSyntax,
    helpProtocol,
    commandUsage
};
