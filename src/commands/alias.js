/*
 * /alias: separates the registration options from the options of the command that will be saved.
 */
const { botConfig } = require('../botConfig');
const { dbReady, dbRun } = require('../db');
const { textIsAlias, listAliases } = require('../aliases');
const { commandsInText, commandsError, breakLines } = require('../textCommands');
const { findCommand } = require('./base');

const aliasName = nameAlt => '/' + nameAlt.replace(/^\//, '');
const NAME = /^\/?[\p{L}\p{N}_-]+$/u;

async function cmdAlias({ msg, args }) {
    await dbReady;
    const textAlt = args.trim();
    if (!textAlt || /^-(list|l)$/.test(textAlt)) return listAliases(msg);
    const removeAlt2 = textAlt.match(/^-(?:rem|rm)\s+(\S+)$/);
    if (removeAlt2) {
        if (removeAlt2[1] === 'all') {
            const r = await dbRun('DELETE FROM command_aliases');
            return msg.reply(`🗑️ Todos os aliases removidos (${r.changes}).`);
        }
        const nameAlt = aliasName(removeAlt2[1]);
        const r = await dbRun('DELETE FROM command_aliases WHERE name = ?', [nameAlt]);
        return msg.reply(r.changes
            ? `🗑️ Alias ${nameAlt} removido.` : `❌ Alias ${nameAlt} não encontrado.`);
    }
    const registration = textAlt.match(/^(\S+)\s+([\s\S]+)$/);
    if (!registration || !NAME.test(registration[1])) {
        return msg.reply('❌ Use: /alias <nome> [-desc "Descrição"] </comando argumentos | texto com {/comando}>');
    }
    const nameAlt = aliasName(registration[1]);
    if (nameAlt === '/all') return msg.reply('❌ O nome all é reservado para remover todos os aliases.');
    if (botConfig.commands.some(c => c.cmd === nameAlt || c.aliases?.includes(nameAlt))) {
        return msg.reply(`❌ ${nameAlt} já é um comando do bot.`);
    }
    let commandAlt = registration[2].trim();
    let description = '';
    if (/^-(desc|d)(?:\s|$)/.test(commandAlt)) {
        const d = commandAlt.match(
            /^-(?:desc|d)\s+(["“”](?:\\.|[^"“”\\])*["“”]|['‘’](?:\\.|[^'‘’\\])*['‘’])\s+([\s\S]+)$/
        );
        if (!d) return msg.reply('❌ Informe a descrição entre aspas e depois o comando.');
        description = d[1].slice(1, -1).replace(/\\(["'\\])/g, '$1');
        commandAlt = d[2].trim();
    }
    if (textIsAlias(commandAlt)) {
        // Text with {/command}, as in /cron: the typed \n becomes a line break
        commandAlt = breakLines(commandAlt);
        if (!commandsInText(commandAlt).length) {
            return msg.reply('❌ O destino deve ser um /comando ou um texto com pelo menos um {/comando}.\n' +
                '💡 _/alias orca Orca: {/defi orca}\\n Prjx: {/defi prjx}_');
        }
        const errorAlt = commandsError(commandAlt, '/alias');
        if (errorAlt) return msg.reply(errorAlt);
    } else {
        const destination = commandAlt.split(/\s+/, 1)[0];
        const target = findCommand(destination);
        if (!target || target.cmd === '/alias') {
            return msg.reply('❌ O destino deve ser um comando ativo do bot; não pode ser outro alias cadastrado nem /alias.');
        }
    }
    await dbRun(`INSERT INTO command_aliases (name, description, command) VALUES (?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET description = excluded.description,
        command = excluded.command`, [nameAlt, description, commandAlt]);
    const detail = description ? `\n📝 ${description}` : '';
    await msg.reply(`🔗 Alias salvo: ${nameAlt} → ${commandAlt}${detail}`);
}

module.exports = { cmdAlias };
