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

/**
 * Formats a command's help in the "command -help" style.
 * (There used to be two almost identical functions; now only this one.)
 */
function formatCommandHelp(command) {
    const lines = [`Usage: ${interpolar(command.usage ?? command.cmd)}`];

    if (command.help) lines.push(interpolar(command.help));

    const cmdOpts = command.cmd_opts ?? [];
    const notEmpty = v => v != null && v !== '';

    const options = cmdOpts
        .filter(o => o?.opts?.length)
        .map(o => {
            const opts = o.opts.filter(Boolean).map(opt => `-${opt}`).join(', ');
            const values = (o.values ?? []).filter(notEmpty).join(' ');
            return { syntax: values ? `${opts} ${values}` : opts, desc: interpolar(o.desc) };
        });

    const positional = cmdOpts
        .filter(o => o?.argv?.length)
        .map(o => ({ syntax: o.argv.filter(Boolean).join(' '), desc: interpolar(o.desc) }));

    // A single column so Options and Arguments line up
    const width = Math.max(0, ...[...options, ...positional].map(o => o.syntax.length));

    if (options.length) {
        lines.push('', 'Options:');
        options.forEach(o => lines.push(`  ${o.syntax.padEnd(width)}  ${o.desc}`));
    }

    if (positional.length) {
        lines.push('', 'Arguments:');
        positional.forEach(a => lines.push(`  ${a.syntax.padEnd(width)}  ${a.desc}`));
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
