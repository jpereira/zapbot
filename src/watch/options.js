/*
 * Preserves /regex with spaces/flags and /chat names/ in /watch.
 */
const { t } = require('../i18n');

function tokensWatch(args) {
    const tokens = [];
    let textAlt = args.trim();
    while (textAlt) {
        const delimiter = textAlt[0];
        if (!['/', '"', "'"].includes(delimiter)) {
            const valueAlt = textAlt.match(/^\S+/)[0];
            tokens.push({ valor: valueAlt, regra: valueAlt, opcao: true });
            textAlt = textAlt.slice(valueAlt.length).trimStart();
            continue;
        }
        let end = 1;
        let escaped = false;
        let kind = false;
        for (; end < textAlt.length; end++) {
            const c = textAlt[end];
            if (escaped) { escaped = false; continue; }
            if (c === '\\') { escaped = true; continue; }
            if (delimiter === '/') {
                if (c === '[') kind = true;
                if (c === ']') kind = false;
            }
            if (c === delimiter && !kind) break;
        }
        if (end === textAlt.length) throw new Error(t('watch.err.unclosed'));
        const content = textAlt.slice(1, end);
        end++;
        if (delimiter === '/') while (end < textAlt.length && /[a-z]/i.test(textAlt[end])) end++;
        if (textAlt[end] && !/\s/.test(textAlt[end])) throw new Error(t('watch.err.separate'));
        const raw = textAlt.slice(0, end);
        tokens.push({ valor: content, regra: delimiter === '/' ? raw : content });
        textAlt = textAlt.slice(end).trimStart();
    }
    return tokens;
}

function readOptionsWatch(args) {
    const tokens = tokensWatch(args);
    const o = { regra: '', destinos: [], limite: null, n: null, ref: null, acao: null, origem: null, busca: null };
    const aliases = { list: 'list', l: 'list', show: 'show', s: 'show', rm: 'rm', r: 'rm',
        flush: 'flush', f: 'flush', mask: 'mask', m: 'mask', umask: 'umask', u: 'umask', in: 'in', to: 'to', query: 'query', q: 'query' };
    const rule = [];
    for (let i = 0; i < tokens.length; i++) {
        const tk = tokens[i];
        // Only tokens without quotes/slashes are options.
        if (!tk.opcao || !tk.regra.startsWith('-')) { rule.push(tk.regra); continue; }
        if (/^-\d+$/.test(tk.valor)) {
            if (o.limite !== null) throw new Error(t('watch.err.oneCount'));
            o.limite = Number(tk.valor.slice(1));
            continue;
        }
        const nameAlt = aliases[tk.valor.slice(1)];
        if (!nameAlt) throw new Error(t('watch.err.unknownOption', { option: tk.valor }));
        // -mask N / -umask N: the persistent 🔒 of rule N. Without the no., -mask only obfuscates this output
        const next = tokens[i + 1];
        const ruleN = next?.opcao && /^\d+$/.test(next.valor) ? Number(next.valor) : null;
        if (nameAlt === 'mask' && ruleN === null) { o.mask = true; continue; }
        if (nameAlt === 'mask' || nameAlt === 'umask') {
            if (ruleN === null) throw new Error(t('watch.err.needRuleNumber'));
            if (o.trava) throw new Error(t('watch.err.oneMask'));
            o.trava = { n: ruleN, ligar: nameAlt === 'mask' };
            i++;
            continue;
        }
        if (nameAlt === 'to' || nameAlt === 'in' || nameAlt === 'query') {
            const valueAlt = tokens[++i];
            if (!valueAlt || valueAlt.regra.startsWith('-') || !valueAlt.valor.trim()) {
                throw new Error(nameAlt === 'query' ? t('watch.err.needQuery') : t('watch.err.needValue', { name: nameAlt }));
            }
            if (nameAlt === 'query') {
                if (o.busca !== null) throw new Error(t('watch.err.oneQuery'));
                // With slashes, it comes whole: /carro/i
                o.busca = valueAlt.regra.trim();
            } else if (nameAlt === 'to') o.destinos.push(valueAlt.valor);
            else {
                if (o.origem !== null) throw new Error(t('watch.err.oneSource'));
                o.origem = valueAlt.valor;
            }
            continue;
        }
        if (o.acao) throw new Error(t('watch.err.oneAction'));
        o.acao = nameAlt;
        if (nameAlt !== 'list' && /^-?\d+$/.test(tokens[i + 1]?.valor ?? '')) {
            o.n = Number(tokens[++i].valor.replace(/^-/, ''));
        }
    }
    o.regra = rule.join(' ').trim();
    if (o.trava) {
        if (!o.trava.n) throw new Error(t('watch.err.ruleGtZero'));
        if (o.regra || o.acao || o.destinos.length || o.origem !== null || o.busca !== null || o.limite !== null) {
            throw new Error(t('watch.err.maskAlone'));
        }
    }
    // -s/-r/-f also accept the rule itself in place of the no.: /watch -s /Jorge/
    if (['show', 'rm', 'flush'].includes(o.acao) && o.n === null && o.regra) {
        o.ref = o.regra;
        o.regra = '';
    }
    if (o.acao && o.regra) throw new Error(t('watch.err.noMixRule'));
    if (o.origem !== null && !o.regra) throw new Error(t('watch.err.inNeedsRule'));
    if (o.busca !== null && (o.regra || o.destinos.length || ['rm', 'flush', 'list'].includes(o.acao))) {
        throw new Error(t('watch.err.queryOnlyFilters'));
    }
    if (o.limite !== null && (!o.limite || o.limite > 100)) {
        throw new Error(t('watch.err.countRange'));
    }
    if (o.n !== null && !o.n) throw new Error(t('watch.err.ruleGtZero'));
    if (['rm', 'flush', 'list'].includes(o.acao) && o.limite !== null) {
        throw new Error(t('watch.err.countOnlyList'));
    }
    return o;
}

function askedHelpWatch(args) {
    try {
        return tokensWatch(args).some(t => t.opcao && ['-h', '-help'].includes(t.valor));
    } catch {
        return false;
    }
}

function askedMaskWatch(args) {
    try {
        const tokens = tokensWatch(args);
        // -mask N (with the rule no.) is the persistent 🔒, not the obfuscation of this output
        return tokens.some((t, i) => t.opcao && ['-mask', '-m'].includes(t.valor) &&
            !(tokens[i + 1]?.opcao && /^\d+$/.test(tokens[i + 1].valor)));
    } catch {
        return false;
    }
}

module.exports = { readOptionsWatch, askedHelpWatch, askedMaskWatch };
