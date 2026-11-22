'use strict';
/*
 * /call: turns call rejection on and off, the message (call.message) and who always rings (call.allow).
 */

const bot = require('./helpers/bot');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OTHERAlt } = bot;
const { notified, handleCall } = bot.src('calls');
const { separateMsg } = bot.src('commands/call');

const DENIED = '5521977777777';
let rejected;
const call = (numberAlt) => ({ from: `${numberAlt}@c.us`, fromMe: false, isGroup: false, reject: async () => { rejected++; } });
const messagesFor = (numberAlt) => bot.client.sent.filter(e => e.chatId === `${numberAlt}@c.us`).map(e => e.content);

beforeEach(async () => {
    await bot.restart();
    notified.clear();
    rejected = 0;
});

test('/call sem opção: como está (desligado, a mensagem padrão e a lista vazia)', async () => {
    const [r] = await bot.replyAlt('/call');
    assert.match(r, /^📵 \*Recusar ligações:\* desligado\n📝 Oi! Não atendo ligações aqui/);
    assert.match(r, /✅ Sempre tocam: — \(e os admins do bot\)/);
});

test('-on e -off ligam e desligam o call.reject', async () => {
    const [turnedOn] = await bot.replyAlt('/call -on');
    assert.match(turnedOn, /Recusar ligações:\* ligado/);
    assert.equal(bot.getSetting('call.reject'), true);

    const [turnedOff] = await bot.replyAlt('/call -off');
    assert.match(turnedOff, /Recusar ligações:\* desligado/);
    assert.equal(bot.getSetting('call.reject'), false);

    assert.match((await bot.replyAlt('/call -on -off'))[0], /Usage|\/call/);
    assert.equal(bot.getSetting('call.reject'), false, 'ligar e desligar juntos não muda nada');
});

test('-msg muda o texto; off recusa em silêncio; reset volta ao padrão; junto do -on', async () => {
    const [r] = await bot.replyAlt('/call -msg Não atendo ligações, mande áudio!');
    assert.match(r, /📝 Não atendo ligações, mande áudio!/);
    assert.equal(bot.getSetting('call.message'), 'Não atendo ligações, mande áudio!');

    const [silence] = await bot.replyAlt('/call -msg off');
    assert.match(silence, /📝 \(nenhuma: recusa em silêncio\)/);
    assert.equal(bot.getSetting('call.message'), 'off');

    const [defaults] = await bot.replyAlt('/call -msg reset');
    assert.equal(bot.getSetting('call.message'), '');
    assert.match(defaults, /📝 Oi! Não atendo ligações aqui/, 'vazio: o texto padrão do idioma');

    const [junto] = await bot.replyAlt('/call -on -msg Me chame por mensagem!');
    assert.match(junto, /Recusar ligações:\* ligado\n📝 Me chame por mensagem!/);
    assert.equal(bot.getSetting('call.reject'), true);
});

test('-allow e -rm: a lista de quem sempre toca (número e nome do contato)', async () => {
    await bot.replyAlt('/call -allow +5521999999999');
    assert.deepEqual(bot.getSetting('call.allow'), ['5521999999999']);

    await bot.replyAlt(`/call -a /${OTHERAlt.name}/`);
    assert.equal(bot.getSetting('call.allow').length, 2);

    await bot.replyAlt('/call -rm +5521999999999');
    assert.equal(bot.getSetting('call.allow').includes('5521999999999'), false);

    const [status] = await bot.replyAlt('/call');
    assert.match(status, /✅ Sempre tocam: \+\d+ \(e os admins do bot\)/);
});

test('-allow sem ninguém, -msg sem texto e opções que não combinam mostram o uso', async () => {
    for (const cmd of ['/call -allow', '/call -rm', '/call -msg', '/call -allow +5521999999999 -rm +5521988887777',
        '/call -allow +5521999999999 -msg oi']) {
        const [r] = await bot.replyAlt(cmd);
        assert.match(r, /\/call/, cmd);
    }
    assert.deepEqual(bot.getSetting('call.allow'), []);
});

test('quem não é admin não usa o /call (o comando é admin)', async () => {
    assert.deepEqual(await bot.replyAlt('/call -on', { de: OTHERAlt.jid }), []);
    assert.equal(bot.getSetting('call.reject'), false);
});

test('separarMsg: o -msg vai até a próxima opção, com ou sem aspas; o resto são as pessoas', () => {
    assert.deepEqual(separateMsg('-deny /Fulano/ +5521977777777 -msg "Não quero falar agora!"'),
        { text: 'Não quero falar agora!', rest: '-deny /Fulano/ +5521977777777' });
    assert.deepEqual(separateMsg('-msg Estou ocupado agora -deny /Fulano/'), { text: 'Estou ocupado agora', rest: '-deny /Fulano/' });
    assert.deepEqual(separateMsg('-d +5521977777777 -m “Depois eu ligo”'), { text: 'Depois eu ligo', rest: '-d +5521977777777' });
    assert.deepEqual(separateMsg('-deny /Fulano/'), { text: null, rest: '-deny /Fulano/' });
    assert.equal(separateMsg('-deny /Fulano/ -msg').text, null);
});

