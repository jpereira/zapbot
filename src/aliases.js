/*
 * Persistent shortcuts: the execution keeps the permissions of the target command.
 *
 * Two kinds, by what was saved:
 * command  "/crypto USD": runs the command, with the typed arguments at the end
 * text    "Orca: {/defi orca}\nPrjx: {/defi prjx}": as in /cron, each
 * {/command} runs and the reply goes in its place; a single message goes out
 */
const { dbAll, dbGet, dbReady } = require('./db');
const { findCommand } = require('./commands/base');
const { botConfig } = require('./botConfig');
const { commandsInText, assembleText } = require('./textCommands');

const textIsAlias = (salvo) => !salvo.startsWith('/');

// The commands the alias calls: the target or the text's {/command}s
const aliasCommands = (salvo) => (textIsAlias(salvo)
    ? commandsInText(salvo).map(c => c.linha)
    : [salvo]).map(line => line.split(/\s+/, 1)[0].toLowerCase());

async function resolverAlias(textAlt) {
    const [nameAlt] = textAlt.trim().split(/\s+/);
    const args = textAlt.trim().slice(nameAlt.length).trim();
    const command = findCommand(nameAlt);
    if (command) return { command, args };
    await dbReady;
    const alias = await dbGet('SELECT * FROM command_aliases WHERE name = ?', [nameAlt]);
    if (!alias) return null;

    /*
     * Text alias: a fake command with the alias name, for the flow
     * normal (bot off, flood); the permissions are those of each {/command}
     * (targets), and those that no longer exist are left out (they come out as ⚠️).
     */
    if (textIsAlias(alias.command)) {
        const targets = aliasCommands(alias.command).map(findCommand).filter(Boolean);
        return {
            command: { cmd: nameAlt, onlyAdmin: targets.some(c => c.onlyAdmin), alvos: targets.map(c => c.cmd) },
            alias: nameAlt, texto: alias.command, args
        };
    }

    const [destination] = alias.command.split(/\s+/);
    const target = findCommand(destination);
    return target ? { command: target, alias: nameAlt, destino: destination,
        args: [alias.command.slice(destination.length).trim(), args].filter(Boolean).join(' ') } : null;
}

/*
 * Runs a text alias in the chat where it was called, with the permissions of whoever
 * called, and replies a single message (and the media, afterward).
 */
async function textRunAlias(msg, resolved, { chatId, chatName, isGroup, quem: who }) {
    const commands = commandsInText(resolved.texto).map(c => c.linha);
    await msg.reply(`🔗 Alias ${resolved.alias} -> ${commands.join(', ')}`);

    const { texto: textAlt, midias: mediaAltAlt } = await assembleText(resolved.texto,
        { chat_id: chatId, chat_name: chatName, is_group: isGroup }, { onde: '/alias', quem: who });

    if (textAlt) await msg.reply(textAlt);
    for (const { content, options } of mediaAltAlt) await msg.reply(content, undefined, { caption: options?.caption });
}

async function listAliases(msg, can = () => true) {
    await dbReady;
    const aliases = (await dbAll('SELECT * FROM command_aliases ORDER BY name')).filter(a => {
        const targets = aliasCommands(a.command)
            .map(nameAlt => botConfig.commands.find(c => c.cmd === nameAlt || c.aliases?.includes(nameAlt)));
        return targets.length && targets.every(target => target && can(target));
    });
    await msg.reply(aliases.length ? `🔗 *ALIASES* (${aliases.length})\n\n` + aliases.map(a =>
        `${a.name} → ${a.command}${a.description ? `\n📝 ${a.description}` : ''}`
    ).join('\n\n') : '🔗 Nenhum alias disponível.');
}

module.exports = { textIsAlias, textRunAlias, listAliases, resolverAlias };
