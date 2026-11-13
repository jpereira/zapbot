/*
 * Comando /help.
 */

const { listarAliases } = require('../aliases');
const { ROLES, atende } = require('../roles');
const { activeCommands, findCommand, formatCommandHelp, protocoloDaAjuda } = require('./base');
const { localizar } = require('./localizar');
const { t } = require('../i18n');

// Largura do menu no bloco de código (o celular em pé mostra uns 46 caracteres sem quebrar)
const COLUNAS_DO_MENU = 46;

// O texto em linhas de até `largura` caracteres, quebrando entre palavras
function quebrarEmLinhas(texto, largura) {
    const linhas = [];
    let atual = '';
    for (const palavra of String(texto).split(/\s+/).filter(Boolean)) {
        if (atual && atual.length + 1 + palavra.length > largura) {
            linhas.push(atual);
            atual = palavra;
        } else {
            atual = atual ? `${atual} ${palavra}` : palavra;
        }
    }
    return atual ? [...linhas, atual] : linhas;
}

// A ordem do /help -full: do mais restrito ao comum
const ROLES_NA_AJUDA = [ROLES.OWNER, ROLES.ADMIN, ROLES.USER];

/*
 * Cada um vê só o que o nível dele alcança (src/roles.js): o dono, tudo; um admin (bot.admins), o que
 * não é role owner; os usuários (bot.users), só os role user, mais os admin que o dono liberou com o
 * /bot +cmd. Mostrar o /backup para quem não pode usar é como mostrar o cardápio da cozinha.
 */
async function cmdHelp({ msg, args: digitado, opts, nivel, admin,
    podeUsar = (cmd) => findCommand(cmd)?.role === ROLES.USER }) {
    const quem = nivel ?? (admin ? ROLES.ADMIN : ROLES.USER);
    // Admins e o dono: pelo nível; os usuários: pela regra deles (o /bot +cmd)
    const pode = (command) => (atende(quem, ROLES.ADMIN) ? atende(quem, command.role) : podeUsar(command.cmd));

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
            await msg.reply(t('help.notFound', { cmd: requestedCommand }));
            return;
        }

        if (!pode(command)) {
            await msg.reply((command.role !== ROLES.USER
                ? t('help.restricted', { cmd: command.cmd, e: command.role === ROLES.OWNER ? '' : t('help.andAdmins') })
                : t('help.notAllowed', { cmd: command.cmd })) +
                `\n${t('help.seeAllowed')}`);
            return;
        }

        const protocolo = protocoloDaAjuda(command, resto);
        await msg.reply(`${t('help.title')}\n\n\`\`\`${formatCommandHelp(command, { protocolo })}\n\`\`\``);
        return;
    }

    // /help sozinho: um comando por linha, só com o que ele faz; com o -role, separados por role
    // Os nomes alinhados na mesma coluna e a descrição que sobra quebrada com recuo, para ler bem no celular
    const visiveis = activeCommands().filter(pode);
    const larguraDoNome = Math.max(0, ...visiveis.map(c => c.cmd.length));
    const recuo = ' '.repeat(larguraDoNome + 4);
    const linha = (c) => {
        const l = localizar(c);
        const [primeira = '', ...resto] = quebrarEmLinhas(l.summary ?? l.help, COLUNAS_DO_MENU - recuo.length);
        return [` ${c.cmd.padEnd(larguraDoNome)} - ${primeira}`, ...resto.map(r => recuo + r)].join('\n');
    };
    const lista = opts?.opt?.role
        ? ROLES_NA_AJUDA.map(g => [g, visiveis.filter(c => c.role === g)]).filter(([, cs]) => cs.length)
            .map(([g, cs]) => `Role: ${g}\n${cs.map(linha).join('\n')}`).join('\n\n')
        : visiveis.map(linha).join('\n');
    const helpText =
        t('help.menuTitle') + (admin ? '' : ` ${t('help.menuUserNote')}`) + '\n\n```\n' +
        lista +
        `\n\`\`\`\n\n${t('help.menuFooter')}`;

    await msg.reply(helpText);
}

module.exports = {
    cmdHelp
};
