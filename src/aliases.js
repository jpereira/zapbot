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
const { findCommandAlt, withTargets, commandsInText, assembleText } = require('./textCommands');

const textIsAlias = (salvo) => !salvo.startsWith('/');


/*
 * Command alias parameters: $1, $2... take the typed arguments, in order.
 * The used ones leave the list and the leftover go to the end; a $N without an argument stays empty.
 */
function applyParams(salvo, args) {
    const typed = args.split(/\s+/).filter(Boolean);
    const used = new Set();
    // $N or ${N:-default value} (the default applies when argument N was not typed)
    const commandAlt = salvo.replace(/\$(?:([1-9]\d*)|\{([1-9]\d*)(?::-([^}]*))?\})/g, (_, n1, n2, defaults) => {
        const n = Number(n1 ?? n2);
        used.add(n - 1);
        return typed[n - 1] ?? defaults ?? '';
    }).trim();
    // Without $N, what is left is the typed text as it came (line breaks stay, e.g. in /notes)
    if (!used.size) return { comando: commandAlt, sobras: args };
    return { comando: commandAlt, sobras: typed.filter((_, i) => !used.has(i)).join(' ') };
}

// Is the name a command or a saved alias (exact, no completing from the start)?
async function isCommandOrAlias(nameAlt) {
    if (findCommand(nameAlt)) return true;
    await dbReady;
    return Boolean(await dbGet('SELECT 1 FROM command_aliases WHERE name = ?', [nameAlt]));
}

async function resolverAlias(textAlt) {
    const [nameAlt] = textAlt.trim().split(/\s+/);
    const args = textAlt.trim().slice(nameAlt.length).trim();
    const command = findCommand(nameAlt);
    if (command) return { command: await withTargets(command, args), args };
    await dbReady;
    const alias = await dbGet('SELECT * FROM command_aliases WHERE name = ?', [nameAlt]);
    if (!alias) return byPrefix(nameAlt, args);
    return resolverSalvo(alias, nameAlt, args);
}

// A saved alias (the database row) already found: text or command with the $Ns applied
async function resolverSalvo(alias, nameAlt, args) {
    /*
     * Text alias: a fake command with the alias name, for the flow
     * normal (bot off, flood); the permissions are those of each {/command}
     * (targets), and those that no longer exist are left out (they come out as ⚠️).
     */
    if (textIsAlias(alias.command)) {
        const foundAlt4 = await Promise.all(commandsInText(alias.command).map(c => findCommandAlt(c.linha)));
        const targets = foundAlt4.map(a => a?.command).filter(Boolean);
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
    return { command: await withTargets(target, argsFinal), alias: nameAlt, destino: destination, args: argsFinal, quiet: Boolean(alias.quiet) };
}

/*
 * Neither a command nor an alias: the start of a command or a saved alias (/wa, /watc
 * → /watch). A single candidate runs; more than one comes back as "possiveis" for the bot to list.
 */
async function byPrefix(nameAlt, args) {
    const start = nameAlt.toLowerCase();
    const commands = commandsByPrefix(start);
    const names = new Set(commands.flatMap(c => [c.cmd, ...(c.aliases ?? [])]));
    const saved = (await dbAll('SELECT * FROM command_aliases WHERE substr(name, 1, ?) = ? ORDER BY name',
        [start.length, start])).filter(a => !names.has(a.name));

    if (commands.length + saved.length === 1) {
        if (commands.length) return { command: commands[0], args, prefixo: nameAlt };
        const r = await resolverSalvo(saved[0], saved[0].name, args);
        return r && { ...r, prefixo: nameAlt };
    }
    // Each alias enters with the target's permissions (targets), so the bot filters the list
    const deAlias = (await Promise.all(saved.map(async a => {
        const c = (await resolverSalvo(a, a.name, ''))?.command;
        return c && { ...c, cmd: a.name, alvos: c.alvos ?? [c.cmd] };
    }))).filter(Boolean);
    const possible = [...commands, ...deAlias];
    return possible.length ? { possiveis: possible } : null;
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
    const allAlt2 = await dbAll('SELECT * FROM command_aliases ORDER BY name');
    const aliases = [];
    for (const a of allAlt2) {
        // The destination or the text's {/command}s (which may be other aliases)
        const linesAlt = textIsAlias(a.command) ? commandsInText(a.command).map(c => c.linha) : [a.command];
        // The disabled ones too (the alias stays listed); an alias inside the text counts by its target
        const targets = await Promise.all(linesAlt.map(async line => {
            const nameAlt = line.split(/\s+/, 1)[0].toLowerCase();
            return botConfig.commands.find(c => c.cmd === nameAlt || c.aliases?.includes(nameAlt))
                ?? (await findCommandAlt(line))?.command;
        }));
        if (targets.length && targets.every(target => target && can(target))) aliases.push(a);
    }
    await msg.reply(aliases.length ? `🔗 *ALIASES* (${aliases.length})\n\n` + aliases.map(a =>
        `${a.name} → ${a.command}${a.description ? `\n📝 ${a.description}` : ''}`
    ).join('\n\n') : '🔗 Nenhum alias disponível.', undefined, { linkPreview: false });
}

module.exports = { applyParams, textIsAlias, isCommandOrAlias, textRunAlias, listAliases, resolverAlias };
