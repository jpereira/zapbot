/*
 * /alias: separa as opções de cadastro das opções do comando que será salvo.
 */
const { botConfig } = require('../botConfig');
const { dbPronto, dbRun } = require('../db');
const { ehAliasDeTexto, listarAliases } = require('../aliases');
const { comandosNoTexto, erroDosComandos, quebrarLinhas } = require('../comandosNoTexto');
const { findCommand } = require('./base');

const nomeDoAlias = nome => '/' + nome.replace(/^\//, '');
const NOME = /^\/?[\p{L}\p{N}_-]+$/u;

async function cmdAlias({ msg, args }) {
    await dbPronto;
    const texto = args.trim();
    if (!texto || /^-(list|l)$/.test(texto)) return listarAliases(msg);
    const remover = texto.match(/^-(?:rem|rm)\s+(\S+)$/);
    if (remover) {
        if (remover[1] === 'all') {
            const r = await dbRun('DELETE FROM command_aliases');
            return msg.reply(`🗑️ Todos os aliases removidos (${r.changes}).`);
        }
        const nome = nomeDoAlias(remover[1]);
        const r = await dbRun('DELETE FROM command_aliases WHERE name = ?', [nome]);
        return msg.reply(r.changes
            ? `🗑️ Alias ${nome} removido.` : `❌ Alias ${nome} não encontrado.`);
    }
    const cadastro = texto.match(/^(\S+)\s+([\s\S]+)$/);
    if (!cadastro || !NOME.test(cadastro[1])) {
        return msg.reply('❌ Use: /alias <nome> [-desc "Descrição"] </comando argumentos | texto com {/comando}>');
    }
    const nome = nomeDoAlias(cadastro[1]);
    if (nome === '/all') return msg.reply('❌ O nome all é reservado para remover todos os aliases.');
    if (botConfig.commands.some(c => c.cmd === nome || c.aliases?.includes(nome))) {
        return msg.reply(`❌ ${nome} já é um comando do bot.`);
    }
    let comando = cadastro[2].trim();
    let descricao = '';
    if (/^-(desc|d)(?:\s|$)/.test(comando)) {
        const d = comando.match(
            /^-(?:desc|d)\s+(["“”](?:\\.|[^"“”\\])*["“”]|['‘’](?:\\.|[^'‘’\\])*['‘’])\s+([\s\S]+)$/
        );
        if (!d) return msg.reply('❌ Informe a descrição entre aspas e depois o comando.');
        descricao = d[1].slice(1, -1).replace(/\\(["'\\])/g, '$1');
        comando = d[2].trim();
    }
    if (ehAliasDeTexto(comando)) {
        // Texto com {/comando}, como no /cron: o \n digitado vira quebra de linha
        comando = quebrarLinhas(comando);
        if (!comandosNoTexto(comando).length) {
            return msg.reply('❌ O destino deve ser um /comando ou um texto com pelo menos um {/comando}.\n' +
                '💡 _/alias orca Orca: {/defi orca}\\n Prjx: {/defi prjx}_');
        }
        const erro = erroDosComandos(comando, '/alias');
        if (erro) return msg.reply(erro);
    } else {
        const destino = comando.split(/\s+/, 1)[0];
        const alvo = findCommand(destino);
        if (!alvo || alvo.cmd === '/alias') {
            return msg.reply('❌ O destino deve ser um comando ativo do bot; não pode ser outro alias cadastrado nem /alias.');
        }
    }
    await dbRun(`INSERT INTO command_aliases (name, description, command) VALUES (?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET description = excluded.description,
        command = excluded.command`, [nome, descricao, comando]);
    const detalhe = descricao ? `\n📝 ${descricao}` : '';
    await msg.reply(`🔗 Alias salvo: ${nome} → ${comando}${detalhe}`);
}

module.exports = { cmdAlias };
