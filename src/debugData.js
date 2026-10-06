/*
 * Keeps the useful data, without dumping credentials or megabytes of media into the log.
 */
const SENSITIVE = /key|pass|secret|token|authorization|cookie/i;

function settingsLoaded() {
    const modulo = require.cache[require.resolve('./settings')];
    return modulo?.loaded ? modulo.exports : null;
}

function configureDebug() {
    const s = settingsLoaded();
    return {
        enabled: s?.getSetting('debug.enabled') ?? false,
        level: s?.getSetting('debug.level') ?? 0,
        filter: s?.getSetting('debug.filter') ?? '',
        copyTo: s?.getSetting('debug.copyTo') ?? ''
    };
}

function cleanTextDebug(textAlt) {
    const values = Object.entries(process.env)
        .filter(([nameAlt, valueAlt]) => SENSITIVE.test(nameAlt) && valueAlt?.length >= 4)
        .map(([, valueAlt]) => valueAlt);
    const s = settingsLoaded();
    if (s) {
        for (const [keyAlt, schema] of Object.entries(s.SETTINGS_SCHEMA)) {
            const valueAlt = s.getSetting(keyAlt);
            if (schema.secret && typeof valueAlt === 'string' && valueAlt.length >= 4) {
                values.push(valueAlt);
            }
        }
    }
    let safe = String(textAlt);
    for (const valueAlt of values) safe = safe.split(valueAlt).join('[oculto]');
    return safe
        .replace(/([?&](?:api[_-]?key|key|token|secret|password)=)[^&\s]+/gi, '$1[oculto]')
        .replace(/(Bearer\s+)\S+/gi, '$1[oculto]')
        .replace(/(\/set\s+\S*(?:key|pass|secret|token)\S*\s+)[^\n]+/gi, '$1[oculto]');
}

function dataDebug(valueAlt, seen = new WeakSet(), depth = 0) {
    if (typeof valueAlt === 'string') {
        const safe = cleanTextDebug(valueAlt);
        return safe.length > 3000
            ? safe.slice(0, 3000) + `… [${safe.length} caracteres]` : safe;
    }
    if (typeof valueAlt === 'function') return `[função ${valueAlt.name || 'anônima'}]`;
    if (!valueAlt || typeof valueAlt !== 'object') return valueAlt;
    if (Buffer.isBuffer(valueAlt)) return `[Buffer ${valueAlt.length} bytes]`;
    if (valueAlt instanceof Error) return { name: valueAlt.name, message: cleanTextDebug(valueAlt.message),
        stack: cleanTextDebug(valueAlt.stack ?? ''), code: valueAlt.code };
    if (seen.has(valueAlt)) return '[circular]';
    if (depth >= 4) return '[objeto]';
    seen.add(valueAlt);
    try {
        if (valueAlt instanceof Date) {
            return Number.isNaN(valueAlt.getTime()) ? 'Invalid Date' : valueAlt.toISOString();
        }
        if (valueAlt instanceof RegExp) return new RegExp(valueAlt.source, valueAlt.flags);
        if (valueAlt instanceof Set) {
            return new Set([...valueAlt].slice(0, 40)
                .map(v => dataDebug(v, seen, depth + 1)));
        }
        if (valueAlt instanceof Map) {
            return new Map([...valueAlt].slice(0, 40).map(([keyAlt, v]) => [
                dataDebug(keyAlt, seen, depth + 1),
                typeof keyAlt === 'string' && SENSITIVE.test(keyAlt) ? '[oculto]'
                    : dataDebug(v, seen, depth + 1)
            ]));
        }
        if (Array.isArray(valueAlt)) {
            if (typeof valueAlt[0] === 'string' && SENSITIVE.test(valueAlt[0]) &&
                !/\s/.test(valueAlt[0]) && valueAlt.length > 1) {
                return [valueAlt[0], '[oculto]'];
            }
            return valueAlt.slice(0, 40).map(v => dataDebug(v, seen, depth + 1));
        }
        const safe = {};
        for (const keyAlt of Object.keys(valueAlt).slice(0, 40)) {
            const d = Object.getOwnPropertyDescriptor(valueAlt, keyAlt);
            safe[keyAlt] = SENSITIVE.test(keyAlt) ? '[oculto]'
                : d?.get ? '[getter]' : dataDebug(d?.value, seen, depth + 1);
        }
        return safe;
    } finally {
        // A shared reference is not a cycle: only the ancestors are on this trail.
        seen.delete(valueAlt);
    }
}

module.exports = { configureDebug, dataDebug, cleanTextDebug };
