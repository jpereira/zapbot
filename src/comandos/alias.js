/*
 * /alias: separa as opções de cadastro das opções do comando que será salvo.
 */
const { botConfig } = require('../botConfig');
const { dbGet, dbPronto, dbRun } = require('../db');
const { ehAliasDeTexto, listarAliases } = require('../aliases');
const { comandosNoTexto, erroDosComandos, quebrarLinhas } = require('../comandosNoTexto');
const { findCommand } = require('./base');

const nomeDoAlias = nome => '/' + nome.replace(/^\//, '');
const NOME = /^\/?[\p{L}\p{N}_.-]+$/u;

async function cmdAlias({ msg, args }) {
    await dbPronto;
    const texto = args.trim();
    if (!texto || /^-(list|l)$/.test(texto)) return listarAliases(msg);
    const mover = texto.match(/^-(?:move|m)\s+(\S+)\s+(\S+)$/);
    if (/^-(?:move|m)(?:\s|$)/.test(texto) && !mover) return msg.reply('❌ Use: /alias -move <nome atual> <novo nome>');
    if (mover) {
        const [antigo, novo] = [nomeDoAlias(mover[1]), nomeDoAlias(mover[2])];
        if (!NOME.test(mover[2])) return msg.reply(`❌ Nome inválido: ${novo}`);
        if (novo === '/all') return msg.reply('❌ O nome all é reservado para remover todos os aliases.');
        if (botConfig.commands.some(c => c.cmd === novo || c.aliases?.includes(novo))) {
            return msg.reply(`❌ ${novo} já é um comando do bot.`);
        }
        if (!(await dbGet('SELECT 1 FROM command_aliases WHERE name = ?', [antigo]))) {
            return msg.reply(`❌ Alias ${antigo} não encontrado.`);
        }
        if (antigo === novo) return msg.reply(`❌ O alias já se chama ${novo}.`);
        if (await dbGet('SELECT 1 FROM command_aliases WHERE name = ?', [novo])) {
            return msg.reply(`❌ Já existe um alias ${novo}.`);
        }
        await dbRun('UPDATE command_aliases SET name = ? WHERE name = ?', [novo, antigo]);
        return msg.reply(`🔗 Alias renomeado: ${antigo} → ${novo}`);
    }
    const remover = texto.match(/^-rm\s+(\S[\s\S]*)$/);
    if (remover) {
        const nomes = [...new Set(remover[1].split(/[\s,]+/).filter(Boolean).map(nomeDoAlias))];
        if (nomes.includes('/all')) {
            const r = await dbRun('DELETE FROM command_aliases');
            return msg.reply(`🗑️ Todos os aliases removidos (${r.changes}).`);
        }
        const removidos = [];
        const faltando = [];
        for (const nome of nomes) {
            const r = await dbRun('DELETE FROM command_aliases WHERE name = ?', [nome]);
            (r.changes ? removidos : faltando).push(nome);
        }
        if (nomes.length === 1) {
            return msg.reply(removidos.length ? `🗑️ Alias ${nomes[0]} removido.` : `❌ Alias ${nomes[0]} não encontrado.`);
        }
        return msg.reply([
            removidos.length && `🗑️ Aliases removidos (${removidos.length}): ${removidos.join(', ')}`,
            faltando.length && `❌ Não encontrado${faltando.length > 1 ? 's' : ''}: ${faltando.join(', ')}`
        ].filter(Boolean).join('\n'));
    }
    // -q|-quiet: sem o cabeçalho "🔗 Alias ..." ao executar; vale antes do nome, depois dele ou da descrição
    let quiet = false;
    const tirarQuiet = (s) => s.replace(/^-(?:quiet|q)(?:\s+|$)/, () => { quiet = true; return ''; });
    const cadastro = tirarQuiet(texto).match(/^(\S+)\s+([\s\S]+)$/);
    if (!cadastro || !NOME.test(cadastro[1])) {
        return msg.reply('❌ Use: /alias <nome> [-q] [-desc "Descrição"] </comando argumentos | texto com {/comando}>');
    }
    const nome = nomeDoAlias(cadastro[1]);
    if (nome === '/all') return msg.reply('❌ O nome all é reservado para remover todos os aliases.');
    if (botConfig.commands.some(c => c.cmd === nome || c.aliases?.includes(nome))) {
        return msg.reply(`❌ ${nome} já é um comando do bot.`);
    }
    let comando = tirarQuiet(cadastro[2].trim());
    let descricao = '';
    const ASPAS = /(["“”](?:\\.|[^"“”\\])*["“”]|['‘’](?:\\.|[^'‘’\\])*['‘’])/.source;
    const tiraAspas = q => q.slice(1, -1).replace(/\\(["'\\])/g, '$1');
    // Só a descrição, sem comando: atualiza a de um alias que já existe
    const soDescricao = comando.match(new RegExp(`^-(?:desc|d)\\s+${ASPAS}$`));
    if (soDescricao) {
        const r = await dbRun('UPDATE command_aliases SET description = ? WHERE name = ?', [tiraAspas(soDescricao[1]), nome]);
        if (!r.changes) return msg.reply(`❌ Alias ${nome} não encontrado; informe também o comando para criá-lo.`);
        return msg.reply(`🔗 Descrição de ${nome} atualizada: ${tiraAspas(soDescricao[1])}`, undefined, { linkPreview: false });
    }
    if (/^-(desc|d)(?:\s|$)/.test(comando)) {
        const d = comando.match(new RegExp(`^-(?:desc|d)\\s+${ASPAS}\\s+([\\s\\S]+)$`));
        if (!d) return msg.reply('❌ Informe a descrição entre aspas e depois o comando.');
        descricao = tiraAspas(d[1]);
        comando = tirarQuiet(d[2].trim());
    }
    if (ehAliasDeTexto(comando)) {
        // Texto com {/comando}, como no /cron: o \n digitado vira quebra de linha
        comando = quebrarLinhas(comando);
        if (!comandosNoTexto(comando).length) {
            return msg.reply('❌ O destino deve ser um /comando ou um texto com pelo menos um {/comando}.\n' +
                '💡 _/alias orca Orca: {/defi orca}\\n Prjx: {/defi prjx}_');
        }
        const erro = await erroDosComandos(comando, '/alias');
        if (erro) return msg.reply(erro);
    } else {
        const destino = comando.split(/\s+/, 1)[0];
        const alvo = findCommand(destino);
        if (!alvo || alvo.cmd === '/alias') {
            return msg.reply('❌ O destino deve ser um comando ativo do bot; não pode ser outro alias cadastrado nem /alias.');
        }
        if (alvo.cmd === '/me') {
            const erro = await erroDosComandos(comando.slice(destino.length), '/alias');
            if (erro) return msg.reply(erro);
        }
    }
    await dbRun(`INSERT INTO command_aliases (name, description, command, quiet) VALUES (?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET description = excluded.description,
        command = excluded.command, quiet = excluded.quiet`, [nome, descricao, comando, quiet ? 1 : 0]);
    const detalhe = (descricao ? `\n📝 ${descricao}` : '') + (quiet ? '\n🔇 quiet' : '');
    await msg.reply(`🔗 Alias salvo: ${nome} → ${comando}${detalhe}`, undefined, { linkPreview: false });
}

module.exports = { cmdAlias };
