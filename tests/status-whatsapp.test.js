/*
 * /status: posts to the WhatsApp Status; /cron -status schedules it.
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OTHERAlt, GROUP } = bot;
const STATUS = 'status@broadcast';

beforeEach(async () => {
    await bot.restart();
    await bot.dbRun('DELETE FROM status_posts');
});

// Only what the bot replied in the chat (what went to the Status stays out)
const resp = async (line, optionsAlt) => (await bot.execute(line, optionsAlt)).filter(e => e.chatId !== STATUS).map(e => e.text);
const inStatus = () => bot.client.sent.filter(e => e.chatId === STATUS);

test('texto: vai para status@broadcast e confirma', async () => {
    const r = await resp('/status Bom dia, pessoal!');
    assert.deepEqual(r, ['📣 Postado no seu Status.']);
    assert.equal(inStatus().length, 1);
    assert.equal(inStatus()[0].content, 'Bom dia, pessoal!');
});

test('sem texto nem mídia: explica; texto acima de 700 caracteres: recusa e não posta', async () => {
    assert.match((await resp('/status'))[0], /Escreva o texto: \/status Bom dia!/);
    assert.match((await resp(`/status ${'a'.repeat(701)}`))[0], /701 caracteres.*até 700/);
    assert.equal(inStatus().length, 0);
});

test('foto respondida: vai como mídia, com o texto de legenda', async () => {
    const photo = bot.createMessage({ type: 'image', media: { mimetype: 'image/jpeg', data: 'AAAA' } });
    const r = await resp('/status Fim de semana', { quoted: photo });
    assert.deepEqual(r, ['📣 Postado no seu Status.']);
    const [e] = inStatus();
    assert.equal(e.content.data, 'AAAA');
    assert.deepEqual(e.options, { caption: 'Fim de semana' });
});

test('foto que não baixa: avisa e não posta', async () => {
    const photo = bot.createMessage({ type: 'image', media: { mimetype: 'image/jpeg', data: '' } });
    assert.match((await resp('/status oi', { quoted: photo }))[0], /Não consegui baixar/);
    assert.equal(inStatus().length, 0);
});

test('a partir de status.warnAfter postagens em 24 h, o aviso de banimento (e não bloqueia)', async () => {
    for (let i = 1; i <= 2; i++) assert.deepEqual(await resp(`/status post ${i}`), ['📣 Postado no seu Status.']);
    const r = await resp('/status post 3');
    assert.match(r[0], /^📣 Postado no seu Status\.\n⚠️ São 3 postagens em 24 horas.*banimento/);
    assert.equal(inStatus().length, 3);

    // posts older than 24 h do not count
    await bot.dbRun('UPDATE status_posts SET posted_at = posted_at - 90000000');
    assert.deepEqual(await resp('/status depois'), ['📣 Postado no seu Status.']);
});

test('só admin e dono: os outros são ignorados', async () => {
    assert.deepEqual(await resp('/status oi', { de: OTHERAlt.jid, chat: GROUP }), []);
    assert.equal(inStatus().length, 0);
});

test('/cron -status: agenda com destino "Status do WhatsApp" e o aviso; -to, -private e -rem não valem', async () => {
    const [r] = await resp('/cron 8h -r d -status Bom dia!');
    assert.match(r, /Status do WhatsApp/);
    assert.match(r, /banimento/);
    const [item] = await bot.dbAll('SELECT chat_id, text, repeat FROM schedules');
    assert.deepEqual(item, { chat_id: STATUS, text: 'Bom dia!', repeat: 'daily' });

    for (const line of ['/cron 9h -status -to /Fulano/ oi', '/cron 9h -status -rem oi', '/cron 9h -status -private oi']) {
        assert.match((await resp(line))[0], /não leva -to, -private nem -reminder/, line);
    }
    assert.equal((await bot.dbAll('SELECT id FROM schedules')).length, 1);
});

test('/cron -status: na hora, o texto (com os {/comando}) vai para o Status e conta na postagem', async () => {
    await resp('/cron +1m -status Olá {/uptime}');
    await bot.dbRun('UPDATE schedules SET due_at = ?', [Date.now() - 1000]);
    await bot.src('schedule').checkSchedule();

    const [e] = inStatus();
    assert.ok(e, 'postou no status');
    assert.match(e.content, /^Olá\n\n.*ZapBot/s);
    assert.equal((await bot.dbAll('SELECT id FROM status_posts')).length, 1);
});
