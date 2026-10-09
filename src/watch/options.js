/*
 * Preserves /regex with spaces/flags and /chat names/ in /watch.
 */
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
        if (end === textAlt.length) throw new Error('aspas ou barras não foram fechadas');
        const content = textAlt.slice(1, end);
        end++;
        if (delimiter === '/') while (end < textAlt.length && /[a-z]/i.test(textAlt[end])) end++;
        if (textAlt[end] && !/\s/.test(textAlt[end])) throw new Error('separe os argumentos com espaço');
        const raw = textAlt.slice(0, end);
        tokens.push({ valor: content, regra: delimiter === '/' ? raw : content });
        textAlt = textAlt.slice(end).trimStart();
    }
    return tokens;
}

function readOptionsWatch(args) {
    const tokens = tokensWatch(args);
    const o = { regra: '', destinos: [], limite: null, n: null, ref: null, acao: null, origem: null, busca: null };
    const aliases = { list: 'list', l: 'list', show: 'show', s: 'show', rem: 'rem', r: 'rem',
        flush: 'flush', f: 'flush', mask: 'mask', m: 'mask', in: 'in', to: 'to', query: 'query', q: 'query' };
    const rule = [];
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        // Only tokens without quotes/slashes are options.
        if (!t.opcao || !t.regra.startsWith('-')) { rule.push(t.regra); continue; }
        if (/^-\d+$/.test(t.valor)) {
            if (o.limite !== null) throw new Error('informe apenas uma quantidade -N');
            o.limite = Number(t.valor.slice(1));
            continue;
        }
        const nameAlt = aliases[t.valor.slice(1)];
        if (!nameAlt) throw new Error(`opção desconhecida: ${t.valor}`);
        if (nameAlt === 'mask') { o.mask = true; continue; }
        if (nameAlt === 'to' || nameAlt === 'in' || nameAlt === 'query') {
            const valueAlt = tokens[++i];
            if (!valueAlt || valueAlt.regra.startsWith('-') || !valueAlt.valor.trim()) {
                throw new Error(nameAlt === 'query'
                    ? 'informe o que buscar: -q <texto|/regex/flags> (com espaços, entre aspas: -q "bom dia")'
                    : `informe o valor de -${nameAlt}`);
            }
            if (nameAlt === 'query') {
                if (o.busca !== null) throw new Error('informe apenas uma busca -q');
                // With slashes, it comes whole: /carro/i
                o.busca = valueAlt.regra.trim();
            } else if (nameAlt === 'to') o.destinos.push(valueAlt.valor);
            else {
                if (o.origem !== null) throw new Error('informe apenas uma origem -in');
                o.origem = valueAlt.valor;
            }
            continue;
        }
        if (o.acao) throw new Error('use apenas uma ação: -list, -show, -rem ou -flush');
        o.acao = nameAlt;
        if (nameAlt !== 'list' && /^-?\d+$/.test(tokens[i + 1]?.valor ?? '')) {
            o.n = Number(tokens[++i].valor.replace(/^-/, ''));
        }
    }
    o.regra = rule.join(' ').trim();
    // -s/-r/-f also accept the rule itself in place of the no.: /watch -s /Jorge/
    if (['show', 'rem', 'flush'].includes(o.acao) && o.n === null && o.regra) {
        o.ref = o.regra;
        o.regra = '';
    }
    if (o.acao && o.regra) throw new Error('não combine regra nova com ações de consulta ou remoção');
    if (o.origem !== null && !o.regra) throw new Error('o -in acompanha uma regra nova');
    if (o.busca !== null && (o.regra || o.destinos.length || ['rem', 'flush', 'list'].includes(o.acao))) {
        throw new Error('o -q só filtra as ocorrências: use com /watch -s [N|regra] ou /watch [-N]');
    }
    if (o.limite !== null && (!o.limite || o.limite > 100)) {
        throw new Error('a quantidade -N deve estar entre 1 e 100');
    }
    if (o.n !== null && !o.n) throw new Error('o número da regra deve ser maior que zero');
    if (['rem', 'flush', 'list'].includes(o.acao) && o.limite !== null) {
        throw new Error('use -N para a quantidade de matches na listagem ou no -show');
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
        return tokensWatch(args).some(t => t.opcao && ['-mask', '-m'].includes(t.valor));
    } catch {
        return false;
    }
}

module.exports = { readOptionsWatch, askedHelpWatch, askedMaskWatch };
