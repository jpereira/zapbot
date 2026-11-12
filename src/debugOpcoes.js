/*
 * Regex e opções do /debug: o parser comum não preserva espaços dentro de /regex/.
 */

const { t } = require('./i18n');

function compilarFiltroDebug(valor) {
    if (!valor) return null;
    if (valor.length > 100) throw new Error(t('adm.debug.filterMax'));
    const m = valor.match(/^\/(.*)\/([a-z]*)$/s);
    if (!m) throw new Error(t('adm.debug.filterFormat'));
    try {
        return new RegExp(m[1], m[2]);
    } catch (err) {
        throw new Error(t('adm.debug.badRegex', { erro: err.message }), { cause: err });
    }
}

function lerOpcoesDebug(args) {
    const aliases = { on: 'on', off: 'off', level: 'level', lvl: 'level', filter: 'filter',
        f: 'filter', 'copy-to': 'copyTo' };
    const opcoes = {};
    let texto = args.trim();
    while (texto) {
        const m = texto.match(/^-([a-z-]+)(?=\s|$)/);
        const nome = m && aliases[m[1]];
        if (!nome) throw new Error(t('adm.debug.unknownOpt', { opcao: texto.split(/\s/)[0] }));
        if (Object.hasOwn(opcoes, nome)) throw new Error(t('adm.debug.repeatedOpt', { opcao: m[1] }));
        texto = texto.slice(m[0].length).trimStart();
        if (nome === 'on' || nome === 'off') {
            opcoes[nome] = true;
            continue;
        }
        if (!texto || texto.startsWith('-')) {
            opcoes[nome] = null;
            continue;
        }
        const inicio = texto[0];
        if (['/', '"', "'"].includes(inicio)) {
            let fim = 1;
            let escapado = false;
            let classe = false;
            for (; fim < texto.length; fim++) {
                const c = texto[fim];
                if (escapado) { escapado = false; continue; }
                if (c === '\\') { escapado = true; continue; }
                if (nome === 'filter' && inicio === '/') {
                    if (c === '[') classe = true;
                    if (c === ']') classe = false;
                }
                if (c === inicio && !classe) break;
            }
            if (fim === texto.length) throw new Error(t('adm.debug.unclosed', { opcao: m[1] }));
            fim++;
            if (nome === 'filter' && inicio === '/') {
                while (/[a-z]/i.test(texto[fim] ?? '') && fim < texto.length) fim++;
            }
            if (texto[fim] && !/\s/.test(texto[fim])) {
                throw new Error(t('adm.debug.separate', { opcao: m[1] }));
            }
            const valor = texto.slice(0, fim);
            opcoes[nome] = nome === 'filter' && inicio === '/' ? valor : valor.slice(1, -1);
            texto = texto.slice(fim).trimStart();
        } else {
            const valor = texto.match(/^\S+/)[0];
            opcoes[nome] = valor;
            texto = texto.slice(valor.length).trimStart();
        }
    }
    return opcoes;
}

module.exports = { compilarFiltroDebug, lerOpcoesDebug };
