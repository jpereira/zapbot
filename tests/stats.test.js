/*
 * /stats: chat ranking and your own stats (-me).
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, GROUP, OTHERAlt } = bot;
const { countStats, dayAndHour } = bot.src('stats');

const WORK = '120363000000000002@g.us';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const countAlt = (senderId, senderName, n, { chatId = GROUP, chatName = 'Família', quando: when = Date.now(), campos: fields = { msgs: 1 } } = {}) =>
    Promise.all(Array.from({ length: n }, () =>
        countStats({ chatId, chatName, isGroup: 1, senderId, senderName, quando: when, campos: fields })));

// The commands run in your private chat: nothing is counted there, so only the
// counters the test created (in the group, the "/stats" message itself would count)
const stats = (line) => bot.replyAlt(line, { chat: OWNER.jid });

beforeEach(bot.restart);

describe('contadores', () => {
    test('dia e hora no fuso de São Paulo', () => {
        assert.deepEqual(dayAndHour(Date.UTC(2026, 8, 30, 2, 30)), { day: '2026-09-29', hour: 23 });
        assert.deepEqual(dayAndHour(Date.UTC(2026, 8, 30, 15, 0)), { day: '2026-09-30', hour: 12 });
    });

    test('mesma pessoa, dia e hora somam na mesma linha', async () => {
        await countAlt('a', 'A', 3);
        await countAlt('a', 'A', 1, { campos: { deleted: 1 } });
        const linesAlt = await bot.dbAll('SELECT msgs, deleted FROM stats');
        assert.deepEqual(linesAlt, [{ msgs: 3, deleted: 1 }]);
    });
});

describe('/stats', () => {
    test('ranking do chat: total, média, mídia, quem fala, apaga e edita', async () => {
        await countAlt('5521a', 'Tia', 6);
        await countAlt('5521b', 'Tio', 3);
        await countAlt('5521c', 'Primo', 1);
        await countAlt('5521b', 'Tio', 2, { campos: { deleted: 1 } });
        await countAlt('5521c', 'Primo', 1, { campos: { edited: 1 } });
        await countAlt('5521a', 'Tia', 1, { campos: { media: 1 } });

        const [r] = await stats('/stats -c família');
        assert.match(r, /📊 \*Estatísticas de Família\*\n_Últimos 7 dias_/);
        assert.match(r, /💬 \*Mensagens:\* 10 _\(média 1\/dia\)_/);
        assert.match(r, /📎 \*Com mídia:\* 1/);
        assert.match(r, /👥 \*Participantes ativos:\* 3/);
        assert.match(r, /🥇 Tia — \*6\* _\(60%\)_\n🥈 Tio — \*3\* _\(30%\)_\n🥉 Primo — \*1\* _\(10%\)_/);
        assert.match(r, /🗑️ \*Quem mais apaga\*\n1\. Tio — \*2\*/);
        assert.match(r, /✏️ \*Quem mais edita\*\n1\. Primo — \*1\*/);
        assert.match(r, /🕐 \*Por horário\*/);
        assert.match(r, /⏰ \*Horário de pico:\*/);
        assert.match(r, /📅 \*Dia mais movimentado:\*/);
        assert.match(r, /\/stats -me para as suas/);
    });

    test('sem -c: o chat atual, contando a própria mensagem do comando', async () => {
        await countAlt(OTHERAlt.user, OTHERAlt.nome, 2);
        const [r] = await bot.replyAlt('/stats');
        assert.match(r, /Estatísticas de Família[\s\S]*Mensagens:\* 3 [\s\S]*🥇 Fulano — \*2\*[\s\S]*🥈 Dono — \*1\*/);
    });

    test('sem apagar nem editar, essas seções não aparecem', async () => {
        await countAlt('a', 'A', 2);
        const [r] = await stats('/stats -c família');
        assert.doesNotMatch(r, /Quem mais apaga|Quem mais edita/);
    });

    test('mais de 10 pessoas: top 10 e o resto contado', async () => {
        for (let i = 0; i < 12; i++) await countAlt(`p${i}`, `P${i}`, 12 - i);
        const [r] = await stats('/stats -c família');
        assert.match(r, /10\. P9 — /);
        assert.match(r, /_\+2 pessoa\(s\)_/);
    });

    test('-N muda o período; limitado a stats.retentionDays', async () => {
        await countAlt('a', 'A', 1, { quando: Date.now() - 10 * DAY });
        await countAlt('a', 'A', 1);

        assert.match((await stats('/stats -c família'))[0], /Mensagens:\* 1 /);
        assert.match((await stats('/stats -c família -30'))[0], /_Últimos 30 dias_[\s\S]*Mensagens:\* 2 /);
        assert.match((await stats('/stats -c família 999'))[0], /_Últimos 90 dias_/);
    });

    test('argumento inválido mostra a sintaxe', async () => {
        for (const line of ['/stats abc', '/stats 1 2', '/stats -0']) {
            assert.match((await bot.replyAlt(line))[0], /Usage: \/stats/, line);
        }
    });

    test('sem dados; com a contagem desligada, a dica', async () => {
        assert.deepEqual(await stats('/stats'), ['📊 Sem estatísticas deste chat nos últimos 7 dias.']);
        await bot.setSetting('stats.enabled', false);
        assert.match((await stats('/stats'))[0], /\/set stats\.enabled on/);
    });

    test('-c <nome>: outro chat; sem correspondência ou ambíguo', async () => {
        await countAlt('a', 'A', 2, { chatId: WORK, chatName: 'Trabalho' });
        await countAlt('a', 'A', 1, { chatId: '120363000000000003@g.us', chatName: 'Trabalho antigo' });

        assert.match((await bot.replyAlt('/stats -c trabalho'))[0], /Estatísticas de Trabalho\*[\s\S]*Mensagens:\* 2 /);
        assert.match((await bot.replyAlt('/stats -c xyz'))[0], /❌ Nenhum chat com estatísticas contém "xyz"/);
        assert.match((await bot.replyAlt('/stats -c trab'))[0], /🔎 "trab" corresponde a 2 chats/);
    });

    test('-pv manda no seu privado', async () => {
        await countAlt('a', 'A', 1);
        const r = await bot.executar('/stats -pv');
        assert.equal(r[0].texto, '📊 Estatísticas enviadas no seu privado.');
        assert.equal(r[1].chatId, OWNER.jid);
        assert.match(r[1].texto, /Estatísticas de Família/);
    });

    test('-me: as suas mensagens em todos os chats', async () => {
        await countAlt(OWNER.user, 'Dono', 3);
        await countAlt(OWNER.user, 'Dono', 1, { chatId: WORK, chatName: 'Trabalho' });
        await countAlt(OWNER.user, 'Dono', 1, { campos: { deleted: 1 } });
        await countAlt(OTHERAlt.user, OTHERAlt.nome, 50); // of another person: does not enter

        const [r] = await stats('/stats -me');
        assert.match(r, /📊 \*Suas estatísticas\*\n_Últimos 7 dias, todos os chats_/);
        assert.match(r, /💬 \*Mensagens:\* 4 /);
        assert.match(r, /🗑️ \*Apagadas por você:\* 1/);
        assert.match(r, /👥 \*Chats em que você falou:\* 2/);
        assert.match(r, /🥇 👥 Família — \*3\* _\(75%\)_\n🥈 👥 Trabalho — \*1\* _\(25%\)_/);
        assert.doesNotMatch(r, /\/stats -me para as suas/);
    });

    test('-me -c: só as suas num chat', async () => {
        await countAlt(OWNER.user, 'Dono', 2, { chatId: WORK, chatName: 'Trabalho' });
        await countAlt(OWNER.user, 'Dono', 5);

        const [r] = await bot.replyAlt('/stats -me -c trabalho -3');
        assert.match(r, /📊 \*Suas estatísticas em Trabalho\*\n_Últimos 3 dias_/);
        assert.match(r, /Mensagens:\* 2 /);
        assert.doesNotMatch(r, /Onde você mais fala/);
    });

    test('-me sem dados', async () => {
        assert.deepEqual(await stats('/stats -me'), ['📊 Sem estatísticas suas nos últimos 7 dias.']);
    });

    test('plural do pico: 1 msg / 2 msgs', async () => {
        await countAlt('a', 'A', 1);
        assert.match((await stats('/stats -c família'))[0], /Horário de pico:\*.*_\(1 msg\)_/);
        await countAlt('a', 'A', 1);
        assert.match((await stats('/stats -c família'))[0], /Horário de pico:\*.*_\(2 msgs\)_/);
    });
});
