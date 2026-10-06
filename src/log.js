/*
 * Log colorido no console (print*) e formatação do tempo no ar.
 */

const util = require('util');
const colors = require('colors');
const { contextoDebug, podeFiltrarDebug } = require('./debugContexto');
const { configurarDebug, dadosDebug, limparTextoDebug } = require('./debugDados');
const { compilarFiltroDebug } = require('./debugOpcoes');

let filtroTexto;
let filtro;

function realcarMatches(linha, regex, cor) {
    const global = new RegExp(regex.source, regex.flags.replace(/g/g, '') + 'g');
    let saida = '';
    let inicio = 0;
    for (const match of linha.matchAll(global)) {
        if (!match[0]) continue; // Regex vazia não pinta nada, nem segura o terminal num loop.
        saida += cor(linha.slice(inicio, match.index)) + colors.red.bold(match[0]);
        inicio = match.index + match[0].length;
    }
    return saida + cor(linha.slice(inicio));
}

function emitirLog(linha, cor) {
    const cfg = configurarDebug();
    const contexto = contextoDebug();
    const detalhe = cfg.enabled && cfg.level >= 1 && contexto.chatId
        ? ` {chatId=${contexto.chatId} chatName=${contexto.chatName ?? ''}}` : '';
    linha = limparTextoDebug(linha) + limparTextoDebug(detalhe);
    const aplicarFiltro = cfg.enabled && cfg.filter && podeFiltrarDebug();
    if (aplicarFiltro) {
        if (filtroTexto !== cfg.filter) {
            filtro = compilarFiltroDebug(cfg.filter);
            filtroTexto = cfg.filter;
        }
        filtro.lastIndex = 0;
        if (!filtro.test(linha)) return;
    }
    console.log(aplicarFiltro ? realcarMatches(linha, filtro, cor) : cor(linha));
    if (cfg.enabled && cfg.copyTo && !contexto.semRastro) {
        require('./debugCopia').copiarLog(linha);
    }
}

function printDebugNivel(nivel, ...args) {
    const cfg = configurarDebug();
    if (!cfg.enabled || cfg.level < nivel || contextoDebug().semRastro) return;
    const seguros = args.map(a => dadosDebug(a));
    emitirLog(`[${getTimestamp()}] [DEBUG${nivel}] [${getCaller()}] ` +
        util.formatWithOptions({ depth: 4, maxArrayLength: 40 }, ...seguros), colors.white);
}

function getBotUptime(startedTime) {
    const totalSeconds = Math.floor((Date.now() - startedTime) / 1000);

    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];

    if (days) parts.push(`${days} ${days === 1 ? 'dia' : 'dias'}`);
    if (hours) parts.push(`${hours} ${hours === 1 ? 'hora' : 'horas'}`);
    if (minutes) parts.push(`${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`);
    if (!days && !hours) parts.push(`${seconds} ${seconds === 1 ? 'segundo' : 'segundos'}`);

    return parts.join(', ');
}

function getTimestamp() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');

    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
           `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function getCaller() {
    return new Error().stack.split('\n').slice(1)
        .find(l => !l.includes(__filename))?.trim()?.replace('at ', '');
}

/*
 * Todos os print* aceitam vários argumentos (como console.log).
 */
function printDebug(...args) {
    printDebugNivel(0, ...args);
}

function printInfo(...args) {
    emitirLog(`[${getTimestamp()}] [!] ${util.format(...args.map(a => dadosDebug(a)))}`, colors.yellow);
}

function printSuccess(...args) {
    emitirLog(`[${getTimestamp()}] [+] ${util.format(...args.map(a => dadosDebug(a)))}`, colors.green);
}

function printError(...args) {
    emitirLog(`[${getTimestamp()}] [*] [${getCaller()}] ` +
        util.format(...args.map(a => dadosDebug(a))), colors.red);
}

// Quem executou um comando, e onde: [+] 'Fulano' executed '/help' in 'Família'
function printCall(quem, call, chat) {
    emitirLog(`[${getTimestamp()}] [+] '${quem}' executed '${call}'` +
        `${chat ? ` in '${chat}'` : ''}`, colors.blue);
}

/*
 * Comando que não existe (ou está desativado): o do dono sempre aparece; o dos outros,
 * só no modo debug (senão, qualquer "/" digitado num grupo encheria o log).
 *   [!] ⚠️ 'Jorge' executed unknown command: '/tapioca'
 *   [DEBUG0] ⚠️ 'Fulano' executed unknown command: '/tapioca'
 */
function printComandoDesconhecido(quem, call, { doDono }) {
    const texto = `⚠️ '${quem}' executed unknown command: '${call}'`;
    if (doDono) emitirLog(`[${getTimestamp()}] [!] ${texto}`, colors.yellow);
    else if (configurarDebug().enabled) {
        emitirLog(`[${getTimestamp()}] [DEBUG0] ${texto}`, colors.white);
    }
}

module.exports = {
    getBotUptime,
    printCall,
    printComandoDesconhecido,
    printDebug,
    printDebugNivel,
    printError,
    printInfo,
    printSuccess
};
