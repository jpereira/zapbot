/*
 * Schedule: date reading (util/when.js) and /lembrete (/lemb).
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

    test('daqui a tanto tempo', () => {
        assert.equal(when('30m'), 'qui 01/10 09:30 (1)');
        assert.equal(when('1h30m'), 'qui 01/10 10:30 (1)');
        assert.equal(when('2d'), 'sáb 03/10 09:00 (1)');
    });

    test('hora: hoje, ou amanhã se já passou; "18h" sozinho é duração', () => {
        assert.equal(when('18:30'), 'qui 01/10 18:30 (1)');
        assert.equal(when('às 18h'), 'qui 01/10 18:00 (2)');
        assert.equal(when('as 8h15'), 'sex 02/10 08:15 (2)');
        assert.equal(when('18h'), 'sex 02/10 03:00 (1)');      // daqui a 18 horas
        assert.equal(when('25:00'), null);
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
        assert.equal(r.destino, 'Grupo L200');
        assert.deepEqual(readScheduling('-rm 2').opt, { rm: '2' });
        assert.equal(readScheduling('2h -pv 18h').texto, '18h');   // a single "when"
    });
});

describe('/lembrete (/lemb)', () => {
    test('cria no chat atual, responde a mensagem do comando e sai depois de enviar', async () => {
        const cmd = bot.createMessage({ texto: '/lembrete 30m pagar o boleto' });
        const [r] = (await bot.deliver(cmd)).map(e => e.texto);
        assert.match(r, /^⏰ \*Lembrete criado\* para \*\w{3} \d\d\/\d\d \d\d:\d\d\* neste chat\.\n📝 pagar o boleto$/);

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
        await bot.replyAlt('/lemb -pv 2h ligar pro banco');
        const quoted = bot.createMessage({ texto: 'reunião às 15h', de: OTHERAlt.jid });
        await bot.replyAlt('/lembrete 1h', { citada: quoted });

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
        assert.match(sentAlt.content, /^⏰ \*Lembrete\*\n\ntomar o remédio\n\n_\(atrasado: era para \w{3} \d\d\/\d\d \d\d:\d\d\)_$/);
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
        await bot.replyAlt('/lembrete 2h segundo');
        await bot.replyAlt('/lembrete -pv 1h primeiro');

        const [list] = await bot.replyAlt('/lembrete');
        assert.match(list, /^⏰ \*Lembretes\* \(2\)\n\n1\. \*[^*]+\* — primeiro\n   → seu privado\n2\. \*[^*]+\* — segundo\n   → 👥 Família\n\n💡 _Remova com \/lembrete -rm <nº\|all>\._$/);
        assert.equal((await bot.replyAlt('/lembrete -l'))[0], list);

        assert.match((await bot.replyAlt('/lembrete -rm 1'))[0], /🗑️ Removido: \*[^*]+\* — primeiro/);
        assert.match((await bot.replyAlt('/lembrete -rm 5'))[0], /❌ Nº 5 não existe/);
        assert.deepEqual(await bot.replyAlt('/lembrete -rm all'), ['🗑️ 1 removido.']);
        assert.match((await bot.replyAlt('/lembrete'))[0], /⏰ Nenhum lembrete\.\n💡 _Ex\.: \/lembrete 18:30 pagar o boleto_/);
    });

    test('erros: sem "quando", sem texto, já passou, longe demais, -repetir inválido, -to, limite', async () => {
        const errorAlt = async (line, expected) => assert.match((await bot.replyAlt(line))[0], expected, line);
        await errorAlt('/lembrete pagar o boleto', /❌ Não entendi quando/);
        await errorAlt('/lembrete 30m', /❌ Faltou o texto/);
        await errorAlt('/lembrete 01/01/2020 x', /❌ \w{3} 01\/01\/2020 09:00 já passou/);
        await errorAlt('/lembrete 01/01/2099 x', /❌ No máximo 366 dias à frente/);
        await errorAlt('/lembrete 1h -repetir anual x', /❌ Use -repetir diario, semanal ou mensal/);
        await errorAlt('/lembrete 1h -to L200 x', /❌ O \/lembrete não tem -to/);

        await bot.setSetting('agenda.max', 1);
        await bot.replyAlt('/lembrete 1h oi');
        await errorAlt('/lembrete 1h x', /❌ Limite de 1 lembretes \(setting agenda\.max\)/);
    });

    test('só o dono', async () => {
        assert.deepEqual(await bot.replyAlt('/lembrete 1h x', { de: OTHERAlt.jid }), []);
    });
});
