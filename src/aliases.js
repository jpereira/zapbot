/*
 * Persistent shortcuts: the execution keeps the permissions of the target command.
 *
 * Two kinds, by what was saved:
 * command  "/crypto USD": runs the command, with the typed arguments at the end
 * text    "Orca: {/defi orca}\nPrjx: {/defi prjx}": as in /cron, each
 * {/command} runs and the reply goes in its place; a single message goes out
 */
const { dbAll, dbGet, dbReady } = require('./db');
const { commandsByPrefix, findCommand } = require('./commands/base');
const { botConfig } = require('./botConfig');
const { withTargets, commandsInText, assembleText } = require('./textCommands');

const textIsAlias = (salvo) => !salvo.startsWith('/');

// The commands the alias calls: the target or the text's {/command}s
const aliasCommands = (salvo) => (textIsAlias(salvo)
    ? commandsInText(salvo).map(c => c.linha)
    : [salvo]).map(line => line.split(/\s+/, 1)[0].toLowerCase());

/*
 * Command alias parameters: $1, $2... take the typed arguments, in order.
 * The used ones leave the list and the leftover go to the end; a $N without an argument stays empty.
 */
function applyParams(salvo, args) {
    const typed = args.split(/\s+/).filter(Boolean);
    const used = new Set();
    const commandAlt = salvo.replace(/\$([1-9]\d*)/g, (_, n) => {
        used.add(Number(n) - 1);
        return typed[n - 1] ?? '';
    }).trim();
    // Without $N, what is left is the typed text as it came (line breaks stay, e.g. in /notes)
    if (!used.size) return { comando: commandAlt, sobras: args };
    return { comando: commandAlt, sobras: typed.filter((_, i) => !used.has(i)).join(' ') };
}

async function resolverAlias(textAlt) {
    const [nameAlt] = textAlt.trim().split(/\s+/);
    const args = textAlt.trim().slice(nameAlt.length).trim();
    const command = findCommand(nameAlt);
    if (command) return { command: withTargets(command, args), args };
    await dbReady;
    const alias = await dbGet('SELECT * FROM command_aliases WHERE name = ?', [nameAlt]);
    if (!alias) return byPrefix(nameAlt, args);

    /*
     * Text alias: a fake command with the alias name, for the flow
     * normal (bot off, flood); the permissions are those of each {/command}
     * (targets), and those that no longer exist are left out (they come out as ⚠️).
     */
    if (textIsAlias(alias.command)) {
        const targets = aliasCommands(alias.command).map(findCommand).filter(Boolean);
        return {
            command: { cmd: nameAlt, onlyAdmin: targets.some(c => c.onlyAdmin), alvos: targets.map(c => c.cmd) },
            alias: nameAlt, texto: alias.command, args, quiet: Boolean(alias.quiet)
        };
    }

    const { comando: commandAlt, sobras: leftovers } = applyParams(alias.command, args);
    const [destination] = commandAlt.split(/\s+/);
    const target = findCommand(destination);
    if (!target) return null;
    const argsFinal = [commandAlt.slice(destination.length).trim(), leftovers].filter(Boolean).join(' ');
    return { command: withTargets(target, argsFinal), alias: nameAlt, destino: destination, args: argsFinal, quiet: Boolean(alias.quiet) };
}

/*
 * Neither a command nor an alias: the start of a command (/wa, /watc → /watch). Only one
 * candidate runs; more than one comes back as "possiveis" for the bot to list.
 */
function byPrefix(nameAlt, args) {
    const candidates = commandsByPrefix(nameAlt.toLowerCase());
    if (candidates.length === 1) return { command: candidates[0], args, prefixo: nameAlt };
    return candidates.length ? { possiveis: candidates } : null;
}

/*
 * Runs a text alias in the chat where it was called, with the permissions of whoever
 * called, and replies a single message (and the media, afterward).
 */
async function textRunAlias(msg, resolved, { chatId, chatName, isGroup, quem: who }) {
    const commands = commandsInText(resolved.texto).map(c => c.linha);
    if (!resolved.quiet) await msg.reply(`🔗 Alias ${resolved.alias} -> ${commands.join(', ')}`, undefined, { linkPreview: false });

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
    ).join('\n\n') : '🔗 Nenhum alias disponível.', undefined, { linkPreview: false });
}

module.exports = { textIsAlias, textRunAlias, listAliases, resolverAlias };
