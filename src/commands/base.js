/*
 * Command utilities: active commands, search by name/alias, help text and errors.
 */

const { botConfig } = require('../botConfig');
const { getSetting } = require('../settings');

// Active commands: those in bot-config minus those in the 'commands.disabled' setting (via /set)
function activeCommands() {
    const disabled = getSetting('commands.disabled');
    return botConfig.commands.filter(c => !disabled.includes(c.cmd));
}

function findCommand(name) {
    return activeCommands().find(c => c.cmd === name || c.aliases?.includes(name));
}

/**
 * Formats a command's help in the "command -help" style.
 * (There used to be two almost identical functions; now only this one.)
 */
function formatCommandHelp(command) {
    const lines = [`Usage: ${command.usage ?? command.cmd}`];

    if (command.help) lines.push(command.help);

    const cmdOpts = command.cmd_opts ?? [];
    const notEmpty = v => v != null && v !== '';

    const options = cmdOpts
        .filter(o => o?.opts?.length)
        .map(o => {
            const opts = o.opts.filter(Boolean).map(opt => `-${opt}`).join(', ');
            const values = (o.values ?? []).filter(notEmpty).join(' ');
            return { syntax: values ? `${opts} ${values}` : opts, desc: o.desc ?? '' };
        });

    const positional = cmdOpts
        .filter(o => o?.argv?.length)
        .map(o => ({ syntax: o.argv.filter(Boolean).join(' '), desc: o.desc ?? '' }));

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
    getCommandSyntax
};
