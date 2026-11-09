/*
 * Comando /help.
 */

const { listAliases } = require('../aliases');
const { activeCommands, findCommand, formatCommandHelp, helpProtocol } = require('./base');

// The /help -full order: from the most restricted to the common
const ROLES_IN_HELP = ['owner', 'admin', 'user'];

/*
 * Each sees only what they can use: the owner and the admins (bot.admins), everything; the
 * others (those in bot.users), only the common commands, without the admin/owner role ones
 * (unless the owner has allowed an admin with /bot +cmd). Show
 * /backup to whoever cannot use it is like showing the kitchen menu.
 */
async function cmdHelp({ msg, args: typed, opts, admin, podeUsar: canUse = (cmd) => findCommand(cmd)?.role === 'user' }) {
    // The admin ones, only for the owner and the admins; the others, only those in their rule (/bot +cmd)
    const can = (command) => admin || canUse(command.cmd);

    // Without the options (-role), what is left is the command and the protocol
    const args = opts ? opts.argv.join(' ') : typed;

    // Reads the requested command and protocol directly, preserving the name with or without "/".
    const [first, ...rest] = args.split(/\s+/);
    let requestedCommand = first;

    // /help /get  |  /help get  |  /help defi orca (only the help for that protocol)
    if (requestedCommand) {
        if (!requestedCommand.startsWith('/')) {
            requestedCommand = `/${requestedCommand}`;
        }

        if (requestedCommand === '/alias') {
            return listAliases(msg, c => can(c) && (admin || Boolean(findCommand(c.cmd))));
        }

        const command = findCommand(requestedCommand);

        if (!command) {
            await msg.reply(`❌ Comando não encontrado: ${requestedCommand}`);
            return;
        }

        if (!can(command)) {
            await msg.reply((command.role !== 'user'
                ? `⛔ O ${command.cmd} é só do dono do bot (e dos admins).`
                : `⛔ O ${command.cmd} não está liberado para você.`) +
                '\n💡 _Veja os que você pode usar com /help_');
            return;
        }

        const protocol = helpProtocol(command, rest);
        await msg.reply('🤖 *AJUDA*\n\n```' + formatCommandHelp(command, { protocolo: protocol }) + '\n```');
        return;
    }

    // /help alone: one command per line, only with what it does; with -role, separated by role
    const line = (c) => ` ${c.cmd} - ${c.summary ?? c.help}`;
    const visible = activeCommands().filter(can);
    const list = opts?.opt?.role
        ? ROLES_IN_HELP.map(g => [g, visible.filter(c => c.role === g)]).filter(([, cs]) => cs.length)
            .map(([g, cs]) => `Role: ${g}\n${cs.map(line).join('\n')}`).join('\n\n')
        : visible.map(line).join('\n');
    const helpText =
        '🤖 *MENU DE AJUDA*' + (admin ? '' : ' _(os comandos que você pode usar)_') + '\n\n```\n' +
        list +
        '\n```\n\n💡 Utilize */help /comando* ou */comando -h* para mais informações.';

    await msg.reply(helpText);
}

module.exports = {
    cmdHelp
};
