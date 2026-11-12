/*
 * Utilitários dos comandos: comandos ativos, busca por nome/alias, texto de ajuda e erros.
 */

const { botConfig } = require('../botConfig');
const { t } = require('../i18n');
const { getSetting } = require('../settings');
const { localizar } = require('./localizar');

// Comandos ativos: os do comandos.js menos os do setting 'commands.disabled' (via /set)
function activeCommands() {
    const desativados = getSetting('commands.disabled');
    return botConfig.commands.filter(c => !desativados.includes(c.cmd));
}

function findCommand(name) {
    return activeCommands().find(c => c.cmd === name || c.aliases?.includes(name));
}

// Comandos ativos cujo nome ou alias começa com o digitado (ex.: /watc → /watch), sem repetir
function commandsByPrefix(name) {
    if (!/^\/./.test(name)) return [];
    return activeCommands().filter(c => [c.cmd, ...(c.aliases ?? [])].some(n => n.startsWith(name)));
}

/*
 * A ajuda é lida no celular: cada frase numa linha, e o "Ex:" (o `ex` do comandos.js) sempre na
 * linha de baixo, à esquerda, com um exemplo por linha ("Ex: /a 1, /a 2"). Fim de frase é
 * ". " seguido de maiúscula (ou "{"): "Máx. 20" e "(ex.: -taxas 50)" não quebram.
 */
const FIM_DE_FRASE = /(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ{])/u;

/**
 * @param {string} texto
 * @param {string[]} exemplos  o `ex` do comandos.js: um por linha, depois das frases
 * @param {string} inicio  o que vem antes da 1ª frase ("" ou a coluna da opção)
 * @param {string} recuo   o começo das linhas seguintes
 */
function linhasDoTexto(texto, exemplos = [], inicio = '', recuo = '') {
    const frases = String(texto ?? '').split(FIM_DE_FRASE).filter(Boolean);

    return [
        `${inicio}${frases[0] ?? ''}`,
        ...frases.slice(1).map(f => `${recuo}${f}`),
        ...exemplos.map((e, k) => `${recuo}${k ? '    ' : 'Ex: '}${e}`)
    ];
}

/*
 * Comando com protocolos (o /defi): cada opção diz de quais é ("protocolos":
 * ["orca"]); sem a lista, vale para todos. Com o protocolo (/defi orca -help),
 * a ajuda é só dele: o uso, o texto e as opções que valem ali. Sem ele, todas,
 * agrupadas por protocolo (" > Orca", " > Project X e Morpho", " > Todos").
 */
function grupoDaOpcao(command, o) {
    if (!o.protocolos?.length) return { chave: '', ordem: Infinity, titulo: t('help.groupAll') };
    const nomes = o.protocolos.map(p => command.protocolos[p]?.nome ?? p);
    const titulo = nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')}${t('help.and')}${nomes.at(-1)}` : nomes[0];
    return { chave: o.protocolos.join(','), ordem: o.protocolos.length, titulo };
}

/**
 * @param {object} command  a entrada do comandos.js
 * @param {object} [o]
 * @param {string} [o.protocolo]  só a ajuda deste protocolo (as chaves de command.protocolos)
 */