test('-deny: recusa sempre as ligações dessas pessoas, mesmo com a recusa desligada, com a mensagem delas', async () => {
    const [r] = await bot.replyAlt(`/call -deny /${OTHERAlt.name}/ +${DENIED} -msg "Não quero falar agora!"`);
    assert.match(r, /🚷 Ligações sempre recusadas: \+\d+, \+5521977777777\n📝 Não quero falar agora!/);
    assert.equal(bot.getSetting('call.reject'), false, 'a recusa geral continua desligada');

    assert.equal(await handleCall(call(DENIED)), 'recusada');
    assert.equal(rejected, 1);
    assert.deepEqual(messagesFor(DENIED), ['Não quero falar agora!']);
    assert.equal(await handleCall(call('5521955555555')), 'ignorada', 'os outros tocam');
    assert.equal(rejected, 1);

    const [status] = await bot.replyAlt('/call');
    assert.match(status, /🚷 Sempre recusados: \+\d+ \(Não quero falar agora!\), \+5521977777777 \(Não quero falar agora!\)/);
});

test('-deny sem -msg: o texto padrão de quem foi negado; -msg off: recusa em silêncio; o -d vale como -deny', async () => {
    await bot.replyAlt(`/call -d +${DENIED}`);
    assert.equal(await handleCall(call(DENIED)), 'recusada');
    assert.deepEqual(messagesFor(DENIED), ['Não posso falar agora. Me manda uma mensagem!']);

    await bot.replyAlt(`/call -deny +${DENIED} -msg off`);
    notified.clear();
    bot.client.sent.length = 0;
    assert.equal(await handleCall(call(DENIED)), 'recusada');
    assert.deepEqual(messagesFor(DENIED), []);
});

test('-deny e -allow se excluem; -rm tira das duas listas; quem não está em nenhuma recebe o aviso', async () => {
    await bot.replyAlt(`/call -allow +${DENIED}`);
    assert.deepEqual(bot.getSetting('call.allow'), [DENIED]);

    await bot.replyAlt(`/call -deny +${DENIED}`);
    assert.deepEqual(bot.getSetting('call.allow'), [], 'negar tira de quem sempre toca');

    await bot.replyAlt(`/call -allow +${DENIED}`);
    assert.deepEqual(bot.getSetting('call.allow'), [DENIED]);
    assert.equal(await handleCall(call(DENIED)), 'ignorada', 'liberar tira dos negados');

    await bot.replyAlt(`/call -deny +${DENIED}`);
    const [r] = await bot.replyAlt(`/call -rm +${DENIED}`);
    assert.match(r, /De volta à regra geral: \+5521977777777/);
    assert.equal(await handleCall(call(DENIED)), 'ignorada');

    assert.match((await bot.replyAlt('/call -rm +5521933333333'))[0], /não está em nenhuma das listas/);
});

test('-deny sem ninguém, junto do -allow, ou com -msg vazio mostram o uso', async () => {
    for (const cmd of ['/call -deny', `/call -deny +${DENIED} -allow +5521933333333`, `/call -deny +${DENIED} -msg`]) {
        const [r] = await bot.replyAlt(cmd);
        assert.match(r, /\/call/, cmd);
    }
    assert.equal((await bot.replyAlt('/call'))[0].includes('+5521977777777'), false);
});

test('-deny: a ligação que chega como @lid casa com o número negado pelo @lid dele', async () => {
    await bot.replyAlt(`/call -deny +${DENIED} -msg "Agora não!"`);
    const original = bot.client.getContactLidAndPhone;
    bot.client.getContactLidAndPhone = async (ids) => ids.map((id) => (id === `${DENIED}@c.us`
        ? { lid: '99887766@lid', pn: `${DENIED}@c.us` } : { lid: '11112222@lid', pn: id }));
    try {
        assert.equal(await handleCall({ ...call('99887766'), from: '99887766@lid' }), 'recusada');
        assert.deepEqual(bot.client.sent.filter(e => e.chatId === '99887766@lid').map(e => e.content), ['Agora não!']);
        assert.equal(await handleCall({ ...call('55555555'), from: '55555555@lid' }), 'ignorada', 'outro @lid toca');
    } finally {
        bot.client.getContactLidAndPhone = original;
    }
});

test('os exemplos dos docs: -msg antes das pessoas, -d sem -msg e -d com -msg off', async () => {
    const [r] = await bot.replyAlt(`/call -msg Agora não, me chame por mensagem -d +${DENIED}`);
    assert.match(r, /🚷 Ligações sempre recusadas: \+5521977777777\n📝 Agora não, me chame por mensagem/);
    assert.equal(await handleCall(call(DENIED)), 'recusada');
    assert.deepEqual(messagesFor(DENIED), ['Agora não, me chame por mensagem']);
    assert.equal(bot.getSetting('call.message'), '', 'o -msg junto do -deny não muda a mensagem geral');

    await bot.replyAlt(`/call -d +${DENIED} -msg off`);
    notified.clear();
    bot.client.sent.length = 0;
    assert.equal(await handleCall(call(DENIED)), 'recusada');
    assert.deepEqual(messagesFor(DENIED), []);
});
