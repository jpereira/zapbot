/*
 * /calendar: an appointment in a text (a clinic's "agendamento realizado", a confirmation, an invitation) becomes an
 * event: an .ics file (Google Calendar, Apple Calendar, Outlook), a "add to Google Calendar" link and the event as
 * the Google Calendar API wants it (events.insert).
 *
 * The local reader finds the date, the time, the place and the people by their labels ("Data:", "Horário:",
 * "Endereço:", "Médico:"...) and, without labels, by their shape (25/11/2026, 10:45h, "25 de novembro"). The
 * ChatGPT reader (-gpt) is asked for the Google Calendar JSON itself and goes through the same checks.
 */

const crypto = require('crypto');

const { t } = require('./i18n');

const MONTHS = {
    janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
    jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    feb: 2, apr: 4, aug: 8, sep: 9, oct: 10, dec: 12
};

// The labels of a confirmation (without accents, lower case) and what each one is
const LABELS = {
    date: ['data', 'dia', 'quando', 'date', 'when'],
    time: ['horario', 'hora', 'hour', 'time', 'as'],
    address: ['endereco', 'local', 'onde', 'address', 'location', 'where', 'lugar'],
    unit: ['unidade', 'clinica', 'hospital', 'estabelecimento', 'unit', 'clinic'],
    professional: ['profissional', 'medico', 'medica', 'doutor', 'doutora', 'dr', 'dra', 'doctor', 'especialista'],
    specialty: ['especialidade', 'specialty', 'servico', 'procedimento', 'exame', 'tipo', 'assunto', 'subject'],
    patient: ['nome', 'paciente', 'patient', 'name'],
    plan: ['convenio', 'plano', 'insurance', 'plan'],
    method: ['metodo de agendamento', 'forma de agendamento', 'metodo', 'method']
};
const LABEL_OF = new Map(Object.entries(LABELS).flatMap(([kind, names]) => names.map(n => [n, kind])));

const withoutAccents = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const plain = (s) => withoutAccents(s).toLowerCase().trim();

// WhatsApp's *bold*, _italic_ and ~strike~, the emojis and the loose spaces go away
const clean = (s) => String(s ?? '')
    .replace(/[*_~]+/g, '')
    .replace(/\p{Extended_Pictographic}|\u200d|\ufe0f/gu, '')
    .replace(/[ \t]+/g, ' ')
    .trim();

// "REUMATOLOGIA (ENCAIXE)" → "Reumatologia (Encaixe)"; the small words stay small
function titleCase(text) {
    const small = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'em', 'com', 'para', 'a', 'o']);
    return clean(text).toLowerCase().replace(/\p{L}[\p{L}'.-]*/gu, (word, offset) => (offset > 0 && small.has(word) ? word : word[0].toUpperCase() + word.slice(1)));
}

/* ---------------------------------------------------------------- time zones */

function tzOffsetMs(utcMs, timeZone) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric'
    }).formatToParts(new Date(utcMs)).map(p => [p.type, Number(p.value)]));
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - Math.floor(utcMs / 1000) * 1000;
}

/** The instant (ms, UTC) at which the wall clock of `timeZone` shows this date and time */
function zonedToUtc(y, m, d, h, min, timeZone) {
    const wall = Date.UTC(y, m - 1, d, h, min);
    let guess = wall;
    for (let i = 0; i < 3; i++) guess = wall - tzOffsetMs(guess, timeZone);
    return guess;
}

const isTimeZone = (name) => {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: name });
        return true;
    } catch {
        return false;
    }
};

/* ---------------------------------------------------------------- what is asked in the sentence */

const VERBS = '(?:criar|crie|cria|gerar|gere|gera|marcar|marque|marca|agendar|agende|agenda|adicionar|adicione|adiciona|colocar|coloque|coloca|fazer|faca|anotar|anote|lembrar|lembre|create|add|schedule|make|remind me of)';
const NOUNS = '(?:(?:um|uma|o|a|novo|nova|an?|new)\\s+)*(?:evento|compromisso|lembrete|reuniao|consulta|event|appointment|meeting|reminder)';
const A_WEEK_AND_LESS = [10080, 1440, 120, 30];

// "30" + "min" → 30; "2" + "horas" → 120; "1" + "dia" → 1440
function minutesOf(amount, unit) {
    const u = unit.toLowerCase();
    if (/^(sem|week)/.test(u)) return amount * 10080;
    if (/^(dia|day)/.test(u)) return amount * 1440;
    if (/^h/.test(u)) return amount * 60;
    return amount;
}