function formatCommandHelp(command, { protocolo } = {}) {
    command = localizar(command);
    const doProtocolo = protocolo ? command.protocolos?.[protocolo] : null;
    if (doProtocolo) command = { ...command, usage: doProtocolo.usage, help: doProtocolo.help, ex: doProtocolo.ex };
    const valeAqui = (o) => !doProtocolo || !o.protocolos?.length || o.protocolos.includes(protocolo);

    // Cada forma do uso ("... ou ...") numa linha, alinhada embaixo da primeira
    const formas = String(command.usage ?? command.cmd).split(/\s{2}(?:or|ou)\s{2}/);
    const recuo = ' '.repeat(t('help.usage').length);
    const lines = formas.map((f, i) => `${i ? recuo : t('help.usage')}${f}`);

    if (command.help) lines.push(...linhasDoTexto(command.help, command.ex));

    const cmdOpts = (command.cmd_opts ?? []).filter(valeAqui);
    const notEmpty = v => v != null && v !== '';

    const options = cmdOpts
        .filter(o => o?.opts?.length)
        .map(o => {
            // sinais: ['+', '-'] junta o par numa linha só (+o, -o), em vez de um em cada seção
            const opts = o.opts.filter(Boolean)
                .flatMap(opt => (o.sinais ?? ['-']).map(sinal => `${sinal}${opt}`)).join(', ');
            const values = (o.values ?? []).filter(notEmpty).join(' ');
            return { syntax: values ? `${opts} ${values}` : opts, desc: o.desc, ex: o.ex, o };
        });

    // A ajuda de um protocolo não precisa do argumento do protocolo
    const positional = cmdOpts
        .filter(o => o?.argv?.length && !doProtocolo)
        .map(o => ({ syntax: o.argv.filter(Boolean).join(' '), desc: o.desc, ex: o.ex }));

    // Uma única coluna para opções e argumentos ficarem alinhados.
    const width = Math.max(0, ...[...options, ...positional].map(o => o.syntax.length));
    const linha = (o) => linhasDoTexto(o.desc, o.ex, `  ${o.syntax.padEnd(width)}  `, '    ');

    // "espacado": uma linha em branco entre as opções (ajudas longas, como a do /bot)
    if (options.length && command.protocolos && !doProtocolo) {
        // Agrupadas: os de um protocolo só primeiro, os que valem para todos no fim
        const grupos = new Map();
        for (const o of options) {
            const g = grupoDaOpcao(command, o.o);
            if (!grupos.has(g.chave)) grupos.set(g.chave, { ...g, opcoes: [] });
            grupos.get(g.chave).opcoes.push(o);
        }
        lines.push('', t('help.options'));
        [...grupos.values()].sort((a, b) => a.ordem - b.ordem).forEach((g, i) => {
            lines.push(...(i ? [''] : []), ` > ${g.titulo}`);
            g.opcoes.forEach(o => lines.push(...linha(o)));
        });
    } else if (options.length) {
        lines.push('', t('help.options'));
        options.forEach((o, i) => lines.push(...(command.espacado && i ? [''] : []), ...linha(o)));
    }

    if (positional.length) {
        lines.push('', t('help.arguments'));
        positional.forEach(a => lines.push(...linha(a)));
    }

    lines.push('', t('help.helpLine'));

    if (command.aliases?.length) {
        lines.push('', t('help.aliases', { list: command.aliases.join(', ') }));
    }

    return lines.join('\n');
}

// A ajuda do comando (com o protocolo, só a dele: /defi orca -help)
function getCommandSyntax(cmd, protocolo) {
    const command = findCommand(cmd);
    return command ? formatCommandHelp(command, { protocolo }) : null;
}

// O protocolo pedido junto com o -help (/defi orca -help ou, pelo alias, /defi liqswp -help)
const protocoloDaAjuda = (command, palavras) => {
    const protocolos = command?.protocolos ?? {};
    for (const p of palavras.map(x => String(x ?? '').toLowerCase())) {
        const chave = protocolos[p] ? p : Object.keys(protocolos).find(k => protocolos[k].aliases?.includes(p));
        if (chave) return chave;
    }
    return undefined;
};

// Resposta padrão de erro dos comandos /get e /cache
function formatarErroComando(e) {
    let texto = `⚠️💥 ${e.message}.`;

    const cmd = e?.cmd ?? e?.cause?.cmd;
    if (cmd) texto += `\n🛠️ *Cmd*:    ${cmd}`;
    const inner = e?.cause?.inner ?? e?.cause;
    if (inner) texto += `\n⛓️‍💥 *Inner*:  ${inner.message || inner}`;

    return `${texto}\n`;
}

module.exports = {
    activeCommands,
    commandsByPrefix,
    findCommand,
    formatCommandHelp,
    formatarErroComando,
    getCommandSyntax,
    protocoloDaAjuda
};
