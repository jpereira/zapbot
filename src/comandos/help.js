/*
 * Comando /help.
 */

const { activeCommands, findCommand, formatCommandHelp } = require('./base');

/*
 * Cada um vê só o que pode usar: o dono e os admins (bot.admins), tudo; os
 * outros (os do bot.users), só os comandos comuns, sem os onlyAdmin. Mostrar
 * o /backup para quem não pode usar é como mostrar o cardápio da cozinha.
 */
async function cmdHelp({ msg, args, admin }) {
    const pode = (command) => admin || !command.onlyAdmin;

    // Lê direto do texto: o parser de opções descarta um primeiro token que começa com "/"
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

        if (!pode(command)) {
            await msg.reply(`⛔ O ${command.cmd} é só do dono do bot (e dos admins).\n💡 _Veja os que você pode usar com /help_`);
            return;
        }

        await msg.reply('🤖 *AJUDA*\n\n```' + formatCommandHelp(command) + '\n```');
        return;
    }

    // /help sozinho: todos os comandos que quem pediu pode usar
    const helpText =
        '🤖 *MENU DE AJUDA*' + (admin ? '' : ' _(os comandos que você pode usar)_') + '\n\n```' +
        activeCommands().filter(pode).map(formatCommandHelp)
            .join('\n\n' + '─'.repeat(50) + '\n\n') +
        '\n```';

    await msg.reply(helpText);
}

module.exports = {
    cmdHelp
};
