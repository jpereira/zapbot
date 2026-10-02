/*
 * /stats: ranking do chat e as suas estatísticas (-me).
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { DONO, GRUPO, OUTRO } = bot;
const { contarStats, diaEHora } = bot.src('stats');

const TRABALHO = '120363000000000002@g.us';
const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

const contar = (senderId, senderName, n, { chatId = GRUPO, chatName = 'Família', quando = Date.now(), campos = { msgs: 1 } } = {}) =>
    Promise.all(Array.from({ length: n }, () =>
        contarStats({ chatId, chatName, isGroup: 1, senderId, senderName, quando, campos })));

// Os comandos rodam no seu privado: lá nada é contado, então só aparecem os
// contadores que o teste criou (no grupo, a própria mensagem "/stats" contaria)
const stats = (linha) => bot.responder(linha, { chat: DONO.jid });

beforeEach(bot.reiniciar);

describe('contadores', () => {
    test('dia e hora no fuso de São Paulo', () => {
        assert.deepEqual(diaEHora(Date.UTC(2026, 8, 30, 2, 30)), { day: '2026-09-29', hour: 23 });
        assert.deepEqual(diaEHora(Date.UTC(2026, 8, 30, 15, 0)), { day: '2026-09-30', hour: 12 });
    });

    test('mesma pessoa, dia e hora somam na mesma linha', async () => {
        await contar('a', 'A', 3);
        await contar('a', 'A', 1, { campos: { deleted: 1 } });
        const linhas = await bot.dbAll('SELECT msgs, deleted FROM stats');
        assert.deepEqual(linhas, [{ msgs: 3, deleted: 1 }]);
    });
});

describe('/stats', () => {
    test('ranking do chat: total, média, mídia, quem fala, apaga e edita', async () => {
        await contar('5521a', 'Tia', 6);
        await contar('5521b', 'Tio', 3);
        await contar('5521c', 'Primo', 1);
        await contar('5521b', 'Tio', 2, { campos: { deleted: 1 } });
        await contar('5521c', 'Primo', 1, { campos: { edited: 1 } });
        await contar('5521a', 'Tia', 1, { campos: { media: 1 } });

        const [r] = await stats('/stats /família/');
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

    test('sem /chat/: o chat atual, contando a própria mensagem do comando', async () => {
        await contar(OUTRO.user, OUTRO.nome, 2);
        const [r] = await bot.responder('/stats');
        assert.match(r, /Estatísticas de Família[\s\S]*Mensagens:\* 3 [\s\S]*🥇 Fulano — \*2\*[\s\S]*🥈 Dono — \*1\*/);
    });

    test('sem apagar nem editar, essas seções não aparecem', async () => {
        await contar('a', 'A', 2);
        const [r] = await stats('/stats /família/');
        assert.doesNotMatch(r, /Quem mais apaga|Quem mais edita/);
    });

    test('mais de 10 pessoas: top 10 e o resto contado', async () => {
        for (let i = 0; i < 12; i++) await contar(`p${i}`, `P${i}`, 12 - i);
        const [r] = await stats('/stats /família/');
        assert.match(r, /10\. P9 — /);
        assert.match(r, /_\+2 pessoa\(s\)_/);
    });

    test('-N muda o período; limitado a stats.retentionDays', async () => {
        await contar('a', 'A', 1, { quando: Date.now() - 10 * DIA });
        await contar('a', 'A', 1);

        assert.match((await stats('/stats /família/'))[0], /Mensagens:\* 1 /);
        assert.match((await stats('/stats /família/ -30'))[0], /_Últimos 30 dias_[\s\S]*Mensagens:\* 2 /);
        assert.match((await stats('/stats -30 /Família/'))[0], /_Últimos 30 dias_[\s\S]*Mensagens:\* 2 /, '-N antes do alvo');
        assert.match((await stats('/stats família -999'))[0], /_Últimos 90 dias_/, 'alvo sem barras');
    });

    test('opção desconhecida ou -0 mostra a sintaxe; -c e -pv não existem mais', async () => {
        for (const linha of ['/stats -0', '/stats -x', '/stats -c família', '/stats -pv']) {
            assert.match((await bot.responder(linha))[0], /Usage: \/stats/, linha);
        }
    });

    test('sem dados; com a contagem desligada, a dica', async () => {
        assert.deepEqual(await stats('/stats'), ['📊 Sem estatísticas deste chat nos últimos 7 dias.']);
        await bot.setSetting('stats.enable', false);
        assert.match((await stats('/stats'))[0], /\/set stats\.enable on/);
    });

    test('/chat/: outro chat pelo nome (o exato ganha); sem correspondência; vários: escolhe na lista', async () => {
        await contar('a', 'A', 2, { chatId: TRABALHO, chatName: 'Trabalho' });
        await contar('a', 'A', 1, { chatId: '120363000000000003@g.us', chatName: 'Trabalho antigo' });

        assert.match((await bot.responder('/stats /trabalho/'))[0], /Estatísticas de Trabalho\*[\s\S]*Mensagens:\* 2 /);
        assert.match((await bot.responder('/stats /xyz/'))[0], /❌ Nenhum chat com estatísticas tem "xyz" no nome\.\n💡 _Veja os que têm com \/stats -l_/);

        const r = await bot.responderEscolhendo('/stats /trab/', 2);
        assert.match(r[0], /^🔎 "trab" corresponde a 2 chats:\n\n1\. 👥 Trabalho\n2\. 👥 Trabalho antigo/);
        assert.match(r.at(-1), /Estatísticas de Trabalho antigo\*[\s\S]*Mensagens:\* 1 /);
    });

    test('-l: os chats com estatísticas, do que mais fala para o que menos', async () => {
        assert.deepEqual(await stats('/stats -l'), ['📊 Nenhuma estatística guardada ainda.']);
        await contar('a', 'A', 2, { chatId: TRABALHO, chatName: 'Trabalho' });
        await contar('a', 'A', 5);

        const [r] = await stats('/stats -list');
        assert.match(r, /^📊 \*Chats com estatísticas\* \(2\)\n_Até 90 dias guardados_\n\n1\. 👥 Família — 5 msgs _\(última em \d\d\/\d\d\)_\n2\. 👥 Trabalho — 2 msgs/);
    });

    test('-flush /chat/ apaga as de um chat; -flush-all, todas', async () => {
        await contar('a', 'A', 2, { chatId: TRABALHO, chatName: 'Trabalho' });
        await contar('a', 'A', 5);

        assert.match((await stats('/stats -flush'))[0], /❌ Informe o chat: \/stats -flush \/Grupo\//);
        assert.deepEqual(await stats('/stats -f /Trabalho/'), ['🗑️ Estatísticas de 👥 Trabalho apagadas.']);
        assert.deepEqual((await bot.dbAll('SELECT DISTINCT chat_name FROM stats')).map(c => c.chat_name), ['Família']);

        assert.deepEqual(await stats('/stats -flush-all'), ['🗑️ Estatísticas apagadas: 1 chat.']);
        assert.deepEqual(await bot.dbAll('SELECT * FROM stats'), []);
    });

    test('-me: as suas mensagens em todos os chats', async () => {
        await contar(DONO.user, 'Dono', 3);
        await contar(DONO.user, 'Dono', 1, { chatId: TRABALHO, chatName: 'Trabalho' });
        await contar(DONO.user, 'Dono', 1, { campos: { deleted: 1 } });
        await contar(OUTRO.user, OUTRO.nome, 50); // de outra pessoa: não entra

        const [r] = await stats('/stats -me');
        assert.match(r, /📊 \*Suas estatísticas\*\n_Últimos 7 dias, todos os chats_/);
        assert.match(r, /💬 \*Mensagens:\* 4 /);
        assert.match(r, /🗑️ \*Apagadas por você:\* 1/);
        assert.match(r, /👥 \*Chats em que você falou:\* 2/);
        assert.match(r, /🥇 👥 Família — \*3\* _\(75%\)_\n🥈 👥 Trabalho — \*1\* _\(25%\)_/);
        assert.doesNotMatch(r, /\/stats -me para as suas/);
    });

    test('-me /chat/: só as suas num chat', async () => {
        await contar(DONO.user, 'Dono', 2, { chatId: TRABALHO, chatName: 'Trabalho' });
        await contar(DONO.user, 'Dono', 5);

        const [r] = await bot.responder('/stats -me /trabalho/ -3');
        assert.match(r, /📊 \*Suas estatísticas em Trabalho\*\n_Últimos 3 dias_/);
        assert.match(r, /Mensagens:\* 2 /);
        assert.doesNotMatch(r, /Onde você mais fala/);
    });

    test('-me sem dados', async () => {
        assert.deepEqual(await stats('/stats -me'), ['📊 Sem estatísticas suas nos últimos 7 dias.']);
    });

    test('plural do pico: 1 msg / 2 msgs', async () => {
        await contar('a', 'A', 1);
        assert.match((await stats('/stats /família/'))[0], /Horário de pico:\*.*_\(1 msg\)_/);
        await contar('a', 'A', 1);
        assert.match((await stats('/stats /família/'))[0], /Horário de pico:\*.*_\(2 msgs\)_/);
    });
});
