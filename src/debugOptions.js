/*
 * /debug regex and options: the common parser does not preserve spaces inside /regex/.
 */

const { t } = require('./i18n');

function compileFilterDebug(valueAlt) {
    if (!valueAlt) return null;
    if (valueAlt.length > 100) throw new Error(t('adm.debug.filterMax'));
    const m = valueAlt.match(/^\/(.*)\/([a-z]*)$/s);
    if (!m) throw new Error(t('adm.debug.filterFormat'));
    try {
        return new RegExp(m[1], m[2]);
    } catch (err) {
        throw new Error(t('adm.debug.badRegex', { erro: err.message }), { cause: err });
    }
}

function readOptionsDebug(args) {
    const aliases = { on: 'on', off: 'off', level: 'level', lvl: 'level', filter: 'filter',
        f: 'filter', 'copy-to': 'copyTo' };
    const optionsAlt = {};
    let textAlt = args.trim();
    while (textAlt) {
        const m = textAlt.match(/^-([a-z-]+)(?=\s|$)/);
        const nameAlt = m && aliases[m[1]];
        if (!nameAlt) throw new Error(t('adm.debug.unknownOpt', { opcao: textAlt.split(/\s/)[0] }));
        if (Object.hasOwn(optionsAlt, nameAlt)) throw new Error(t('adm.debug.repeatedOpt', { opcao: m[1] }));
        textAlt = textAlt.slice(m[0].length).trimStart();
        if (nameAlt === 'on' || nameAlt === 'off') {
            optionsAlt[nameAlt] = true;
            continue;
        }
        if (!textAlt || textAlt.startsWith('-')) {
            optionsAlt[nameAlt] = null;
            continue;
        }
        const start = textAlt[0];
        if (['/', '"', "'"].includes(start)) {
            let end = 1;
            let escaped = false;
            let kind = false;
            for (; end < textAlt.length; end++) {
                const c = textAlt[end];
                if (escaped) { escaped = false; continue; }
                if (c === '\\') { escaped = true; continue; }
                if (nameAlt === 'filter' && start === '/') {
                    if (c === '[') kind = true;
                    if (c === ']') kind = false;
                }
                if (c === start && !kind) break;
            }
            if (end === textAlt.length) throw new Error(t('adm.debug.unclosed', { opcao: m[1] }));
            end++;
            if (nameAlt === 'filter' && start === '/') {
                while (/[a-z]/i.test(textAlt[end] ?? '') && end < textAlt.length) end++;
            }
            if (textAlt[end] && !/\s/.test(textAlt[end])) {
                throw new Error(t('adm.debug.separate', { opcao: m[1] }));
            }
            const valueAlt = textAlt.slice(0, end);
            optionsAlt[nameAlt] = nameAlt === 'filter' && start === '/' ? valueAlt : valueAlt.slice(1, -1);
            textAlt = textAlt.slice(end).trimStart();
        } else {
            const valueAlt = textAlt.match(/^\S+/)[0];
            optionsAlt[nameAlt] = valueAlt;
            textAlt = textAlt.slice(valueAlt.length).trimStart();
        }
    }
    return optionsAlt;
}

module.exports = { compileFilterDebug, readOptionsDebug };
