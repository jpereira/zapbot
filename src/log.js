/*
 * Log colorido no console (print*) e formatação do tempo no ar.
 */

const util = require('util');
const colors = require('colors');

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
    // [0] Error, [1] getCaller, [2] printX, [3] quem chamou printX
    return new Error().stack.split('\n')[3]?.trim()?.replace('at ', '');
}

/*
 * Todos os print* aceitam vários argumentos (como console.log).
 * Antes, printError('msg:', err.message) descartava o segundo argumento.
 */
function printDebug(...args) {
    console.log(colors.white(`[${getTimestamp()}] [DEBUG] [${getCaller()}] ${util.format(...args)}`));
}

function printInfo(...args) {
    console.log(colors.yellow(`[${getTimestamp()}] [!] ${util.format(...args)}`));
}

function printSuccess(...args) {
    console.log(colors.green(`[${getTimestamp()}] [+] ${util.format(...args)}`));
}

function printError(...args) {
    console.log(colors.red(`[${getTimestamp()}] [*] [${getCaller()}] ${util.format(...args)}`));
}

// Quem executou um comando, e onde: [+] 'Fulano' executed '/help' in 'Família'
function printCall(quem, call, chat) {
    console.log(colors.blue(`[${getTimestamp()}] [+] '${quem}' executed '${call}'${chat ? ` in '${chat}'` : ''}`));
}

/*
 * Comando que não existe (ou está desativado): o do dono sempre aparece; o dos outros,
 * só no modo debug (senão, qualquer "/" digitado num grupo encheria o log).
 *   [!] ⚠️ 'Jorge' executed unknown command: '/tapioca'
 *   [DEBUG] ⚠️ 'Fulano' executed unknown command: '/tapioca'
 */
function printComandoDesconhecido(quem, call, { doDono }) {
    const texto = `⚠️ '${quem}' executed unknown command: '${call}'`;
    if (doDono) console.log(colors.yellow(`[${getTimestamp()}] [!] ${texto}`));
    else console.log(colors.white(`[${getTimestamp()}] [DEBUG] ${texto}`));
}

module.exports = {
    getBotUptime,
    printCall,
    printComandoDesconhecido,
    printDebug,
    printError,
    printInfo,
    printSuccess
};
