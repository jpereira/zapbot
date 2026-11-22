/*
 * /antilink: the modes, the allowed domains and who is never caught (src/antilink.js).
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, GROUP, OTHERAlt } = bot;
const { domainsAlt, normalizeDomain, prohibited } = bot.src('antilink');
const CICLANO = { jid: '5521922222222@c.us', name: 'Ciclano' };

let group;
let removed;

beforeEach(async () => {
    await bot.restart();
    bot.createContact(CICLANO.jid, CICLANO.name);
    group = bot.createGroup(GROUP, 'Família', [{ jid: OWNER.jid, isAdmin: true }, OTHERAlt.jid, CICLANO.jid]);
    removed = [];
    group.removeParticipants = async (ids) => { removed.push(ids); return { status: 200 }; };
});

// Fulano (regular member) sends a text in the group
async function send(textAlt, de = OTHERAlt.jid) {
    const msg = bot.createMessage({ text: textAlt, de });
    const replies = await bot.deliver(msg);
    return { msg, answers: replies };
}

test('dominiosDe: http(s), www, domínio solto e convite; sem falso positivo em texto comum', () => {
    assert.deepEqual(domainsAlt('veja https://www.YouTube.com/watch?v=1 e www.g1.globo.com/x'), ['youtube.com', 'g1.globo.com']);
    assert.deepEqual(domainsAlt('entra em chat.whatsapp.com/ABC123, vai'), ['chat.whatsapp.com']);
    assert.deepEqual(domainsAlt('meu site é exemplo.com.br!'), ['exemplo.com.br']);
    assert.deepEqual(domainsAlt('bom dia, tudo bem? versão 2.5 do arquivo.txt'), []);
});

test('domínios liberados valem com subdomínios, e não por sufixo de texto', () => {
    assert.deepEqual(prohibited(['m.youtube.com', 'youtube.com', 'notyoutube.com', 'g1.com'], ['youtube.com']), ['notyoutube.com', 'g1.com']);
    assert.equal(normalizeDomain('https://www.YouTube.com/x'), 'youtube.com');
    assert.equal(normalizeDomain('youtube'), null);
});

test('/antilink: mostra o modo, muda e libera/tira domínios; só em grupo', async () => {
    assert.match((await bot.replyAlt('/antilink'))[0], /^🔗 \*Antilink:\* desligado\n✅ \*Liberados:\* nenhum/);
    const r = (await bot.replyAlt('/antilink -delete -allow https://www.YouTube.com/x')).join('\n');
    assert.match(r, /🔗 Modo: apagar\.\n✅ youtube\.com liberado\.\n🔗 \*Antilink:\* apagar\n✅ \*Liberados:\* youtube\.com/);
    assert.match((await bot.replyAlt('/antilink -deny youtube.com'))[0], /🚫 youtube\.com tirado dos liberados\./);
    assert.match((await bot.replyAlt('/antilink -delete -warn'))[0], /Escolha um modo só/);
    assert.match((await bot.replyAlt('/antilink -allow youtube'))[0], /Domínio inválido: "youtube"/);
    assert.match((await bot.replyAlt('/antilink', { chat: OWNER.jid }))[0], /grupos/);
});

test('-delete: apaga o link de quem não é admin; texto comum, domínio liberado e comandos passam', async () => {
    await bot.replyAlt('/antilink -delete -allow youtube.com');

    const { msg, answers: replies } = await send('olha isso https://golpe.xyz/promo');
    assert.equal(msg.deletedFor, 'todos');
    assert.ok(bot.client.sent.some(e => e.content === '🔗 Link de Fulano apagado.'), JSON.stringify(replies));

    const ok = await send('bom dia, tudo bem?');
    assert.equal(ok.msg.deletedFor, undefined);
    const released = await send('https://m.youtube.com/watch?v=1');
    assert.equal(released.msg.deletedFor, undefined);
});

test('quem nunca é pego: admin do grupo, o dono, e o bot sem ser admin não apaga', async () => {
    await bot.replyAlt('/antilink -delete');
    group.participants.find(p => p.id._serialized === OTHERAlt.jid).isAdmin = true;
    assert.equal((await send('https://golpe.xyz')).msg.deletedFor, undefined, 'admin do grupo');
    group.participants.find(p => p.id._serialized === OTHERAlt.jid).isAdmin = false;

    const my = bot.createMessage({ text: 'https://meu.site/x', fromMe: true, chat: GROUP });
    await bot.deliver(my);
    assert.equal(my.deletedFor, undefined, 'o dono');

    group.participants.find(p => p.id._serialized === OWNER.jid).isAdmin = false;
    assert.equal((await send('https://golpe.xyz')).msg.deletedFor, undefined, 'bot sem admin: não apaga');
});

test('-warn: apaga e soma um aviso do /warn; no limite, remove a pessoa', async () => {
    await bot.setSetting('warn.max', 2);
    await bot.replyAlt('/antilink -warn');

    await send('https://golpe.xyz/1');
    assert.ok(bot.client.sent.some(e => /Link de Fulano apagado\.\n⚠️ \*Aviso 1\/2\* para Fulano: mandou link/.test(e.content)));
    await send('https://golpe.xyz/2');
    assert.ok(bot.client.sent.some(e => /Aviso 2\/2.*\n🚪 Fulano chegou a 2 avisos e foi removido do grupo/s.test(e.content)));
    assert.deepEqual(removed, [[OTHERAlt.jid]]);
});

test('-remove: apaga e remove na hora; -off volta ao normal', async () => {
    await bot.replyAlt('/antilink -remove');
    const { msg } = await send('https://golpe.xyz');
    assert.equal(msg.deletedFor, 'todos');
    assert.deepEqual(removed, [[OTHERAlt.jid]]);
    assert.ok(bot.client.sent.some(e => e.content === '🚪 Fulano mandou link e foi removido do grupo.'));

    await bot.replyAlt('/antilink -off');
    assert.equal((await send('https://golpe.xyz')).msg.deletedFor, undefined);
});
