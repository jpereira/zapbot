/*
 * /calendar: a text with an appointment becomes an .ics, a Google Calendar link and the Google Calendar JSON.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { MessageMedia, network, OTHERAlt } = bot;
const cal = bot.src('calendar');
const popup = (minutes) => ({ minutes, method: 'popup' });
const byEmail = (minutes) => ({ minutes, method: 'email' });

const CLINIC = `*AGENDAMENTO REALIZADO!* ✅
Especialidade: REUMATOLOGIA (ENCAIXE)
Profissional: PAULA DA COSTA PAIVA

Data: 25/11/2026
Horário: 10:45h
Endereço: *CENTRO MÉDICO*
CHN - NOVA UNIDADE 2 - NA RUA MARQUÊS DE OLINDA, S/N, ESQUINA COM A RUA EUSÉBIO DE
QUEIROZ, CENTRO - NITERÓI

Não esquecer documento com foto e chegar 20 minutos antes`;

const HOSPITAL = `Seu agendamento foi realizado com sucesso! 🎉

*Nome*: JOSE JORGE PEREIRA NAZARENO
*Unidade*: COMPLEXO HOSPITALAR NITEROI
*Endereço*: NA RUA MARQUÊS DE OLINDA, S/N, ESQUINA COM A RUA EUSÉBIO DE QUEIROZ, CENTRO - NITERÓI
*Método de Agendamento*: Convênio
*Convênio*: AMIL- ASS. MED
*Plano*: 879 AMIL S 450 QP APTO
*Médico*: ISADORA CAMBRUZZI
*Especialidade*: REUMATOLOGIA
*Data*: 01/12/2026
*Horário*: 20:00`;

const NOW = Date.parse('2026-11-22T10:00:00Z');
const read = (text, o = {}) => cal.parseLocal(text, { now: NOW, ...o });
const media = (r) => r.find(x => x.content instanceof MessageMedia);
const icsOf = (m) => Buffer.from(m.content.data, 'base64').toString('utf8');

beforeEach(bot.restart);

describe('the local reader', () => {
    test('the clinic confirmation: title, date and time in São Paulo, the address in one line, the notes and the reminders', () => {
        const e = read(CLINIC);
        assert.equal(e.summary, 'Consulta: Reumatologia (Encaixe) — Paula da Costa Paiva');
        assert.equal(new Date(e.start).toISOString(), '2026-11-25T13:45:00.000Z'); // 10:45 in UTC-3
        assert.equal(new Date(e.end).toISOString(), '2026-11-25T14:45:00.000Z');
        assert.equal(e.location, 'CENTRO MÉDICO, CHN - NOVA UNIDADE 2 - NA RUA MARQUÊS DE OLINDA, S/N, ESQUINA COM A RUA EUSÉBIO DE QUEIROZ, CENTRO - NITERÓI');
        assert.match(e.description, /Profissional: Paula da Costa Paiva/);
        assert.match(e.description, /Não esquecer documento com foto e chegar 20 minutos antes/);
        assert.ok(!e.description.includes('AGENDAMENTO REALIZADO'));
        assert.deepEqual(e.alarms, [popup(1440), byEmail(1440), popup(120), popup(35)], '1 day (notification and e-mail), 2 hours and the arrival (20 min + 15)');
    });

    test('the hospital confirmation (labels in bold, unit + address, insurance, patient)', () => {
        const e = read(HOSPITAL);
        assert.equal(e.summary, 'Consulta: Reumatologia — Isadora Cambruzzi');
        assert.equal(new Date(e.start).toISOString(), '2026-12-01T23:00:00.000Z'); // 20:00 in UTC-3
        assert.equal(e.location, 'COMPLEXO HOSPITALAR NITEROI, NA RUA MARQUÊS DE OLINDA, S/N, ESQUINA COM A RUA EUSÉBIO DE QUEIROZ, CENTRO - NITERÓI');
        assert.match(e.description, /Convênio\/plano: AMIL- ASS\. MED — 879 AMIL S 450 QP APTO/);
        assert.match(e.description, /Paciente: Jose Jorge Pereira Nazareno/);
        assert.deepEqual(e.alarms, [popup(1440), byEmail(1440), popup(120)], 'the default: 1 day and 2 hours, the day also by e-mail');
    });

    test('dates and times by their shape: month names, no year, a range, 10h, no time (all day), another zone and duration', () => {
        assert.equal(new Date(read('Dentista 25 de novembro de 2026 às 9h30').start).toISOString(), '2026-11-25T12:30:00.000Z');
        assert.equal(new Date(read('Reunião 2026-12-03 14:00').start).toISOString(), '2026-12-03T17:00:00.000Z');
        assert.equal(new Date(read('Jantar 5 jan 2027 às 20h').start).toISOString(), '2027-01-05T23:00:00.000Z');
        // no year: the next time that day comes (today is 22/11/2026: 10/03 is in 2027, 30/11 is this year)
        assert.equal(new Date(read('Show 10/03 às 21:00').start).getUTCFullYear(), 2027);
        assert.equal(new Date(read('Show 30/11 às 21:00').start).getUTCFullYear(), 2026);

        const range = read('Aula 25/11/2026 das 10:00 às 11:30');
        assert.equal((range.end - range.start) / 60000, 90);
        assert.equal((read('Aula 25/11/2026 14:00', { duration: 45 }).end - read('Aula 25/11/2026 14:00').start) / 60000, 45);

        const allDay = read('Feriado dia 15/11/2027');
        assert.deepEqual([allDay.allDay, allDay.startDate, allDay.endDate], [true, '2027-11-15', '2027-11-16']);

        assert.equal(new Date(read('Voo 25/11/2026 10:00', { timeZone: 'Europe/Lisbon' }).start).toISOString(), '2026-11-25T10:00:00.000Z');
        assert.equal(read('sem data nenhuma aqui'), null);
        assert.equal(read('Dia 45/13/2026'), null);
    });
});

describe('an event typed in a sentence', () => {
    const sentence = (text) => read(text);
    const when = (e) => new Date(e.start).toISOString();

    test('"criar evento para dia 21 de maio as 22h, gere avisos": no title, the next 21 of May, and a good set of reminders', () => {
        const e = sentence('criar evento para dia 21 de maio as 22h, gere avisos');
        assert.equal(e.summary, 'Evento');
        assert.equal(when(e), '2027-05-22T01:00:00.000Z'); // 22h in São Paulo, the next 21/05 (today is 22/11/2026)
        assert.deepEqual(e.alarms, [popup(10080), popup(1440), popup(120), popup(30)], 'a week, a day, two hours and half an hour before, by notification');
    });

    test('the title in the sentence (plain, after "evento", in quotes or "chamado"), without the verbs, the date and the time', () => {
        assert.equal(sentence('criar evento Aniversário da Ana dia 21 de maio às 22h').summary, 'Aniversário da Ana');
        assert.equal(sentence('agendar dentista dia 25 às 10h').summary, 'Dentista');
        assert.equal(sentence('crie um lembrete amanhã às 9h30 pagar o boleto').summary, 'Pagar o boleto');
        assert.equal(sentence('criar evento "Show do Djavan" dia 3 de dezembro 20h').summary, 'Show do Djavan');
        assert.equal(sentence('marcar evento chamado Churrasco dia 5 de dezembro às 13h').summary, 'Churrasco');
        assert.equal(sentence('criar lembrete para dia 21 de maio as 22h').summary, 'Lembrete');
        assert.equal(sentence('add dentist tomorrow at 9:30').summary, 'Dentist');
    });

    test('"dia 25" is the next 25th, and today, tomorrow and the days of the week are the next one', () => {
        assert.equal(when(sentence('agendar dentista dia 25 às 10h')), '2026-11-25T13:00:00.000Z');
        assert.equal(when(sentence('reunião dia 10 às 10h')), '2026-12-10T13:00:00.000Z', 'the 10th has passed: next month');
        assert.equal(when(sentence('evento hoje 18h')), '2026-11-22T21:00:00.000Z');
        assert.equal(when(sentence('evento amanhã 9h30')), '2026-11-23T12:30:00.000Z');
        assert.equal(when(sentence('evento depois de amanhã 8h')), '2026-11-24T11:00:00.000Z');
        assert.equal(when(sentence('marcar reunião sexta às 15h')), '2026-11-27T18:00:00.000Z', 'today is Sunday');
        assert.equal(when(sentence('marcar reunião domingo às 15h')), '2026-11-29T18:00:00.000Z', 'a week from today');
    });

    test('the reminders it asks for replace the default ones: "30 minutos antes", "1 dia e 2 horas antes", "1 hour before"', () => {
        assert.deepEqual(sentence('marcar reunião sexta às 15h, me avise 30 minutos antes').alarms, [popup(30)]);
        assert.deepEqual(sentence('agendar dentista dia 25 às 10h, avisos 1 dia e 2 horas antes').alarms, [popup(1440), popup(120)]);
        assert.deepEqual(sentence('add dentist tomorrow at 9:30, remind me 1 hour before').alarms, [popup(60)]);
        assert.deepEqual(sentence('criar lembrete para dia 21 de maio as 22h').alarms, [popup(1440), byEmail(1440), popup(120)], 'the noun "lembrete" asks for nothing: the default');
        assert.equal(sentence('Consulta dia 25/11/2026 às 10:45h, chegar 20 minutos antes').alarms.some(a => a.minutes === 35), true, 'the arrival still counts');
    });

    test('through the command: the .ics has the reminders asked and the Google JSON has them too', async () => {
        const r = await bot.execute('/calendar criar evento para dia 21 de maio as 22h, gere avisos');
        const file = media(r);
        assert.match(icsOf(file), /SUMMARY:📅 Evento\r\n/);
        assert.match(icsOf(file), /DTSTART:2027052\dT\d{6}Z/);
        assert.equal((icsOf(file).match(/BEGIN:VALARM/g) ?? []).length, 4);
        assert.match(icsOf(file), /TRIGGER:-PT10080M/);
        assert.match(file.options.caption, /⏰ Lembretes: 1 semana, 1 dia, 2 h, 30 min antes/);
    });
});

describe('the emoji of the title', () => {
    test('the kind of the event chooses it: a list of the most common ones', () => {
        const cases = {
            'Consulta no Centro Médico': '🩺', 'Dentista': '🦷', 'Escalada': '🧗', 'Corrida de rua': '🏃🏽‍♂️',
            'Crossfit': '🏋🏽‍♂️', 'Treino de perna': '🏋🏽‍♂️', 'Yoga': '🧘', 'Aniversário da Ana': '🎂',
            'Jantar com a Maria': '🍽️', 'Cinema': '🎬', 'Voo para Lisboa': '✈️', 'Reunião': '💼',
            'Prova de inglês': '📝', 'Aula de inglês': '🎓', 'Pagar o IPTU': '💳', 'Evento': '📅', 'Meeting with John': '💼'
        };
        for (const [title, emoji] of Object.entries(cases)) assert.equal(cal.withEmoji(title), `${emoji} ${title}`, title);
        assert.equal(cal.withEmoji('Planejamento 2027'), 'Planejamento 2027', 'no fitting emoji: nothing is added');
        assert.equal(cal.withEmoji('🎸 Ensaio'), '🎸 Ensaio', 'it never doubles an emoji');
        assert.equal(cal.emojiFor('Consulta no dentista'), '🦷', 'the specific wins over the general');
    });

    test('the local reader adds it only when asked, and the ChatGPT prompt asks for it', () => {
        const options = { now: Date.parse('2026-11-22T12:00:00Z') };
        assert.equal(cal.parseLocal('escalada sábado às 9h', { ...options, emoji: true }).summary, '🧗 Escalada');
        assert.equal(cal.parseLocal('escalada sábado às 9h', options).summary, 'Escalada');
        assert.match(cal.gptInstructions({ timeZone: 'America/Sao_Paulo', duration: 60, now: options.now, emoji: true }), /ONE emoji/);
        assert.doesNotMatch(cal.gptInstructions({ timeZone: 'America/Sao_Paulo', duration: 60, now: options.now }), /emoji/);
    });

    test('English sentences: 3pm, "on Dec 3", "at 8pm on Friday"', () => {
        const options = { now: Date.parse('2026-11-22T12:00:00Z') };
        const read = (text) => { const e = cal.parseLocal(text, options); return [e.summary, new Date(e.start).toISOString()]; };
        assert.deepEqual(read('create event Birthday party on May 21 at 10pm'), ['Birthday party', '2027-05-22T01:00:00.000Z']);
        assert.deepEqual(read('dinner at 8pm on Friday'), ['Dinner', '2026-11-27T23:00:00.000Z']);
        assert.deepEqual(read('meeting with John on Dec 3 at 14:00'), ['Meeting with John', '2026-12-03T17:00:00.000Z']);
    });
});

describe('the formats', () => {
    test('.ics: CRLF, UTC times, escaped text, folded lines, one alarm per reminder and a stable UID', () => {
        const event = read(CLINIC);
        const ics = cal.toIcs(event, { now: NOW });
        assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
        assert.match(ics, /DTSTART:20261125T134500Z\r\n/);
        assert.match(ics, /DTEND:20261125T144500Z\r\n/);
        assert.match(ics, /SUMMARY:Consulta: Reumatologia \(Encaixe\) — Paula da Costa Paiva\r\n/);
        assert.equal((ics.match(/BEGIN:VALARM/g) ?? []).length, 3);
        assert.match(ics, /TRIGGER:-PT1440M/);
        for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, `line over 75 bytes: ${line}`);
        // unfolded, the commas of the address are escaped
        assert.match(ics.replace(/\r\n /g, ''), /LOCATION:CENTRO MÉDICO\\, CHN - NOVA UNIDADE 2/);
        assert.equal(cal.toIcs(event, { now: 5 }).match(/UID:(\S+)/)[1], ics.match(/UID:(\S+)/)[1]);
        assert.match(cal.toIcs(read('Feriado 15/11/2027'), { now: NOW }), /DTSTART;VALUE=DATE:20271115\r\nDTEND;VALUE=DATE:20271116/);
    });

    test('the Google Calendar JSON and the "add" link', () => {
        const event = read(HOSPITAL);
        const json = cal.toGoogleJson(event);
        assert.deepEqual(json.start, { dateTime: '2026-12-01T20:00:00', timeZone: 'America/Sao_Paulo' });
        assert.deepEqual(json.end, { dateTime: '2026-12-01T21:00:00', timeZone: 'America/Sao_Paulo' });
        assert.deepEqual(json.reminders, { useDefault: false, overrides: [{ method: 'popup', minutes: 1440 }, { method: 'email', minutes: 1440 }, { method: 'popup', minutes: 120 }] });
        const link = new URL(cal.toGoogleLink(event));
        assert.equal(link.origin + link.pathname, 'https://calendar.google.com/calendar/render');
        assert.deepEqual([link.searchParams.get('action'), link.searchParams.get('dates'), link.searchParams.get('ctz')], ['TEMPLATE', '20261201T230000Z/20261202T000000Z', 'America/Sao_Paulo']);
        assert.match(link.searchParams.get('text'), /Isadora Cambruzzi/);
    });

    test('ChatGPT answers are read like the local ones: fences, offsets, all day, bad answers', () => {
        const answer = '```json\n{"summary":"Dentista","location":"Rua A, 10","description":"levar documento","start":{"dateTime":"2026-11-25T10:45:00","timeZone":"America/Sao_Paulo"},"end":{"dateTime":"2026-11-25T11:15:00","timeZone":"America/Sao_Paulo"},"reminders":{"useDefault":false,"overrides":[{"method":"popup","minutes":60}]}}\n```';
        const e = cal.fromGoogleJson(answer, { now: NOW });
        assert.deepEqual([e.summary, new Date(e.start).toISOString(), (e.end - e.start) / 60000, e.alarms, e.source], ['Dentista', '2026-11-25T13:45:00.000Z', 30, [popup(60)], 'gpt']);
        assert.equal(cal.fromGoogleJson('{"summary":"x","start":{"dateTime":"2026-11-25T10:00:00-05:00"}}').start, Date.parse('2026-11-25T15:00:00Z'));
        assert.equal(cal.fromGoogleJson('{"summary":"Feriado","start":{"date":"2026-12-25"},"end":{"date":"2026-12-26"}}').allDay, true);
        assert.throws(() => cal.fromGoogleJson('{"error":"no date"}'), /no date/);
        assert.throws(() => cal.fromGoogleJson('sorry, I cannot'), /not a JSON/);
        assert.throws(() => cal.fromGoogleJson('{"summary":"x","start":{"dateTime":"amanhã"}}'), /not a date/);
    });

    test('the emoji ChatGPT puts in the summary (gptInstructions, when asked) survives: clean() must not strip it', () => {
        const answer = '{"summary":"🦷 Dentista","start":{"dateTime":"2026-11-25T10:45:00","timeZone":"America/Sao_Paulo"}}';
        assert.equal(cal.fromGoogleJson(answer, { now: NOW }).summary, '🦷 Dentista');
    });
});

describe('/calendar', () => {
    test('calendar.addEmoji=false: the title has no emoji', async () => {
        assert.match(icsOf(media(await bot.execute('/calendar Dentista 03/12/2026 às 14h'))), /SUMMARY:🦷 Dentista\r\n/);
        await bot.setSetting('calendar.addEmoji', false);
        assert.match(icsOf(media(await bot.execute('/calendar Dentista 03/12/2026 às 14h'))), /SUMMARY:Dentista\r\n/);
    });

    test('replying to a confirmation: the notice becomes "event below", then the .ics as a document with the summary and the link', async () => {
        const quoted = bot.createMessage({ text: CLINIC, de: OTHERAlt.jid });
        const r = await bot.execute('/calendar', { quoted });
        assert.equal(r.length, 2);
        assert.equal(r[0].text, '📅 Evento abaixo.');
        const file = media(r);
        assert.equal(file.content.mimetype, 'text/calendar');
        assert.match(file.content.filename, /^consulta-reumatologia-encaixe-paula-da-costa-paiva\.ics$/);
        assert.equal(file.options.sendMediaAsDocument, true);
        assert.match(icsOf(file), /SUMMARY:🩺 Consulta: Reumatologia/);
        assert.match(file.options.caption, /^📅 \*🩺 Consulta: Reumatologia \(Encaixe\) — Paula da Costa Paiva\*\n🗓️ .+25\/11\/2026 · 10:45 → 11:45\n📍 CENTRO MÉDICO/);
        assert.match(file.options.caption, /⏰ Lembretes: 1 dia, 1 dia \(por e-mail\), 2 h, 35 min antes/);
        assert.match(file.options.caption, /➕ Adicionar ao Google Agenda: https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE[^\n]*\n\n💡 _Processado por leitor local_$/);
    });

    test('reply output is private for the caller and only the command is deleted', async () => {
        const quoted = bot.createMessage({ text: CLINIC, de: bot.OWNER.jid });
        const cmd = bot.createMessage({ text: '/cal', de: OTHERAlt.jid, quoted });
        const result = await bot.deliver(cmd);
        assert.equal(result.length, 2);
        for (const item of result) {
            assert.equal(item.chatId, OTHERAlt.jid);
            assert.equal(item.options.quotedMessageId, undefined);
        }
        assert.equal(cmd.deletedFor, 'todos');
        assert.equal(quoted.deletedFor, undefined);
    });

    test('reply errors are private, and -d or turning the setting off keeps output in the chat', async () => {
        const quoted = bot.createMessage({ text: 'sem data' });
        const error = await bot.execute('/cal', { quoted });
        assert.equal(error.at(-1).chatId, bot.OWNER.jid);
        assert.match(error.at(-1).text, /Não achei uma data/);
        quoted.body = CLINIC;
        const direct = bot.createMessage({ text: '/cal -d', quoted });
        assert.equal(media(await bot.deliver(direct)).chatId, bot.GROUP);
        assert.equal(direct.deletedFor, undefined);
        await bot.setSetting('calendar.outputToPrivate', false);
        const bySetting = bot.createMessage({ text: '/cal', quoted });
        assert.equal(media(await bot.deliver(bySetting)).chatId, bot.GROUP);
        assert.equal(bySetting.deletedFor, undefined);
    });

    test('typed text wins over the reply; /cal is the same; -q sends only the file; -json adds the Google JSON', async () => {
        const quoted = bot.createMessage({ text: HOSPITAL, de: OTHERAlt.jid });
        const typed = media(await bot.execute('/cal Dentista 03/12/2026 às 14h', { quoted }));
        assert.match(icsOf(typed), /SUMMARY:🦷 Dentista/);

        const quiet = await bot.execute('/calendar -q', { quoted });
        assert.equal(quiet.length, 1, 'no notice');
        assert.equal(quiet[0].options.caption, undefined);
        assert.match(icsOf(quiet[0]), /Isadora Cambruzzi/);

        const json = await bot.execute('/calendar -j', { quoted });
        const block = json.at(-1).text;
        assert.match(block, /^```\{\n {2}"summary": "🩺 Consulta: Reumatologia — Isadora Cambruzzi"/);
        assert.equal(JSON.parse(block.replace(/```/g, '')).start.dateTime, '2026-12-01T20:00:00');
    });

    test('the duration, time zone and footer settings', async () => {
        await bot.setSetting('calendar.duration', 90);
        assert.match(icsOf(media(await bot.execute('/calendar Aula 25/11/2026 14:00'))), /DTEND:20261125T183000Z/);
        await assert.rejects(bot.setSetting('calendar.duration', 2), /entre 5 e 1440/);
        await bot.setSetting('calendar.duration', 60);

        await bot.setSetting('calendar.timezone', 'Europe/Lisbon');
        assert.match(icsOf(media(await bot.execute('/calendar Aula 25/11/2026 14:00'))), /DTSTART:20261125T140000Z/);
        await assert.rejects(bot.setSetting('calendar.timezone', 'Marte/Olimpo'), /fuso/);

        await bot.setSetting('calendar.footer', false);
        assert.ok(!media(await bot.execute('/calendar Aula 25/11/2026 14:00')).options.caption.includes('💡'));

        await bot.setSetting('calendar.googleLink', false);
        const noLink = media(await bot.execute('/calendar Aula 25/11/2026 14:00'));
        assert.ok(!noLink.options.caption.includes('calendar.google.com'), 'off: no link');
        assert.equal(noLink.content.mimetype, 'text/calendar', 'the .ics still goes');
    });

    test('without text, without a date, or too long', async () => {
        assert.match((await bot.replyAlt('/calendar'))[0], /^```Usage: \/calendar /);
        assert.equal((await bot.execute('/calendar nada de data aqui')).at(-1).text, '❌ Não achei uma data no texto. Mande com uma data (25/11/2026, "25 de novembro") ou tente o -gpt.');
        assert.match((await bot.replyAlt(`/calendar ${'a'.repeat(6001)}`))[0], /6001 caracteres: o limite é 6000/);
    });

    test('-gpt: only the owner or a user with a limit; it needs the key; ChatGPT answers the Google Calendar JSON; the usage is told with -s', async () => {
        assert.match((await bot.replyAlt('/calendar -gpt Dentista amanhã', { de: OTHERAlt.jid }))[0], /gasta a chave da OpenAI/);
        assert.match((await bot.replyAlt('/calendar -gpt Dentista dia 03/12/2026 14h'))[0], /API key da OpenAI não encontrada/);

        await bot.setSetting('gpt.api.key', 'sk-teste');
        await bot.setSetting('gpt.status', false);
        network.responder('post', 'api.openai.com/v1/chat/completions', { choices: [{ message: { content: '{"summary":"Dentista","location":"Rua A, 10","start":{"dateTime":"2026-12-03T14:00:00","timeZone":"America/Sao_Paulo"},"end":{"dateTime":"2026-12-03T14:45:00","timeZone":"America/Sao_Paulo"}}' } }], usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } });
        const r = await bot.execute('/calendar -g terça que vem no dentista', {});
        const file = media(r);
        assert.match(icsOf(file), /SUMMARY:Dentista/);
        assert.match(icsOf(file), /DTEND:20261203T174500Z/);
        assert.match(file.options.caption, /💡 _Processado por ChatGPT_/);
        assert.ok(!/ TX/.test(file.options.caption), 'no usage without -s (gpt.status off)');
        assert.match(media(await bot.execute('/calendar -g -s terça que vem no dentista')).options.caption, /⬆️ .+ TX/);

        const sent = network.calls.at(-1).cfg.body;
        assert.match(sent.messages[0].content, /Google Calendar API/);
        assert.match(sent.messages[0].content, /America\/Sao_Paulo/);
        assert.equal(sent.messages[1].content, 'terça que vem no dentista');

        // a bad answer is told
        network.responder('post', 'api.openai.com/v1/chat/completions', { choices: [{ message: { content: 'não sei' } }] });
        assert.match((await bot.execute('/calendar -g algo', { expectedError: true })).at(-1).text, /❌ Não consegui fazer o evento: the answer is not a JSON/);
    });
});
