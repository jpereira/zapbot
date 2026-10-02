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

/*
 * A ajuda é lida no celular: cada frase numa linha, e o "Ex:" sempre na linha de
 * baixo, à esquerda, com um exemplo por linha ("Ex: /a 1, /a 2"). Fim de frase é
 * ". " seguido de maiúscula (ou "{"): "Máx. 20" e "(ex.: -taxas 50)" não quebram.
 */
const FIM_DE_FRASE = /(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ{])/u;

/**
 * @param {string} texto
 * @param {string} inicio  o que vem antes da 1ª frase ("" ou a coluna da opção)
 * @param {string} recuo   o começo das linhas seguintes
 */
function linhasDoTexto(texto, inicio = '', recuo = '') {
    const m = String(texto ?? '').match(/^(.*?)\s*Ex\.?:\s*(.+)$/s);
    const frases = (m ? m[1] : String(texto ?? '')).split(FIM_DE_FRASE).filter(Boolean);
    const exemplos = m ? m[2].split(/,\s+(?=[/-])/) : [];

    return [
        `${inicio}${frases[0] ?? ''}`,
        ...frases.slice(1).map(f => `${recuo}${f}`),
        ...exemplos.map((e, k) => `${recuo}${k ? '    ' : 'Ex: '}${e}`)
    ];
}

function formatCommandHelp(command) {
    // Cada forma do uso ("... ou ...") numa linha, alinhada embaixo da primeira
    const formas = interpolar(command.usage ?? command.cmd).split(/\s{2}ou\s{2}/);
    const lines = formas.map((f, i) => `${i ? '       ' : 'Usage: '}${f}`);

    if (command.help) lines.push(...linhasDoTexto(interpolar(command.help)));

    const cmdOpts = command.cmd_opts ?? [];
    const notEmpty = v => v != null && v !== '';

    const options = cmdOpts
        .filter(o => o?.opts?.length)
        .map(o => {
            // sinais: ['+', '-'] junta o par numa linha só (+o, -o), em vez de um em cada seção
            const opts = o.opts.filter(Boolean)
                .flatMap(opt => (o.sinais ?? ['-']).map(sinal => `${sinal}${opt}`)).join(', ');
            const values = (o.values ?? []).filter(notEmpty).join(' ');
            return { syntax: values ? `${opts} ${values}` : opts, desc: interpolar(o.desc) };
        });

    const positional = cmdOpts
        .filter(o => o?.argv?.length)
        .map(o => ({ syntax: o.argv.filter(Boolean).join(' '), desc: interpolar(o.desc) }));

    // Uma única coluna para Options e Arguments ficarem alinhados
    const width = Math.max(0, ...[...options, ...positional].map(o => o.syntax.length));
    const linha = (o) => linhasDoTexto(o.desc, `  ${o.syntax.padEnd(width)}  `, '    ');

    if (options.length) {
        lines.push('', 'Options:');
        options.forEach(o => lines.push(...linha(o)));
    }

    if (positional.length) {
        lines.push('', 'Arguments:');
        positional.forEach(a => lines.push(...linha(a)));
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
