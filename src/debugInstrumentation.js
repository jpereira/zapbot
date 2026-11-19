/*
 * Tracks exported functions when the modules are loaded. Does not transform
 * sync functions into async and preserves the integrations' this.
 *
 * Levels (cumulative):
 * 1  what the bot is calling, one line each when it finishes: commands, database queries, HTTP requests,
 *    external processes, email and the WhatsApp calls (see CALLS and `summarize`)
 * 2  the same calls with their arguments (start/end) and every exported function of the modules, with the
 *    depth and the duration
 * 3  the results, and the execution in Chromium
 */
const Module = require('module');
const path = require('path');
const { withContextDebug, contextDebug } = require('./debugContext');
const { configureDebug } = require('./debugData');
const { printDebugLevel } = require('./log');
const { cleanTextDebug } = require('./debugData');

const ROOT = __dirname + path.sep;
const IGNORE = new Set(['log.js', 'settings.js', 'botConfig.js']);
const wrappers = new WeakMap();
const trackedAlt = new WeakSet();
let installed = false;
let sequence = 0;

// One line of text, without credentials and short enough for a log
function short(value, max = 140) {
    const text = cleanTextDebug(String(value ?? '')).replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max)}…` : text;
}

// What each call looks like in the level 1 line: (args, result, error, name) → text
const SUMMARIES = {
    command: (args, result, error, name) => `command ${name.replace(/^handler\./, '')} ${short(args[0]?.args, 100)}`.trim(),
    sql: (args) => `database ${short(args[0], 160)}`,
    http: (args, result, error, name) => {
        const config = typeof args[0] === 'object' ? args[0] : null;
        const method = (config?.method ?? name.split('.').pop()).toUpperCase();
        const status = result?.status ?? error?.response?.status ?? error?.code ?? '';
        return `request ${method} ${short(config?.url ?? args[0], 160)}${status ? ` → ${status}` : ''}`;
    },
    process: (args) => `process ${short([args[0], ...(Array.isArray(args[1]) ? args[1] : [])].join(' '), 160)}`,
    email: (args) => `email to=${short(args[0]?.to, 60)} subject="${short(args[0]?.subject, 60)}"`,
    whatsapp: (args, result, error, name) => `whatsapp ${name.split('.').pop()} ${short(typeof args[0] === 'object' ? args[0]?._serialized ?? '' : args[0], 60)}`
};

/**
 * @param {Function} fn
 * @param {string} nameAlt
 * @param {number} level   the lowest level that traces it
 * @param {Function} [summarize]  one of SUMMARIES: at exactly `level` it prints one line when it finishes; from the next
 * level on, the full start/end with the arguments (and, at 3, the result)
 * @param {boolean} [onlyLine]  only the level 1 line: from level 2 on the function already shows up on its own (the commands)
 */
function wrap(fn, nameAlt, level, summarize = null, onlyLine = false) {
    if (!onlyLine && wrappers.has(fn)) return wrappers.get(fn);
    function tracked(...args) {
        const cfg = configureDebug();
        if (!cfg.enabled || cfg.level < level || (onlyLine && cfg.level > level) || contextDebug().semRastro) {
            return fn.apply(this, args);
        }
        // Level 1: just that it happened (and how long it took), in one line
        if (summarize && cfg.level === level) {
            const start = Date.now();
            const line = (result, error) => printDebugLevel(level,
                `${summarize(args, result, error, nameAlt)} ${error ? `error ${short(error?.message ?? error, 100)} ` : ''}+${Date.now() - start}ms`);
            let compactResult;
            try {
                compactResult = fn.apply(this, args);
            } catch (err) {
                line(undefined, err);
                throw err;
            }
            if (typeof compactResult?.then === 'function') {
                return compactResult.then(v => { line(v); return v; }, e => { line(undefined, e); throw e; });
            }
            line(compactResult);
            return compactResult;
        }
        const printLevel = summarize ? level + 1 : level;
        const parent = contextDebug();
        const id = ++sequence;
        const start = Date.now();
        return withContextDebug({ profundidade: (parent.profundidade ?? 0) + 1 }, () => {
            const prefix = `${'  '.repeat(Math.min(parent.profundidade ?? 0, 12))}#${id} ${nameAlt}`;
            printDebugLevel(printLevel, `${prefix} start`, args);
            const end = (errorAlt, valueAlt, failed = false) => {
                const duration = Date.now() - start;
                printDebugLevel(printLevel, `${prefix} ${failed ? 'error' : 'end'} +${duration}ms`,
                    failed ? { message: errorAlt?.message ?? errorAlt } : '');
                if (cfg.level >= 3) {
                    printDebugLevel(3, `${prefix} result`, failed ? errorAlt : valueAlt);
                }
                if (failed) throw errorAlt;
                return valueAlt;
            };
            let resultAlt;
            try {
                resultAlt = fn.apply(this, args);
            } catch (err) {
                return end(err, undefined, true);
            }
            return typeof resultAlt?.then === 'function'
                ? resultAlt.then(v => end(null, v), e => end(e, undefined, true))
                : end(null, resultAlt);
        });
    }
    if (!onlyLine) {
        wrappers.set(fn, tracked);
        wrappers.set(tracked, tracked);
    }
    return tracked;
}

