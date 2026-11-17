/*
 * /antitag and /antibadword: tagging everyone and prohibited words (src/groupRules.js, src/moderation.js).
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, GROUP, OTHERAlt } = bot;
const { marksLimit, normalizeWord, wordsProhibited } = bot.src('groupRules');

let group;
let removed;
const MEMBERS = Array.from({ length: 12 }, (_, i) => `55219000000${String(i).padStart(2, '0')}@c.us`);

beforeEach(async () => {
    await bot.restart();
    group = bot.createGroup(GROUP, 'Família', [{ jid: OWNER.jid, isAdmin: true }, OTHERAlt.jid, ...MEMBERS]);
    removed = [];
    group.removeParticipants = async (ids) => { removed.push(ids); return { status: 200 }; };
});

async function send(textAlt, { de = OTHERAlt.jid, mencoes: mentions = [] } = {}) {
    const msg = bot.createMessage({ texto: textAlt, de, mencoes: mentions });
    await bot.deliver(msg);
    return msg;
}
const notices = () => bot.client.enviadas.map(e => e.content);

test('palavras: sem acento, maiúscula nem pontuação, e só a palavra inteira', () => {
    assert.equal(normalizeWord('  ÍDIOTA! '), 'idiota');
    assert.equal(normalizeWord('!!!'), null);
    assert.equal(normalizeWord('x'.repeat(41)), null);
    const list = ['idiota', 'cu', 'vai se ferrar'];
    assert.deepEqual(wordsProhibited('Você é um IDIOTA!!', list), ['idiota']);
    assert.deepEqual(wordsProhibited('cuidado com o acusado, cu!', list), ['cu']);
    assert.deepEqual(wordsProhibited('cuidado com o acusado', list), []);
    assert.deepEqual(wordsProhibited('então, VAI,  se  ferrar.', list), ['vai se ferrar']);
});

test('limite de marcações: o mínimo do grupo, ou 80% se for pequeno, nunca menos de 3', () => {
    assert.equal(marksLimit(undefined, 100), 10);
    assert.equal(marksLimit(6, 100), 6);
    assert.equal(marksLimit(10, 5), 4);
    assert.equal(marksLimit(10, 2), 3);
});

test('/antibadword: modo, palavras, lista; só em grupo', async () => {
    assert.match((await bot.replyAlt('/antibadword'))[0], /^🤬 \*Antibadword:\* desligado\n📚 \*Palavras:\* 0/);
    assert.match((await bot.replyAlt('/antibadword -add Idiota! -delete')).join('\n'), /✅ "idiota" entrou na lista\./);
    const r = (await bot.replyAlt('/antibadword -add "vai se ferrar"')).join('\n');
    assert.match(r, /✅ "vai se ferrar" entrou na lista\./);
    assert.match(r, /🤬 \*Antibadword:\* apagar\n📚 \*Palavras:\* 2/);
    assert.match((await bot.replyAlt('/antibadword -list'))[0], /idiota, vai se ferrar/);
    assert.match((await bot.replyAlt('/antibadword -rm idiota'))[0], /🚫 "idiota" saiu da lista\./);
    assert.match((await bot.replyAlt('/antibadword -add !!!'))[0], /Palavra inválida/);
    assert.match((await bot.replyAlt('/antibadword -delete -warn'))[0], /Escolha um modo só/);
    assert.match((await bot.replyAlt('/antibadword', { chat: OWNER.jid }))[0], /grupos/);
});

test('/antibadword -delete: apaga a palavra de quem não é admin; admin, dono e comando passam', async () => {
    await bot.replyAlt('/antibadword -add idiota -delete');

    const m = await send('Você é um IDIOTA!');
    assert.equal(m.apagadaPara, 'todos');
    assert.ok(notices().includes('🤬 Mensagem de Fulano apagada: palavra proibida.'), JSON.stringify(notices()));

    assert.equal((await send('bom dia, tudo bem?')).apagadaPara, undefined);
    assert.equal((await send('/ping idiota')).apagadaPara, undefined, 'comando não conta');

    group.participants.find(p => p.id._serialized === OTHERAlt.jid).isAdmin = true;
    assert.equal((await send('idiota')).apagadaPara, undefined, 'admin do grupo');
});

test('/antibadword -remove: apaga e tira a pessoa; -warn soma um aviso', async () => {
    await bot.replyAlt('/antibadword -add idiota -remove');
    await send('idiota');
    assert.deepEqual(removed, [[OTHERAlt.jid]]);
    assert.ok(notices().some(c => /usou uma palavra proibida e foi removido/.test(c)));

    removed.length = 0;
    await bot.replyAlt('/antibadword -warn');
    const m = await send('idiota');
    assert.equal(m.apagadaPara, 'todos');
    assert.deepEqual(removed, [], '1 aviso, abaixo do warn.max');
    assert.ok(notices().some(c => /⚠️|aviso/i.test(c)));
});

test('/antitag: modo e mínimo; apaga quem marca gente demais', async () => {
    assert.match((await bot.replyAlt('/antitag'))[0], /^🏷️ \*Antitag:\* desligado\n📏 \*Mínimo:\* 10 marcações/);
    const r = (await bot.replyAlt('/antitag -delete -min 6')).join('\n');
    assert.match(r, /📏 Mínimo: 6 marcações\./);
    assert.match(r, /🏷️ \*Antitag:\* apagar\n📏 \*Mínimo:\* 6 marcações numa mensagem/);
    assert.match((await bot.replyAlt('/antitag -min 2'))[0], /Use um número inteiro de 3 a 1000/);

    const few = await send('oi @a @b', { mencoes: MEMBERS.slice(0, 2) });
    assert.equal(few.apagadaPara, undefined);
    const five = await send('oi gente', { mencoes: MEMBERS.slice(0, 5) });
    assert.equal(five.apagadaPara, undefined, 'abaixo do mínimo (6)');
    const six = await send('oi gente', { mencoes: MEMBERS.slice(0, 6) });
    assert.equal(six.apagadaPara, 'todos');
    assert.ok(notices().includes('🏷️ Mensagem de Fulano apagada: marcou gente demais.'));

    group.participants.find(p => p.id._serialized === OTHERAlt.jid).isAdmin = true;
    assert.equal((await send('oi', { mencoes: MEMBERS.slice(0, 8) })).apagadaPara, undefined, 'admin do grupo');
});

test('/antitag desligado não faz nada, e o bot sem ser admin não apaga', async () => {
    assert.equal((await send('oi', { mencoes: MEMBERS })).apagadaPara, undefined);
    await bot.replyAlt('/antitag -delete');
    group.participants.find(p => p.id._serialized === OWNER.jid).isAdmin = false;
    assert.equal((await send('oi', { mencoes: MEMBERS })).apagadaPara, undefined);
    assert.match((await bot.replyAlt('/antitag'))[0], /O bot não é admin do grupo/);
});
