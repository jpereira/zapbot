/*
 * Getopt-style option parser for the commands ("-ss 10 -a https://...").
 */

function tokenizeCommand(input) {
    const tokens = [];
    let textAlt = input.trim();
    while (textAlt) {
        const delimiter = textAlt[0];
        if (['/', '"', "'"].includes(delimiter)) {
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
            let afterAlt = end + 1;
            if (delimiter === '/') {
                while (afterAlt < textAlt.length && /[a-z]/i.test(textAlt[afterAlt])) afterAlt++;
            }
            if (end < textAlt.length && (!textAlt[afterAlt] || /\s/.test(textAlt[afterAlt]))) {
                const raw = textAlt.slice(0, afterAlt);
                const valueAlt = delimiter === '/' ? raw : textAlt.slice(1, end);
                tokens.push({ valor: valueAlt, opcao: false });
                textAlt = textAlt.slice(afterAlt).trimStart();
                continue;
            }
        }
        // Paths and texts without a closing delimiter remain ordinary arguments.
        const valueAlt = textAlt.match(/^\S+/)[0];
        tokens.push({ valor: valueAlt, opcao: true });
        textAlt = textAlt.slice(valueAlt.length).trimStart();
    }
    return tokens;
}

function normalizeArg(arg) {
    // Fixes the common typo: uol..com.br
    return arg.replace('..com.br', '.com.br');
}

function isOption(token) {
    return token.startsWith('-') && token.length > 1;
}

// "-10" and "-01:44" (time counted from the end, -ss/-es) are values, not options
const isTimeNegative = (token) => /^-\d[\d:.]*$/.test(token);

/*
 * Converts "-ss 10 -a https://..." into:
 *   { opt: { startSec: '10', audio: true, ... }, argv: ['https://...'] }
 *
 * Options with empty "values" are boolean; with values they expect a value.
 * "-help" / "-h" are added automatically to every command.
 * `given` stores the canonical name of the options provided: tells apart "-x" without
 * value (null, but present) of "-x" absent (null).
 *
 * Two optional features, turned on in commands.js:
 * numero: true (in a cmd_opts entry) reads "-10" as `numero` (the 1st; a 2nd is an error), instead
 * before sending it to argv;
 * strict: true (in the command) stores the unknown option in `desconhecidas`, instead of sending it
 * to argv (the handler never sees it).
 */
function GetOptFromCommand(input, config = {}) {
    const tokens = tokenizeCommand(input);

    const argv = [];
    const given = new Set();
    const unknown = [];
    const result = { opt: {}, argv, given, numero: null, desconhecidas: unknown };
    const readNumber = (config.cmd_opts ?? []).some(o => o.numero);

    const commandOptions = [
        { opts: ['help', 'h'], values: [], desc: 'Exibe ajuda.' },
        ...(config.cmd_opts ?? [])
    ];

    // alias -> canonical definition (e.g.: ss -> startSec)
    const optionMap = new Map();

    for (const option of commandOptions) {
        if (!option.opts?.length) continue; // positional argv definitions

        const canonicalName = option.opts[0];
        const expectedValues = (option.values ?? [])
            .filter(v => v != null && String(v).trim() !== '');
        const expectsValue = expectedValues.length > 0;

        result.opt[canonicalName] = expectsValue ? null : false;

        for (const alias of option.opts) {
            optionMap.set(alias, { ...option, canonicalName, expectedValues, expectsValue });
        }
    }

    // `input` is only the arguments (without the "/command"): a 1st argument starting with "/" is an argument
    for (let i = 0; i < tokens.length; i++) {
        const { valor: token, opcao: optionAlt } = tokens[i];

        if (!optionAlt || !isOption(token)) {
            argv.push(normalizeArg(token));
            continue;
        }

        if (readNumber && /^-\d+$/.test(token)) {
            if (result.numero === null) result.numero = Number(token.slice(1));
            else unknown.push(token);
            continue;
        }

        const option = optionMap.get(token.slice(1));

        // An unknown option goes to argv (or, in a strict command, to `desconhecidas`)
        if (!option) {
            if (config.estrito) unknown.push(token);
            else argv.push(normalizeArg(token));
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

            if (nextToken === undefined || (next.opcao && isOption(nextToken) && !isTimeNegative(nextToken))) {
                result.opt[canonicalName] = null;
                continue;
            }

            result.opt[canonicalName] = normalizeArg(nextToken);
            i++;
            continue;
        }

        // Option with multiple values
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
