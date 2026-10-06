/*
 * Atalhos persistentes: a execução mantém as permissões do comando de destino.
 */
const { dbAll, dbGet, dbPronto } = require('./db');
const { findCommand } = require('./comandos/base');
const { botConfig } = require('./botConfig');

async function resolverAlias(texto) {
    const [nome] = texto.trim().split(/\s+/);
    const args = texto.trim().slice(nome.length).trim();
    const command = findCommand(nome);
    if (command) return { command, args };
    await dbPronto;
    const alias = await dbGet('SELECT * FROM command_aliases WHERE name = ?', [nome]);
    if (!alias) return null;
    const [destino] = alias.command.split(/\s+/);
    const alvo = findCommand(destino);
    return alvo ? { command: alvo, alias: nome, destino,
        args: [alias.command.slice(destino.length).trim(), args].filter(Boolean).join(' ') } : null;
}

async function listarAliases(msg, pode = () => true) {
    await dbPronto;
    const aliases = (await dbAll('SELECT * FROM command_aliases ORDER BY name')).filter(a => {
        const nome = a.command.split(/\s+/, 1)[0];
        const alvo = botConfig.commands.find(c => c.cmd === nome || c.aliases?.includes(nome));
        return alvo && pode(alvo);
    });
    await msg.reply(aliases.length ? `🔗 *ALIASES* (${aliases.length})\n\n` + aliases.map(a =>
        `${a.name} → ${a.command}${a.description ? `\n📝 ${a.description}` : ''}`
    ).join('\n\n') : '🔗 Nenhum alias disponível.');
}

module.exports = { listarAliases, resolverAlias };
