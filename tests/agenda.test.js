/*
 * Agenda: a leitura de datas (util/quando.js) e o /cron (/agenda, /lembrete),
 * com os dois modos: mensagem (texto puro) e lembrete (⏰ Lembrete).
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { DONO, GRUPO, OUTRO } = bot;
const { fmtQuando, lerQuando, proximaRepeticao, instanteEmBrasilia } = bot.src('util/quando');
const { lerAgendamento, verificarAgenda } = bot.src('agenda');

const L200 = '120363000000000200@g.us';
const HORA = 3600_000;

beforeEach(async () => {
    await bot.reiniciar();
    bot.criarGrupo(L200, 'Grupo sobre L200', [DONO.jid]);
});

// Vence o item (ou todos) há `atrasoMs` e roda a verificação; devolve o que foi enviado
async function vencer(atrasoMs = 1000) {
    await bot.dbRun('UPDATE schedules SET due_at = ?', [Date.now() - atrasoMs]);
    const antes = bot.client.enviadas.length;
    await verificarAgenda();
    return bot.client.enviadas.slice(antes);
}

const itens = () => bot.dbAll('SELECT * FROM schedules ORDER BY id');

describe('datas (util/quando.js)', () => {
    // qui 01/10/2026 09:00 em Brasília
    const AGORA = instanteEmBrasilia(2026, 10, 1, 9, 0);
    const quando = (texto) => {
        const r = lerQuando(texto.split(' '), AGORA);
        return r && `${fmtQuando(r.ms, AGORA)} (${r.usadas})`;
    };

    test('daqui a tanto tempo: 30m, 1d, 1h30m, e +2h, em 2h, daqui (a) 2h', () => {
        assert.equal(quando('30m'), 'qui 01/10 09:30 (1)');
        assert.equal(quando('1h30m'), 'qui 01/10 10:30 (1)');
        assert.equal(quando('2d'), 'sáb 03/10 09:00 (1)');
        assert.equal(quando('+2h'), 'qui 01/10 11:00 (1)');
        assert.equal(quando('+18h'), 'sex 02/10 03:00 (1)');
        assert.equal(quando('em 2h texto'), 'qui 01/10 11:00 (2)');
        assert.equal(quando('daqui 30m'), 'qui 01/10 09:30 (2)');
        assert.equal(quando('daqui a 1d'), 'sex 02/10 09:00 (3)');
        assert.equal(quando('+banana'), null);
        assert.equal(quando('em casa'), null);
    });

    test('hora: hoje, ou amanhã se já passou; "6h" e "07h" sozinhos são horário', () => {
        assert.equal(quando('18:30'), 'qui 01/10 18:30 (1)');
        assert.equal(quando('às 18h'), 'qui 01/10 18:00 (2)');
        assert.equal(quando('as 8h15'), 'sex 02/10 08:15 (2)');
        assert.equal(quando('18h'), 'qui 01/10 18:00 (1)');
        assert.equal(quando('6h'), 'sex 02/10 06:00 (1)');       // já passou hoje: amanhã
        assert.equal(quando('07h'), 'sex 02/10 07:00 (1)');
        assert.equal(quando('25:00'), null);
        assert.equal(quando('25h'), 'sex 02/10 10:00 (1)');      // não é horário: daqui a 25 horas
    });

    test('hoje, amanhã e dias da semana (sem hora: 9h)', () => {
        assert.equal(quando('hoje 23h'), 'qui 01/10 23:00 (2)');
        assert.equal(quando('amanhã'), 'sex 02/10 09:00 (1)');
        assert.equal(quando('amanha 10:00 texto'), 'sex 02/10 10:00 (2)');
        assert.equal(quando('sexta 18h'), 'sex 02/10 18:00 (2)');
        assert.equal(quando('qui 10h'), 'qui 01/10 10:00 (2)');   // hoje, ainda vai acontecer
        assert.equal(quando('quinta 8h'), 'qui 08/10 08:00 (2)'); // hoje já passou: a próxima
        assert.equal(quando('sábado'), 'sáb 03/10 09:00 (1)');
    });

    test('datas: a próxima, com ano, inexistentes', () => {
        assert.equal(quando('25/12'), 'sex 25/12 09:00 (1)');
        assert.equal(quando('25/12/2027 10:00'), 'sáb 25/12/2027 10:00 (2)');
        assert.equal(quando('01/10 08:00'), 'sex 01/10/2027 08:00 (2)');  // já passou este ano
        assert.equal(quando('31/02'), null);
        assert.equal(quando('banana'), null);
    });

    test('repetição: diária, semanal e mensal (o dia 31 cai no último dia do mês)', () => {
        const jan31 = instanteEmBrasilia(2026, 1, 31, 10, 0);
        assert.equal(fmtQuando(proximaRepeticao(jan31, 'diario'), jan31), 'dom 01/02 10:00');
        assert.equal(fmtQuando(proximaRepeticao(jan31, 'semanal'), jan31), 'sáb 07/02 10:00');
        const fev28 = proximaRepeticao(jan31, 'mensal', 31);
        assert.equal(fmtQuando(fev28, jan31), 'sáb 28/02 10:00');
        assert.equal(fmtQuando(proximaRepeticao(fev28, 'mensal', 31), jan31), 'ter 31/03 10:00');
    });

    test('lerAgendamento: opções e "quando" no começo, em qualquer ordem; o texto fica como veio', () => {
        const r = lerAgendamento('-repetir semanal amanhã 10h -to /Grupo L200/ Bom dia\nsegunda linha');
        assert.deepEqual(r.opt, { repetir: 'semanal' });
        assert.equal(r.quando.usadas, 2);
        assert.equal(r.texto, 'Bom dia\nsegunda linha');
        assert.deepEqual(r.destinos, ['Grupo L200']);
        assert.deepEqual(lerAgendamento('-rm 2').opt, { rm: '2' });
        assert.deepEqual(lerAgendamento('8h -to /Família/ -to Trabalho -to +5521999999999 oi').destinos, ['Família', 'Trabalho', '+5521999999999']);
        assert.deepEqual(lerAgendamento('-edit 3 18h novo texto').opt, { edit: '3' });
        assert.deepEqual(lerAgendamento('-pause all').opt, { pause: 'all' });
        assert.deepEqual(lerAgendamento('-lem 2h x').opt, { lembrete: true });
        assert.equal(lerAgendamento('2h -pv 18h').texto, '18h');   // um "quando" só
    });
});

describe('/lembrete', () => {
    test('cria no chat atual, responde a mensagem do comando e sai depois de enviar', async () => {
        const cmd = bot.criarMensagem({ texto: '/lembrete 30m pagar o boleto' });
        const [r] = (await bot.entregar(cmd)).map(e => e.texto);
        assert.match(r, /^⏰ \*Lembrete criado\* para \*[a-zá]{3} \d\d\/\d\d \d\d:\d\d\* neste chat\.\n📝 pagar o boleto$/);

        const [item] = await itens();
        assert.equal(item.chat_id, GRUPO);
        assert.equal(item.quoted_id, cmd.id._serialized);
        assert.ok(Math.abs(item.due_at - (Date.now() + 30 * 60_000)) < 5000);

        const [enviado] = await vencer();
        assert.equal(enviado.chatId, GRUPO);
        assert.equal(enviado.content, '⏰ *Lembrete*\n\npagar o boleto');
        assert.equal(enviado.options.quotedMessageId, cmd.id._serialized);
        assert.deepEqual(await itens(), []);
    });

    test('-pv lembra no seu privado; respondendo uma mensagem, o texto dela', async () => {
        await bot.responder('/lembrete -pv +2h ligar pro banco');
        const citada = bot.criarMensagem({ texto: 'reunião às 15h', de: OUTRO.jid });
        await bot.responder('/lembrete +1h', { citada });

        const [pv, respondida] = await itens();
        assert.deepEqual([pv.chat_id, pv.quoted_id, pv.text], [DONO.jid, null, 'ligar pro banco']);
        assert.deepEqual([respondida.chat_id, respondida.quoted_id, respondida.text], [GRUPO, citada.id._serialized, 'reunião às 15h']);
    });

    test('atrasado (bot fora do ar na hora) avisa; desconectado, espera', async () => {
        await bot.responder('/lembrete às 18h tomar o remédio');

        bot.estado.pronto = false;
        assert.deepEqual(await vencer(), []);

        bot.estado.pronto = true;
        const [enviado] = await vencer(HORA);
        assert.match(enviado.content, /^⏰ \*Lembrete\*\n\ntomar o remédio\n\n_\(atrasado: era para [a-zá]{3} \d\d\/\d\d \d\d:\d\d\)_$/);
    });

    test('-repetir: continua na lista com o próximo horário', async () => {
        assert.match((await bot.responder('/lembrete amanhã 8h -repetir diário tomar água'))[0], /🔁 todo dia neste chat/);
        await vencer();
        const [item] = await itens();
        assert.ok(item.due_at > Date.now() && item.due_at <= Date.now() + 24 * HORA, 'próximo envio nas próximas 24 h');
        assert.equal(fmtQuando(item.due_at).slice(-5), fmtQuando(Date.now() - 1000).slice(-5), 'mesma hora');
    });

    test('sem a mensagem citada, envia sem citar', async () => {
        await bot.responder('/lembrete 30m x');
        const original = bot.client.sendMessage;
        bot.client.sendMessage = async (chatId, content, options = {}) => {
            if (options.quotedMessageId) throw new Error('mensagem citada não encontrada');
            return original.call(bot.client, chatId, content, options);
        };
        try {
            const [enviado] = await vencer();
            assert.equal(enviado.content, '⏰ *Lembrete*\n\nx');
            assert.equal(enviado.options.quotedMessageId, undefined);
        } finally {
            bot.client.sendMessage = original;
        }
    });

    test('lista, -rm N e -rm all', async () => {
        await bot.responder('/lembrete +2h segundo');
        await bot.responder('/lembrete -pv +1h primeiro');

        const [lista] = await bot.responder('/lembrete');
        assert.match(lista, /^📅 \*Agenda\* \(2\)\n\n1\. ⏰ \*[^*]+\* — primeiro\n   → seu privado\n2\. ⏰ \*[^*]+\* — segundo\n   → 👥 Família\n\n💡 _📅 mensagem · ⏰ lembrete\. -edit <nº> muda, -pause\/-resume <nº> segura e solta, -rm <nº\|all> remove\._$/);
        assert.equal((await bot.responder('/lembrete -l'))[0], lista);

        assert.match((await bot.responder('/lembrete -rm 1'))[0], /🗑️ Removido: \*[^*]+\* — primeiro/);
        assert.match((await bot.responder('/lembrete -rm 5'))[0], /❌ Nº 5 não existe/);
        assert.deepEqual(await bot.responder('/lembrete -rm all'), ['🗑️ 1 removido.']);
        assert.match((await bot.responder('/lembrete'))[0], /^📅 Nada agendado\.\n💡 _Ex\.: \/cron sexta 18h .*\n\/lembrete 18:30 pagar o boleto_$/);
    });

    test('erros: sem "quando", sem texto, já passou, longe demais, -repetir inválido, -to, limite', async () => {
        const erro = async (linha, esperado) => assert.match((await bot.responder(linha))[0], esperado, linha);
        await erro('/lembrete pagar o boleto', /❌ Não entendi quando/);
        await erro('/lembrete 30m', /❌ Faltou o texto/);
        await erro('/lembrete 01/01/2020 x', /❌ [a-zá]{3} 01\/01\/2020 09:00 já passou/);
        await erro('/lembrete 01/01/2099 x', /❌ No máximo 366 dias à frente/);
        await erro('/lembrete +1h -repetir anual x', /❌ Use -repetir \(-r\) diario, semanal ou mensal/);
        await erro('/lembrete +1h -to L200 x', /❌ O lembrete não tem -to/);

        await bot.setSetting('agenda.max', 1);
        await bot.responder('/cron +1h oi');
        await erro('/lembrete +1h x', /❌ Limite de 1 lembretes e mensagens agendadas \(setting agenda\.max\)/);
    });

    test('só o dono', async () => {
        assert.deepEqual(await bot.responder('/lembrete +1h x', { de: OUTRO.jid }), []);
    });
});

describe('/cron (/agenda)', () => {
    test('-to grupo: envia o texto puro, sem citar, e sai da lista', async () => {
        const [r] = await bot.responder('/cron sexta 18h -to /Grupo L200/ Bom fim de semana!\nAté segunda.');
        assert.match(r, /^📅 \*Mensagem agendada\* para \*sex \d\d\/\d\d 18:00\* em 👥 Grupo sobre L200\.\n📝 Bom fim de semana! Até segunda\.$/);

        const [lista] = await bot.responder('/agenda -l');
        assert.match(lista, /📅 \*Agenda\* \(1\)\n\n1\. 📅 \*sex \d\d\/\d\d 18:00\* — Bom fim de semana! Até segunda\.\n   → 👥 Grupo sobre L200/);

        const [enviado] = await vencer();
        assert.equal(enviado.chatId, L200);
        assert.equal(enviado.content, 'Bom fim de semana!\nAté segunda.');
        assert.deepEqual(enviado.options, {});
        assert.deepEqual(await itens(), []);
    });

    test('sem -to: no chat atual; -to +número: no privado da pessoa; mensal', async () => {
        await bot.responder('/cron 25/12 10:00 Feliz Natal!');
        await bot.responder('/cron 05/11 -repetir mensal -to +5521911111111 Lembrete do aluguel');

        const [natal, aluguel] = await itens();
        assert.deepEqual([natal.chat_id, natal.repeat], [GRUPO, null]);
        assert.deepEqual([aluguel.chat_id, aluguel.chat_name, aluguel.repeat, aluguel.day_of_month], [OUTRO.jid, 'Fulano', 'mensal', 5]);
    });

    test('"6h" com -repetir é o horário (06:00 todo dia); "+6h" é daqui a 6 horas', async () => {
        assert.match((await bot.responder('/cron 6h -repetir diario -to L200 Bom dia!'))[0],
            /^📅 \*Mensagem agendada\* para \*[a-zá]{3} \d\d\/\d\d 06:00\* 🔁 todo dia em 👥 Grupo sobre L200\./);
        assert.match((await bot.responder('/cron 07h -to L200 Bom dia!'))[0], /para \*[a-zá]{3} \d\d\/\d\d 07:00\*/);

        await bot.responder('/cron +6h -to L200 Daqui a pouco');
        const [, , daqui] = await itens();
        assert.ok(Math.abs(daqui.due_at - (Date.now() + 6 * HORA)) < 60_000);
    });

    test('-to: o mesmo contato pelo telefone e pelo LID (como @c.us ou @lid) é um só', async () => {
        const TELEFONE = '5521999985555@c.us';
        bot.criarContato(TELEFONE, 'Lourival Vieira Neto');
        bot.criarContato('100000000000004@c.us', 'Lourival Vieira Neto');   // o LID, vindo como @c.us
        bot.client.lids.set('100000000000004@lid', TELEFONE);

        assert.match((await bot.responder('/cron 06:00 -r diario -to /Lourival Neto/ Bom dia!'))[0],
            /^📅 \*Mensagem agendada\* .* 🔁 todo dia em 👤 Lourival Vieira Neto\./);
        assert.equal((await itens())[0].chat_id, TELEFONE);

        // O LID como @lid, sem o mapa do WhatsApp: fica o @c.us
        bot.client.lids.clear();
        bot.client.contatos.delete('100000000000004@c.us');
        bot.criarContato('100000000000004@lid', 'Lourival Vieira Neto');
        assert.match((await bot.responder('/cron 07:00 -to /Lourival Neto/ Bom dia!'))[0], /em 👤 Lourival Vieira Neto\./);
        assert.equal((await itens())[1].chat_id, TELEFONE);
    });

    test('-to busca direto na memória do WhatsApp Web (sem getContacts/getChats); o LID vira o telefone', async (t) => {
        const wid = (s) => ({ _serialized: s, server: s.split('@')[1] });
        /*
         * Como no WhatsApp Web: o modelo cru do contato NÃO tem name nem
         * isMyContact; eles saem das funções de WAWebContactGetters e
         * WAWebFrontendContactGetters (as mesmas que o whatsapp-web.js usa).
         */
        const contato = (id, nome, { naAgenda = true, eu = false, telefone = null } = {}) =>
            ({ id: wid(id), _nome: nome, _naAgenda: naAgenda, _eu: eu, ...(telefone ? { phoneNumber: wid(telefone) } : {}) });
        const colecoes = {
            WAWebCollections: {
                Contact: { getModelsArray: () => [
                    contato('15559998888@c.us', 'Rafael Silva'),
                    contato('100000000000005@lid', 'Rafael Silva', { telefone: '15559998888@c.us' }),
                    contato('5521900000000@c.us', 'Rafael Eu', { eu: true }),
                    contato('5521977777777@c.us', 'Rafael Souza', { naAgenda: false })
                ] },
                Chat: { getModelsArray: () => [{ id: wid(L200), formattedTitle: 'Grupo sobre L200' }] }
            },
            WAWebApiContact: { getAlternateUserWid: () => null },
            WAWebContactGetters: { getName: c => c._nome, getIsMe: c => c._eu },
            WAWebFrontendContactGetters: { getIsMyContact: c => c._naAgenda }
        };
        globalThis.window = { require: (m) => colecoes[m] };
        bot.client.pupPage = { evaluate: async (fn, arg) => fn(arg) };
        bot.client.getContacts = () => assert.fail('não pode usar o getContacts');
        bot.client.getChats = () => assert.fail('não pode usar o getChats');
        t.after(() => {
            delete globalThis.window;
            delete bot.client.pupPage;
            delete bot.client.getContacts;
            delete bot.client.getChats;
        });

        assert.match((await bot.responder('/cron 06:00 -r diario -to /Rafael Silva/ Bom dia!'))[0], /em 👤 Rafael Silva\./);
        assert.equal((await itens())[0].chat_id, '15559998888@c.us');
        assert.match((await bot.responder('/cron 07:00 -to l200 oi'))[0], /em 👥 Grupo sobre L200\./);
        // Fora da agenda e você mesmo não entram
        assert.match((await bot.responder('/cron 07:00 -to /Rafael Souza/ oi'))[0], /❌ Nenhum contato ou grupo com "Rafael Souza"/);
        assert.match((await bot.responder('/cron 07:00 -to /Rafael Eu/ oi'))[0], /❌ Nenhum contato ou grupo com "Rafael Eu"/);

        // A página não responde: erro, sem travar
        bot.client.pupPage = { evaluate: async () => { throw new Error('página fechada'); } };
        assert.match((await bot.responder('/cron 08:00 -to /Rafael/ oi', { erroEsperado: true }))[0],
            /⚠️ Não consegui buscar "Rafael" nos contatos e grupos agora \(página fechada\)/);
    });

    test('vários -to: um item por destino (o repetido conta uma vez); o limite conta todos', async () => {
        const [r] = await bot.responder('/cron +1h -to L200 -to /Fulano/ -to l200 Reunião às 10h!');
        assert.match(r, /^📅 \*Mensagem agendada\* para \*[^*]+\* em 2 chats _\(um item para cada\)_:\n• 👥 Grupo sobre L200\n• 👤 Fulano\n📝 Reunião às 10h!$/);
        assert.deepEqual((await itens()).map(i => [i.chat_id, i.text]), [[L200, 'Reunião às 10h!'], [OUTRO.jid, 'Reunião às 10h!']]);

        await bot.setSetting('agenda.max', 3);
        assert.match((await bot.responder('/cron +2h -to L200 -to /Fulano/ oi'))[0], /❌ Limite de 3 .*: estes 2 não cabem/);
        assert.equal((await itens()).length, 2);
    });

    test('-edit <nº>: troca a hora, o texto e/ou a repetição; o destino fica', async () => {
        await bot.responder('/cron +1h -to L200 texto antigo');

        assert.match((await bot.responder('/cron -edit 1 18:30'))[0], /^✏️ \*Editado:\* 📅 \*[a-zá]{3} \d\d\/\d\d 18:30\*\n📝 texto antigo$/);
        assert.match((await bot.responder('/cron -edit 1 texto novo'))[0], /📝 texto novo$/);
        assert.match((await bot.responder('/cron -edit 1 -r semanal'))[0], /18:30\* 🔁 toda semana\n/);
        assert.doesNotMatch((await bot.responder('/cron -edit 1 -r nao'))[0], /🔁/);

        const [item] = await itens();
        assert.deepEqual([item.chat_id, item.text, item.repeat], [L200, 'texto novo', null]);

        assert.match((await bot.responder('/cron -edit 9 18h'))[0], /❌ Nº 9 não existe/);
        assert.match((await bot.responder('/cron -edit 1'))[0], /❌ Informe o que mudar/);
        assert.match((await bot.responder('/cron -edit 1 -to /Fulano/ 18h'))[0], /❌ O -edit troca só a hora, o texto e o -repetir/);
        assert.match((await bot.responder('/cron -edit 1 -r anual'))[0], /❌ Use -repetir \(-r\) diario, semanal, mensal ou nao/);
    });

    test('-pause/-resume <nº|all>: o pausado não sai; ao retomar, o repetido pula para o próximo e o único sai', async () => {
        await bot.responder('/cron +1h -to L200 único');
        await bot.responder('/cron +2h -r diario -to L200 todo dia');

        assert.match((await bot.responder('/cron -pause all'))[0], /^⏸️ \*Pausado\* \(2\)\n• .* — único\n• .* — todo dia\n💡/);
        assert.match((await bot.responder('/cron -l'))[0], /1\. 📅 \*[^*]+\* ⏸️ _pausado_ — único/);
        assert.deepEqual(await vencer(), [], 'pausados não saem');
        assert.equal((await itens()).length, 2);
        assert.deepEqual(await bot.responder('/cron -pause 1'), ['ℹ️ Já estava pausado.']);

        // Venceram enquanto pausados: o diário vai para o futuro, o único sai na próxima verificação
        const [r] = await bot.responder('/cron -resume all');
        assert.match(r, /^▶️ \*Retomado\* \(2\)\n• .* — único _\(já passou: sai agora\)_\n• .* — todo dia$/);
        const diario = (await itens()).find(i => i.repeat);
        assert.ok(diario.due_at > Date.now());

        const antes = bot.client.enviadas.length;
        await verificarAgenda();
        assert.deepEqual(bot.client.enviadas.slice(antes).map(e => e.content), ['único']);
        assert.match((await bot.responder('/cron -resume 7'))[0], /❌ Nº 7 não existe/);
    });

    test('-to por menção (@ no WhatsApp), junto com outros destinos', async () => {
        bot.client.lids.set('100000000000002@lid', OUTRO.jid);
        assert.match((await bot.responder('/cron +1h -to @100000000000002 -to L200 oi', { mencoes: ['100000000000002@lid'] }))[0],
            /em 2 chats _\(um item para cada\)_:\n• 👤 Fulano\n• 👥 Grupo sobre L200/);
        assert.deepEqual((await itens()).map(i => i.chat_id), [OUTRO.jid, L200]);
    });

    test('-lem é o -lembrete', async () => {
        assert.match((await bot.responder('/cron -lem +2h beber água'))[0], /^⏰ \*Lembrete criado\*/);
    });

    test('texto começando com "/" é enviado, mas nunca roda como comando', async () => {
        await bot.responder('/cron +1h /cache -a');
        const [enviado] = await vencer();
        assert.equal(enviado.content, '/cache -a');

        // O WhatsApp devolve o envio no message_create: a marca do bot impede o comando
        assert.deepEqual(await bot.responder('/cache -a'), []);
    });

    test('erros: destino inválido e -pv', async () => {
        assert.match((await bot.responder('/cron +1h -to xyz oi'))[0], /❌ Nenhum contato ou grupo com "xyz" no nome/);
        assert.match((await bot.responder('/cron +1h -pv oi'))[0], /❌ O -pv é do modo lembrete/);
        assert.match((await bot.responder('/cron +1h -to voce@exemplo.com oi'))[0], /❌ O \/cron envia a mensagem como se você digitasse/);
        assert.deepEqual(await itens(), []);
    });
});

