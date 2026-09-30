/*
 * Comando /help.
 */

const { activeCommands, findCommand, formatCommandHelp } = require('./base');

async function cmdHelp({ msg, args }) {
    // Reads straight from the text: the option parser discards a first token that starts with "/"
    let requestedCommand = args.split(/\s+/)[0];

    // /help /get  |  /help get
    if (requestedCommand) {
        if (!requestedCommand.startsWith('/')) {
            requestedCommand = `/${requestedCommand}`;
        }

        const command = findCommand(requestedCommand);

        if (!command) {
            await msg.reply(`❌ Comando não encontrado: ${requestedCommand}`);
            return;
        }

        await msg.reply('🤖 *AJUDA*\n\n```' + formatCommandHelp(command) + '\n```');
        return;
    }

    // /help alone: all the commands
    const helpText =
        '🤖 *MENU DE AJUDA*\n\n```' +
        activeCommands().map(formatCommandHelp).join('\n\n' + '─'.repeat(50) + '\n\n') +
        '\n```';

    await msg.reply(helpText);
}

module.exports = {
    cmdHelp
};