/**
 * The reminders the sentence asks for: "gere avisos" (a week, a day, two hours and half an hour before), "avise 30
 * minutos antes", "avisos 1 dia e 2 horas antes". null: nothing was asked (the default reminders stay).
 */
function readReminders(text) {
    const s = withoutAccents(text).toLowerCase();
    // the last word that asks ("lembrete dia 25 às 8h, avisos 1 dia antes": the amounts come after "avisos")
    const asks = [...s.matchAll(/\b(?:avis\w*|alert\w*|notific\w*|remind\w*|lembr\w*)\b(?=([^.\n]*))/g)];
    const ask = asks.findLast(m => /\b(?:antes|before)\b/.test(m[1])) ?? asks[0];
    if (!ask) return null;
    const before = /^(.*?)\b(?:antes|before)\b/.exec(ask[1]);
    if (before) {
        const found = [...before[1].matchAll(/(\d{1,3})\s*(semanas?|weeks?|dias?|days?|horas?|hours?|h|minutos?|minutes?|mins?|m)\b/g)].map(m => minutesOf(+m[1], m[2])).filter(n => n > 0);
        if (found.length) return [...new Set(found)];
    }
    // "gere avisos", "com avisos", "me avise": a good set. ("criar lembrete" alone is just the noun)
    return /\b(?:avis|alert|notific|remind)\w*/.test(ask[0]) ? A_WEEK_AND_LESS : null;
}

const MONTH_NAME = /(?:no\s+)?(?:dia\s+)?\b(\d{1,2})\s*(?:de\s+)?([a-zç]{3,9})\.?(?:\s*(?:de\s+)?\d{4})?/giu;
const DAYS = '(?:hoje|amanh[aã]|depois de amanh[aã]|today|tomorrow|(?:domingo|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado)(?:-feira)?(?:\\s+que\\s+vem|\\s+pr[oó]xima?)?|(?:next\\s+)?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday))';

// "criar lembrete para dia 21": no title, only the kind of thing it is
function nounOf(text) {
    const m = /(?<![\p{L}\d])(evento|lembrete|reuni[aã]o|consulta|compromisso|event|reminder|meeting|appointment)(?![\p{L}\d])/iu.exec(text);
    if (!m) return 'Evento';
    const word = plain(m[1]);
    const names = { event: 'Event', reminder: 'Reminder', meeting: 'Meeting', appointment: 'Appointment', reuniao: 'Reunião' };
    return names[word] ?? word[0].toUpperCase() + word.slice(1);
}

/**
 * The title that the sentence gives to the event ("criar evento Aniversário da Ana dia 21 de maio às 22h" →
 * "Aniversário da Ana"); null when it only has the date and the time ("criar evento para dia 21 de maio às 22h").
 */
