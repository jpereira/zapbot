/*
 * Parser de opções estilo getopt dos comandos ("-ss 10 -a https://...").
 */

function tokenizeCommand(input) {
    const tokens = [];
    let texto = input.trim();
    while (texto) {
        const delimitador = texto[0];
        if (['/', '"', "'"].includes(delimitador)) {
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
            let depois = fim + 1;
            if (delimitador === '/') {
                while (depois < texto.length && /[a-z]/i.test(texto[depois])) depois++;
            }
            if (fim < texto.length && (!texto[depois] || /\s/.test(texto[depois]))) {
                const raw = texto.slice(0, depois);
                const valor = delimitador === '/' ? raw : texto.slice(1, fim);
                tokens.push({ valor, opcao: false });
                texto = texto.slice(depois).trimStart();
                continue;
            }
        }
        // Caminhos e textos sem delimitador final continuam sendo argumentos comuns.
        const valor = texto.match(/^\S+/)[0];
        tokens.push({ valor, opcao: true });
        texto = texto.slice(valor.length).trimStart();
    }
    return tokens;
}

function normalizeArg(arg) {
    // Corrige o typo comum: uol..com.br
    return arg.replace('..com.br', '.com.br');
}

function isOption(token) {
    return token.startsWith('-') && token.length > 1;
}

/*
 * Converte "-ss 10 -a https://..." em:
 *   { opt: { startSec: '10', audio: true, ... }, argv: ['https://...'] }
 *
 * Opções com "values" vazios são booleanas; com values esperam um valor.
 * "-help" / "-h" são adicionados automaticamente a todo comando.
 * `given` guarda o nome canônico das opções informadas: distingue "-x" sem
 * valor (null, mas presente) de "-x" ausente (null).
 */
function GetOptFromCommand(input, config = {}) {
    const tokens = tokenizeCommand(input);

    const argv = [];
    const given = new Set();
    const result = { opt: {}, argv, given };

    const commandOptions = [
        { opts: ['help', 'h'], values: [], desc: 'Exibe ajuda.' },
        ...(config.cmd_opts ?? [])
    ];

    // alias -> definição canônica (ex.: ss -> startSec)
    const optionMap = new Map();

    for (const option of commandOptions) {
        if (!option.opts?.length) continue; // definições de argv posicional

        const canonicalName = option.opts[0];
        const expectedValues = (option.values ?? [])
            .filter(v => v != null && String(v).trim() !== '');
        const expectsValue = expectedValues.length > 0;

        result.opt[canonicalName] = expectsValue ? null : false;

        for (const alias of option.opts) {
            optionMap.set(alias, { ...option, canonicalName, expectedValues, expectsValue });
        }
    }

    // `input` são só os argumentos (sem o "/comando"): um 1º argumento começando com "/" é argumento
    for (let i = 0; i < tokens.length; i++) {
        const { valor: token, opcao } = tokens[i];

        if (!opcao || !isOption(token)) {
            argv.push(normalizeArg(token));
            continue;
        }

        const option = optionMap.get(token.slice(1));

        // Opção desconhecida vai para argv
        if (!option) {
            argv.push(normalizeArg(token));
            continue;
        }

        const { canonicalName } = option;
        given.add(canonicalName);

        if (!option.expectsValue) {
            result.opt[canonicalName] = true;
            continue;
        }

        if (option.expectedValues.length === 1) {
            const next = tokens[i + 1];
            const nextToken = next?.valor;

            if (nextToken === undefined || (next.opcao && isOption(nextToken))) {
                result.opt[canonicalName] = null;
                continue;
            }

            result.opt[canonicalName] = normalizeArg(nextToken);
            i++;
            continue;
        }

        // Opção com múltiplos valores
        const values = [];
        for (let x = 0; x < option.expectedValues.length; x++) {
            const next = tokens[i + 1];
            const nextToken = next?.valor;
            if (nextToken === undefined || (next.opcao && isOption(nextToken))) break;
            values.push(normalizeArg(nextToken));
            i++;
        }
        result.opt[canonicalName] = values;
    }

    return result;
}

module.exports = {
    GetOptFromCommand
};
