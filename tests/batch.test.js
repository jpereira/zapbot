/*
 * /batch: vários comandos de uma mensagem, em sequência, com um resumo só.
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

beforeEach(async () => {
    await bot.reiniciar();
    await bot.dbRun('DELETE FROM notes');
    await bot.dbRun('DELETE FROM command_aliases');
    await bot.dbRun("DELETE FROM sqlite_sequence WHERE name = 'notes'");
});

const notas = () => bot.dbAll('SELECT id, text, tag FROM notes ORDER BY id');

test('executa os blocos em sequência (linhas em branco e URLs ficam no bloco) e resume', async () => {
    await bot.responder('/alias /ideia /notes #ideias $1');
    const r = await bot.responder('/batch\n/ideia Preciso ver sobre isso\n\nhttp://minha.com/?124\n\n' +
        '/ideia Quando puder ler\nhttp://g1.com/labala\n/notes #casa pão');
    assert.equal(r.length, 1);
    assert.match(r[0], /BATCH\* · 3\/3 ok/);
    assert.match(r[0], /✅ 1 · \/ideia Preciso ver/);

    const n = await notas();
    assert.equal(n.length, 3);
    // com $1 o alias junta o texto numa linha só (o comportamento do /alias)
    assert.equal(n[0].text, 'Preciso ver sobre isso http://minha.com/?124');
    assert.equal(n[0].tag, 'ideias');
    assert.equal(n[1].text, 'Quando puder ler http://g1.com/labala');
    assert.equal(n[2].tag, 'casa');
});

test('linha com "/" que não é comando continua sendo texto do bloco', async () => {
    await bot.responder('/batch\n/notes veja /etc/hosts\n/etc/passwd');
    assert.match((await notas())[0].text, /veja \/etc\/hosts\n\/etc\/passwd/);
});

test('-dry só mostra a separação; sem comando, erro; /batch dentro de /batch, recusado', async () => {
    const [d] = await bot.responder('/batch -dry\ntexto solto\n/notes um\nmais\n/notes dois');
    assert.match(d, /só a separação/);
    assert.match(d, /1\. \/notes um .*\+1 linhas/);
    assert.match(d, /2\. \/notes dois/);
    assert.match(d, /antes do primeiro comando/);
    assert.equal((await notas()).length, 0);

    assert.match((await bot.responder('/batch'))[0], /Use: \/batch/);
    assert.match((await bot.responder('/batch só texto'))[0], /Nenhum comando/);
    assert.match((await bot.responder('/batch\n/batch\n/notes x'))[0], /dentro de \/batch/);
});

test('falha segue adiante; com -stop, para no primeiro erro', async () => {
    const [a] = await bot.responder('/batch\n/notes -rm 99\n/notes ok');
    assert.match(a, /1\/2 ok/);
    assert.match(a, /❌ 1/);
    assert.equal((await notas()).length, 1);

    const [b] = await bot.responder('/batch -stop\n/notes -rm 99\n/notes não roda');
    assert.match(b, /Parou no bloco 1; 1 não rodaram/);
    assert.equal((await notas()).length, 1);
});

test('alias de texto, comando de consulta e a mensagem respondida', async t => {
    const { HANDLERS } = bot.src('comandos/index');
    t.mock.method(HANDLERS, '/crypto', async ({ msg }) => msg.reply('₿ BTC $1'));
    await bot.responder('/alias btc Bitcoin: {/crypto BTC} fim');
    const [r] = await bot.responder('/batch\n/btc\n/notes um\n/ping');
    assert.match(r, /BATCH\* · 3\/3 ok/);
    assert.match(r, /✅ 1 · \/btc\n   ↳ Bitcoin: ₿ BTC \$1 fim/);
    assert.equal((await notas()).length, 1);

    // sem texto, o /batch executa o texto da mensagem respondida
    const citada = bot.criarMensagem({ de: bot.DONO.jid, texto: '/notes primeira\n/notes segunda' });
    const [resp] = await bot.responder('/batch', { citada });
    assert.match(resp, /2\/2 ok/);
    assert.deepEqual((await notas()).map(n => n.text), ['um', 'primeira', 'segunda']);
});

test('mais de 50 blocos: nada é executado', async () => {
    const [r] = await bot.responder('/batch\n' + Array.from({ length: 51 }, (_, i) => `/notes n${i}`).join('\n'));
    assert.match(r, /São 51 blocos; o máximo é 50\. Nada foi executado/);
    assert.equal((await notas()).length, 0);
});

test('só o dono usa', async () => {
    assert.deepEqual(await bot.responder('/batch\n/notes x', { de: bot.OUTRO.jid }), []);
    assert.equal((await notas()).length, 0);
});
