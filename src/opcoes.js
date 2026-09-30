/*
 * Parser de opções estilo getopt dos comandos ("-ss 10 -a https://...").
 */

function tokenizeCommand(input) {
    return [...input.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)]
        .map(m => m[1] ?? m[2] ?? m[3]);
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
 *   { opt: { startSec: '10', audio: true, ..., argv: [...] }, argv: ['https://...'] }
 *
 * Opções com "values" vazios são booleanas; com values esperam um valor.
 * "-help" / "-h" são adicionados automaticamente a todo comando.
 * `given` guarda o nome canônico das opções informadas: distingue "-x" sem
 * valor (null, mas presente) de "-x" ausente (null).
 */
function GetOptFromCommand(input, config = {}) {
    const tokens = tokenizeCommand(input);

    // Mesmo array em result.argv e result.opt.argv
    const argv = [];
    const given = new Set();
    const result = { opt: { argv }, argv, given };

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

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        // Ignora o próprio comando (/get, /download...)
        if (i === 0 && token.startsWith('/')) continue;

        if (!isOption(token)) {
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
            const nextToken = tokens[i + 1];

            if (nextToken === undefined || isOption(nextToken)) {
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
            const nextToken = tokens[i + 1];
            if (nextToken === undefined || isOption(nextToken)) break;
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
