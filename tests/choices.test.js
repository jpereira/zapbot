/*
 * Choice from a list and confirmation: src/choices.js (0 and "cancelar" give up without waiting for the deadline)
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { waitConfirmation, waitChoice, replyChoice } = bot.src('choices');
const CHAT = bot.GROUP;

beforeEach(() => bot.restart());

const owner = (textAlt) => bot.createMessage({ text: textAlt, fromMe: true, chat: CHAT });

test('um nº da lista escolhe; fora da lista pede de novo e a escolha segue de pé', async () => {
    const wait = waitChoice(CHAT, ['a', 'b']);
    const bad = owner('5');
    assert.equal(await replyChoice(bad, CHAT, '5'), true);
    assert.match(bot.client.sent.at(-1).content, /Escolha um nº de 1 a 2/);
    assert.equal(await replyChoice(owner('2'), CHAT, '2'), true);
    assert.equal(await wait, 'b');
});

test('0 e "cancelar" desistem na hora: a espera termina em null e o bot avisa', async () => {
    for (const word of ['0', 'cancelar', 'Cancel']) {
        const wait = waitChoice(CHAT, ['a', 'b']);
        assert.equal(await replyChoice(owner(word), CHAT, word), true, word);
        assert.equal(await wait, null, word);
        assert.equal(bot.client.sent.at(-1).content, '🚫 Cancelado.');
    }
    // without a pending one, "0" follows the normal path
    assert.equal(await replyChoice(owner('0'), CHAT, '0'), false);
});

test('na confirmação, "cancelar" vale como "não"', async () => {
    const wait = waitConfirmation(CHAT, { ms: 5000 });
    assert.equal(await replyChoice(owner('cancelar'), CHAT, 'cancelar'), true);
    assert.equal(await wait, false);
});
