/*
 * Datas e horas digitadas nos comandos (/cron e /lembrete), no fuso de Brasília.
 */

const { semAcentos } = require('./formatar');

const FUSO = 'America/Sao_Paulo';
const HORA_PADRAO = { h: 9, m: 0 }; // "amanhã", "sexta", "25/12" sem hora

const DIAS_DA_SEMANA = {
    dom: 0, domingo: 0,
    seg: 1, segunda: 1, 'segunda-feira': 1,
    ter: 2, terca: 2, 'terca-feira': 2,
    qua: 3, quarta: 3, 'quarta-feira': 3,
    qui: 4, quinta: 4, 'quinta-feira': 4,
    sex: 5, sexta: 5, 'sexta-feira': 5,
    sab: 6, sabado: 6
};

const formatador = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short'
});

const SEMANA_EN = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Data e hora de Brasília num instante: { ano, mes (1-12), dia, h, m, s, semana (0=dom) }
function partesEmBrasilia(ms) {
    const p = Object.fromEntries(formatador.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
    return { ano: +p.year, mes: +p.month, dia: +p.day, h: +p.hour, m: +p.minute, s: +p.second, semana: SEMANA_EN[p.weekday] };
}

// Instante (ms) de uma data e hora de Brasília. O dia pode passar do fim do mês (Date.UTC normaliza).
function instanteEmBrasilia(ano, mes, dia, h, m) {
    const comoUtc = Date.UTC(ano, mes - 1, dia, h, m);
    const p = partesEmBrasilia(comoUtc);
    const offset = Date.UTC(p.ano, p.mes - 1, p.dia, p.h, p.m) - comoUtc; // negativo: Brasília atrás do UTC
    return comoUtc - offset;
}

// "18:30", "18h30", "18h", "9h"
function lerHora(token) {
    const m = String(token).toLowerCase().match(/^(\d{1,2})(?::(\d{2})|h(\d{2})?)$/);
    if (!m) return null;

    const h = Number(m[1]);
    const min = Number(m[2] ?? m[3] ?? 0);
    return h <= 23 && min <= 59 ? { h, m: min } : null;
}

// "30m", "2h", "1d", "1h30m", "2d4h"
function lerDuracao(token) {
    const m = String(token).toLowerCase().match(/^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)(?:m|min))?$/);
    if (!m || !(m[1] || m[2] || m[3])) return null;

    const ms = ((Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0)) * 60_000;
    return ms > 0 ? ms : null;
}

/**
 * Lê o "quando" no começo de uma lista de palavras.
 *   30m | 2h | 1d | 1h30m          → daqui a tanto tempo ("18h" sozinho também: daqui a 18 horas)
 *   18:30 | 18h30 | às 18h         → hoje nesse horário (ou amanhã, se já passou)
 *   hoje 18h | amanhã [9h]         → hoje / amanhã (sem hora: 9h)
 *   sexta [18h] | seg [8:00]       → o próximo dia da semana (hoje, se a hora ainda não passou)
 *   25/12 [10:00] | 25/12/2027 [10h] → a data (sem ano: a próxima; sem hora: 9h)
 * @param {string[]} palavras
 * @param {number} [agora]
 * @returns {{ ms: number, usadas: number } | null}  usadas: quantas palavras o "quando" ocupou
 */
