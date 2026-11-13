/*
 * Utilitários dos comandos: comandos ativos, busca por nome/alias, texto de ajuda e erros.
 */

const { botConfig } = require('../botConfig');
const { idioma, t } = require('../i18n');
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
 * A ajuda (-h) é lida no celular, num bloco de código de uns 46 caracteres: só o essencial. O comando
 * mostra o resumo de uma linha, as opções com a 1ª frase de cada uma (o resto fica na página do site, cujo
 * link vem no fim) e no máximo 3 exemplos. Fim de frase é ". " seguido de maiúscula (ou "{"): "Máx. 20"
 * e "(ex.: -taxas 50)" não quebram.
 */
const FIM_DE_FRASE = /(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ{])/u;
const LARGURA = 46;        // colunas do bloco no celular
const MAX_FRASE = 70;      // a 1ª frase de uma opção passa disso: corta numa vírgula (ou numa palavra, com "…")
const MAX_EXEMPLOS = 3;
const SITE = 'https://jpereira.github.io/zapbot';

// A 1ª frase, só até o primeiro ":", ";" ou " (" (o que vem depois fica no site) e sem passar de MAX_FRASE
function primeiraFrase(texto) {
    let frase = String(texto ?? '').split(FIM_DE_FRASE).filter(Boolean)[0]?.trim() ?? '';
    const corte = [...frase.matchAll(/:\s|;\s|\s\(|\s[—–]\s/g)].find(m => m.index >= 12)?.index;
    if (corte != null) frase = frase.slice(0, corte);
    if (frase.length > MAX_FRASE) {
        const ate = frase.slice(0, MAX_FRASE);
        const virgula = ate.lastIndexOf(', ');
        frase = virgula >= 24 ? ate.slice(0, virgula) : `${ate.replace(/\s+\S*$/, '')}…`;
    }
    // Sem parêntese ou aspas abertos no fim
    const aberto = frase.lastIndexOf('(');
    if (aberto > 0 && aberto > frase.lastIndexOf(')')) frase = frase.slice(0, aberto).trim();
    return frase.replace(/[.,;:]$/, '');
}

// O texto quebrado em linhas de até `largura` caracteres, entre palavras
function quebrar(texto, largura) {
    const linhas = [];
    let atual = '';
    for (const palavra of String(texto).split(/\s+/).filter(Boolean)) {
        if (atual && atual.length + 1 + palavra.length > largura) {
            linhas.push(atual);
            atual = palavra;
        } else {
            atual = atual ? `${atual} ${palavra}` : palavra;
        }
    }
    return atual ? [...linhas, atual] : linhas;
}

/*
 * Uma opção ou argumento: se o nome e a 1ª frase cabem numa linha, ficam juntos (nomes alinhados); senão,
 * o nome fica sozinho e a descrição vem abaixo, recuada.
 * @param {number} coluna  a largura da coluna dos nomes que cabem junto da descrição
 */
function linhaDaOpcao({ syntax, desc, cabe }, coluna) {
    const frase = primeiraFrase(desc);
    if (!frase) return [`  ${syntax}`];
    if (cabe) return [`  ${syntax.padEnd(coluna)}  ${frase}`];
    return [`  ${syntax}`, ...quebrar(frase, LARGURA - 4).map(r => `    ${r}`)];
}

// Os exemplos do comando; sem eles, os das opções (os que são comandos inteiros primeiro; um pedaço como
// "-ss 1.5" ganha o comando na frente), no máximo MAX_EXEMPLOS
function exemplosDo(command, cmdOpts) {
    let lista = command.ex ?? [];
    if (!lista.length) {
        const dasOpcoes = cmdOpts.flatMap(o => o.ex ?? []);
        const inteiros = dasOpcoes.filter(e => e.startsWith('/'));
        lista = inteiros.length ? inteiros : dasOpcoes.map(e => `${command.cmd} ${e}`);
    }
    return [...new Set(lista)].slice(0, MAX_EXEMPLOS);
}

// O link da página do comando no site (a pt-BR fica em /pt-BR/)
const paginaDoComando = (cmd) => `${SITE}${idioma() === 'pt_BR' ? '/pt-BR' : ''}/comandos/${cmd.replace(/^\//, '')}/`;

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
    const original = command;
    command = localizar(command);
    const doProtocolo = protocolo ? command.protocolos?.[protocolo] : null;
    if (doProtocolo) command = { ...command, usage: doProtocolo.usage, summary: primeiraFrase(doProtocolo.help), ex: doProtocolo.ex };
    const valeAqui = (o) => !doProtocolo || !o.protocolos?.length || o.protocolos.includes(protocolo);

    // Cada forma do uso ("... ou ...") numa linha, alinhada embaixo da primeira
    const formas = String(command.usage ?? command.cmd).split(/\s{2}(?:or|ou)\s{2}/);
    const recuo = ' '.repeat(t('help.usage').length);
    const lines = formas.map((f, i) => `${i ? recuo : t('help.usage')}${f}`);

    // O que o comando faz, em uma linha (o texto longo fica no site)
    const resumo = command.summary ?? primeiraFrase(command.help);
    if (resumo) lines.push(...quebrar(resumo, LARGURA));

    const cmdOpts = (command.cmd_opts ?? []).filter(valeAqui);
    const notEmpty = v => v != null && v !== '';

    const options = cmdOpts
        .filter(o => o?.opts?.length)
        .map(o => {
            // sinais: ['+', '-'] junta o par numa linha só (+o, -o), em vez de um em cada seção
            const opts = o.opts.filter(Boolean)
                .flatMap(opt => (o.sinais ?? ['-']).map(sinal => `${sinal}${opt}`)).join(', ');
            const values = (o.values ?? []).filter(notEmpty).join(' ');
            return { syntax: values ? `${opts} ${values}` : opts, desc: o.desc, o };
        });

    // A ajuda de um protocolo não precisa do argumento do protocolo
    const positional = cmdOpts
        .filter(o => o?.argv?.length && !doProtocolo)
        .map(o => ({ syntax: o.argv.filter(Boolean).join(' '), desc: o.desc }));

    // Cabem numa linha (nome + 1ª frase)? Esses ficam alinhados numa coluna; os outros, nome e descrição embaixo
    const todas = [...options, ...positional];
    for (const o of todas) o.cabe = 2 + o.syntax.length + 2 + primeiraFrase(o.desc).length <= LARGURA;
    const coluna = Math.max(0, ...todas.filter(o => o.cabe).map(o => o.syntax.length));
    for (const o of todas) o.cabe = o.cabe && 2 + coluna + 2 + primeiraFrase(o.desc).length <= LARGURA;
    const linha = (o) => linhaDaOpcao(o, coluna);

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
        options.forEach(o => lines.push(...linha(o)));
    }

    if (positional.length) {
        lines.push('', t('help.arguments'));
        positional.forEach(a => lines.push(...linha(a)));
    }

    const exemplos = exemplosDo(command, cmdOpts);
    if (exemplos.length) {
        lines.push('');
        exemplos.forEach((e, k) => lines.push(`${k ? '    ' : 'Ex: '}${e}`));
    }

    if (command.aliases?.length) {
        lines.push('', t('help.aliases', { list: command.aliases.join(', ') }));
    }

    lines.push('', t('help.more', { url: paginaDoComando(original.cmd) }));

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
