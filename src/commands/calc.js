/*
 * /calc command (also /math and /sum): calculations and the sum of the numbers of a list, of the typed text or of the
 * replied message (the logic is in src/calculator.js).
 *   /calc 437 + 351 * 2         → a conta
 * (replying "437 maromba / 351 corrida") /calc   → the column sum: 788
 * -short     only the total, without the tape                -group   subtotal by name (maromba, corrida...)
 * -all       all the numbers of each line        -col <n> number n of each line (-1 is the last)
 */

const { commandUsage } = require('./base');
const { group, round, format, totalDeclared, valuesAlt } = require('../calculator');
const { language, t } = require('../i18n');

const MAX_LINES = 40;      // the tape and -group cut here
const MAX_NAME = 24;        // each line's name on the tape

// The text without the command options, preserving line breaks
const withoutOptions = (args) => String(args ?? '')
    .replace(/(^|\s)-(?:all|a|short|s|group|g)(?=\s|$)/g, ' ')
    .replace(/(^|\s)-(?:col|c)\s+-?\d+(?=\s|$)/g, ' ')
    .trim();

// The number to show, with the currency when all the list values had it (R$ 1.055,00 or -R$ 1.055,00)
const dinheiro = (n, pt, currency, places) => (currency ? `${n < 0 ? '-' : ''}${currency} ${format(Math.abs(n), pt, places)}` : format(n, pt, places));

// How many decimals the whole list uses: none if it only has integers; otherwise 2 (or more, if some value has)
const decimals = (n) => { const s = String(round(n)); const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };
const placesAlt = (values, currency) => {
    const max = Math.max(0, ...values.map((v) => decimals(v.valor)));
    return currency || max > 0 ? Math.min(6, Math.max(2, max)) : 0;
};

async function cmdCalc({ msg, args, opts, quotedMsg }) {
    const pt = language() === 'pt_BR';
    const textAlt = [withoutOptions(args), String(quotedMsg?.body ?? '').trim()].filter(Boolean).join('\n');
    if (!textAlt) {
        await msg.reply(commandUsage('/calc'));
        return;
    }

    let column = 1;
    if (opts.given.has('col')) {
        column = Number(opts.opt.col);
        if (!Number.isInteger(column) || column === 0) {
            await msg.reply(t('calc.badCol'));
            return;
        }
    }

    let values;
    try {
        values = valuesAlt(textAlt, { todos: opts.opt.all, coluna: column, pt });
    } catch (err) {
        await msg.reply(t(err.message === 'divzero' ? 'calc.divZero' : 'calc.badExpr', { expr: textAlt }));
        return;
    }
    if (!values.length) {
        await msg.reply(t(/[\d]/.test(textAlt) ? 'calc.badExpr' : 'calc.none', { expr: textAlt }));
        return;
    }

    const total = values.reduce((s, v) => s + v.valor, 0);

    // A single calculation ("437 - 351"): the calculation and the result
    if (values.length === 1 && values[0].conta) {
        await msg.reply(t('calc.expr', { expr: values[0].linha, total: format(total, pt) }));
        return;
    }

    // All with the same currency (R$): the values come out with it
    const currency = values.every((v) => v.moeda && v.moeda === values[0].moeda) ? values[0].moeda : null;
    const places = placesAlt(values, currency);
    const fmt = (n) => dinheiro(n, pt, currency, places);
    // The average with 2 decimals (or the list's, if whole)
    const fmtMedia = (n) => { const m = Math.round(n * 100) / 100; return dinheiro(m, pt, currency, Number.isInteger(m) ? places : Math.max(places, 2)); };
    // Inflows and outflows: the list has signs on both sides (a balance, a debt)
    const inputs = values.filter((v) => v.valor > 0);
    const outputs = values.filter((v) => v.valor < 0);
    const mixed = inputs.length > 0 && outputs.length > 0;
    const sum = (list) => list.reduce((s, v) => s + v.valor, 0);
    const cap = (textAlt) => textAlt.charAt(0).toUpperCase() + textAlt.slice(1);

    const partsAlt = [t(mixed ? 'calc.balance' : 'calc.total', { total: fmt(total) })];

    // The text carries its own total ("R$664,89 = Total Divida"): it stays out of the sum and serves as a check
    const declared = totalDeclared(textAlt, pt);
    if (declared !== null && values.length > 1) {
        const difference = round(Math.abs(Math.abs(total) - declared));
        partsAlt.push(difference < 0.005
            ? t('calc.checkOk')
            : t('calc.checkDiff', { declared: fmt(declared), diff: fmt(difference) }));
    }

    // The tape: everything read as a number, in the same format, and the total below
    if (!opts.opt.short && values.length > 1) {
        const items = opts.opt.group ? group(values).map((g) => ({ valor: g.total, rotulo: g.rotulo })) : values;
        partsAlt.push('', tape(items.slice(0, MAX_LINES), total, { pt, moeda: currency, casas: places, misto: mixed, rotulo: cap }));
        if (items.length > MAX_LINES) partsAlt.push(t('calc.more', { n: items.length - MAX_LINES }));
    }

    if (mixed) {
        // What came in, what went out and the biggest spend
        partsAlt.push('');
        partsAlt.push(t('calc.income', { value: fmt(sum(inputs)), count: inputs.length }));
        partsAlt.push(t('calc.outgo', { value: fmt(Math.abs(sum(outputs))), count: outputs.length }));
        const greater = outputs.reduce((a, b) => (b.valor < a.valor ? b : a));
        if (outputs.length > 1) partsAlt.push(t('calc.biggest', { label: cap(greater.rotulo || greater.linha), value: fmt(Math.abs(greater.valor)) }));
    } else if (values.length > 1) {
        partsAlt.push(t('calc.stats', { count: values.length, avg: fmtMedia(total / values.length) }));
    }
    await msg.reply(partsAlt.join('\n'));
}