function titleFromSentence(text) {
    let s = clean(text).replace(/\s+/g, ' ');
    const quoted = /["“”]([^"“”]{2,80})["“”]/.exec(s);
    if (quoted) return clean(quoted[1]);
    const named = /\b(?:chamado|chamada|intitulado|titulo|título|nome|title|called|named)\s*:?\s+(.+?)(?:[,.;]|\s+(?:para|dia|as|às|em|no|on|at|hoje|depois|chegar)\b|\s+amanh|\s+\d{1,2}[h:/]|$)/i.exec(s);
    if (named) return clean(named[1]);
    s = s.replace(/[,;.]?\s*(?:e\s+)?(?:chegar|chegue|arrive)\b[^.\n]*$/i, '');
    // the part about the reminders goes away ("..., gere avisos", "e me avise 30 min antes")
    s = s.replace(/[,;.]?\s*(?:(?:e|and)\s+)?(?:(?:gere|gerar|crie|criar|com|me|generate|create|set|with)\s+)?(?:avis|alert|notific|remind)\w*[^.\n]*$/i, '');
    const PREPOSITION = '(?:(?:para|pra|de|do|da|em|on|for)\\s+|:\\s*)?';
    const verb = new RegExp(`^\\s*${VERBS}\\s+(?:${NOUNS})?\\s*${PREPOSITION}`, 'i');
    // "Consulta dia 25 no Centro Médico": without a verb, the noun is part of the title
    if (verb.test(s)) s = s.replace(verb, '');
    s = s.replace(MONTH_NAME, (whole, day, word) => (MONTHS[plain(word)] ? '' : whole));
    s = s.replace(/(?:\b(?:no\s+)?dia\s+)?\b\d{1,4}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b/g, '');
    s = s.replace(new RegExp(`(?<![\\p{L}\\d])(?:no\\s+|on\\s+)?${DAYS}(?![\\p{L}\\d])`, 'giu'), '');
    s = s.replace(/\b(?:no\s+)?dia\s+\d{1,2}\b/gi, '');
    s = s.replace(/(?:(?<![\p{L}\d])on\s+)?(?<![\p{L}\d])([A-Za-z]{3,9})\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?(?![\p{L}\d])/giu, (whole, word) => (MONTHS[plain(word)] ? '' : whole));
    s = s.replace(/(?:(?<![\p{L}\d])at\s+)?(?<![\d:])\d{1,2}(?::\d{2})?\s*[ap]m(?![\p{L}\d])/giu, '');
    s = s.replace(/(?:(?<![\p{L}\d])(?:[aàá]s|at|@)\s*)?(?<![\p{L}\d])\d{1,2}(?:[:h]\d{2}|\s*h(?:oras?)?)(?![\p{L}\d])/giu, '');
    s = s.replace(/\s+/g, ' ').replace(/^[\s,;:.\-–—]+|[\s,;:.\-–—]+$/g, '');
    s = s.replace(/^(?:para|pra|de|do|da|em|no|na|on|for|at)\s+/i, '').replace(/\s+(?:para|pra|de|do|da|em|no|na|as|às|on|for|at|e)$/i, '').trim();
    return s.length >= 2 ? s[0].toUpperCase() + s.slice(1) : null;
}

/* ---------------------------------------------------------------- the emoji of the title */

// The first that matches wins, so the specific ones come first ("consulta no dentista" is 🦷, not 🩺).
// The words are stems, matched at the start of a word of the title (lowercase, no accents).
const EMOJIS = [
    ['🦷', 'dentist|ortodont|odonto'],
    ['💉', 'vacina|vaccin'],
    ['🐶', 'veterinar|vet\\b|pet\\b|banho e tosa'],
    ['🧗', 'escalada|climb|boulder'],
    ['🏃🏽‍♂️', 'corrida|correr|running|maratona|marathon|jog'],
    ['🏋🏽‍♂️', 'crossfit|treino|academia|musculacao|workout|gym|hiit|fitness'],
    ['🧘', 'yoga|pilates|meditac|meditat'],
    ['🏊', 'natacao|nadar|swim'],
    ['🚴', 'ciclismo|pedalar|pedal\\b|bike|cycling'],
    ['⚽', 'futebol|pelada|soccer|football'],
    ['🎾', 'tenis|tennis|padel'],
    ['🏀', 'basquete|basketball'],
    ['🥋', 'jiu|karate|judo|muay|boxe|boxing'],
    ['🎂', 'aniversario|birthday|niver\\b|parabens'],
    ['💍', 'casamento|wedding|noivado|formatura'],
    ['🎉', 'festa|party|comemorac|celebrat'],
    ['🍻', 'happy hour|churrasco|barzinho|bar\\b|cerveja'],
    ['🍽️', 'jantar|almoco|dinner|lunch|restaurante|brunch|cafe da manha|breakfast|cafe\\b'],
    ['🎬', 'cinema|filme|movie|netflix'],
    ['🎤', 'show\\b|concert|banda\\b|festival|gig\\b'],
    ['🎭', 'teatro|theat|peca\\b|musical|opera'],
    ['✈️', 'voo\\b|viagem|flight|trip\\b|embarque|aeroporto|airport'],
    ['🏨', 'hotel|hospedagem|check-?in|check-?out'],
    ['🛂', 'passaporte|passport|visto\\b|visa\\b'],
    ['🚗', 'oficina|mecanic|revisao do carro|carro\\b|rodizio|detran|ipva'],
    ['💇', 'cabelei|barbeir|salao|manicure|corte de cabelo|haircut'],
    ['🩺', 'consult|medic|dr\\b|dra\\b|clinica|exame|check-?up|cardio|reumato|ortoped|dermato|pediatr|ginecolog|oftalmo|psic|terapia|fisioterap|hospital|doctor|physician|appointment'],
    ['📝', 'prova\\b|teste\\b|exam\\b|vestibular|enem\\b|quiz\\b'],
    ['🎓', 'aula|curso|faculdade|escola|workshop|palestra|class\\b|lesson|course|seminar|webinar|treinamento'],
    ['💼', 'reuniao|meeting|call\\b|entrevista|interview|apresentacao|presentation|sync\\b|standup|1:1|negociacao'],
    ['💳', 'pagar|pagamento|boleto|fatura|vencimento|imposto|iptu|irpf?\\b|pay\\b|bill\\b|invoice|aluguel|condominio'],
    ['🛒', 'mercado|supermercado|compras|shopping|groceries|feira\\b'],
    ['🛠️', 'manutencao|conserto|reforma|encanador|eletricista|repair|maintenance'],
    ['📦', 'entrega|encomenda|delivery|correios'],
    ['👨‍👩‍👧', 'buscar as criancas|crianca|filho|escolinha'],
    ['⏰', 'lembrete|reminder'],
    ['📅', 'evento|compromisso|event\\b']
].map(([emoji, words]) => [emoji, new RegExp(`(?<![a-z])(?:${words})`)]);

