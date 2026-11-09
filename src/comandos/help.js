/*
 * Comando /help.
 */

const { listarAliases } = require('../aliases');
const { activeCommands, findCommand, formatCommandHelp, protocoloDaAjuda } = require('./base');

// A ordem do /help -full: do mais restrito ao comum
const ROLES_NA_AJUDA = ['owner', 'admin', 'user'];

/*
 * Cada um vê só o que pode usar: o dono e os admins (bot.admins), tudo; os
 * outros (os do bot.users), só os comandos comuns, sem os de role admin/owner
 * (a menos que o dono tenha liberado um admin com o /bot +cmd). Mostrar
 * o /backup para quem não pode usar é como mostrar o cardápio da cozinha.
 */
async function cmdHelp({ msg, args: digitado, opts, admin, podeUsar = (cmd) => findCommand(cmd)?.role === 'user' }) {
    // Os admin, só para o dono e os admins; os outros, só os da regra deles (o /bot +cmd)
    const pode = (command) => admin || podeUsar(command.cmd);

    // Sem as opções (-role), o que sobra é o comando e o protocolo
    const args = opts ? opts.argv.join(' ') : digitado;

    // Lê o comando e o protocolo pedidos diretamente, preservando o nome com ou sem "/".
    const [primeira, ...resto] = args.split(/\s+/);
    let requestedCommand = primeira;

    // /help /get  |  /help get  |  /help defi orca (só a ajuda daquele protocolo)
    if (requestedCommand) {
        if (!requestedCommand.startsWith('/')) {
            requestedCommand = `/${requestedCommand}`;
        }

        if (requestedCommand === '/alias') {
            return listarAliases(msg, c => pode(c) && (admin || Boolean(findCommand(c.cmd))));
        }

        const command = findCommand(requestedCommand);

        if (!command) {
            await msg.reply(`❌ Comando não encontrado: ${requestedCommand}`);
            return;
        }

        if (!pode(command)) {
            await msg.reply((command.role !== 'user'
                ? `⛔ O ${command.cmd} é só do dono do bot (e dos admins).`
                : `⛔ O ${command.cmd} não está liberado para você.`) +
                '\n💡 _Veja os que você pode usar com /help_');
            return;
        }

        const protocolo = protocoloDaAjuda(command, resto);
        await msg.reply('🤖 *AJUDA*\n\n```' + formatCommandHelp(command, { protocolo }) + '\n```');
        return;
    }

    // /help sozinho: um comando por linha, só com o que ele faz; com o -role, separados por role
    const linha = (c) => ` ${c.cmd} - ${c.summary ?? c.help}`;
    const visiveis = activeCommands().filter(pode);
    const lista = opts?.opt?.role
        ? ROLES_NA_AJUDA.map(g => [g, visiveis.filter(c => c.role === g)]).filter(([, cs]) => cs.length)
            .map(([g, cs]) => `Role: ${g}\n${cs.map(linha).join('\n')}`).join('\n\n')
        : visiveis.map(linha).join('\n');
    const helpText =
        '🤖 *MENU DE AJUDA*' + (admin ? '' : ' _(os comandos que você pode usar)_') + '\n\n```\n' +
        lista +
        '\n```\n\n💡 Utilize */help /comando* ou */comando -h* para mais informações.';

    await msg.reply(helpText);
}

module.exports = {
    cmdHelp
};
