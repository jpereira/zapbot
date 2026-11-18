/*
 * Rejected calls (src/calls.js): call.reject, call.allow and call.message.
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OTHERAlt } = bot;
const { EVENT_CALL, notified, handleCall } = bot.src('calls');
const requireIt = require;

let rejected;

beforeEach(async () => {
    await bot.restart();
    notified.clear();
    rejected = 0;
});

const call = (de = OTHERAlt.jid) => ({ from: de, fromMe: false, isGroup: false, reject: async () => { rejected++; } });
const messagesFor = (jid) => bot.client.enviadas.filter(e => e.chatId === jid).map(e => e.content);

test('desligado (o padrão): a ligação toca, nada acontece', async () => {
    assert.equal(await handleCall(call()), 'ignorada');
    assert.equal(rejected, 0);
});

test('call.reject: recusa e avisa uma vez a cada 10 minutos', async () => {
    await bot.setSetting('call.reject', true);
    const nowAlt = Date.now();

    assert.equal(await handleCall(call(), nowAlt), 'recusada');
    assert.equal(await handleCall(call(), nowAlt + 60 * 1000), 'recusada');
    assert.equal(rejected, 2);
    assert.equal(messagesFor(OTHERAlt.jid).length, 1, 'a 2ª ligação não repete o aviso');
    assert.match(messagesFor(OTHERAlt.jid)[0], /Não atendo ligações aqui/);

    assert.equal(await handleCall(call(), nowAlt + 11 * 60 * 1000), 'recusada');
    assert.equal(messagesFor(OTHERAlt.jid).length, 2, 'passados 10 min, avisa de novo');
});

test('call.allow e bot.admins sempre tocam; call.message off recusa em silêncio', async () => {
    await bot.setSetting('call.reject', true);
    await bot.setSetting('call.allow', OTHERAlt.jid.split('@')[0]);
    assert.equal(await handleCall(call()), 'ignorada');
    assert.equal(rejected, 0);

    await bot.setSetting('call.allow', '');
    await bot.setSetting('call.message', 'off');
    assert.equal(await handleCall(call()), 'recusada');
    assert.deepEqual(messagesFor(OTHERAlt.jid), []);
});

test('o nome do evento é o da biblioteca (um nome inventado nunca dispara)', () => {
    const { Events } = requireIt('whatsapp-web.js/src/util/Constants');
    assert.equal(EVENT_CALL, Events.INCOMING_CALL);
});

test('o evento de ligação do cliente chega ao tratador', async () => {
    await bot.setSetting('call.reject', true);
    bot.client.emit(EVENT_CALL, call());
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(rejected, 1);
});
