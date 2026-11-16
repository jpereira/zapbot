/*
 * Tracks exported functions when the modules are loaded. Does not transform
 * sync functions into async and preserves the integrations' this.
 */
const Module = require('module');
const path = require('path');
const { withContextDebug, contextDebug } = require('./debugContext');
const { configureDebug } = require('./debugData');
const { printDebugLevel } = require('./log');

const ROOT = __dirname + path.sep;
const IGNORE = new Set(['log.js', 'settings.js', 'botConfig.js']);
const wrappers = new WeakMap();
const trackedAlt = new WeakSet();
let installed = false;
let sequence = 0;

function wrap(fn, nameAlt, level) {
    if (wrappers.has(fn)) return wrappers.get(fn);
    function tracked(...args) {
        const cfg = configureDebug();
        if (!cfg.enabled || cfg.level < level || contextDebug().semRastro) {
            return fn.apply(this, args);
        }
        const parent = contextDebug();
        const id = ++sequence;
        const start = Date.now();
        return withContextDebug({ profundidade: (parent.profundidade ?? 0) + 1 }, () => {
            const prefix = `${'  '.repeat(Math.min(parent.profundidade ?? 0, 12))}#${id} ${nameAlt}`;
            printDebugLevel(level, `${prefix} start`, args);
            const end = (errorAlt, valueAlt, failed = false) => {
                const duration = Date.now() - start;
                printDebugLevel(level, `${prefix} ${failed ? 'error' : 'end'} +${duration}ms`,
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
    wrappers.set(fn, tracked);
    wrappers.set(tracked, tracked);
    return tracked;
}

function instrumentObject(object, nameAlt, level, methods = Object.keys(object ?? {})) {
    if (!object || trackedAlt.has(object)) return;
    trackedAlt.add(object);
    for (const keyAlt of methods) {
        const fn = object[keyAlt];
        if (typeof fn !== 'function' || /^class\s/.test(Function.prototype.toString.call(fn))) {
            continue;
        }
        object[keyAlt] = wrap(fn, `${nameAlt}.${keyAlt}`, level);
    }
}

function instrumentClient(client) {
    if (trackedAlt.has(client)) return;
    instrumentObject(client, 'WhatsApp', 2, [
        'sendMessage', 'getChats', 'getContacts', 'getContactById', 'getChatById',
        'getNumberId', 'getContactLidAndPhone', 'getState', 'initialize', 'destroy'
    ]);
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
            instrumentObject(resultAlt, 'axios', 2,
                ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'request']);
        } else if (request === 'nodemailer' && !trackedAlt.has(resultAlt)) {
            trackedAlt.add(resultAlt);
            const create = resultAlt.createTransport;
            resultAlt.createTransport = function (...args) {
                const transporte = create.apply(this, args);
                instrumentObject(transporte, 'SMTP', 2, ['sendMail']);
                return transporte;
            };
        } else if (request === 'child_process') {
            instrumentObject(resultAlt, 'processo', 2, ['spawn', 'execFile']);
        } else {
            let fileAlt;
            try { fileAlt = Module._resolveFilename(request, ...rest); } catch { return resultAlt; }
            if (typeof fileAlt !== 'string' || !fileAlt.startsWith(ROOT)) return resultAlt;
            const nameAlt = fileAlt.slice(ROOT.length);
            if (nameAlt.startsWith('debug') || IGNORE.has(nameAlt)) return resultAlt;
            if (require.cache[fileAlt] && !require.cache[fileAlt].loaded) return resultAlt;
            instrumentObject(resultAlt, nameAlt, nameAlt === 'db.js' ? 3 : 1);
            if (nameAlt === 'commands/index.js') instrumentObject(resultAlt.HANDLERS, 'handler', 1);
            if (nameAlt === 'client.js') instrumentClient(resultAlt.client);
        }
        return resultAlt;
    };
}

module.exports = { installDebug, instrumentObject };