/*
 * The calculator tape, in a code block (monospaced, to align): the sign, the value aligned to the
 * right and the line name, and below the total line.
 *     R$ 3.375,00  15 kit x 225
 *   - R$ 1.055,00  Casaco
 *   ──────────────
 *   = R$   664,89
 */
function tape(items, total, { pt, moeda: currency, casas: places, misto: mixed, rotulo: label }) {
    // The numbers right-aligned, with the currency (R$) fixed on the left
    const numberAlt = (n) => format(Math.abs(n), pt, places);
    const prefix = currency ? `${currency} ` : '';
    const values = items.map((it) => numberAlt(it.valor));
    const resultAlt = numberAlt(total);
    const widthAlt = Math.max(resultAlt.length, ...values.map((v) => v.length));
    const linesAlt = items.map((it, i) => {
        // With inflows and outflows, the inflow carries "+"; in a list of only inflows, only from the second on
        const signalAlt = it.valor < 0 ? '-' : (mixed || i > 0 ? '+' : ' ');
        // Several numbers on the same line (-all): the name only on the first
        const repeated = i > 0 && it.linha && it.linha === items[i - 1].linha;
        const nameAlt = repeated ? '' : label((it.rotulo || '').replace(/`/g, "'"));
        const short = nameAlt.length > MAX_NAME ? `${nameAlt.slice(0, MAX_NAME - 1)}…` : nameAlt;
        return `${signalAlt} ${prefix}${values[i].padStart(widthAlt)}${short ? `  ${short}` : ''}`;
    });
    const signalTotal = total < 0 ? '-' : '=';
    linesAlt.push('─'.repeat(widthAlt + prefix.length + 2), `${signalTotal} ${prefix}${resultAlt.padStart(widthAlt)}`);
    return '```' + linesAlt.join('\n') + '```';
}

module.exports = { cmdCalc };
