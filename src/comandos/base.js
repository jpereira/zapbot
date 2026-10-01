/*
 * Utilitários dos comandos: comandos ativos, busca por nome/alias, texto de ajuda e erros.
 */

const { botConfig } = require('../botConfig');
const { BACKUP_DIR, CACHE_DIR, MEDIA_DIR, TMP_DIR } = require('../constantes');
const { getSetting } = require('../settings');

// Comandos ativos: os do comandos.json menos os do setting 'commands.disabled' (via /set)
function activeCommands() {
    const desativados = getSetting('commands.disabled');
    return botConfig.commands.filter(c => !desativados.includes(c.cmd));
}

function findCommand(name) {
    return activeCommands().find(c => c.cmd === name || c.aliases?.includes(name));
}

/*
 * Variáveis que os textos do comandos.json podem citar (ex.: "Exibe o espaço
 * ocupado em ${CACHE_DIR}"): o JSON não tem template strings, então a ajuda
 * troca cada ${NOME} conhecido pelo valor. Um ${NOME} desconhecido fica como está.
 */
const VARIAVEIS_DA_AJUDA = { BACKUP_DIR, CACHE_DIR, MEDIA_DIR, TMP_DIR };

const interpolar = (texto) => String(texto ?? '')
    .replace(/\$\{(\w+)\}/g, (original, nome) => VARIAVEIS_DA_AJUDA[nome] ?? original);

/**
 * Formata a ajuda de um comando no estilo "command -help".
 * (Antes existiam duas funções quase idênticas; agora só esta.)
 */
function formatCommandHelp(command) {
    const lines = [`Usage: ${interpolar(command.usage ?? command.cmd)}`];

    if (command.help) lines.push(interpolar(command.help));

    const cmdOpts = command.cmd_opts ?? [];
    const notEmpty = v => v != null && v !== '';

    const options = cmdOpts
        .filter(o => o?.opts?.length)
        .map(o => {
            const opts = o.opts.filter(Boolean).map(opt => `-${opt}`).join(', ');
            const values = (o.values ?? []).filter(notEmpty).join(' ');
            return { syntax: values ? `${opts} ${values}` : opts, desc: interpolar(o.desc) };
        });

    const positional = cmdOpts
        .filter(o => o?.argv?.length)
        .map(o => ({ syntax: o.argv.filter(Boolean).join(' '), desc: interpolar(o.desc) }));

    // Uma única coluna para Options e Arguments ficarem alinhados
    const width = Math.max(0, ...[...options, ...positional].map(o => o.syntax.length));

    if (options.length) {
        lines.push('', 'Options:');
        options.forEach(o => lines.push(`  ${o.syntax.padEnd(width)}  ${o.desc}`));
    }

    if (positional.length) {
        lines.push('', 'Arguments:');
        positional.forEach(a => lines.push(`  ${a.syntax.padEnd(width)}  ${a.desc}`));
    }

    if (command.aliases?.length) {
        lines.push('', `Aliases: ${command.aliases.join(', ')}`);
    }

    return lines.join('\n');
}

function getCommandSyntax(cmd) {
    const command = findCommand(cmd);
    return command ? formatCommandHelp(command) : null;
}

// Resposta padrão de erro dos comandos /get e /cache
function formatarErroComando(e) {
    let texto = `⚠️💥 ${e.message}.`;

    if (e?.cause?.cmd) texto += `\n🛠️ *Cmd*:    ${e.cause.cmd}`;
    if (e?.cause?.inner) texto += `\n⛓️‍💥 *Inner*:  ${e.cause.inner.message || e.cause.inner}`;

    return `${texto}\n`;
}

module.exports = {
    activeCommands,
    findCommand,
    formatCommandHelp,
    formatarErroComando,
    getCommandSyntax,
    interpolar
};