const EMOJI_AT_START = /^\s*(?:\p{Extended_Pictographic}|\p{Regional_Indicator})/u;

/** @returns {string|null} the emoji that fits the title ("Consulta no Centro Médico" → 🩺), null when none does */
function emojiFor(summary) {
    const s = plain(summary);
    return EMOJIS.find(([, pattern]) => pattern.test(s))?.[0] ?? null;
}

/** @returns {string} the title with its emoji at the start ("🩺 Consulta..."); the same when it has one or none fits */
function withEmoji(summary) {
    if (EMOJI_AT_START.test(summary)) return summary;
    const emoji = emojiFor(summary);
    return emoji ? `${emoji} ${summary}` : summary;
}

/* ---------------------------------------------------------------- the local reader */

// "Label: value" lines; the lines below it (until a blank line or another label) continue the value
function readLabels(text) {
    const fields = [];
    const lines = String(text).replace(/\r/g, '').split('\n');
    let current = null;
    for (const raw of lines) {
        const line = clean(raw);
        const m = /^([^\d:][^:]{1,34}?)\s*:\s*(.*)$/u.exec(line);
        const kind = m ? LABEL_OF.get(plain(m[1])) : null;
        if (kind) {
            current = { kind, label: clean(m[1]), lines: m[2] ? [m[2]] : [] };
            fields.push(current);
        } else if (!line) {
            current = null;
        } else if (current) {
            current.lines.push(line);
        }
    }
    return fields.map(f => ({ ...f, value: joinLines(f.lines) }));
}

// The lines of a value: a line the sender's app wrapped (a long one with no punctuation at its end) goes on with a
// space; the other lines are separate parts: a comma
function joinLines(lines) {
    let out = '';
    lines.forEach((line, i) => {
        if (i === 0) out = line;
        else out += (lines[i - 1].length >= 70 && !/[.,;:!?-]$/.test(lines[i - 1])) ? ` ${line}` : `, ${line}`;
    });
    return out.replace(/\s*,\s*,/g, ',').replace(/,\s*$/, '');
}

// The lines that no label owns: what is left to say (the notes, the warnings)
function leftoverLines(text) {
    const owned = new Set();
    const lines = String(text).replace(/\r/g, '').split('\n').map(clean);
    let current = false;
    lines.forEach((line, i) => {
        const m = /^([^\d:][^:]{1,34}?)\s*:\s*(.*)$/u.exec(line);
        if (m && LABEL_OF.get(plain(m[1]))) {
            current = true;
            owned.add(i);
        } else if (!line) {
            current = false;
        } else if (current) {
            owned.add(i);
        }
    });
    return lines.filter((line, i) => line && !owned.has(i));
}

function readDate(text, now, timeZone) {
    const s = String(text);
    let m = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(s);
    if (m) return { y: +m[1], m: +m[2], d: +m[3] };
    m = /\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/.exec(s);
    if (m && +m[1] <= 31 && +m[2] <= 12) return { y: m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null, m: +m[2], d: +m[1] };
    m = /\b(\d{1,2})\s*(?:de\s+)?([a-zç]{3,9})\.?(?:\s*(?:de\s+)?(\d{4}))?/iu.exec(withoutAccents(s));
    if (m && MONTHS[m[2].toLowerCase()]) return { y: m[3] ? +m[3] : null, m: MONTHS[m[2].toLowerCase()], d: +m[1] };
    m = /\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/i.exec(withoutAccents(s));
    if (m && MONTHS[m[1].toLowerCase()]) return { y: m[3] ? +m[3] : null, m: MONTHS[m[1].toLowerCase()], d: +m[2] };
    const relative = readRelativeDate(s, now, timeZone);
    if (relative) return relative;
    // "dia 21": the next 21st
    m = /\b(?:dia|day|on the)\s+(\d{1,2})\b(?!\s*(?:[:h/]|min|hora))/i.exec(withoutAccents(s));
    if (m && +m[1] >= 1 && +m[1] <= 31) return { y: null, m: null, d: +m[1] };
    return null;
}

