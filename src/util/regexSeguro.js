/*
 * Proteção contra ReDoS (catastrophic backtracking) em regexes vindas do
 * usuário (/watch, /show -q, /set, /watch -q). A engine do JavaScript é síncrona
 * e roda na única thread do bot: uma regex como /(x+)+y/ contra "xxxx…" (sem o
 * "y") faz backtracking exponencial e congela o bot inteiro (heartbeat, reconexão,
 * todos os comandos). O texto testado vem de qualquer mensagem recebida, então
 * nem precisa ser um admin para disparar.
 */

// Acima disto o texto testado é truncado: limita o custo de regexes que escapam
// da verificação estática (ex.: alternância sobreposta) sem nunca travar o bot.
const MAX_TEXTO_TESTADO = 20_000;

/*
 * Um quantificador que repete (>1 vez) a partir da posição i: "*", "+" ou
 * "{n,…}"/"{n,m}" com limite > 1. "?" e "{0,1}" não repetem e não interessam.
 * @returns {number} caracteres consumidos (0 se não houver)
 */
function lerQuantificador(src, i) {
    const c = src[i];
    if (c === '*' || c === '+') return 1 + (src[i + 1] === '?' ? 1 : 0); // inclui o lazy "+?"
    if (c === '{') {
        const m = src.slice(i).match(/^\{(\d*)(?:,(\d*))?\}/);
        if (!m) return 0;
        const [bruto, , max] = m;
        const repete = max === undefined ? false // {n} repete n vezes fixas: star height não cresce
            : max === '' ? true                   // {n,}
                : Number(max) > 1;                // {n,m}
        if (!repete) return 0;
        return bruto.length + (src[i + bruto.length] === '?' ? 1 : 0);
    }
    return 0;
}

/*
 * Heurística de "star height > 1": um quantificador que repete aplicado a um
 * grupo que já contém um quantificador que repete — o caso clássico e de longe
 * mais comum de backtracking catastrófico, como (x+)+ ou ([a-z]+) repetido.
 * Faz uma só passada, respeitando escapes e classes de caracteres.
 *
 * Não detecta alternância sobreposta (como "(a|ab)+") — por isso o texto testado é
 * truncado em MAX_TEXTO_TESTADO como defesa em profundidade.
 */
function regexPerigosa(source) {
    const pilha = []; // um frame por grupo aberto: { temRepeticao }
    let i = 0;

    while (i < source.length) {
        const c = source[i];

        if (c === '\\') { // escape (ex.: \d): pula o par e vê se vem um quantificador
            i += 2;
            const q = lerQuantificador(source, i);
            if (q) { if (pilha.length) pilha[pilha.length - 1].temRepeticao = true; i += q; }
            continue;
        }

        if (c === '[') { // classe de caracteres: pula até o "]" não escapado
            i++;
            if (source[i] === '^') i++;
            if (source[i] === ']') i++; // "]" logo no início é literal
            while (i < source.length && source[i] !== ']') {
                i += source[i] === '\\' ? 2 : 1;
            }
            i++;
            const q = lerQuantificador(source, i);
            if (q) { if (pilha.length) pilha[pilha.length - 1].temRepeticao = true; i += q; }
            continue;
        }

        if (c === '(') { pilha.push({ temRepeticao: false }); i++; continue; }

        if (c === ')') {
            const grupo = pilha.pop() ?? { temRepeticao: false };
            i++;
            const q = lerQuantificador(source, i);
            if (q) {
                // Quantificador que repete sobre um grupo que já repete dentro → perigoso
                if (grupo.temRepeticao) return true;
                if (pilha.length) pilha[pilha.length - 1].temRepeticao = true;
                i += q;
            }
            continue;
        }

        // Átomo comum (um caractere); se vier um quantificador que repete, o grupo atual repete
        i++;
        const q = lerQuantificador(source, i);
        if (q) { if (pilha.length) pilha[pilha.length - 1].temRepeticao = true; i += q; }
    }

    return false;
}

module.exports = { MAX_TEXTO_TESTADO, regexPerigosa };