function lerQuando(palavras, agora = Date.now()) {
    const [primeira, segunda] = palavras.map(semAcentos);
    if (!primeira) return null;

    const duracao = lerDuracao(primeira);
    if (duracao) return { ms: agora + duracao, usadas: 1 };

    const hoje = partesEmBrasilia(agora);
    const horaSeguinte = segunda !== undefined ? lerHora(segunda) : null;
    const comHora = (h) => ({ hora: h ?? HORA_PADRAO, usadas: h ? 2 : 1 });

    // Só a hora ("18:30", "18h30" ou "às 18h"): hoje, ou amanhã se já passou
    const comAs = primeira === 'as' && horaSeguinte;
    const soHora = comAs ? horaSeguinte : lerHora(primeira);
    if (soHora) {
        let ms = instanteEmBrasilia(hoje.ano, hoje.mes, hoje.dia, soHora.h, soHora.m);
        if (ms <= agora) ms = instanteEmBrasilia(hoje.ano, hoje.mes, hoje.dia + 1, soHora.h, soHora.m);
        return { ms, usadas: comAs ? 2 : 1 };
    }

    if (primeira === 'hoje' || primeira === 'amanha') {
        const { hora, usadas } = comHora(horaSeguinte);
        const dia = hoje.dia + (primeira === 'amanha' ? 1 : 0);
        return { ms: instanteEmBrasilia(hoje.ano, hoje.mes, dia, hora.h, hora.m), usadas };
    }

    if (primeira in DIAS_DA_SEMANA) {
        const { hora, usadas } = comHora(horaSeguinte);
        let faltam = (DIAS_DA_SEMANA[primeira] - hoje.semana + 7) % 7;
        let ms = instanteEmBrasilia(hoje.ano, hoje.mes, hoje.dia + faltam, hora.h, hora.m);
        if (ms <= agora) {
            faltam += 7;
            ms = instanteEmBrasilia(hoje.ano, hoje.mes, hoje.dia + faltam, hora.h, hora.m);
        }
        return { ms, usadas };
    }

    const data = primeira.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
    if (data) {
        const [dia, mes] = [Number(data[1]), Number(data[2])];
        if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

        const { hora, usadas } = comHora(horaSeguinte);
        let ano = data[3] ? Number(data[3].length === 2 ? `20${data[3]}` : data[3]) : hoje.ano;
        let ms = instanteEmBrasilia(ano, mes, dia, hora.h, hora.m);

        // 31/02 viraria 03/03: data inexistente
        if (partesEmBrasilia(ms).dia !== dia) return null;
        if (!data[3] && ms <= agora) ms = instanteEmBrasilia(++ano, mes, dia, hora.h, hora.m);

        return { ms, usadas };
    }

    return null;
}

const SEMANA_PT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const dois = (n) => String(n).padStart(2, '0');

// "qua 01/10 18:30" (com o ano, se não for o atual)
function fmtQuando(ms, agora = Date.now()) {
    const p = partesEmBrasilia(ms);
    const ano = p.ano !== partesEmBrasilia(agora).ano ? `/${p.ano}` : '';
    return `${SEMANA_PT[p.semana]} ${dois(p.dia)}/${dois(p.mes)}${ano} ${dois(p.h)}:${dois(p.m)}`;
}

/*
 * Repetição: o próximo horário depois de `ms`, mantendo a hora de Brasília
 * (diário, semanal) e o dia do mês (mensal; num mês sem o dia, o último dia).
 */
const REPETICOES = {
    diario: { rotulo: 'todo dia', dias: 1 },
    semanal: { rotulo: 'toda semana', dias: 7 },
    mensal: { rotulo: 'todo mês', meses: 1 }
};

function proximaRepeticao(ms, repetir, diaOriginal) {
    const r = REPETICOES[repetir];
    const p = partesEmBrasilia(ms);

    if (r.dias) return instanteEmBrasilia(p.ano, p.mes, p.dia + r.dias, p.h, p.m);

    const mes = p.mes === 12 ? 1 : p.mes + 1;
    const ano = p.mes === 12 ? p.ano + 1 : p.ano;
    const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    return instanteEmBrasilia(ano, mes, Math.min(diaOriginal ?? p.dia, ultimoDia), p.h, p.m);
}

module.exports = {
    REPETICOES,
    fmtQuando,
    instanteEmBrasilia,
    lerDuracao,
    lerHora,
    lerQuando,
    partesEmBrasilia,
    proximaRepeticao
};