describe('/cron: os dois modos', () => {
    test('/agenda é o /cron; -lembrete (ou /lembrete) é o modo lembrete; -r é o -repetir', async () => {
        assert.match((await bot.responder('/agenda +1h -to L200 oi'))[0], /^📅 \*Mensagem agendada\*/);
        assert.match((await bot.responder('/cron -lembrete +2h -pv beber água'))[0], /^⏰ \*Lembrete criado\* .* no seu privado\./);
        assert.match((await bot.responder('/lembrete +3h -r diario alongar'))[0], /^⏰ \*Lembrete criado\* .* 🔁 todo dia neste chat\./);

        assert.deepEqual((await itens()).map(i => [i.kind, i.chat_id, i.repeat]),
            [['agendar', L200, null], ['lembrete', DONO.jid, null], ['lembrete', GRUPO, 'diario']]);
    });

    test('uma lista só, com os dois tipos, e o -rm vale para qualquer um', async () => {
        await bot.responder('/cron +2h -to L200 mensagem');
        await bot.responder('/lembrete +1h lembrete');

        const [lista] = await bot.responder('/cron -l');
        assert.match(lista, /1\. ⏰ \*[^*]+\* — lembrete\n   → 👥 Família\n2\. 📅 \*[^*]+\* — mensagem\n   → 👥 Grupo sobre L200/);

        assert.match((await bot.responder('/cron -rm 1'))[0], /🗑️ Removido: \*[^*]+\* — lembrete/);
        assert.deepEqual(await bot.responder('/lembrete -rm all'), ['🗑️ 1 removido.']);
        assert.deepEqual(await itens(), []);
    });
});

