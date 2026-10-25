/*
 * Atalhos persistentes: a execução mantém as permissões do comando de destino.
 *
 * Dois tipos, pelo que foi salvo:
 *   comando  "/crypto USD": roda o comando, com os argumentos digitados no fim
 *   texto    "Orca: {/defi orca}\nPrjx: {/defi prjx}": como no /cron, cada
 *            {/comando} roda e a resposta entra no lugar; sai uma mensagem só
 */
const { dbAll, dbGet, dbPronto } = require('./db');
const { commandsByPrefix, findCommand } = require('./comandos/base');
const { botConfig } = require('./botConfig');
const { comAlvos, comandosNoTexto, montarTexto } = require('./comandosNoTexto');

const ehAliasDeTexto = (salvo) => !salvo.startsWith('/');

// Os comandos que o alias chama: o destino ou os {/comando} do texto
const comandosDoAlias = (salvo) => (ehAliasDeTexto(salvo)
    ? comandosNoTexto(salvo).map(c => c.linha)
    : [salvo]).map(linha => linha.split(/\s+/, 1)[0].toLowerCase());

/*
 * Parâmetros do alias de comando: $1, $2... pegam os argumentos digitados, na ordem.
 * Os usados saem da lista e os que sobram vão para o fim; um $N sem argumento fica vazio.
 */
function aplicarParametros(salvo, args) {
    const digitados = args.split(/\s+/).filter(Boolean);
    const usados = new Set();
    const comando = salvo.replace(/\$([1-9]\d*)/g, (_, n) => {
        usados.add(Number(n) - 1);
        return digitados[n - 1] ?? '';
    }).trim();
    return { comando, sobras: digitados.filter((_, i) => !usados.has(i)).join(' ') };
}

async function resolverAlias(texto) {
    const [nome] = texto.trim().split(/\s+/);
    const args = texto.trim().slice(nome.length).trim();
    const command = findCommand(nome);
    if (command) return { command: comAlvos(command, args), args };
    await dbPronto;
    const alias = await dbGet('SELECT * FROM command_aliases WHERE name = ?', [nome]);
    if (!alias) return porPrefixo(nome, args);

    /*
     * Alias de texto: um comando de mentira com o nome do alias, para o fluxo
     * normal (bot desligado, flood); as permissões são as de cada {/comando}
     * (alvos), e os que deixaram de existir ficam de fora (saem como ⚠️).
     */
    if (ehAliasDeTexto(alias.command)) {
        const alvos = comandosDoAlias(alias.command).map(findCommand).filter(Boolean);
        return {
            command: { cmd: nome, onlyAdmin: alvos.some(c => c.onlyAdmin), alvos: alvos.map(c => c.cmd) },
            alias: nome, texto: alias.command, args, quiet: Boolean(alias.quiet)
        };
    }

    const { comando, sobras } = aplicarParametros(alias.command, args);
    const [destino] = comando.split(/\s+/);
    const alvo = findCommand(destino);
    if (!alvo) return null;
    const argsFinais = [comando.slice(destino.length).trim(), sobras].filter(Boolean).join(' ');
    return { command: comAlvos(alvo, argsFinais), alias: nome, destino, args: argsFinais, quiet: Boolean(alias.quiet) };
}

/*
 * Nem comando nem alias: o começo de um comando (/wa, /watc → /watch). Um só
 * candidato roda; mais de um volta como "possiveis" para o bot listar.
 */
function porPrefixo(nome, args) {
    const candidatos = commandsByPrefix(nome.toLowerCase());
    if (candidatos.length === 1) return { command: candidatos[0], args, prefixo: nome };
    return candidatos.length ? { possiveis: candidatos } : null;
}

/*
 * Roda um alias de texto no chat em que foi chamado, com as permissões de quem
 * chamou, e responde uma mensagem só (e as mídias, depois).
 */
async function executarAliasDeTexto(msg, resolvido, { chatId, chatName, isGroup, quem }) {
    const comandos = comandosNoTexto(resolvido.texto).map(c => c.linha);
    if (!resolvido.quiet) await msg.reply(`🔗 Alias ${resolvido.alias} -> ${comandos.join(', ')}`);

    const { texto, midias } = await montarTexto(resolvido.texto,
        { chat_id: chatId, chat_name: chatName, is_group: isGroup }, { onde: '/alias', quem });

    if (texto) await msg.reply(texto);
    for (const { content, options } of midias) await msg.reply(content, undefined, { caption: options?.caption });
}

async function listarAliases(msg, pode = () => true) {
    await dbPronto;
    const aliases = (await dbAll('SELECT * FROM command_aliases ORDER BY name')).filter(a => {
        const alvos = comandosDoAlias(a.command)
            .map(nome => botConfig.commands.find(c => c.cmd === nome || c.aliases?.includes(nome)));
        return alvos.length && alvos.every(alvo => alvo && pode(alvo));
    });
    await msg.reply(aliases.length ? `🔗 *ALIASES* (${aliases.length})\n\n` + aliases.map(a =>
        `${a.name} → ${a.command}${a.description ? `\n📝 ${a.description}` : ''}`
    ).join('\n\n') : '🔗 Nenhum alias disponível.');
}

module.exports = { ehAliasDeTexto, executarAliasDeTexto, listarAliases, resolverAlias };
