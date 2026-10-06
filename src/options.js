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

/*
 * Converts "-ss 10 -a https://..." into:
 *   { opt: { startSec: '10', audio: true, ..., argv: [...] }, argv: ['https://...'] }
 *
 * Options with empty "values" are boolean; with values they expect a value.
 * "-help" / "-h" are added automatically to every command.
 * `given` stores the canonical name of the options provided: tells apart "-x" without
 * value (null, but present) of "-x" absent (null).
 */
function GetOptFromCommand(input, config = {}) {
    const tokens = tokenizeCommand(input);

    // Same array in result.argv and result.opt.argv
    const argv = [];
    const given = new Set();
    const result = { opt: { argv }, argv, given };

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

        const option = optionMap.get(token.slice(1));

        // An unknown option goes to argv
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