function instrumentObject(object, nameAlt, level, methods = Object.keys(object ?? {}), summarize = null, again = false, onlyLine = false) {
    if (!object || (!again && trackedAlt.has(object))) return;
    trackedAlt.add(object);
    for (const keyAlt of methods) {
        const fn = object[keyAlt];
        if (typeof fn !== 'function' || /^class\s/.test(Function.prototype.toString.call(fn))) {
            continue;
        }
        object[keyAlt] = wrap(fn, `${nameAlt}.${keyAlt}`, level, summarize, onlyLine);
    }
}

function instrumentClient(client) {
    if (trackedAlt.has(client)) return;
    instrumentObject(client, 'WhatsApp', 1, [
        'sendMessage', 'getChats', 'getContacts', 'getContactById', 'getChatById',
        'getNumberId', 'getContactLidAndPhone', 'getState', 'initialize', 'destroy'
    ], SUMMARIES.whatsapp);
    client.on('ready', () => {
        if (client.pupPage) instrumentObject(client.pupPage, 'Chromium', 3, ['evaluate']);
    });
}

function installDebug() {
    if (installed) return;
    installed = true;
    const load = Module._load;
    Module._load = function (request, ...rest) {
        const resultAlt = load.call(this, request, ...rest);
        if (request === 'axios') {
            instrumentObject(resultAlt, 'axios', 1,
                ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'request'], SUMMARIES.http);
        } else if (request === 'nodemailer' && !trackedAlt.has(resultAlt)) {
            trackedAlt.add(resultAlt);
            const create = resultAlt.createTransport;
            resultAlt.createTransport = function (...args) {
                const transporte = create.apply(this, args);
                instrumentObject(transporte, 'SMTP', 1, ['sendMail'], SUMMARIES.email);
                return transporte;
            };
        } else if (request === 'child_process') {
            instrumentObject(resultAlt, 'process', 1, ['spawn', 'execFile'], SUMMARIES.process);
        } else {
            let fileAlt;
            try { fileAlt = Module._resolveFilename(request, ...rest); } catch { return resultAlt; }
            if (typeof fileAlt !== 'string' || !fileAlt.startsWith(ROOT)) return resultAlt;
            const nameAlt = fileAlt.slice(ROOT.length);
            if (nameAlt.startsWith('debug') || IGNORE.has(nameAlt)) return resultAlt;
            if (require.cache[fileAlt] && !require.cache[fileAlt].loaded) return resultAlt;
            if (nameAlt === 'db.js') {
                // The queries are level 1 (one line with the SQL); the rest of the module, level 2 like any other
                instrumentObject(resultAlt, nameAlt, 1, ['dbAll', 'dbGet', 'dbRun'], SUMMARIES.sql);
                instrumentObject(resultAlt, nameAlt, 2, Object.keys(resultAlt).filter(k => !['dbAll', 'dbGet', 'dbRun'].includes(k)), null, true);
            } else {
                instrumentObject(resultAlt, nameAlt, 2);
            }
            if (nameAlt === 'commands/index.js') instrumentObject(resultAlt.HANDLERS, 'handler', 1, undefined, SUMMARIES.command, false, true);
            if (nameAlt === 'client.js') instrumentClient(resultAlt.client);
        }
        return resultAlt;
    };
}

module.exports = { installDebug, instrumentObject };
