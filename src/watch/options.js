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
            tokens.push({ value: valueAlt, rule: valueAlt, option: true });
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
        tokens.push({ value: content, rule: delimiter === '/' ? raw : content });
        textAlt = textAlt.slice(end).trimStart();
    }
    return tokens;
}

function readOptionsWatch(args) {
    const tokens = tokensWatch(args);
    const o = { rule: '', destinations: [], limit: null, n: null, ref: null, action: null, origin: null, search: null };
    const aliases = { list: 'list', l: 'list', show: 'show', s: 'show', rm: 'rm', r: 'rm',
        flush: 'flush', f: 'flush', mask: 'mask', m: 'mask', umask: 'umask', u: 'umask', in: 'in', to: 'to', query: 'query', q: 'query' };
    const rule = [];
    for (let i = 0; i < tokens.length; i++) {
        const tk = tokens[i];
        // Only tokens without quotes/slashes are options.
        if (!tk.option || !tk.rule.startsWith('-')) { rule.push(tk.rule); continue; }
        if (/^-\d+$/.test(tk.value)) {
            if (o.limit !== null) throw new Error(t('watch.err.oneCount'));
            o.limit = Number(tk.value.slice(1));
            continue;
        }
        const nameAlt = aliases[tk.value.slice(1)];
        if (!nameAlt) throw new Error(t('watch.err.unknownOption', { option: tk.value }));
        // -mask N / -umask N: the persistent 🔒 of rule N. Without the no., -mask only obfuscates this output
        const next = tokens[i + 1];
        const ruleN = next?.option && /^\d+$/.test(next.value) ? Number(next.value) : null;
        if (nameAlt === 'mask' && ruleN === null) { o.mask = true; continue; }
        if (nameAlt === 'mask' || nameAlt === 'umask') {
            if (ruleN === null) throw new Error(t('watch.err.needRuleNumber'));
            if (o.lock) throw new Error(t('watch.err.oneMask'));
            o.lock = { n: ruleN, turnOn: nameAlt === 'mask' };
            i++;
            continue;
        }
        if (nameAlt === 'to' || nameAlt === 'in' || nameAlt === 'query') {
            const valueAlt = tokens[++i];
            if (!valueAlt || valueAlt.rule.startsWith('-') || !valueAlt.value.trim()) {
                throw new Error(nameAlt === 'query' ? t('watch.err.needQuery') : t('watch.err.needValue', { name: nameAlt }));
            }
            if (nameAlt === 'query') {
                if (o.search !== null) throw new Error(t('watch.err.oneQuery'));
                // With slashes, it comes whole: /carro/i
                o.search = valueAlt.rule.trim();
            } else if (nameAlt === 'to') o.destinations.push(valueAlt.value);
            else {
                if (o.origin !== null) throw new Error(t('watch.err.oneSource'));
                o.origin = valueAlt.value;
            }
            continue;
        }
        if (o.action) throw new Error(t('watch.err.oneAction'));
        o.action = nameAlt;
        if (nameAlt !== 'list' && /^-?\d+$/.test(tokens[i + 1]?.value ?? '')) {
            o.n = Number(tokens[++i].value.replace(/^-/, ''));
        }
    }
    o.rule = rule.join(' ').trim();
    if (o.lock) {
        if (!o.lock.n) throw new Error(t('watch.err.ruleGtZero'));
        if (o.rule || o.action || o.destinations.length || o.origin !== null || o.search !== null || o.limit !== null) {
            throw new Error(t('watch.err.maskAlone'));
        }
    }
    // -s/-r/-f also accept the rule itself in place of the no.: /watch -s /Jorge/
    if (['show', 'rm', 'flush'].includes(o.action) && o.n === null && o.rule) {
        o.ref = o.rule;
        o.rule = '';
    }
    if (o.action && o.rule) throw new Error(t('watch.err.noMixRule'));
    if (o.origin !== null && !o.rule) throw new Error(t('watch.err.inNeedsRule'));
    if (o.search !== null && (o.rule || o.destinations.length || ['rm', 'flush', 'list'].includes(o.action))) {
        throw new Error(t('watch.err.queryOnlyFilters'));
    }
    if (o.limit !== null && (!o.limit || o.limit > 100)) {
        throw new Error(t('watch.err.countRange'));
    }
    if (o.n !== null && !o.n) throw new Error(t('watch.err.ruleGtZero'));
    if (['rm', 'flush', 'list'].includes(o.action) && o.limit !== null) {
        throw new Error(t('watch.err.countOnlyList'));
    }
    return o;
}

function askedHelpWatch(args) {
    try {
        return tokensWatch(args).some(t => t.option && ['-h', '-help'].includes(t.value));
    } catch {
        return false;
    }
}

function askedMaskWatch(args) {
    try {
        const tokens = tokensWatch(args);
        // -mask N (with the rule no.) is the persistent 🔒, not the obfuscation of this output
        return tokens.some((t, i) => t.option && ['-mask', '-m'].includes(t.value) &&
            !(tokens[i + 1]?.option && /^\d+$/.test(tokens[i + 1].value)));
    } catch {
        return false;
    }
}

module.exports = { readOptionsWatch, askedHelpWatch, askedMaskWatch };
