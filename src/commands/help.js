/*
 * Comando /help.
 */

const { listAliases } = require('../aliases');
const { activeCommands, findCommand, formatCommandHelp, helpProtocol } = require('./base');

/*
 * Each sees only what they can use: the owner and the admins (bot.admins), everything; the
 * others (those in bot.users), only the common commands, without the onlyAdmin ones. Showing
 * /backup to whoever cannot use it is like showing the kitchen menu.
 */
async function cmdHelp({ msg, args, admin, podeUsar: canUse = () => true }) {
    // The admin ones, only for the owner and the admins; the others, only those in their rule (/bot +cmd)
    const can = (command) => admin || (!command.onlyAdmin && canUse(command.cmd));

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
            await msg.reply((command.onlyAdmin
                ? `⛔ O ${command.cmd} é só do dono do bot (e dos admins).`
                : `⛔ O ${command.cmd} não está liberado para você.`) +
                '\n💡 _Veja os que você pode usar com /help_');
            return;
        }

        const protocol = helpProtocol(command, rest);
        await msg.reply('🤖 *AJUDA*\n\n```' + formatCommandHelp(command, { protocolo: protocol }) + '\n```');
        return;
    }

    // /help alone: all the commands the requester can use
    const helpText =
        '🤖 *MENU DE AJUDA*' + (admin ? '' : ' _(os comandos que você pode usar)_') + '\n\n```' +
        activeCommands().filter(can).map(formatCommandHelp)
            .join('\n\n' + '─'.repeat(50) + '\n\n') +
        '\n```';

    await msg.reply(helpText);
}

module.exports = {
    cmdHelp
};
