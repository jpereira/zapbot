/*
 * /alias: separa as opções de cadastro das opções do comando que será salvo.
 */
const { botConfig } = require('../botConfig');
const { dbGet, dbPronto, dbRun } = require('../db');
const { blocoDoAlias, ehAliasDeTexto, listarAliases } = require('../aliases');
const { comandosNoTexto, erroDosComandos, quebrarLinhas } = require('../comandosNoTexto');
const { findCommand } = require('./base');
const { t } = require('../i18n');

const nomeDoAlias = nome => '/' + nome.replace(/^\//, '');
const NOME = /^\/?[\p{L}\p{N}_.-]+$/u;

async function cmdAlias({ msg, args }) {
    await dbPronto;
    const texto = args.trim();
    if (!texto || /^-(list|l)$/.test(texto)) return listarAliases(msg);
    const mover = texto.match(/^-(?:move|m)\s+(\S+)\s+(\S+)$/);
    if (/^-(?:move|m)(?:\s|$)/.test(texto) && !mover) return msg.reply(t('adm.alias.usageMove'));
    if (mover) {
        const [antigo, novo] = [nomeDoAlias(mover[1]), nomeDoAlias(mover[2])];
        if (!NOME.test(mover[2])) return msg.reply(t('adm.alias.invalidName', { nome: novo }));
        if (novo === '/all') return msg.reply(t('adm.alias.allReserved'));
        if (botConfig.commands.some(c => c.cmd === novo || c.aliases?.includes(novo))) {
            return msg.reply(t('adm.alias.isCommand', { nome: novo }));
        }
        if (!(await dbGet('SELECT 1 FROM command_aliases WHERE name = ?', [antigo]))) {
            return msg.reply(t('adm.alias.notFound', { nome: antigo }));
        }
        if (antigo === novo) return msg.reply(t('adm.alias.sameName', { nome: novo }));
        if (await dbGet('SELECT 1 FROM command_aliases WHERE name = ?', [novo])) {
            return msg.reply(t('adm.alias.exists', { nome: novo }));
        }
        await dbRun('UPDATE command_aliases SET name = ? WHERE name = ?', [novo, antigo]);
        return msg.reply(t('adm.alias.renamed', { antigo, novo }));
    }
    const remover = texto.match(/^-rm\s+(\S[\s\S]*)$/);
    if (remover) {
        const nomes = [...new Set(remover[1].split(/[\s,]+/).filter(Boolean).map(nomeDoAlias))];
        if (nomes.includes('/all')) {
            const r = await dbRun('DELETE FROM command_aliases');
            return msg.reply(t('adm.alias.allRemoved', { n: r.changes }));
        }
        const removidos = [];
        const faltando = [];
        for (const nome of nomes) {
            const r = await dbRun('DELETE FROM command_aliases WHERE name = ?', [nome]);
            (r.changes ? removidos : faltando).push(nome);
        }
        if (nomes.length === 1) {
            return msg.reply(t(removidos.length ? 'adm.alias.removed' : 'adm.alias.notFound', { nome: nomes[0] }));
        }
        return msg.reply([
            removidos.length && t('adm.alias.removedMany', { n: removidos.length, lista: removidos.join(', ') }),
            faltando.length && t('adm.alias.missing', { n: faltando.length, lista: faltando.join(', ') })
        ].filter(Boolean).join('\n'));
    }
    // Só o nome (/alias /dolar): mostra o que o alias faz; se não for um alias, o erro
    if (/^\/?[\p{L}\p{N}_.][\p{L}\p{N}_.-]*$/u.test(texto)) {
        const nome = nomeDoAlias(texto);
        const alias = await dbGet('SELECT * FROM command_aliases WHERE name = ?', [nome]);
        if (alias) return msg.reply(blocoDoAlias(alias), undefined, { linkPreview: false });
        const ehComando = botConfig.commands.some(c => c.cmd === nome || c.aliases?.includes(nome));
        return msg.reply(t(ehComando ? 'adm.alias.isCommand' : 'adm.alias.notFound', { nome }));
    }
    // -q|-quiet: sem o cabeçalho "🔗 Alias ..." ao executar; vale antes do nome, depois dele ou da descrição
    let quiet = false;
    const tirarQuiet = (s) => s.replace(/^-(?:quiet|q)(?:\s+|$)/, () => { quiet = true; return ''; });
    const cadastro = tirarQuiet(texto).match(/^(\S+)\s+([\s\S]+)$/);
    if (!cadastro || !NOME.test(cadastro[1])) {
        return msg.reply(t('adm.alias.usage'));
    }
    const nome = nomeDoAlias(cadastro[1]);
    if (nome === '/all') return msg.reply(t('adm.alias.allReserved'));
    if (botConfig.commands.some(c => c.cmd === nome || c.aliases?.includes(nome))) {
        return msg.reply(t('adm.alias.isCommand', { nome }));
    }
    let comando = tirarQuiet(cadastro[2].trim());
    let descricao = '';
    const ASPAS = /(["“”](?:\\.|[^"“”\\])*["“”]|['‘’](?:\\.|[^'‘’\\])*['‘’])/.source;
    const tiraAspas = q => q.slice(1, -1).replace(/\\(["'\\])/g, '$1');
    // Só a descrição, sem comando: atualiza a de um alias que já existe
    const soDescricao = comando.match(new RegExp(`^-(?:desc|d)\\s+${ASPAS}$`));
    if (soDescricao) {
        const r = await dbRun('UPDATE command_aliases SET description = ? WHERE name = ?', [tiraAspas(soDescricao[1]), nome]);
        if (!r.changes) return msg.reply(t('adm.alias.notFoundDesc', { nome }));
        return msg.reply(t('adm.alias.descUpdated', { nome, desc: tiraAspas(soDescricao[1]) }), undefined, { linkPreview: false });
    }
    if (/^-(desc|d)(?:\s|$)/.test(comando)) {
        const d = comando.match(new RegExp(`^-(?:desc|d)\\s+${ASPAS}\\s+([\\s\\S]+)$`));
        if (!d) return msg.reply(t('adm.alias.needDesc'));
        descricao = tiraAspas(d[1]);
        comando = tirarQuiet(d[2].trim());
    }
    if (ehAliasDeTexto(comando)) {
        // Texto com {/comando}, como no /cron: o \n digitado vira quebra de linha
        comando = quebrarLinhas(comando);
        if (!comandosNoTexto(comando).length) {
            return msg.reply(t('adm.alias.badTarget'));
        }
        const erro = await erroDosComandos(comando, '/alias');
        if (erro) return msg.reply(erro);
    } else {
        const destino = comando.split(/\s+/, 1)[0];
        const alvo = findCommand(destino);
        if (!alvo || alvo.cmd === '/alias') {
            return msg.reply(t('adm.alias.badTargetCmd'));
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
    await msg.reply(t('adm.alias.saved', { nome, comando, detalhe }), undefined, { linkPreview: false });
}

module.exports = { cmdAlias };
