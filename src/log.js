/*
 * Colored console log (print*) and uptime formatting.
 */

const util = require('util');
const colors = require('colors');
const { contextDebug } = require('./debugContext');
const { configureDebug, dataDebug, cleanTextDebug } = require('./debugData');
const { compileFilterDebug } = require('./debugOptions');

let filterText;
let filter;

function emitLog(line, cor) {
    const cfg = configureDebug();
    const context = contextDebug();
    const detail = cfg.enabled && cfg.level >= 1 && context.chatId
        ? ` {chatId=${context.chatId} chatName=${context.chatName ?? ''}}` : '';
    line = cleanTextDebug(line) + cleanTextDebug(detail);
    if (cfg.enabled && cfg.filter) {
        if (filterText !== cfg.filter) {
            filter = compileFilterDebug(cfg.filter);
            filterText = cfg.filter;
        }
        filter.lastIndex = 0;
        if (!filter.test(line)) return;
    }
    console.log(cor(line));
    if (cfg.enabled && cfg.copyTo && !context.semRastro) {
        require('./debugCopy').copyLog(line);
    }
}

function printDebugLevel(level, ...args) {
    const cfg = configureDebug();
    if (!cfg.enabled || cfg.level < level || contextDebug().semRastro) return;
    const safe = args.map(a => dataDebug(a));
    emitLog(`[${getTimestamp()}] [DEBUG${level}] [${getCaller()}] ` +
        util.format(...safe), colors.white);
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
 * All the print* accept several arguments (like console.log).
 */
function printDebug(...args) {
    printDebugLevel(0, ...args);
}

function printInfo(...args) {
    emitLog(`[${getTimestamp()}] [!] ${util.format(...args.map(a => dataDebug(a)))}`, colors.yellow);
}

function printSuccess(...args) {
    emitLog(`[${getTimestamp()}] [+] ${util.format(...args.map(a => dataDebug(a)))}`, colors.green);
}

function printError(...args) {
    emitLog(`[${getTimestamp()}] [*] [${getCaller()}] ` +
        util.format(...args.map(a => dataDebug(a))), colors.red);
}

// Who ran a command, and where: [+] 'Fulano' executed '/help' in 'Família'
function printCall(who, call, chat) {
    emitLog(`[${getTimestamp()}] [+] '${who}' executed '${call}'` +
        `${chat ? ` in '${chat}'` : ''}`, colors.blue);
}

/*
 * A command that does not exist (or is disabled): the owner's always shows up; the others',
 * only in debug mode (otherwise any "/" typed in a group would flood the log).
 *   [!] ⚠️ 'Jorge' executed unknown command: '/tapioca'
 *   [DEBUG0] ⚠️ 'Fulano' executed unknown command: '/tapioca'
 */
function printCommandUnknown(who, call, { doDono: owner }) {
    const textAlt = `⚠️ '${who}' executed unknown command: '${call}'`;
    if (owner) emitLog(`[${getTimestamp()}] [!] ${textAlt}`, colors.yellow);
    else if (configureDebug().enabled) {
        emitLog(`[${getTimestamp()}] [DEBUG0] ${textAlt}`, colors.white);
    }
}

module.exports = {
    getBotUptime,
    printCall,
    printCommandUnknown,
    printDebug,
    printDebugLevel,
    printError,
    printInfo,
    printSuccess
};
