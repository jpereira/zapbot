/*
 * Mantém os dados úteis, sem despejar credenciais ou megabytes de mídia no log.
 */
const SENSIVEL = /key|pass|secret|token|authorization|cookie/i;

function settingsCarregados() {
    const modulo = require.cache[require.resolve('./settings')];
    return modulo?.loaded ? modulo.exports : null;
}

function configurarDebug() {
    const s = settingsCarregados();
    return {
        enabled: s?.getSetting('debug.enabled') ?? false,
        level: s?.getSetting('debug.level') ?? 0,
        filter: s?.getSetting('debug.filter') ?? '',
        copyTo: s?.getSetting('debug.copyTo') ?? ''
    };
}

function limparTextoDebug(texto) {
    const valores = Object.entries(process.env)
        .filter(([nome, valor]) => SENSIVEL.test(nome) && valor?.length >= 4)
        .map(([, valor]) => valor);
    const s = settingsCarregados();
    if (s) {
        for (const [chave, schema] of Object.entries(s.SETTINGS_SCHEMA)) {
            const valor = s.getSetting(chave);
            if (schema.secret && typeof valor === 'string' && valor.length >= 4) {
                valores.push(valor);
            }
        }
    }
    let seguro = String(texto);
    for (const valor of valores) seguro = seguro.split(valor).join('[oculto]');
    return seguro
        .replace(/([?&](?:api[_-]?key|key|token|secret|password)=)[^&\s]+/gi, '$1[oculto]')
        .replace(/(Bearer\s+)\S+/gi, '$1[oculto]')
        .replace(/(\/set\s+\S*(?:key|pass|secret|token)\S*\s+)[^\n]+/gi, '$1[oculto]');
}

function dadosDebug(valor, vistos = new WeakSet(), profundidade = 0) {
    if (typeof valor === 'string') {
        const seguro = limparTextoDebug(valor);
        return seguro.length > 3000
            ? seguro.slice(0, 3000) + `… [${seguro.length} caracteres]` : seguro;
    }
    if (typeof valor === 'function') return `[função ${valor.name || 'anônima'}]`;
    if (!valor || typeof valor !== 'object') return valor;
    if (Buffer.isBuffer(valor)) return `[Buffer ${valor.length} bytes]`;
    if (valor instanceof Error) return { name: valor.name, message: limparTextoDebug(valor.message),
        stack: limparTextoDebug(valor.stack ?? ''), code: valor.code };
    if (vistos.has(valor)) return '[circular]';
    if (profundidade >= 4) return '[objeto]';
    vistos.add(valor);
    try {
        if (valor instanceof Date) {
            return Number.isNaN(valor.getTime()) ? 'Invalid Date' : valor.toISOString();
        }
        if (valor instanceof RegExp) return new RegExp(valor.source, valor.flags);
        if (valor instanceof Set) {
            return new Set([...valor].slice(0, 40)
                .map(v => dadosDebug(v, vistos, profundidade + 1)));
        }
        if (valor instanceof Map) {
            return new Map([...valor].slice(0, 40).map(([chave, v]) => [
                dadosDebug(chave, vistos, profundidade + 1),
                typeof chave === 'string' && SENSIVEL.test(chave) ? '[oculto]'
                    : dadosDebug(v, vistos, profundidade + 1)
            ]));
        }
        if (Array.isArray(valor)) {
            if (typeof valor[0] === 'string' && SENSIVEL.test(valor[0]) &&
                !/\s/.test(valor[0]) && valor.length > 1) {
                return [valor[0], '[oculto]'];
            }
            return valor.slice(0, 40).map(v => dadosDebug(v, vistos, profundidade + 1));
        }
        const seguro = {};
        for (const chave of Object.keys(valor).slice(0, 40)) {
            const d = Object.getOwnPropertyDescriptor(valor, chave);
            seguro[chave] = SENSIVEL.test(chave) ? '[oculto]'
                : d?.get ? '[getter]' : dadosDebug(d?.value, vistos, profundidade + 1);
        }
        return seguro;
    } finally {
        // Referência compartilhada não é ciclo: só os ancestrais estão nesta trilha.
        vistos.delete(valor);
    }
}

module.exports = { configurarDebug, dadosDebug, limparTextoDebug };
