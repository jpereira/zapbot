/*
 * Schedule: date reading (util/when.js) and /cron (/agenda, /lembrete),
 * with both modes: message (plain text) and reminder (⏰ Lembrete).
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, GROUP, OTHERAlt } = bot;
const { fmtWhen, readWhen, nextRepetition, instantInBrasilia } = bot.src('util/when');
const { readScheduling, checkSchedule } = bot.src('schedule');

const L200 = '120363000000000200@g.us';
const HOUR = 3600_000;

beforeEach(async () => {
    await bot.restart();
    bot.createGroup(L200, 'Grupo sobre L200', [OWNER.jid]);
});

// Expires the item (or all) `delayMs` ago and runs the check; returns what was sent
async function expire(delayMs = 1000) {
    await bot.dbRun('UPDATE schedules SET due_at = ?', [Date.now() - delayMs]);
    const beforeAlt = bot.client.enviadas.length;
    await checkSchedule();
    return bot.client.enviadas.slice(beforeAlt);
}

const items = () => bot.dbAll('SELECT * FROM schedules ORDER BY id');

describe('datas (util/when.js)', () => {
    // thu 01/10/2026 09:00 in Brasília
    const NOW = instantInBrasilia(2026, 10, 1, 9, 0);
    const when = (textAlt) => {
        const r = readWhen(textAlt.split(' '), NOW);
        return r && `${fmtWhen(r.ms, NOW)} (${r.usadas})`;
    };

    test('daqui a tanto tempo: 30m, 1d, 1h30m, e +2h, em 2h, daqui (a) 2h', () => {
        assert.equal(when('30m'), 'qui 01/10 09:30 (1)');
        assert.equal(when('1h30m'), 'qui 01/10 10:30 (1)');
        assert.equal(when('2d'), 'sáb 03/10 09:00 (1)');
        assert.equal(when('+2h'), 'qui 01/10 11:00 (1)');
        assert.equal(when('+18h'), 'sex 02/10 03:00 (1)');
        assert.equal(when('em 2h texto'), 'qui 01/10 11:00 (2)');
        assert.equal(when('daqui 30m'), 'qui 01/10 09:30 (2)');
        assert.equal(when('daqui a 1d'), 'sex 02/10 09:00 (3)');
        assert.equal(when('+banana'), null);
        assert.equal(when('em casa'), null);
    });

    test('hora: hoje, ou amanhã se já passou; "6h" e "07h" sozinhos são horário', () => {
        assert.equal(when('18:30'), 'qui 01/10 18:30 (1)');
        assert.equal(when('às 18h'), 'qui 01/10 18:00 (2)');
        assert.equal(when('as 8h15'), 'sex 02/10 08:15 (2)');
        assert.equal(when('18h'), 'qui 01/10 18:00 (1)');
        assert.equal(when('6h'), 'sex 02/10 06:00 (1)');       // already passed today: tomorrow
        assert.equal(when('07h'), 'sex 02/10 07:00 (1)');
        assert.equal(when('25:00'), null);
        assert.equal(when('25h'), 'sex 02/10 10:00 (1)');      // is not a time of day: 25 hours from now
    });

    test('hoje, amanhã e dias da semana (sem hora: 9h)', () => {
        assert.equal(when('hoje 23h'), 'qui 01/10 23:00 (2)');
        assert.equal(when('amanhã'), 'sex 02/10 09:00 (1)');
        assert.equal(when('amanha 10:00 texto'), 'sex 02/10 10:00 (2)');
        assert.equal(when('sexta 18h'), 'sex 02/10 18:00 (2)');
        assert.equal(when('qui 10h'), 'qui 01/10 10:00 (2)');   // today, it will still happen
        assert.equal(when('quinta 8h'), 'qui 08/10 08:00 (2)'); // today has already passed: the next one
        assert.equal(when('sábado'), 'sáb 03/10 09:00 (1)');
    });

    test('datas: a próxima, com ano, inexistentes', () => {
        assert.equal(when('25/12'), 'sex 25/12 09:00 (1)');
        assert.equal(when('25/12/2027 10:00'), 'sáb 25/12/2027 10:00 (2)');
        assert.equal(when('01/10 08:00'), 'sex 01/10/2027 08:00 (2)');  // already passed this year
        assert.equal(when('31/02'), null);
        assert.equal(when('banana'), null);
    });

    test('repetição: diária, semanal e mensal (o dia 31 cai no último dia do mês)', () => {
        const jan31 = instantInBrasilia(2026, 1, 31, 10, 0);
        assert.equal(fmtWhen(nextRepetition(jan31, 'diario'), jan31), 'dom 01/02 10:00');
        assert.equal(fmtWhen(nextRepetition(jan31, 'semanal'), jan31), 'sáb 07/02 10:00');
        const fev28 = nextRepetition(jan31, 'mensal', 31);
        assert.equal(fmtWhen(fev28, jan31), 'sáb 28/02 10:00');
        assert.equal(fmtWhen(nextRepetition(fev28, 'mensal', 31), jan31), 'ter 31/03 10:00');
    });

    test('lerAgendamento: opções e "quando" no começo, em qualquer ordem; o texto fica como veio', () => {
        const r = readScheduling('-repetir semanal amanhã 10h -to /Grupo L200/ Bom dia\nsegunda linha');
        assert.deepEqual(r.opt, { repetir: 'semanal' });
        assert.equal(r.quando.usadas, 2);
        assert.equal(r.texto, 'Bom dia\nsegunda linha');
        assert.deepEqual(r.destinos, ['Grupo L200']);
        assert.deepEqual(readScheduling('-rm 2').opt, { rm: '2' });
        assert.deepEqual(readScheduling('-rm 1 3,5 texto').opt, { rm: '1 3,5' });
        assert.deepEqual(readScheduling('8h -to /Família/ -to Trabalho -to +5521999999999 oi').destinos, ['Família', 'Trabalho', '+5521999999999']);
        assert.deepEqual(readScheduling('-edit 3 18h novo texto').opt, { edit: '3' });
        assert.deepEqual(readScheduling('-pause all').opt, { pause: 'all' });
        assert.deepEqual(readScheduling('-resume 2 4').opt, { resume: '2 4' });
        assert.deepEqual(readScheduling('-lem 2h x').opt, { lembrete: true });
        assert.equal(readScheduling('2h -pv 18h').texto, '18h');   // a single "when"
    });
});

describe('/lembrete', () => {
    test('cria no chat atual, responde a mensagem do comando e sai depois de enviar', async () => {
        const cmd = bot.createMessage({ texto: '/lembrete 30m pagar o boleto' });
        const [r] = (await bot.deliver(cmd)).map(e => e.texto);
        assert.match(r, /^⏰ \*Lembrete criado\* para \*[a-zá]{3} \d\d\/\d\d \d\d:\d\d\* neste chat\.\n📝 pagar o boleto$/);

        const [item] = await items();
        assert.equal(item.chat_id, GROUP);
        assert.equal(item.quoted_id, cmd.id._serialized);
        assert.ok(Math.abs(item.due_at - (Date.now() + 30 * 60_000)) < 5000);

        const [sentAlt] = await expire();
        assert.equal(sentAlt.chatId, GROUP);
        assert.equal(sentAlt.content, '⏰ *Lembrete*\n\npagar o boleto');
        assert.equal(sentAlt.options.quotedMessageId, cmd.id._serialized);
        assert.deepEqual(await items(), []);
    });

    test('-pv lembra no seu privado; respondendo uma mensagem, o texto dela', async () => {
        await bot.replyAlt('/lembrete -pv +2h ligar pro banco');
        const quoted = bot.createMessage({ texto: 'reunião às 15h', de: OTHERAlt.jid });
        await bot.replyAlt('/lembrete +1h', { citada: quoted });

        const [pv, replied] = await items();
        assert.deepEqual([pv.chat_id, pv.quoted_id, pv.text], [OWNER.jid, null, 'ligar pro banco']);
        assert.deepEqual([replied.chat_id, replied.quoted_id, replied.text], [GROUP, quoted.id._serialized, 'reunião às 15h']);
    });

    test('atrasado (bot fora do ar na hora) avisa; desconectado, espera', async () => {
        await bot.replyAlt('/lembrete às 18h tomar o remédio');

        bot.estado.pronto = false;
        assert.deepEqual(await expire(), []);

        bot.estado.pronto = true;
        const [sentAlt] = await expire(HOUR);
        assert.match(sentAlt.content, /^⏰ \*Lembrete\*\n\ntomar o remédio\n\n_\(atrasado: era para [a-zá]{3} \d\d\/\d\d \d\d:\d\d\)_$/);
    });

    test('-repetir: continua na lista com o próximo horário', async () => {
        assert.match((await bot.replyAlt('/lembrete amanhã 8h -repetir diário tomar água'))[0], /🔁 todo dia neste chat/);
        await expire();
        const [item] = await items();
        assert.ok(item.due_at > Date.now() && item.due_at <= Date.now() + 24 * HOUR, 'próximo envio nas próximas 24 h');
        assert.equal(fmtWhen(item.due_at).slice(-5), fmtWhen(Date.now() - 1000).slice(-5), 'mesma hora');
    });

    test('sem a mensagem citada, envia sem citar', async () => {
        await bot.replyAlt('/lembrete 30m x');
        const original = bot.client.sendMessage;
        bot.client.sendMessage = async (chatId, content, options = {}) => {
            if (options.quotedMessageId) throw new Error('mensagem citada não encontrada');
            return original.call(bot.client, chatId, content, options);
        };
        try {
            const [sentAlt] = await expire();
            assert.equal(sentAlt.content, '⏰ *Lembrete*\n\nx');
            assert.equal(sentAlt.options.quotedMessageId, undefined);
        } finally {
            bot.client.sendMessage = original;
        }
    });

    test('lista, -rm N e -rm all', async () => {
        await bot.replyAlt('/lembrete +2h segundo');
        await bot.replyAlt('/lembrete -pv +1h primeiro');

        const [list] = await bot.replyAlt('/lembrete');
        assert.match(list, /^📅 \*Agenda\* \(2\)\n\n1\. ⏰ \*[^*]+\* — primeiro\n   → seu privado\n2\. ⏰ \*[^*]+\* — segundo\n   → 👥 Família\n\n💡 _📅 mensagem · ⏰ lembrete\. -edit <nº> muda, -pause\/-resume <nº\.\.\.> segura e solta, -rm <nº\.\.\.\|all> remove\._$/);
        assert.equal((await bot.replyAlt('/lembrete -l'))[0], list);

        assert.match((await bot.replyAlt('/lembrete -rm 1'))[0], /🗑️ Removido: \*[^*]+\* — primeiro/);
        assert.match((await bot.replyAlt('/lembrete -rm 5'))[0], /❌ Nº 5 não existe/);
        assert.deepEqual(await bot.replyAlt('/lembrete -rm all'), ['🗑️ 1 removido.']);
        assert.match((await bot.replyAlt('/lembrete'))[0], /^📅 Nada agendado\.\n💡 _Ex\.: \/cron sexta 18h .*\n\/lembrete 18:30 pagar o boleto_$/);
    });

    test('-l mostra o texto inteiro, sem cortar; as linhas seguintes recuadas', async () => {
        const long = 'Hora de um café seguido do preço do Bitcoin, das notícias e da previsão do tempo de hoje! {/crypto BTC}';
        await bot.replyAlt(`/cron +1h -to L200 ${long}`);
        await bot.replyAlt('/cron +2h -to L200 linha um\nlinha dois');

        const [list] = await bot.replyAlt('/cron -l');
        assert.ok(list.includes(`— ${long}\n   → 👥 Grupo sobre L200`));
        assert.match(list, /— linha um\n {3}linha dois\n {3}→ 👥 Grupo sobre L200/);
    });

    test('-pause/-resume com vários números; algum que não existe: nenhum muda', async () => {
        for (const [i, t] of ['um', 'dois', 'três'].entries()) await bot.replyAlt(`/lembrete +${i + 1}h ${t}`);

        assert.equal((await bot.replyAlt('/cron -pause 1 5'))[0].split('\n')[0], '❌ Nº 5 não existe. Nada foi pausado; veja a lista com /cron -l');
        assert.deepEqual((await items()).map(s => s.paused), [0, 0, 0]);

        assert.match((await bot.replyAlt('/cron -pause 1,3'))[0], /^⏸️ \*Pausado\* \(2\)\n• .* — um\n• .* — três\n💡/);
        assert.deepEqual((await items()).map(s => s.paused), [1, 0, 1]);

        assert.match((await bot.replyAlt('/cron -resume 3 1'))[0], /^▶️ \*Retomado\* \(2\)\n• .* — um\n• .* — três$/);
        assert.deepEqual((await items()).map(s => s.paused), [0, 0, 0]);
    });

    test('-rm com vários números (com espaço ou vírgula); algum que não existe: nenhum sai', async () => {
        for (const [i, t] of ['um', 'dois', 'três', 'quatro', 'cinco'].entries()) await bot.replyAlt(`/lembrete +${i + 1}h ${t}`);

        const [errorAlt] = await bot.replyAlt('/cron -rm 2 9 7');
        assert.equal(errorAlt.split('\n')[0], '❌ Nº 7, 9 não existem. Nada foi removido; veja a lista com /cron -l');
        assert.equal((await items()).length, 5);

        const [ok] = await bot.replyAlt('/cron -rm 4 2,2');   // the numbers from the previous list; a repeat counts once
        assert.match(ok, /^🗑️ \*Removidos\* \(2\)\n• \*[^*]+\* — dois\n• \*[^*]+\* — quatro$/);
        assert.deepEqual((await items()).map(s => s.text), ['um', 'três', 'cinco']);

        await bot.replyAlt('/cron -rm 1 3');
        assert.deepEqual((await items()).map(s => s.text), ['três']);
    });

    test('erros: sem "quando", sem texto, já passou, longe demais, -repetir inválido, -to, limite', async () => {
        const errorAlt = async (line, expected) => assert.match((await bot.replyAlt(line))[0], expected, line);
        await errorAlt('/lembrete pagar o boleto', /❌ Não entendi quando/);
        await errorAlt('/lembrete 30m', /❌ Faltou o texto/);
        await errorAlt('/lembrete 01/01/2020 x', /❌ [a-zá]{3} 01\/01\/2020 09:00 já passou/);
        await errorAlt('/lembrete 01/01/2099 x', /❌ No máximo 366 dias à frente/);
        await errorAlt('/lembrete +1h -repetir anual x', /❌ Use -repetir \(-r\) diario, semanal ou mensal/);
        await errorAlt('/lembrete +1h -to L200 x', /❌ O lembrete não tem -to/);

        await bot.setSetting('agenda.max', 1);
        await bot.replyAlt('/cron +1h oi');
        await errorAlt('/lembrete +1h x', /❌ Limite de 1 lembretes e mensagens agendadas \(setting agenda\.max\)/);
    });

    test('só o dono', async () => {
        assert.deepEqual(await bot.replyAlt('/lembrete +1h x', { de: OTHERAlt.jid }), []);
    });
});

describe('/cron (/agenda)', () => {
    test('-to grupo: envia o texto puro, sem citar, e sai da lista', async () => {
        const [r] = await bot.replyAlt('/cron sexta 18h -to /Grupo L200/ Bom fim de semana!\nAté segunda.');
        assert.match(r, /^📅 \*Mensagem agendada\* para \*sex \d\d\/\d\d 18:00\* em 👥 Grupo sobre L200\.\n📝 Bom fim de semana! Até segunda\.$/);

        const [list] = await bot.replyAlt('/agenda -l');
        assert.match(list, /📅 \*Agenda\* \(1\)\n\n1\. 📅 \*sex \d\d\/\d\d 18:00\* — Bom fim de semana!\n   Até segunda\.\n   → 👥 Grupo sobre L200/);

        const [sentAlt] = await expire();
        assert.equal(sentAlt.chatId, L200);
        assert.equal(sentAlt.content, 'Bom fim de semana!\nAté segunda.');
        assert.deepEqual(sentAlt.options, {});
        assert.deepEqual(await items(), []);
    });

    test('sem -to: no chat atual; -to +número: no privado da pessoa; mensal', async () => {
        await bot.replyAlt('/cron 25/12 10:00 Feliz Natal!');
        await bot.replyAlt('/cron 05/11 -repetir mensal -to +5521911111111 Lembrete do aluguel');

        const [natal, rent] = await items();
        assert.deepEqual([natal.chat_id, natal.repeat], [GROUP, null]);
        assert.deepEqual([rent.chat_id, rent.chat_name, rent.repeat, rent.day_of_month], [OTHERAlt.jid, 'Fulano', 'mensal', 5]);

        // The log says where it went: the name and the number (person) or the id (group)
        await expire();
        assert.ok(bot.logs.some(l => l.includes(`/cron: enviado para 👤 Fulano (+${OTHERAlt.jid.split('@')[0]}) (mensal)`)));
        assert.ok(bot.logs.some(l => /\/cron: enviado para 👥 \S.* \(\d+@g\.us\)$/.test(l)));
    });

    test('"6h" com -repetir é o horário (06:00 todo dia); "+6h" é daqui a 6 horas', async () => {
        assert.match((await bot.replyAlt('/cron 6h -repetir diario -to L200 Bom dia!'))[0],
            /^📅 \*Mensagem agendada\* para \*[a-zá]{3} \d\d\/\d\d 06:00\* 🔁 todo dia em 👥 Grupo sobre L200\./);
        assert.match((await bot.replyAlt('/cron 07h -to L200 Bom dia!'))[0], /para \*[a-zá]{3} \d\d\/\d\d 07:00\*/);

        await bot.replyAlt('/cron +6h -to L200 Daqui a pouco');
        const [, , fromHere] = await items();
        assert.ok(Math.abs(fromHere.due_at - (Date.now() + 6 * HOUR)) < 60_000);
    });

    test('-to: o mesmo contato pelo telefone e pelo LID (como @c.us ou @lid) é um só', async () => {
        const PHONE = '5521999985555@c.us';
        bot.createContact(PHONE, 'Lourival Vieira Neto');
        bot.createContact('100000000000004@c.us', 'Lourival Vieira Neto');   // the LID, coming as @c.us
        bot.client.lids.set('100000000000004@lid', PHONE);

        assert.match((await bot.replyAlt('/cron 06:00 -r diario -to /Lourival Neto/ Bom dia!'))[0],
            /^📅 \*Mensagem agendada\* .* 🔁 todo dia em 👤 Lourival Vieira Neto\./);
        assert.equal((await items())[0].chat_id, PHONE);

        // The LID as @lid, without WhatsApp's map: the @c.us stays
        bot.client.lids.clear();
        bot.client.contatos.delete('100000000000004@c.us');
        bot.createContact('100000000000004@lid', 'Lourival Vieira Neto');
        assert.match((await bot.replyAlt('/cron 07:00 -to /Lourival Neto/ Bom dia!'))[0], /em 👤 Lourival Vieira Neto\./);
        assert.equal((await items())[1].chat_id, PHONE);
    });

    test('-to busca direto na memória do WhatsApp Web (sem getContacts/getChats); o LID vira o telefone', async (t) => {
        const wid = (s) => ({ _serialized: s, server: s.split('@')[1] });
        /*
         * As in WhatsApp Web: the raw contact model does NOT have name nor
         * isMyContact; they come from the WAWebContactGetters functions and
         * WAWebFrontendContactGetters (the same ones whatsapp-web.js uses).
         */
        const contactAlt = (id, nameAlt, { naAgenda: inSchedule = true, eu = false, telefone: phoneAlt = null } = {}) =>
            ({ id: wid(id), _nome: nameAlt, _naAgenda: inSchedule, _eu: eu, ...(phoneAlt ? { phoneNumber: wid(phoneAlt) } : {}) });
        const collections = {
            WAWebCollections: {
                Contact: { getModelsArray: () => [
                    contactAlt('15559998888@c.us', 'Rafael Silva'),
                    contactAlt('100000000000005@lid', 'Rafael Silva', { telefone: '15559998888@c.us' }),
                    contactAlt('5521900000000@c.us', 'Rafael Eu', { eu: true }),
                    contactAlt('5521977777777@c.us', 'Rafael Souza', { naAgenda: false })
                ] },
                Chat: { getModelsArray: () => [{ id: wid(L200), formattedTitle: 'Grupo sobre L200' }] }
            },
            WAWebApiContact: { getAlternateUserWid: () => null },
            WAWebContactGetters: { getName: c => c._nome, getIsMe: c => c._eu },
            WAWebFrontendContactGetters: { getIsMyContact: c => c._naAgenda }
        };
        globalThis.window = { require: (m) => collections[m] };
        bot.client.pupPage = { evaluate: async (fn, arg) => fn(arg) };
        bot.client.getContacts = () => assert.fail('não pode usar o getContacts');
        bot.client.getChats = () => assert.fail('não pode usar o getChats');
        t.after(() => {
            delete globalThis.window;
            delete bot.client.pupPage;
            delete bot.client.getContacts;
            delete bot.client.getChats;
        });

        assert.match((await bot.replyAlt('/cron 06:00 -r diario -to /Rafael Silva/ Bom dia!'))[0], /em 👤 Rafael Silva\./);
        assert.equal((await items())[0].chat_id, '15559998888@c.us');
        assert.match((await bot.replyAlt('/cron 07:00 -to l200 oi'))[0], /em 👥 Grupo sobre L200\./);
        // Outside the address book does not enter; yourself (by the saved name) is your private chat, with your id
        assert.match((await bot.replyAlt('/cron 07:00 -to /Rafael Souza/ oi'))[0], /❌ Nenhum contato ou grupo com "Rafael Souza"/);
        assert.match((await bot.replyAlt('/cron 07:00 -to /Rafael Eu/ oi'))[0], /no seu privado\.\n📝 oi$/);
        assert.equal((await items()).at(-1).chat_id, OWNER.jid);

        // The page does not respond: error, without hanging
        bot.client.pupPage = { evaluate: async () => { throw new Error('página fechada'); } };
        assert.match((await bot.replyAlt('/cron 08:00 -to /Rafael/ oi', { erroEsperado: true }))[0],
            /⚠️ Não consegui buscar "Rafael" nos contatos e grupos agora \(página fechada\)/);
    });

    test('vários -to: um item por destino (o repetido conta uma vez); o limite conta todos', async () => {
        const [r] = await bot.replyAlt('/cron +1h -to L200 -to /Fulano/ -to l200 Reunião às 10h!');
        assert.match(r, /^📅 \*Mensagem agendada\* para \*[^*]+\* em 2 chats _\(um item para cada\)_:\n• 👥 Grupo sobre L200\n• 👤 Fulano\n📝 Reunião às 10h!$/);
        assert.deepEqual((await items()).map(i => [i.chat_id, i.text]), [[L200, 'Reunião às 10h!'], [OTHERAlt.jid, 'Reunião às 10h!']]);

        await bot.setSetting('agenda.max', 3);
        assert.match((await bot.replyAlt('/cron +2h -to L200 -to /Fulano/ oi'))[0], /❌ Limite de 3 .*: estes 2 não cabem/);
        assert.equal((await items()).length, 2);
    });

    test('-edit <nº>: troca a hora, o texto e/ou a repetição; o destino fica', async () => {
        await bot.replyAlt('/cron +1h -to L200 texto antigo');

        assert.match((await bot.replyAlt('/cron -edit 1 18:30'))[0], /^✏️ \*Editado:\* 📅 \*[a-zá]{3} \d\d\/\d\d 18:30\*\n📝 texto antigo$/);
        assert.match((await bot.replyAlt('/cron -edit 1 texto novo'))[0], /📝 texto novo$/);
        assert.match((await bot.replyAlt('/cron -edit 1 -r semanal'))[0], /18:30\* 🔁 toda semana\n/);
        assert.doesNotMatch((await bot.replyAlt('/cron -edit 1 -r nao'))[0], /🔁/);

        const [item] = await items();
        assert.deepEqual([item.chat_id, item.text, item.repeat], [L200, 'texto novo', null]);

        assert.match((await bot.replyAlt('/cron -edit 9 18h'))[0], /❌ Nº 9 não existe/);
        assert.match((await bot.replyAlt('/cron -edit 1'))[0], /❌ Informe o que mudar/);
        assert.match((await bot.replyAlt('/cron -edit 1 -to /Fulano/ 18h'))[0], /❌ O -edit troca só a hora, o texto e o -repetir/);
        assert.match((await bot.replyAlt('/cron -edit 1 -r anual'))[0], /❌ Use -repetir \(-r\) diario, semanal, mensal ou nao/);
    });

    test('-pause/-resume <nº|all>: o pausado não sai; ao retomar, o repetido pula para o próximo e o único sai', async () => {
        await bot.replyAlt('/cron +1h -to L200 único');
        await bot.replyAlt('/cron +2h -r diario -to L200 todo dia');

        assert.match((await bot.replyAlt('/cron -pause all'))[0], /^⏸️ \*Pausado\* \(2\)\n• .* — único\n• .* — todo dia\n💡/);
        assert.match((await bot.replyAlt('/cron -l'))[0], /1\. 📅 \*[^*]+\* ⏸️ _pausado_ — único/);
        assert.deepEqual(await expire(), [], 'pausados não saem');
        assert.equal((await items()).length, 2);
        assert.deepEqual(await bot.replyAlt('/cron -pause 1'), ['ℹ️ Já estava pausado.']);

        // Expired while paused: the daily one goes to the future, the one-off goes out on the next check
        const [r] = await bot.replyAlt('/cron -resume all');
        assert.match(r, /^▶️ \*Retomado\* \(2\)\n• .* — único _\(já passou: sai agora\)_\n• .* — todo dia$/);
        const daily = (await items()).find(i => i.repeat);
        assert.ok(daily.due_at > Date.now());

        const beforeAlt = bot.client.enviadas.length;
        await checkSchedule();
        assert.deepEqual(bot.client.enviadas.slice(beforeAlt).map(e => e.content), ['único']);
        assert.match((await bot.replyAlt('/cron -resume 7'))[0], /❌ Nº 7 não existe/);
    });

    test('-to por menção (@ no WhatsApp), junto com outros destinos', async () => {
        bot.client.lids.set('100000000000002@lid', OTHERAlt.jid);
        assert.match((await bot.replyAlt('/cron +1h -to @100000000000002 -to L200 oi', { mencoes: ['100000000000002@lid'] }))[0],
            /em 2 chats _\(um item para cada\)_:\n• 👤 Fulano\n• 👥 Grupo sobre L200/);
        assert.deepEqual((await items()).map(i => i.chat_id), [OTHERAlt.jid, L200]);
    });

    test('-lem é o -lembrete', async () => {
        assert.match((await bot.replyAlt('/cron -lem +2h beber água'))[0], /^⏰ \*Lembrete criado\*/);
    });

    test('texto começando com "/" é enviado, mas nunca roda como comando', async () => {
        await bot.replyAlt('/cron +1h /cache -a');
        const [sentAlt] = await expire();
        assert.equal(sentAlt.content, '/cache -a');

        // WhatsApp returns the send in message_create: the bot mark prevents the command
        assert.deepEqual(await bot.replyAlt('/cache -a'), []);
    });

    test('-to você mesmo: pelo nome salvo ou pelo nome de perfil, é o seu privado', async () => {
        bot.createContact(OWNER.jid, 'Jorge Pereira').isMe = true;
        assert.match((await bot.replyAlt('/cron +1h -to /Jorge Pereira/ Preço: {/uptime}'))[0], /no seu privado\.\n📝 Preço: \{\/uptime\}$/);
        assert.match((await bot.replyAlt(`/cron +1h -to /${OWNER.nome}/ oi`))[0], /no seu privado\./);   // o pushname
        assert.deepEqual((await items()).map(s => s.chat_id), [OWNER.jid, OWNER.jid]);
    });

    test('erros: destino inválido e -pv', async () => {
        assert.match((await bot.replyAlt('/cron +1h -to xyz oi'))[0], /❌ Nenhum contato ou grupo com "xyz" no nome/);
        assert.match((await bot.replyAlt('/cron +1h -pv oi'))[0], /❌ O -pv é do modo lembrete/);
        assert.match((await bot.replyAlt('/cron +1h -to voce@exemplo.com oi'))[0], /❌ O \/cron envia a mensagem como se você digitasse/);
        assert.deepEqual(await items(), []);
    });
});

