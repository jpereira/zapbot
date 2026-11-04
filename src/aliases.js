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
const { acharComando, comAlvos, comandosNoTexto, montarTexto } = require('./comandosNoTexto');

const ehAliasDeTexto = (salvo) => !salvo.startsWith('/');


/*
 * Parâmetros do alias de comando: $1, $2... pegam os argumentos digitados, na ordem.
 * Os usados saem da lista e os que sobram vão para o fim; um $N sem argumento fica vazio.
 */
function aplicarParametros(salvo, args) {
    const digitados = args.split(/\s+/).filter(Boolean);
    const usados = new Set();
    // $N ou ${N:-valor padrão} (o padrão vale quando o argumento N não foi digitado)
    const comando = salvo.replace(/\$(?:([1-9]\d*)|\{([1-9]\d*)(?::-([^}]*))?\})/g, (_, n1, n2, padrao) => {
        const n = Number(n1 ?? n2);
        usados.add(n - 1);
        return digitados[n - 1] ?? padrao ?? '';
    }).trim();
    // Sem $N, o que sobra é o texto digitado como veio (as quebras de linha ficam, p. ex. no /notes)
    if (!usados.size) return { comando, sobras: args };
    return { comando, sobras: digitados.filter((_, i) => !usados.has(i)).join(' ') };
}

// O nome é um comando ou um alias salvo (exato, sem completar pelo começo)?
async function ehComandoOuAlias(nome) {
    if (findCommand(nome)) return true;
    await dbPronto;
    return Boolean(await dbGet('SELECT 1 FROM command_aliases WHERE name = ?', [nome]));
}

async function resolverAlias(texto) {
    const [nome] = texto.trim().split(/\s+/);
    const args = texto.trim().slice(nome.length).trim();
    const command = findCommand(nome);
    if (command) return { command: await comAlvos(command, args), args };
    await dbPronto;
    const alias = await dbGet('SELECT * FROM command_aliases WHERE name = ?', [nome]);
    if (!alias) return porPrefixo(nome, args);

    /*
     * Alias de texto: um comando de mentira com o nome do alias, para o fluxo
     * normal (bot desligado, flood); as permissões são as de cada {/comando}
     * (alvos), e os que deixaram de existir ficam de fora (saem como ⚠️).
     */
    if (ehAliasDeTexto(alias.command)) {
        const achados = await Promise.all(comandosNoTexto(alias.command).map(c => acharComando(c.linha)));
        const alvos = achados.map(a => a?.command).filter(Boolean);
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
    return { command: await comAlvos(alvo, argsFinais), alias: nome, destino, args: argsFinais, quiet: Boolean(alias.quiet) };
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
    if (!resolvido.quiet) await msg.reply(`🔗 Alias ${resolvido.alias} -> ${comandos.join(', ')}`, undefined, { linkPreview: false });

    const { texto, midias } = await montarTexto(resolvido.texto,
        { chat_id: chatId, chat_name: chatName, is_group: isGroup }, { onde: '/alias', quem });

    if (texto) await msg.reply(texto);
    for (const { content, options } of midias) await msg.reply(content, undefined, { caption: options?.caption });
}

async function listarAliases(msg, pode = () => true) {
    await dbPronto;
    const todos = await dbAll('SELECT * FROM command_aliases ORDER BY name');
    const aliases = [];
    for (const a of todos) {
        // O destino ou os {/comando} do texto (que podem ser outros aliases)
        const linhas = ehAliasDeTexto(a.command) ? comandosNoTexto(a.command).map(c => c.linha) : [a.command];
        // Também os desativados (o alias continua listado); um alias dentro do texto vale pelo destino dele
        const alvos = await Promise.all(linhas.map(async linha => {
            const nome = linha.split(/\s+/, 1)[0].toLowerCase();
            return botConfig.commands.find(c => c.cmd === nome || c.aliases?.includes(nome))
                ?? (await acharComando(linha))?.command;
        }));
        if (alvos.length && alvos.every(alvo => alvo && pode(alvo))) aliases.push(a);
    }
    await msg.reply(aliases.length ? `🔗 *ALIASES* (${aliases.length})\n\n` + aliases.map(a =>
        `${a.name} → ${a.command}${a.description ? `\n📝 ${a.description}` : ''}`
    ).join('\n\n') : '🔗 Nenhum alias disponível.', undefined, { linkPreview: false });
}

module.exports = { aplicarParametros, ehAliasDeTexto, ehComandoOuAlias, executarAliasDeTexto, listarAliases, resolverAlias };
