/*
 * Preserva /regex com espaços/flags e /nomes de chats/ no /watch.
 */
function tokensWatch(args) {
    const tokens = [];
    let texto = args.trim();
    while (texto) {
        const delimitador = texto[0];
        if (!['/', '"', "'"].includes(delimitador)) {
            const valor = texto.match(/^\S+/)[0];
            tokens.push({ valor, regra: valor, opcao: true });
            texto = texto.slice(valor.length).trimStart();
            continue;
        }
        let fim = 1;
        let escapado = false;
        let classe = false;
        for (; fim < texto.length; fim++) {
            const c = texto[fim];
            if (escapado) { escapado = false; continue; }
            if (c === '\\') { escapado = true; continue; }
            if (delimitador === '/') {
                if (c === '[') classe = true;
                if (c === ']') classe = false;
            }
            if (c === delimitador && !classe) break;
        }
        if (fim === texto.length) throw new Error('aspas ou barras não foram fechadas');
        const conteudo = texto.slice(1, fim);
        fim++;
        if (delimitador === '/') while (fim < texto.length && /[a-z]/i.test(texto[fim])) fim++;
        if (texto[fim] && !/\s/.test(texto[fim])) throw new Error('separe os argumentos com espaço');
        const raw = texto.slice(0, fim);
        tokens.push({ valor: conteudo, regra: delimitador === '/' ? raw : conteudo });
        texto = texto.slice(fim).trimStart();
    }
    return tokens;
}

function lerOpcoesWatch(args) {
    const tokens = tokensWatch(args);
    const o = { regra: '', destinos: [], limite: null, n: null, ref: null, acao: null, origem: null, busca: null };
    const aliases = { list: 'list', l: 'list', show: 'show', s: 'show', rm: 'rm', r: 'rm',
        flush: 'flush', f: 'flush', mask: 'mask', m: 'mask', umask: 'umask', u: 'umask', in: 'in', to: 'to', query: 'query', q: 'query' };
    const regra = [];
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        // Só tokens sem aspas/barras são opções.
        if (!t.opcao || !t.regra.startsWith('-')) { regra.push(t.regra); continue; }
        if (/^-\d+$/.test(t.valor)) {
            if (o.limite !== null) throw new Error('informe apenas uma quantidade -N');
            o.limite = Number(t.valor.slice(1));
            continue;
        }
        const nome = aliases[t.valor.slice(1)];
        if (!nome) throw new Error(`opção desconhecida: ${t.valor}`);
        // -mask N / -umask N: o 🔒 persistente da regra N. Sem o nº, o -mask só ofusca esta saída
        const proximo = tokens[i + 1];
        const nDaRegra = proximo?.opcao && /^\d+$/.test(proximo.valor) ? Number(proximo.valor) : null;
        if (nome === 'mask' && nDaRegra === null) { o.mask = true; continue; }
        if (nome === 'mask' || nome === 'umask') {
            if (nDaRegra === null) throw new Error('informe o nº da regra: -umask N');
            if (o.trava) throw new Error('use apenas um -mask N ou -umask N');
            o.trava = { n: nDaRegra, ligar: nome === 'mask' };
            i++;
            continue;
        }
        if (nome === 'to' || nome === 'in' || nome === 'query') {
            const valor = tokens[++i];
            if (!valor || valor.regra.startsWith('-') || !valor.valor.trim()) {
                throw new Error(nome === 'query'
                    ? 'informe o que buscar: -q <texto|/regex/flags> (com espaços, entre aspas: -q "bom dia")'
                    : `informe o valor de -${nome}`);
            }
            if (nome === 'query') {
                if (o.busca !== null) throw new Error('informe apenas uma busca -q');
                // Com barras, vem inteira: /carro/i
                o.busca = valor.regra.trim();
            } else if (nome === 'to') o.destinos.push(valor.valor);
            else {
                if (o.origem !== null) throw new Error('informe apenas uma origem -in');
                o.origem = valor.valor;
            }
            continue;
        }
        if (o.acao) throw new Error('use apenas uma ação: -list, -show, -rm ou -flush');
        o.acao = nome;
        if (nome !== 'list' && /^-?\d+$/.test(tokens[i + 1]?.valor ?? '')) {
            o.n = Number(tokens[++i].valor.replace(/^-/, ''));
        }
    }
    o.regra = regra.join(' ').trim();
    if (o.trava) {
        if (!o.trava.n) throw new Error('o número da regra deve ser maior que zero');
        if (o.regra || o.acao || o.destinos.length || o.origem !== null || o.busca !== null || o.limite !== null) {
            throw new Error('use -mask N e -umask N sozinhos');
        }
    }
    // -s/-r/-f também aceitam a própria regra no lugar do nº: /watch -s /Jorge/
    if (['show', 'rm', 'flush'].includes(o.acao) && o.n === null && o.regra) {
        o.ref = o.regra;
        o.regra = '';
    }
    if (o.acao && o.regra) throw new Error('não combine regra nova com ações de consulta ou remoção');
    if (o.origem !== null && !o.regra) throw new Error('o -in acompanha uma regra nova');
    if (o.busca !== null && (o.regra || o.destinos.length || ['rm', 'flush', 'list'].includes(o.acao))) {
        throw new Error('o -q só filtra as ocorrências: use com /watch -s [N|regra] ou /watch [-N]');
    }
    if (o.limite !== null && (!o.limite || o.limite > 100)) {
        throw new Error('a quantidade -N deve estar entre 1 e 100');
    }
    if (o.n !== null && !o.n) throw new Error('o número da regra deve ser maior que zero');
    if (['rm', 'flush', 'list'].includes(o.acao) && o.limite !== null) {
        throw new Error('use -N para a quantidade de matches na listagem ou no -show');
    }
    return o;
}

function pediuAjudaWatch(args) {
    try {
        return tokensWatch(args).some(t => t.opcao && ['-h', '-help'].includes(t.valor));
    } catch {
        return false;
    }
}

function pediuMascaraWatch(args) {
    try {
        const tokens = tokensWatch(args);
        // O -mask N (com o nº da regra) é o 🔒 persistente, não o ofuscar desta saída
        return tokens.some((t, i) => t.opcao && ['-mask', '-m'].includes(t.valor) &&
            !(tokens[i + 1]?.opcao && /^\d+$/.test(tokens[i + 1].valor)));
    } catch {
        return false;
    }
}

module.exports = { lerOpcoesWatch, pediuAjudaWatch, pediuMascaraWatch };
