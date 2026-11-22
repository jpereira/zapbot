/*
 * Colored console log (print*) and uptime formatting.
 */

const util = require('util');
const colors = require('colors');
const { contextDebug, canFilterDebug } = require('./debugContext');
const { configureDebug, dataDebug, cleanTextDebug } = require('./debugData');
const { compileFilterDebug } = require('./debugOptions');
const { t } = require('./i18n');
const { maskLockPassword } = require('./util/lockPassword');

let filterText;
let filter;

function highlightMatches(line, regex, color) {
    const global = new RegExp(regex.source, regex.flags.replace(/g/g, '') + 'g');
    let outputAlt = '';
    let start = 0;
    for (const match of line.matchAll(global)) {
        if (!match[0]) continue; // An empty regex paints nothing, nor holds the terminal in a loop.
        outputAlt += color(line.slice(start, match.index)) + colors.red.bold(match[0]);
        start = match.index + match[0].length;
    }
    return outputAlt + color(line.slice(start));
}

function emitLog(line, color) {
    line = maskLockPassword(line); // a /notes -lock <password> never gets to the logs
    const cfg = configureDebug();
    const context = contextDebug();
    const detail = cfg.enabled && cfg.level >= 1 && context.chatId
        ? ` {chatId=${context.chatId} chatName=${context.chatName ?? ''}}` : '';
    line = cleanTextDebug(line) + cleanTextDebug(detail);
    const applyFilter = cfg.enabled && cfg.filter && canFilterDebug();
    if (applyFilter) {
        if (filterText !== cfg.filter) {
            filter = compileFilterDebug(cfg.filter);
            filterText = cfg.filter;
        }
        filter.lastIndex = 0;
        if (!filter.test(line)) return;
    }
    console.log(applyFilter ? highlightMatches(line, filter, color) : color(line));
    if (cfg.enabled && cfg.copyTo && !context.noTrace) {
        require('./debugCopy').copyLog(line);
    }
}

function printDebugLevel(level, ...args) {
    const cfg = configureDebug();
    if (!cfg.enabled || cfg.level < level || contextDebug().noTrace) return;
    const safe = args.map(a => dataDebug(a));
    emitLog(`[${getTimestamp()}] [DEBUG${level}] [${getCaller()}] ` +
        util.formatWithOptions({ depth: 4, maxArrayLength: 40 }, ...safe), colors.white);
}

function getBotUptime(startedTime) {
    const totalSeconds = Math.floor((Date.now() - startedTime) / 1000);

    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];

    if (days) parts.push(t(days === 1 ? 'log.dia' : 'log.dias', { n: days }));
    if (hours) parts.push(t(hours === 1 ? 'log.hora' : 'log.horas', { n: hours }));
    if (minutes) parts.push(t(minutes === 1 ? 'log.minuto' : 'log.minutos', { n: minutes }));
    if (!days && !hours) parts.push(t(seconds === 1 ? 'log.segundo' : 'log.segundos', { n: seconds }));

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

// A {/command} of the text that runs (/tts, /me, /cron...): the text that had it, the command and who:
//   [+]          EXPAND '/tts The dollar is {/stocks USD}' > /stocks USD 'Fulano'
function printExpand(who, origin, call) {
    const text = String(origin).length > 100 ? `${String(origin).slice(0, 100)}…` : origin;
    emitLog(`[${getTimestamp()}] [+]          EXPAND '${text}' > ${call} '${who}'`, colors.blue);
}

/*
 * A command that does not exist (or is disabled): the owner's always shows up; the others',
 * only in debug mode (otherwise any "/" typed in a group would flood the log).
 *   [!] ⚠️ 'Jorge' executed unknown command: '/tapioca'
 *   [DEBUG0] ⚠️ 'Fulano' executed unknown command: '/tapioca'
 */
function printCommandUnknown(who, call, { ofOwner: owner }) {
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
    printExpand,
    printInfo,
    printSuccess
};