const WEEKDAYS = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6, sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

function todayIn(now, timeZone) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(now)).map(x => [x.type, Number(x.value)]));
    return { y: p.year, m: p.month, d: p.day };
}

const addDays = ({ y, m, d }, n) => {
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
};

// hoje, amanhã, depois de amanhã, sexta (que vem): by the day of the week, the next one
function readRelativeDate(text, now, timeZone) {
    const s = withoutAccents(text).toLowerCase();
    const today = todayIn(now, timeZone);
    if (/\bdepois de amanha\b/.test(s)) return addDays(today, 2);
    if (/\bamanha\b|\btomorrow\b/.test(s)) return addDays(today, 1);
    if (/\bhoje\b|\btoday\b/.test(s)) return today;
    const m = /\b(domingo|segunda|terca|quarta|quinta|sexta|sabado|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.exec(s);
    if (!m) return null;
    const todayWeekday = new Date(Date.UTC(today.y, today.m - 1, today.d)).getUTCDay();
    return addDays(today, ((WEEKDAYS[m[1]] - todayWeekday + 6) % 7) + 1);
}

// No year in the text: the next time that day comes
function withYear({ y, m, d }, now, timeZone) {
    if (y) return { y, m, d };
    if (!m) {
        // only the day of the month: this month if it has not passed, else the next
        const today = todayIn(now, timeZone);
        const base = d >= today.d ? { y: today.y, m: today.m } : (today.m === 12 ? { y: today.y + 1, m: 1 } : { y: today.y, m: today.m + 1 });
        return { ...base, d };
    }
    const today = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(now)).map(p => [p.type, Number(p.value)]));
    const thisYear = Date.UTC(today.year, m - 1, d) >= Date.UTC(today.year, today.month - 1, today.day);
    return { y: thisYear ? today.year : today.year + 1, m, d };
}

function readTime(text) {
    const s = String(text);
    // 3pm, 10:30 pm, 9am
    const ampm = /(?<![\d:])(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?![\p{L}\d])/iu.exec(s);
    if (ampm && +ampm[1] >= 1 && +ampm[1] <= 12) {
        const pm = ampm[3].toLowerCase() === 'pm';
        return { h: (+ampm[1] % 12) + (pm ? 12 : 0), min: ampm[2] ? Math.min(+ampm[2], 59) : 0, end: null };
    }
    const range = /\b(\d{1,2})(?:[:h](\d{2})|\s*h)\s*(?:h\s*)?(?:as|a|-|–|ate|to)\s*(\d{1,2})(?:[:h](\d{2})|\s*h)\b/i.exec(withoutAccents(s));
    let m = /(?<!\d)(\d{1,2})[:h](\d{2})(?!\d)/i.exec(s) ?? /(?<!\d)(\d{1,2})\s*h(?:oras?)?(?![\p{L}\d])/iu.exec(s);
    if (!m) return null;
    const h = +m[1];
    const min = m[2] ? +m[2] : 0;
    if (h > 23 || min > 59) return null;
    const time = { h, min, end: null };
    if (range && +range[1] === h) {
        const eh = +range[3];
        const emin = range[4] ? +range[4] : 0;
        if (eh <= 23 && emin <= 59 && (eh * 60 + emin) > (h * 60 + min)) time.end = { h: eh, min: emin };
    }
    return time;
}

/**
 * @param {string} text   the message
 * @param {{ now?: number, timeZone?: string, duration?: number, emoji?: boolean }} [o]
 * @returns {object|null} the event (see buildEvent), or null if there is no date in the text
 */
