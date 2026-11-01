/*
 * /batch: several commands from one message, in sequence, with a single summary.
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

beforeEach(async () => {
    await bot.restart();
    await bot.dbRun('DELETE FROM notes');
    await bot.dbRun('DELETE FROM command_aliases');
    await bot.dbRun("DELETE FROM sqlite_sequence WHERE name = 'notes'");
});

const notes = () => bot.dbAll('SELECT id, text, tag FROM notes ORDER BY id');

test('executa os blocos em sequência (linhas em branco e URLs ficam no bloco) e resume', async () => {
    await bot.replyAlt('/alias /ideia /notes #ideias $1');
    const r = await bot.replyAlt('/batch\n/ideia Preciso ver sobre isso\n\nhttp://minha.com/?124\n\n' +
        '/ideia Quando puder ler\nhttp://g1.com/labala\n/notes #casa pão');
    assert.equal(r.length, 1);
    assert.match(r[0], /BATCH\* · 3\/3 ok/);
    assert.match(r[0], /✅ 1 · \/ideia Preciso ver/);

    const n = await notes();
    assert.equal(n.length, 3);
    // with $1 the alias joins the text on a single line (the /alias behavior)
    assert.equal(n[0].text, 'Preciso ver sobre isso http://minha.com/?124');
    assert.equal(n[0].tag, 'ideias');
    assert.equal(n[1].text, 'Quando puder ler http://g1.com/labala');
    assert.equal(n[2].tag, 'casa');
});

test('linha com "/" que não é comando continua sendo texto do bloco', async () => {
    await bot.replyAlt('/batch\n/notes veja /etc/hosts\n/etc/passwd');
    assert.match((await notes())[0].text, /veja \/etc\/hosts\n\/etc\/passwd/);
});

test('-dry só mostra a separação; sem comando, erro; /batch dentro de /batch, recusado', async () => {
    const [d] = await bot.replyAlt('/batch -dry\ntexto solto\n/notes um\nmais\n/notes dois');
    assert.match(d, /só a separação/);
    assert.equal((await bot.replyAlt('/batch -d\ntexto solto\n/notes um\nmais\n/notes dois'))[0], d);
    assert.match(d, /1\. \/notes um .*\+1 linhas/);
    assert.match(d, /2\. \/notes dois/);
    assert.match(d, /antes do primeiro comando/);
    assert.equal((await notes()).length, 0);

    assert.match((await bot.replyAlt('/batch'))[0], /Use: \/batch/);
    assert.match((await bot.replyAlt('/batch só texto'))[0], /Nenhum comando/);
    assert.match((await bot.replyAlt('/batch\n/batch\n/notes x'))[0], /dentro de \/batch/);
});

test('falha segue adiante; com -stop, para no primeiro erro', async () => {
    const [a] = await bot.replyAlt('/batch\n/notes -rm 99\n/notes ok');
    assert.match(a, /1\/2 ok/);
    assert.match(a, /❌ 1/);
    assert.equal((await notes()).length, 1);

    const [b] = await bot.replyAlt('/batch -stop\n/notes -rm 99\n/notes não roda');
    assert.match(b, /Parou no bloco 1; 1 não rodaram/);
    assert.equal((await notes()).length, 1);
});

test('alias de texto, comando de consulta e a mensagem respondida', async t => {
    const { HANDLERS } = bot.src('commands/index');
    t.mock.method(HANDLERS, '/crypto', async ({ msg }) => msg.reply('₿ BTC $1'));
    await bot.replyAlt('/alias btc Bitcoin: {/crypto BTC} fim');
    const [r] = await bot.replyAlt('/batch\n/btc\n/notes um\n/ping');
    assert.match(r, /BATCH\* · 3\/3 ok/);
    assert.match(r, /✅ 1 · \/btc\n   ↳ Bitcoin: ₿ BTC \$1 fim/);
    assert.equal((await notes()).length, 1);

    // without text, /batch runs the replied message's text
    const quoted = bot.createMessage({ de: bot.OWNER.jid, texto: '/notes primeira\n/notes segunda' });
    const [resp] = await bot.replyAlt('/batch', { citada: quoted });
    assert.match(resp, /2\/2 ok/);
    assert.deepEqual((await notes()).map(n => n.text), ['um', 'primeira', 'segunda']);
});

test('mais de 50 blocos: nada é executado', async () => {
    const [r] = await bot.replyAlt('/batch\n' + Array.from({ length: 51 }, (_, i) => `/notes n${i}`).join('\n'));
    assert.match(r, /São 51 blocos; o máximo é 50\. Nada foi executado/);
    assert.equal((await notes()).length, 0);
});

test('só o dono usa', async () => {
    assert.deepEqual(await bot.replyAlt('/batch\n/notes x', { de: bot.OTHERAlt.jid }), []);
    assert.equal((await notes()).length, 0);
});
