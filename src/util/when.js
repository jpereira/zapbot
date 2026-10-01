/*
 * Dates and times typed in the commands (/lembrete, /agendar), in Brasília time.
 */

const { withoutAccents } = require('./format');

const TIMEZONE = 'America/Sao_Paulo';
const HOUR_DEFAULT = { h: 9, m: 0 }; // "amanhã", "sexta", "25/12" without a time

const WEEK_DAYS = {
    dom: 0, domingo: 0,
    seg: 1, segunda: 1, 'segunda-feira': 1,
    ter: 2, terca: 2, 'terca-feira': 2,
    qua: 3, quarta: 3, 'quarta-feira': 3,
    qui: 4, quinta: 4, 'quinta-feira': 4,
    sex: 5, sexta: 5, 'sexta-feira': 5,
    sab: 6, sabado: 6
};

const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short'
});

const WEEK_EN = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Brasília date and time at an instant: { year, month (1-12), day, h, m, s, weekday (0=sun) }
function partsInBrasilia(ms) {
    const p = Object.fromEntries(formatter.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
    return { ano: +p.year, mes: +p.month, dia: +p.day, h: +p.hour, m: +p.minute, s: +p.second, semana: WEEK_EN[p.weekday] };
}

// Instant (ms) of a Brasília date and time. The day may go past the end of the month (Date.UTC normalizes).
function instantInBrasilia(year, mes, day, h, m) {
    const asUtc = Date.UTC(year, mes - 1, day, h, m);
    const p = partsInBrasilia(asUtc);
    const offset = Date.UTC(p.ano, p.mes - 1, p.dia, p.h, p.m) - asUtc; // negative: Brasília behind UTC
    return asUtc - offset;
}

// "18:30", "18h30", "18h", "9h"
function readHour(token) {
    const m = String(token).toLowerCase().match(/^(\d{1,2})(?::(\d{2})|h(\d{2})?)$/);
    if (!m) return null;

    const h = Number(m[1]);
    const min = Number(m[2] ?? m[3] ?? 0);
    return h <= 23 && min <= 59 ? { h, m: min } : null;
}

// "30m", "2h", "1d", "1h30m", "2d4h"
function readDuration(token) {
    const m = String(token).toLowerCase().match(/^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)(?:m|min))?$/);
    if (!m || !(m[1] || m[2] || m[3])) return null;

    const ms = ((Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0)) * 60_000;
    return ms > 0 ? ms : null;
}

/**
 * Reads the "when" at the start of a list of words.
 * 30m | 2h | 1d | 1h30m          → this long from now ("18h" alone too: 18 hours from now)
 * 18:30 | 18h30 | às 18h         → today at that time (or tomorrow, if it has passed)
 * hoje 18h | amanhã [9h]         → today / tomorrow (without a time: 9h)
 * sexta [18h] | seg [8:00]       → the next weekday (today, if the time has not passed)
 * 25/12 [10:00] | 25/12/2027 [10h] → the date (without a year: the next one; without a time: 9h)
 * @param {string[]} palavras
 * @param {number} [agora]
 * @returns {{ ms: number, usadas: number } | null}  usadas: how many words the "when" took
 */
function readWhen(words, nowAlt = Date.now()) {
    const [first, monday] = words.map(withoutAccents);
    if (!first) return null;

    const duration = readDuration(first);
    if (duration) return { ms: nowAlt + duration, usadas: 1 };

    const today = partsInBrasilia(nowAlt);
    const hourNext = monday !== undefined ? readHour(monday) : null;
    const withHour = (h) => ({ hora: h ?? HOUR_DEFAULT, usadas: h ? 2 : 1 });

    // Only the time ("18:30", "18h30" or "às 18h"): today, or tomorrow if it has passed
    const withAs = first === 'as' && hourNext;
    const soHour = withAs ? hourNext : readHour(first);
    if (soHour) {
        let ms = instantInBrasilia(today.ano, today.mes, today.dia, soHour.h, soHour.m);
        if (ms <= nowAlt) ms = instantInBrasilia(today.ano, today.mes, today.dia + 1, soHour.h, soHour.m);
        return { ms, usadas: withAs ? 2 : 1 };
    }

    if (first === 'hoje' || first === 'amanha') {
        const { hora: hour, usadas: used } = withHour(hourNext);
        const day = today.dia + (first === 'amanha' ? 1 : 0);
        return { ms: instantInBrasilia(today.ano, today.mes, day, hour.h, hour.m), usadas: used };
    }

    if (first in WEEK_DAYS) {
        const { hora: hour, usadas: used } = withHour(hourNext);
        let missing = (WEEK_DAYS[first] - today.semana + 7) % 7;
        let ms = instantInBrasilia(today.ano, today.mes, today.dia + missing, hour.h, hour.m);
        if (ms <= nowAlt) {
            missing += 7;
            ms = instantInBrasilia(today.ano, today.mes, today.dia + missing, hour.h, hour.m);
        }
        return { ms, usadas: used };
    }

    const data = first.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
    if (data) {
        const [day, mes] = [Number(data[1]), Number(data[2])];
        if (mes < 1 || mes > 12 || day < 1 || day > 31) return null;

        const { hora: hour, usadas: used } = withHour(hourNext);
        let year = data[3] ? Number(data[3].length === 2 ? `20${data[3]}` : data[3]) : today.ano;
        let ms = instantInBrasilia(year, mes, day, hour.h, hour.m);

        // 31/02 viraria 03/03: data inexistente
        if (partsInBrasilia(ms).dia !== day) return null;
        if (!data[3] && ms <= nowAlt) ms = instantInBrasilia(++year, mes, day, hour.h, hour.m);

        return { ms, usadas: used };
    }

    return null;
}

const WEEK_PT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const two = (n) => String(n).padStart(2, '0');

// "qua 01/10 18:30" (with the year, if it is not the current one)
function fmtWhen(ms, nowAlt = Date.now()) {
    const p = partsInBrasilia(ms);
    const year = p.ano !== partsInBrasilia(nowAlt).ano ? `/${p.ano}` : '';
    return `${WEEK_PT[p.semana]} ${two(p.dia)}/${two(p.mes)}${year} ${two(p.h)}:${two(p.m)}`;
}

/*
 * Repetition: the next time after `ms`, keeping Brasília time
 * (daily, weekly) and the day of the month (monthly; in a month without the day, the last day).
 */
const REPETITIONS = {
    diario: { rotulo: 'todo dia', dias: 1 },
    semanal: { rotulo: 'toda semana', dias: 7 },
    mensal: { rotulo: 'todo mês', meses: 1 }
};

function nextRepetition(ms, repeatAlt, dayOriginal) {
    const r = REPETITIONS[repeatAlt];
    const p = partsInBrasilia(ms);

    if (r.dias) return instantInBrasilia(p.ano, p.mes, p.dia + r.dias, p.h, p.m);

    const mes = p.mes === 12 ? 1 : p.mes + 1;
    const year = p.mes === 12 ? p.ano + 1 : p.ano;
    const lastDay = new Date(Date.UTC(year, mes, 0)).getUTCDate();
    return instantInBrasilia(year, mes, Math.min(dayOriginal ?? p.dia, lastDay), p.h, p.m);
}

module.exports = {
    REPETITIONS,
    fmtWhen,
    instantInBrasilia,
    readDuration,
    readHour,
    readWhen,
    partsInBrasilia,
    nextRepetition
};