describe('/cron: comandos no texto ({/comando})', () => {
    test('roda na hora do envio e a resposta entra no lugar; só sai a mensagem montada', async () => {
        assert.match((await bot.replyAlt('/cron +1h -to L200 Status: {/uptime} · fim'))[0], /^📅 \*Mensagem agendada\*/);
        assert.equal((await items())[0].text, 'Status: {/uptime} · fim');   // stored as typed

        const sentAlt3 = await expire();
        assert.equal(sentAlt3.length, 1);
        assert.equal(sentAlt3[0].chatId, L200);
        assert.match(sentAlt3[0].content, /^Status:\n\n🤖 \*ZapBot [\d.]+[^\n]*\n━+\n⚡ Online: [\s\S]*\S\n\n· fim$/);
        assert.equal(sentAlt3[0].options.quotedMessageId, undefined);

        // One log line per send, with the destination and the commands executed
        assert.ok(bot.logs.some(l => l.endsWith(`/cron: enviado para 👥 Grupo sobre L200 (${L200}), com {/uptime}`)));
    });

    test('resposta de várias linhas vira um parágrafo (linha em branco antes e depois); de uma linha, fica na frase', async () => {
        await bot.replyAlt('/cron +1h -to L200 Hora do Bitcoin! {/uptime} Até amanhã.');
        const [sentAlt] = await expire();
        assert.match(sentAlt.content, /^Hora do Bitcoin!\n\n🤖 \*ZapBot[^\n]*\n━+\n[\s\S]*\S\n\nAté amanhã\.$/);

        // Already on its own line: does not pile up blank lines
        await bot.replyAlt('/cron +1h -to L200 Hora do Bitcoin!\n\n{/uptime}');
        const [own] = await expire();
        assert.match(own.content, /^Hora do Bitcoin!\n\n🤖 /);

        // A single line (the reply of a disabled /joke, for example): stays in the sentence
        await bot.replyAlt('/cron +1h -to L200 Piada: {/joke} fim');
        await bot.setSetting('commands.disabled', ['/joke']);
        const [line] = await expire();
        assert.equal(line.content, 'Piada: ⚠️ /joke não roda no /cron fim');
    });

    test('vários no mesmo texto, também no lembrete', async () => {
        await bot.replyAlt('/lembrete +1h versão {/version} e de novo {/ver}');
        const [sentAlt] = await expire();
        assert.match(sentAlt.content, /^⏰ \*Lembrete\*\n\nversão\n\n🤖 \*ZapBot[\s\S]*\S\n\ne de novo\n\n🤖 \*ZapBot/);
        assert.doesNotMatch(sentAlt.content, /\{\//);
    });

    test('mídia (/meme) sai depois da mensagem, sem citar; só mídia não manda texto vazio', async () => {
        const memes = { data: { memes: [{ name: 'Drake Hotline Bling', url: 'https://i.imgflip.com/drake.jpg' }] } };
        bot.network.responder('get', 'api.imgflip.com', memes);
        bot.network.responder('get', 'https://i.imgflip.com/', bot.network.http({ data: Buffer.from('jpg'), headers: { 'content-type': 'image/png' } }));

        await bot.replyAlt('/cron +1h -to L200 Olha: {/meme drake}');
        const [textAlt, image] = await expire();
        assert.equal(textAlt.content, 'Olha:');
        assert.equal(image.chatId, L200);
        assert.equal(image.content.mimetype, 'image/png');
        assert.equal(image.options.caption, '🖼️ Drake Hotline Bling');
        assert.equal(image.options.quotedMessageId, undefined);

        await bot.replyAlt('/cron +1h -to L200 {/meme drake}');
        const so = await expire();
        assert.deepEqual(so.map(e => typeof e.content), ['object']);
    });

    test('conferido ao criar e no -edit: não existe, não roda no /cron, opção que muda algo', async () => {
        assert.equal((await bot.replyAlt('/cron +1h oi {/xyz}'))[0], '❌ {/xyz}: o /xyz não existe.');
        assert.match((await bot.replyAlt('/cron +1h {/set show.max 5}'))[0], /^❌ \{\/set show\.max 5\}: o \/set não roda dentro do \/cron\.\n💡 _Rodam: .*\/crypto.*\._$/);
        assert.equal((await bot.replyAlt('/cron +1h {/crypto -add DOGE}'))[0], '❌ {/crypto -add DOGE}: o -add do /crypto não roda dentro do /cron.');
        assert.equal((await bot.replyAlt('/cron +1h {/stats -pv}'))[0], '❌ {/stats -pv}: o -pv do /stats não roda dentro do /cron.');
        assert.equal((await bot.replyAlt('/cron +1h {/defi -rm 1}'))[0], '❌ {/defi -rm 1}: o -rm do /defi não roda dentro do /cron.');
        assert.equal((await bot.replyAlt('/cron +1h {/defi -alerta all}'))[0], '❌ {/defi -alerta all}: o -alerta do /defi não roda dentro do /cron.');
        assert.deepEqual(await items(), []);

        await bot.replyAlt('/cron +1h oi');
        assert.equal((await bot.replyAlt('/cron -edit 1 {/cache -a}'))[0].split('\n')[0], '❌ {/cache -a}: o /cache não roda dentro do /cron.');
        assert.equal((await items())[0].text, 'oi');
    });

    test('/defi -s roda (só consulta); vários comandos e vários -to no mesmo item', async () => {
        await bot.replyAlt('/cron 06:00 -r diario -to L200 -to +5521911111111 ⏰ Status da DeFi!{/defi -s} Versão: {/version}');
        const sentAlt3 = await expire();
        assert.deepEqual(sentAlt3.map(e => e.chatId), [L200, OTHERAlt.jid]);
        for (const e of sentAlt3) {
            assert.match(e.content, /^⏰ Status da DeFi!\n\n🌊 Nenhuma posição cadastrada\.\n💡 _\/defi -orca[^\n]*\n\/defi -project-x[^\n]*_\n\nVersão:\n\n🤖 \*ZapBot/);
        }
    });

    test('comando desativado depois de criado: a mensagem sai com o aviso no lugar', async () => {
        await bot.replyAlt('/cron +1h -to L200 Piada: {/joke}');
        await bot.setSetting('commands.disabled', ['/joke']);
        const [sentAlt] = await expire();
        assert.equal(sentAlt.content, 'Piada: ⚠️ /joke não roda no /cron');
    });

    test('-test <nº>: monta agora e mostra aqui, sem enviar ao destino nem mudar o horário', async () => {
        await bot.replyAlt('/cron +1h -to L200 Status: {/uptime}');
        const [beforeAlt] = await items();

        const sentAlt3 = await bot.executar('/cron -test 1');
        assert.equal(sentAlt3.length, 1);
        assert.equal(sentAlt3[0].chatId, GROUP);
        assert.match(sentAlt3[0].texto, /^🧪 \*Teste do nº 1\* _\(sai em [^\n]+ → 👥 Grupo sobre L200\)_\n\nStatus:\n\n🤖 \*ZapBot/);
        assert.deepEqual(await items(), [beforeAlt]);

        assert.match((await bot.replyAlt('/cron -test 9'))[0], /^❌ Nº 9 não existe/);
    });
});

describe('/cron: os dois modos', () => {
    test('/agenda é o /cron; -lembrete (ou /lembrete) é o modo lembrete; -r é o -repetir', async () => {
        assert.match((await bot.replyAlt('/agenda +1h -to L200 oi'))[0], /^📅 \*Mensagem agendada\*/);
        assert.match((await bot.replyAlt('/cron -lembrete +2h -pv beber água'))[0], /^⏰ \*Lembrete criado\* .* no seu privado\./);
        assert.match((await bot.replyAlt('/lembrete +3h -r diario alongar'))[0], /^⏰ \*Lembrete criado\* .* 🔁 todo dia neste chat\./);

        assert.deepEqual((await items()).map(i => [i.kind, i.chat_id, i.repeat]),
            [['agendar', L200, null], ['lembrete', OWNER.jid, null], ['lembrete', GROUP, 'diario']]);
    });

    test('uma lista só, com os dois tipos, e o -rm vale para qualquer um', async () => {
        await bot.replyAlt('/cron +2h -to L200 mensagem');
        await bot.replyAlt('/lembrete +1h lembrete');

        const [list] = await bot.replyAlt('/cron -l');
        assert.match(list, /1\. ⏰ \*[^*]+\* — lembrete\n   → 👥 Família\n2\. 📅 \*[^*]+\* — mensagem\n   → 👥 Grupo sobre L200/);

        assert.match((await bot.replyAlt('/cron -rm 1'))[0], /🗑️ Removido: \*[^*]+\* — lembrete/);
        assert.deepEqual(await bot.replyAlt('/lembrete -rm all'), ['🗑️ 1 removido.']);
        assert.deepEqual(await items(), []);
    });
});