function parseLocal(text, { now = Date.now(), timeZone = 'America/Sao_Paulo', duration = 60, emoji = false } = {}) {
    const fields = readLabels(text);
    const by = (kind) => fields.filter(f => f.kind === kind).map(f => f.value).filter(Boolean);
    const first = (kind) => by(kind)[0] ?? '';

    const date = readDate(first('date'), now, timeZone) ?? readDate(text, now, timeZone);
    if (!date || (date.m !== null && (date.m < 1 || date.m > 12)) || date.d < 1 || date.d > 31) return null;
    const day = withYear(date, now, timeZone);
    const time = readTime(first('time')) ?? readTime(leftoverAndFields(text));

    const specialty = clean(first('specialty'));
    const professional = clean(first('professional'));
    const health = Boolean(specialty || professional || first('plan'));
    const lines = leftoverLines(text).filter(l => !/^(agendamento|seu agendamento|your appointment)/i.test(plain(l)) && !/realizado|confirmad|sucesso|success/i.test(plain(l)));

    let summary;
    if (specialty) summary = `${health ? 'Consulta: ' : ''}${titleCase(specialty)}${professional ? ` — ${titleCase(professional)}` : ''}`;
    else if (professional) summary = `Consulta — ${titleCase(professional)}`;
    else if (fields.length) summary = clean(lines[0] ?? '').slice(0, 80) || 'Evento';
    else summary = titleFromSentence(text) ?? nounOf(text);

    const unit = clean(first('unit'));
    const address = clean(by('address').join(', '));
    const location = [unit, address].filter(Boolean).join(', ');

    const description = [
        professional && `Profissional: ${titleCase(professional)}`,
        specialty && `Especialidade: ${titleCase(specialty)}`,
        first('plan') && `Convênio/plano: ${clean(by('plan').join(' — '))}`,
        first('patient') && `Paciente: ${titleCase(first('patient'))}`,
        first('method') && `Agendamento: ${clean(first('method'))}`,
        ...lines.filter(l => l !== summary)
    ].filter(Boolean).join('\n');

    const arrive = /chegar\s+(?:com\s+)?(\d{1,3})\s*min/i.exec(withoutAccents(text));
    const asked = readReminders(text);
    const alarms = asked ? asked.map(popup) : defaultAlarms();
    if (arrive) alarms.push(popup(+arrive[1] + 15));

    return buildEvent({
        summary: emoji ? withEmoji(summary) : summary, location, description, day, time, timeZone, duration, alarms, now,
        source: 'local'
    });
}

// The text outside the date label, to look for a time that is not under "Horário:"
const leftoverAndFields = (text) => String(text);

/* ---------------------------------------------------------------- the event */

// A reminder is { minutes, method }: method is 'popup' (a notification) or 'email'. A plain number (what the local
// reader and a typed "X antes" give) is a popup. Two reminders at the same minutes can still differ by method.
const popup = (minutes) => ({ minutes, method: 'popup' });

// When nothing says otherwise: notifications 1 day, 6 hours and 15 minutes before.
const defaultAlarms = () => [popup(1440), popup(360), popup(15)];

