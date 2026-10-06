/*
 * Persistent shortcuts: the execution keeps the permissions of the target command.
 */
const { dbAll, dbGet, dbReady } = require('./db');
const { findCommand } = require('./commands/base');
const { botConfig } = require('./botConfig');

async function resolverAlias(textAlt) {
    const [nameAlt] = textAlt.trim().split(/\s+/);
    const args = textAlt.trim().slice(nameAlt.length).trim();
    const command = findCommand(nameAlt);
    if (command) return { command, args };
    await dbReady;
    const alias = await dbGet('SELECT * FROM command_aliases WHERE name = ?', [nameAlt]);
    if (!alias) return null;
    const [destination] = alias.command.split(/\s+/);
    const target = findCommand(destination);
    return target ? { command: target, alias: nameAlt, destino: destination,
        args: [alias.command.slice(destination.length).trim(), args].filter(Boolean).join(' ') } : null;
}

async function listAliases(msg, can = () => true) {
    await dbReady;
    const aliases = (await dbAll('SELECT * FROM command_aliases ORDER BY name')).filter(a => {
        const nameAlt = a.command.split(/\s+/, 1)[0];
        const target = botConfig.commands.find(c => c.cmd === nameAlt || c.aliases?.includes(nameAlt));
        return target && can(target);
    });
    await msg.reply(aliases.length ? `🔗 *ALIASES* (${aliases.length})\n\n` + aliases.map(a =>
        `${a.name} → ${a.command}${a.description ? `\n📝 ${a.description}` : ''}`
    ).join('\n\n') : '🔗 Nenhum alias disponível.');
}

module.exports = { listAliases, resolverAlias };
