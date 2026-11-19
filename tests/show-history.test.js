/*
 * /show -all (-a): the general history of a chat (messages table + cache/media): the summary by month, day and
 * hour, the period, the parts, the last N, the search and the deletion.
 */
const bot = require('./helpers/bot');

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, OTHERAlt } = bot;

const FAMILY = '120363000000000001@g.us';
const WORK = '120363000000000002@g.us';
let seq = 0;

beforeEach(async () => {
    await bot.restart();
    await bot.setSetting('show.delayMs', 0);
    bot.createGroup(WORK, 'Trabalho', [OWNER.jid, OTHERAlt.jid]);
});

// A message of the history at a date/time of São Paulo ("2026-10-05 14:30")
async function add(when, body, { chat = FAMILY, name = chat === FAMILY ? 'Família' : 'Trabalho', media = null, revoked = 0 } = {}) {
    const ms = new Date(`${when.replace(' ', 'T')}:00-03:00`).getTime();
    await bot.dbRun(
        `INSERT INTO messages (id, sender_name, sender_jid, sender_number, chat_id, chat_name, is_group, body, type, timestamp,
                               has_media, media_path, from_me, revoked, revoked_at)
         VALUES (?, 'Fulano', ?, '5521911111111', ?, ?, 1, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [`h${++seq}`, OTHERAlt.jid, chat, name, body, media ? 'image' : 'chat', ms, media ? 1 : 0, media, revoked, revoked ? ms + 1000 : null]);
}

// n messages in a day, one per minute from the hour
const day = (date, n, hour = 9, extra = {}) => Promise.all(Array.from({ length: n }, (_, i) => add(`${date} ${String(hour).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`, `msg ${date} ${i + 1}`, extra)));

const sent = () => bot.client.enviadas.map(e => (typeof e.content === 'string' ? e.content : '[mídia]'));
const titles = () => sent().filter(c => c.startsWith('💬 *MENSAGEM*')).map(c => c.split('\n')[0]);

describe('/show -a: o resumo e a descida por mês, dia e hora', () => {
    test('muitas mensagens: o total, os meses (com mídia), a dica do próximo nível e que o histórico fica mesmo apagando no celular', async () => {
        await bot.setSetting('cache.messageRetentionHours', 2160);
        await day('2026-09-10', 12);
        await day('2026-10-05', 20);
        await add('2026-10-06 10:00', 'foto', { media: '/cache/media/x.jpg' });
        await day('2026-11-19', 5);
        const [r] = await bot.replyAlt('/show -a');
        assert.match(r, /^🗄️ \*Histórico · Família\*\n38 mensagens \(1 com mídia\), de 2026-09-10 a 2026-11-19\n\n2026-11 · 5\n2026-10 · 21 · 🖼️ 1\n2026-09 · 12\n/);
        assert.match(r, /💡 _Para ler, repita com o período: \/show -a 2026-11_/);
        assert.match(r, /Dia: 2026-05-05 \(ou 05\/05\/2026, hoje, ontem\) · mês: 2026-05 · hora: 14h/);
        assert.match(r, /Mesmo apagando mensagens no celular ou no WhatsApp Web, o bot continua com o histórico \(e as mídias\) por 90 dias/);
        assert.equal(titles().length, 0, 'nada de mensagem solta: só o resumo');
    });

    test('mês → os dias; dia → as horas; hora → as mensagens', async () => {
        await day('2026-10-05', 25, 9);
        await day('2026-10-05', 30, 14);
        await day('2026-10-07', 3);
        const [days] = await bot.replyAlt('/show -a 2026-10');
        assert.match(days, /^🗄️ \*Família · 2026-10\*\n58 mensagens\n\n2026-10-07 · 3\n2026-10-05 · 55\n/);
        assert.match(days, /\/show -a 2026-10-07/);
        assert.doesNotMatch(days, /Mesmo apagando/, 'a nota só vai no primeiro nível');

        const [hours] = await bot.replyAlt('/show -a 05/10/2026');
        assert.match(hours, /^🗄️ \*Família · 2026-10-05\*\n55 mensagens\n\n14h · 30\n09h · 25\n/);
        assert.match(hours, /\/show -a 2026-10-05 14h/);

        await bot.replyAlt('/show -a 2026-10-05 14h');
        assert.equal(titles().length, 20, 'a primeira parte: show.max');
        assert.match(sent().find(c => c.startsWith('💬 *30 mensagens*')), /2026-10-05 14h \(parte 1\/2\)\n💡 _Próxima parte: \/show -a 2026-10-05 14h p2_/);
        assert.equal(titles().at(-1), '💬 *MENSAGEM* (20/20)');
        const before = titles().length;
        await bot.replyAlt('/show -a 2026-10-05 14:00 p2');
        assert.equal(titles().length - before, 10);
        assert.match(sent().find(c => c.includes('parte 2/2')), /\(parte 2\/2\)$/);
    });

    test('poucas mensagens: saem direto, em ordem; apagada para todos vem marcada; ontem e hoje', async () => {
        await add('2026-10-05 09:00', 'primeira');
        await add('2026-10-05 09:05', 'segunda', { revoked: 1 });
        await add('2026-10-04 08:00', 'outro dia');
        await bot.replyAlt('/show -a 2026-10-05');
        const out = sent();
        assert.ok(out.some(c => c.startsWith('💬 *2 mensagens* · Família · 2026-10-05')));
        assert.deepEqual(titles(), ['💬 *MENSAGEM* (1/2)', '💬 *MENSAGEM* (2/2) 🗑️ _apagada para todos_']);
        assert.ok(out.some(c => c.includes('primeira')) && out.some(c => c.includes('segunda')) && !out.some(c => c.includes('outro dia')));

        const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(Date.now() - 86400000);
        await add(`${day} 12:00`, 'ontem mesmo');
        await bot.replyAlt('/show -a ontem');
        assert.ok(sent().some(c => c.includes('ontem mesmo')));
    });

    test('-N: as últimas N (de tudo, ou do período); sem mensagem: o aviso', async () => {
        await day('2026-10-05', 30);
        await bot.replyAlt('/show -a -3');
        assert.ok(sent().some(c => c.startsWith('💬 *As últimas 3 mensagens* · Família')));
        assert.deepEqual(titles(), ['💬 *MENSAGEM* (1/3)', '💬 *MENSAGEM* (2/3)', '💬 *MENSAGEM* (3/3)']);
        assert.ok(sent().some(c => c.includes('msg 2026-10-05 30')) && !sent().some(c => c.includes('msg 2026-10-05 27')));
        assert.match((await bot.replyAlt('/show -a 2025-01'))[0], /Nada no histórico neste chat · 2025-01\./);
    });

    test('datas inválidas, hora sem dia, período duplo e as opções que não combinam', async () => {
        assert.match((await bot.replyAlt('/show -a 2026-13'))[0], /❌ "2026-13" não é uma data que eu entenda/);
        assert.match((await bot.replyAlt('/show -a 31/02/2026'))[0], /não é uma data que eu entenda/);
        assert.match((await bot.replyAlt('/show -a 25h'))[0], /não é uma data que eu entenda/);
        assert.match((await bot.replyAlt('/show -a 14h'))[0], /A hora precisa de um dia/);
        assert.match((await bot.replyAlt('/show -a 2026-10 2026-11'))[0], /Use só um período/);
        assert.match((await bot.replyAlt('/show -a -d'))[0], /não combina com -d, -e, -s, -r e -l/);
        assert.match((await bot.replyAlt('/show -a -l'))[0], /não combina/);
    });
});

describe('/show -a: o chat, a busca e o privado do dono', () => {
    test('/show -a <chat>: o nome, de outro chat; no privado do dono sem chat, a lista dos chats com histórico', async () => {
        await day('2026-10-05', 25, 9, { chat: WORK });
        await add('2026-10-05 10:00', 'só da família');
        const [byChat] = await bot.replyAlt('/show -a trabalho', { chat: OWNER.jid });
        assert.match(byChat, /^🗄️ \*Histórico · Trabalho\*\n25 mensagens, de 2026-10-05 a 2026-10-05/);
        assert.match(byChat, /\/show -a \/Trabalho\/ 2026-10/);

        const [list] = await bot.replyAlt('/show -a', { chat: OWNER.jid });
        assert.match(list, /^🗄️ \*Histórico: 2 chats\* · 26 mensagens\n\n1\. 👥 Trabalho — 25 mensagens · última /);
        assert.match(list, /2\. 👥 Família — 1 mensagem · última /);
        assert.match(list, /\/show -a \/Fulano\//);
        assert.match(list, /Mesmo apagando mensagens no celular/);

        // with a period and no chat, in your private chat: all of them
        const [all] = await bot.replyAlt('/show -a 2026-10-05', { chat: OWNER.jid });
        assert.match(all, /^🗄️ \*todos os chats · 2026-10-05\*|^💬 \*26 mensagens\* · todos os chats/);
    });

    test('-q busca no texto (e nas transcrições) e resume só o que casa', async () => {
        await day('2026-09-10', 12);
        await day('2026-10-05', 20);
        await add('2026-10-05 20:00', 'o BOLETO venceu hoje');
        await bot.dbRun("UPDATE messages SET transcription = 'mandei o boleto no áudio' WHERE body = 'msg 2026-09-10 3'");
        await bot.replyAlt('/show -a -q boleto');
        assert.equal(titles().length, 2);
        assert.ok(sent().some(c => /💬 \*2 mensagens\* · Família · todo o período com "boleto"/.test(c)));
        assert.match((await bot.replyAlt('/show -a -q inexistente'))[0], /Nada no histórico neste chat com "inexistente"\./);
    });
});

describe('/show -f -a: apaga o histórico (só com -yes)', () => {
    test('sem -yes diz quantas sairiam; com -yes apaga as mensagens e os arquivos de mídia do período', async () => {
        const file = path.join(os.tmpdir(), `zapbot-hist-${Date.now()}.jpg`);
        // media_path must be inside MEDIA_DIR to be deleted
        const { MEDIA_DIR } = bot.src('constants');
        const inMedia = path.join(MEDIA_DIR, '2026', '10', '05', `h-${Date.now()}.jpg`);
        fs.mkdirSync(path.dirname(inMedia), { recursive: true });
        fs.writeFileSync(inMedia, 'x'.repeat(100));
        fs.rmSync(file, { force: true });
        await add('2026-10-05 09:00', 'com foto', { media: inMedia });
        await add('2026-10-05 09:01', 'sem foto');
        await add('2026-11-01 09:00', 'outro mês');

        const [ask] = await bot.replyAlt('/show -f -a 2026-10');
        assert.match(ask, /^⚠️ Isso apaga 2 mensagens do histórico neste chat, com 1 arquivos de mídia \(100 B\)\.\nPara confirmar: \/show -f -a 2026-10 -yes$/);
        assert.equal((await bot.dbGet("SELECT COUNT(*) AS n FROM messages WHERE body NOT LIKE '/%'")).n, 3);
        assert.ok(fs.existsSync(inMedia));

        const [done] = await bot.replyAlt('/show -f -a 2026-10 -y');
        assert.match(done, /^🧹 \*Histórico apagado\* neste chat: 2 mensagens, 1 arquivos de mídia _\(100 B\)_\.$/);
        assert.deepEqual((await bot.dbAll("SELECT body FROM messages WHERE body NOT LIKE '/%'")).map(r => r.body), ['outro mês']);
        assert.ok(!fs.existsSync(inMedia));
        assert.ok(!fs.existsSync(path.dirname(inMedia)), 'a pasta vazia do dia foi junto');
    });
});