// Normalizes (a plain number is a popup), drops invalid ones, removes exact duplicates (same minutes and method) and
// sorts from the furthest to the closest (a popup before an email at the same minutes)
function normalizeAlarms(alarms) {
    const seen = new Set();
    const out = [];
    for (const raw of alarms) {
        const item = typeof raw === 'number' ? popup(raw) : raw;
        const minutes = Number(item?.minutes);
        if (!(minutes > 0)) continue;
        const method = item.method === 'email' ? 'email' : 'popup';
        const key = `${minutes}:${method}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ minutes, method });
    }
    return out.sort((a, b) => b.minutes - a.minutes || (a.method === b.method ? 0 : a.method === 'popup' ? -1 : 1));
}

/**
 * The event, whatever read it: start and end in ms (UTC) (or, all day, the dates), with the time zone it is shown in.
 */
function buildEvent({ summary, location = '', description = '', day, time, timeZone, duration = 60, alarms = defaultAlarms(), source, now = Date.now() }) {
    const event = { summary: String(summary).slice(0, 200), location, description, timeZone, alarms: normalizeAlarms(alarms), source, allDay: !time };
    if (!time) {
        event.startDate = `${day.y}-${String(day.m).padStart(2, '0')}-${String(day.d).padStart(2, '0')}`;
        const next = new Date(Date.UTC(day.y, day.m - 1, day.d + 1));
        event.endDate = next.toISOString().slice(0, 10);
        return event;
    }
    event.start = zonedToUtc(day.y, day.m, day.d, time.h, time.min, timeZone);
    event.end = time.end ? zonedToUtc(day.y, day.m, day.d, time.end.h, time.end.min, timeZone) : event.start + duration * 60_000;
    return event;
}

/* ---------------------------------------------------------------- the formats */

const utcStamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

const escapeIcs = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// A line of an .ics has at most 75 bytes: the rest goes on the next, after a space
function fold(line) {
    const out = [];
    let current = '';
    let bytes = 0;
    for (const ch of line) {
        const size = Buffer.byteLength(ch);
        if (bytes + size > (out.length ? 74 : 75)) {
            out.push(current);
            current = '';
            bytes = 0;
        }
        current += ch;
        bytes += size;
    }
    out.push(current);
    return out.join('\r\n ');
}

function humanBefore(minutes) {
    if (minutes % 10080 === 0) return `${minutes / 10080} semana${minutes === 10080 ? '' : 's'}`;
    if (minutes % 1440 === 0) return `${minutes / 1440} dia${minutes === 1440 ? '' : 's'}`;
    if (minutes % 60 === 0) return `${minutes / 60} h`;
    return `${minutes} min`;
}

// "30 min, 1 dia, 1 dia (por e-mail)": a popup reminder is bare, an e-mail one says so
const describeAlarms = (alarms) => alarms.map(a => `${humanBefore(a.minutes)}${a.method === 'email' ? ` (${t('calendar.byEmail')})` : ''}`).join(', ');

/** The .ics (iCalendar) text of the event */
function toIcs(event, { now = Date.now() } = {}) {
    const uid = `${crypto.createHash('sha1').update(`${event.summary}|${event.start ?? event.startDate}|${event.location}`).digest('hex').slice(0, 24)}@zapbot`;
    const lines = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ZapBot//calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${utcStamp(now)}`
    ];
    if (event.allDay) lines.push(`DTSTART;VALUE=DATE:${event.startDate.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${event.endDate.replace(/-/g, '')}`);
    else lines.push(`DTSTART:${utcStamp(event.start)}`, `DTEND:${utcStamp(event.end)}`);
    lines.push(`SUMMARY:${escapeIcs(event.summary)}`);
    if (event.location) lines.push(`LOCATION:${escapeIcs(event.location)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeIcs(event.description)}`);
    lines.push('STATUS:CONFIRMED', 'TRANSP:OPAQUE');
    // .ics has no "by e-mail" alert: the same minutes by popup and by e-mail become one VALARM
    for (const minutes of new Set(event.alarms.map(a => a.minutes))) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeIcs(event.summary)}`, `TRIGGER:-PT${minutes}M`, 'END:VALARM');
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return `${lines.map(fold).join('\r\n')}\r\n`;
}

// "2026-11-25T10:45:00" in the time zone of the event (what the Google Calendar API takes with timeZone)
function wallTime(ms, timeZone) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

/** The event as the Google Calendar API's Events resource (events.insert) */
function toGoogleJson(event) {
    const json = { summary: event.summary };
    if (event.location) json.location = event.location;
    if (event.description) json.description = event.description;
    if (event.allDay) {
        json.start = { date: event.startDate };
        json.end = { date: event.endDate };
    } else {
        json.start = { dateTime: wallTime(event.start, event.timeZone), timeZone: event.timeZone };
        json.end = { dateTime: wallTime(event.end, event.timeZone), timeZone: event.timeZone };
    }
    json.reminders = { useDefault: false, overrides: event.alarms.map(({ minutes, method }) => ({ method, minutes })) };
    return json;
}

/** The "add to Google Calendar" link: opens the form already filled, no account connection needed */
function toGoogleLink(event) {
    const dates = event.allDay
        ? `${event.startDate.replace(/-/g, '')}/${event.endDate.replace(/-/g, '')}`
        : `${utcStamp(event.start)}/${utcStamp(event.end)}`;
    const params = new URLSearchParams({ action: 'TEMPLATE', text: event.summary, dates });
    if (event.location) params.set('location', event.location);
    if (event.description) params.set('details', event.description.slice(0, 900));
    if (!event.allDay) params.set('ctz', event.timeZone);
    return `https://calendar.google.com/calendar/render?${params}`;
}

/* ---------------------------------------------------------------- the ChatGPT reader */

