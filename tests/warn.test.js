/*
 * /warn: group warnings, with the limit (warn.max) that removes the person; -l and -c.
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, GROUP, OTHERAlt } = bot;
const CICLANO = { jid: '5521922222222@c.us', name: 'Ciclano' };

let group;
let removed;

beforeEach(async () => {
    await bot.restart();
    bot.createContact(CICLANO.jid, CICLANO.name);
    group = bot.createGroup(GROUP, 'Família', [{ jid: OWNER.jid, isAdmin: true }, { jid: OTHERAlt.jid, isAdmin: true }, CICLANO.jid]);
    removed = [];
    group.removeParticipants = async (ids) => { removed.push(ids); return { status: 200 }; };
});

const notices = () => bot.dbAll('SELECT person, reason FROM warns ORDER BY id');

test('/warn soma um aviso com o motivo, por número, nome ou respondendo', async () => {
    assert.deepEqual(await bot.replyAlt('/warn +5521922222222 mandou link'), ['⚠️ *Aviso 1/3* para Ciclano: mandou link']);
    assert.deepEqual(await bot.replyAlt('/warn /Ciclano/'), ['⚠️ *Aviso 2/3* para Ciclano']);
    const quoted = bot.createMessage({ text: 'oi', de: CICLANO.jid });
    assert.deepEqual(await bot.replyAlt('/warn fora do assunto', { quoted }), ['⚠️ *Aviso 3/3* para Ciclano: fora do assunto'].map(x => x + '\n🚪 Ciclano chegou a 3 avisos e foi removido do grupo.'));
    assert.deepEqual(removed, [[CICLANO.jid]]);
    assert.deepEqual(await notices(), [], 'removido: a contagem zera');
});

test('warn.max muda o limite; 0 só conta e nunca remove', async () => {
    await bot.setSetting('warn.max', 2);
    await bot.replyAlt('/warn +5521922222222');
    assert.match((await bot.replyAlt('/warn +5521922222222'))[0], /Aviso 2\/2.*\n🚪 Ciclano chegou a 2 avisos/s);

    await bot.setSetting('warn.max', 0);
    for (let i = 0; i < 4; i++) await bot.replyAlt('/warn +5521922222222');
    assert.match((await bot.replyAlt('/warn +5521922222222'))[0], /^⚠️ \*Aviso 5\/∞\* para Ciclano$/);
    assert.equal(removed.length, 1, 'com 0 ninguém é removido');
});

test('no limite sem o bot ser admin: avisa que não conseguiu remover e mantém a contagem', async () => {
    await bot.setSetting('warn.max', 1);
    group.participants.find(p => p.id._serialized === OWNER.jid).isAdmin = false;
    assert.match((await bot.replyAlt('/warn +5521922222222'))[0], /Aviso 1\/1.*\n🚫 Ciclano chegou a 1 avisos, mas não consegui remover: o bot precisa ser admin do grupo\./s);
    assert.deepEqual(removed, []);
    assert.equal((await notices()).length, 1);
});

test('admins do grupo e o bot não levam aviso; fora de grupo e sem ninguém', async () => {
    assert.match((await bot.replyAlt(`/warn +${OTHERAlt.user}`))[0], /Fulano é admin do grupo: não leva aviso/);
    const my = bot.createMessage({ text: 'oi', fromMe: true });
    assert.deepEqual(await bot.replyAlt('/warn', { quoted: my }), ['❌ Eu não me aviso. 🙂']);
    assert.match((await bot.replyAlt('/warn'))[0], /Usage: \/warn/);
    assert.match((await bot.replyAlt('/warn +5521999999999', { chat: OWNER.jid }))[0], /grupos/);
    assert.deepEqual(await notices(), []);
});

test('-l lista o grupo e, com uma pessoa, cada aviso com o motivo; -c zera', async () => {
    assert.deepEqual(await bot.replyAlt('/warn -l'), ['Ninguém tem aviso neste grupo.']);
    await bot.replyAlt('/warn +5521922222222 link');
    await bot.replyAlt('/warn +5521922222222 spam');

    assert.match((await bot.replyAlt('/warn -l'))[0], /^⚠️ \*Avisos do grupo\* \(1\)\n\n1\. Ciclano — 2\/3/);
    const [det] = await bot.replyAlt('/warn -l +5521922222222');
    assert.match(det, /^⚠️ \*Avisos de Ciclano\* \(2\/3\)\n\n1\. .* · link\n2\. .* · spam$/);

    assert.deepEqual(await bot.replyAlt('/warn -c +5521922222222'), ['✅ Avisos de Ciclano zerados (2).']);
    assert.deepEqual(await bot.replyAlt('/warn -c +5521922222222'), ['Ciclano não tem avisos aqui.']);
});

test('lerAlvoEMotivo: a pessoa no começo e o resto é o motivo', () => {
    const { readTargetAndReason } = bot.src('commands/warn');
    assert.deepEqual(readTargetAndReason('@Fulano mandou link'), { person: '@Fulano', reason: 'mandou link' });
    assert.deepEqual(readTargetAndReason('/Fulano de Tal/ spam'), { person: '/Fulano de Tal/', reason: 'spam' });
    assert.deepEqual(readTargetAndReason('+5521999999999'), { person: '+5521999999999', reason: '' });
    assert.deepEqual(readTargetAndReason('só o motivo'), { person: '', reason: 'só o motivo' });
});
