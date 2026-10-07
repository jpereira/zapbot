/*
 * Atalhos persistentes: a execução mantém as permissões do comando de destino.
 *
 * Dois tipos, pelo que foi salvo:
 *   comando  "/crypto USD": roda o comando, com os argumentos digitados no fim
 *   texto    "Orca: {/defi orca}\nPrjx: {/defi prjx}": como no /cron, cada
 *            {/comando} roda e a resposta entra no lugar; sai uma mensagem só
 */
const { dbAll, dbGet, dbPronto } = require('./db');
const { findCommand } = require('./comandos/base');
const { botConfig } = require('./botConfig');
const { comandosNoTexto, montarTexto } = require('./comandosNoTexto');

const ehAliasDeTexto = (salvo) => !salvo.startsWith('/');

// Os comandos que o alias chama: o destino ou os {/comando} do texto
const comandosDoAlias = (salvo) => (ehAliasDeTexto(salvo)
    ? comandosNoTexto(salvo).map(c => c.linha)
    : [salvo]).map(linha => linha.split(/\s+/, 1)[0].toLowerCase());

async function resolverAlias(texto) {
    const [nome] = texto.trim().split(/\s+/);
    const args = texto.trim().slice(nome.length).trim();
    const command = findCommand(nome);
    if (command) return { command, args };
    await dbPronto;
    const alias = await dbGet('SELECT * FROM command_aliases WHERE name = ?', [nome]);
    if (!alias) return null;

    /*
     * Alias de texto: um comando de mentira com o nome do alias, para o fluxo
     * normal (bot desligado, flood); as permissões são as de cada {/comando}
     * (alvos), e os que deixaram de existir ficam de fora (saem como ⚠️).
     */
    if (ehAliasDeTexto(alias.command)) {
        const alvos = comandosDoAlias(alias.command).map(findCommand).filter(Boolean);
        return {
            command: { cmd: nome, onlyAdmin: alvos.some(c => c.onlyAdmin), alvos: alvos.map(c => c.cmd) },
            alias: nome, texto: alias.command, args
        };
    }

    const [destino] = alias.command.split(/\s+/);
    const alvo = findCommand(destino);
    return alvo ? { command: alvo, alias: nome, destino,
        args: [alias.command.slice(destino.length).trim(), args].filter(Boolean).join(' ') } : null;
}

/*
 * Roda um alias de texto no chat em que foi chamado, com as permissões de quem
 * chamou, e responde uma mensagem só (e as mídias, depois).
 */
async function executarAliasDeTexto(msg, resolvido, { chatId, chatName, isGroup, quem }) {
    const comandos = comandosNoTexto(resolvido.texto).map(c => c.linha);
    await msg.reply(`🔗 Alias ${resolvido.alias} -> ${comandos.join(', ')}`);

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