/** What ChatGPT is told: the Google Calendar JSON and nothing else */
function gptInstructions({ timeZone, duration, now, emoji = false }) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'full' }).format(new Date(now));
    return [
        'You read a text with an appointment or an event and answer ONLY with one JSON object, no other text, no code fence.',
        'The JSON is an event of the Google Calendar API (Events resource):',
        '{"summary": "...", "location": "...", "description": "...",',
        ' "start": {"dateTime": "YYYY-MM-DDTHH:MM:SS", "timeZone": "..."}, "end": {"dateTime": "YYYY-MM-DDTHH:MM:SS", "timeZone": "..."},',
        ' "reminders": {"useDefault": false, "overrides": [{"method": "popup", "minutes": 1440}, {"method": "popup", "minutes": 360}, {"method": "popup", "minutes": 15}]}}',
        `Use the time zone ${timeZone} when the text does not say another. Today is ${today}.`,
        `If the duration is not in the text, the event lasts ${duration} minutes. An event with no time uses {"date": "YYYY-MM-DD"} in start and end (end is the next day).`,
        'summary: short and clear (for example "Consulta: Reumatologia — Paula da Costa Paiva"). location: unit and address in one line.',
        'If the text asks for reminders (avisos, alertas, lembretes antes), put them in reminders.overrides: the ones it says ("30 minutos antes"), or, when it only asks to generate them, 1440, 360 and 15 minutes.',
        ...(emoji ? ['summary starts with ONE emoji that fits the kind of event, then a space (for example "🩺 Consulta: Reumatologia", "🦷 Dentista", "🏋🏽‍♂️ Crossfit", "🏋🏽‍♂️ Treino", "🏃🏽‍♂️ Corrida", "🎂 Aniversário da Ana", "🎉 Festa de fim de ano", "💼 Reunião", "✈️ Voo"); with no fitting emoji, 📅.'] : []),
        'description: the other useful facts (professional, insurance, notes such as documents to bring or arrival time), one per line.',
        'If the text has no date, answer exactly {"error": "no date"}.'
    ].join('\n');
}

/**
 * The event from what ChatGPT answered (the Google Calendar JSON); the same checks of the local reader.
 * @returns {object} the event
 * @throws {Error} when the answer is not an event
 */
function fromGoogleJson(answer, { timeZone = 'America/Sao_Paulo', duration = 60, now = Date.now() } = {}) {
    const raw = String(answer ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    let json;
    try {
        json = JSON.parse(raw.slice(start, end + 1));
    } catch {
        throw new Error('the answer is not a JSON');
    }
    if (json.error) throw new Error(String(json.error));
    // clean() would strip the emoji ChatGPT was asked to put at the start (gptInstructions, when asked for one)
    const summary = String(json.summary ?? '').replace(/[*_~]+/g, '').replace(/[ \t]+/g, ' ').trim();
    if (!summary || !json.start) throw new Error('the answer has no summary or start');

    const alarms = (json.reminders?.overrides ?? [])
        .map(o => ({ minutes: Number(o.minutes), method: o.method === 'email' ? 'email' : 'popup' }))
        .filter(o => Number.isFinite(o.minutes) && o.minutes > 0);
    const common = {
        // ChatGPT picks its own emoji (gptInstructions, when asked): unlike the local reader, no keyword list here
        summary, location: clean(json.location), description: String(json.description ?? '').trim(),
        alarms: alarms.length ? alarms : defaultAlarms(), source: 'gpt'
    };

    if (json.start.date) {
        const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(json.start.date);
        if (!day) throw new Error('start.date is not YYYY-MM-DD');
        return buildEvent({ ...common, day: { y: +day[1], m: +day[2], d: +day[3] }, time: null, timeZone, duration, now });
    }
    const zone = isTimeZone(json.start.timeZone) ? json.start.timeZone : timeZone;
    const toMs = (part) => {
        const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?(Z|[+-]\d{2}:?\d{2})?$/.exec(String(part?.dateTime ?? ''));
        if (!m) return null;
        if (m[6]) return Date.parse(String(part.dateTime));
        return zonedToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], isTimeZone(part.timeZone) ? part.timeZone : zone);
    };
    const startMs = toMs(json.start);
    if (!startMs) throw new Error('start.dateTime is not a date and time');
    const endMs = toMs(json.end);
    return { ...common, timeZone: zone, allDay: false, start: startMs, end: endMs && endMs > startMs ? endMs : startMs + duration * 60_000 };
}

module.exports = { describeAlarms, emojiFor, fromGoogleJson, gptInstructions, humanBefore, isTimeZone, parseLocal, toGoogleJson, toGoogleLink, toIcs, wallTime, withEmoji, zonedToUtc };
