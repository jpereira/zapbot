/*
 * /welcome and /goodbye: each group's join and leave message (group_join and group_leave events).
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, GROUP, OTHERAlt } = bot;
const CICLANO = { jid: '5521922222222@c.us', nome: 'Ciclano' };

beforeEach(async () => {
    await bot.restart();
    bot.createContact(CICLANO.jid, CICLANO.nome);
    bot.createGroup(GROUP, 'Família', [OWNER.jid, OTHERAlt.jid, CICLANO.jid]);
});

// The whatsapp-web.js event (GroupNotification) and what the bot sent because of it
async function event(nameAlt, recipientIds, chatId = GROUP) {
    const beforeAlt = bot.client.enviadas.length;
    for (const h of bot.client.listeners(nameAlt)) await h({ chatId, recipientIds });
    return bot.client.enviadas.slice(beforeAlt);
}

test('sem configurar, entrar e sair não manda nada', async () => {
    assert.deepEqual(await event('group_join', [CICLANO.jid]), []);
    assert.deepEqual(await event('group_leave', [CICLANO.jid]), []);
});

test('/welcome <texto> liga: {name} vira a menção de quem entrou e {group}, o nome do grupo', async () => {
    const [r] = await bot.replyAlt('/welcome Boas-vindas ao {group}, {name}! 🎉');
    assert.match(r, /^✅ A mensagem de boas-vindas está ligada neste grupo:\n\nBoas-vindas ao \{group\}, \{name\}! 🎉$/);

    const [e] = await event('group_join', [CICLANO.jid]);
    assert.equal(e.chatId, GROUP);
    assert.equal(e.content, 'Boas-vindas ao Família, @5521922222222! 🎉');
    assert.deepEqual(e.options.mentions, [CICLANO.jid]);
});

test('mais de uma pessoa entrando: uma mensagem para cada', async () => {
    await bot.replyAlt('/welcome Oi {name}');
    const sentAlt2 = await event('group_join', [CICLANO.jid, OTHERAlt.jid]);
    assert.deepEqual(sentAlt2.map(e => e.content), ['Oi @5521922222222', 'Oi @5521911111111']);
});

test('o bot entrando num grupo não se cumprimenta', async () => {
    await bot.replyAlt('/welcome Oi {name}');
    assert.deepEqual(await event('group_join', [OWNER.jid]), []);
});

test('o texto é por grupo: outro grupo sem a mensagem fica quieto', async () => {
    const OTHER_GROUP = '120363000000000002@g.us';
    bot.createGroup(OTHER_GROUP, 'Trabalho', [OWNER.jid]);
    await bot.replyAlt('/welcome Oi {name}');
    assert.deepEqual(await event('group_join', [CICLANO.jid], OTHER_GROUP), []);
});

test('/welcome -on usa o texto padrão do idioma', async () => {
    const [r] = await bot.replyAlt('/welcome -on');
    assert.match(r, /Boas-vindas ao \{group\}, \{name\}!/);
    const [e] = await event('group_join', [CICLANO.jid]);
    assert.equal(e.content, '👋 Boas-vindas ao Família, @5521922222222!');
});

test('/welcome sem nada mostra a mensagem do grupo (ou diz que não tem)', async () => {
    assert.match((await bot.replyAlt('/welcome'))[0], /Este grupo não tem mensagem de boas-vindas\./);
    await bot.replyAlt('/welcome Oi {name}');
    const [r] = await bot.replyAlt('/welcome');
    assert.match(r, /A mensagem de boas-vindas deste grupo \(ligada\):\n\nOi \{name\}/);
});

test('/welcome -off desliga', async () => {
    await bot.replyAlt('/welcome Oi {name}');
    assert.deepEqual(await bot.replyAlt('/welcome -off'), ['🔕 A mensagem de boas-vindas está desligada neste grupo.']);
    assert.deepEqual(await event('group_join', [CICLANO.jid]), []);
});

test('/welcome -test manda como ficaria, com você no lugar de quem entra, sem gravar', async () => {
    const [e] = await bot.executar('/welcome -test Oi {name}, bem-vindo ao {group}', { de: OWNER.jid });
    assert.equal(e.texto, `Oi @${OWNER.user}, bem-vindo ao Família`);
    assert.deepEqual(e.options.mentions, [OWNER.jid]);
    assert.match((await bot.replyAlt('/welcome'))[0], /Este grupo não tem mensagem/);
});

test('texto com várias linhas e grande demais', async () => {
    await bot.replyAlt('/welcome Linha 1\nLinha 2 {name}');
    const [e] = await event('group_join', [CICLANO.jid]);
    assert.equal(e.content, 'Linha 1\nLinha 2 @5521922222222');

    assert.match((await bot.replyAlt(`/welcome ${'a'.repeat(1001)}`))[0], /❌ O texto tem 1001 caracteres: até 1000\./);
});

test('/goodbye: {name} é o nome da agenda (sem menção) de quem saiu', async () => {
    assert.match((await bot.replyAlt('/goodbye -on'))[0], /A mensagem de despedida está ligada/);
    const [e] = await event('group_leave', [CICLANO.jid]);
    assert.equal(e.content, '👋 Ciclano saiu do Família.');
    assert.deepEqual(e.options, {});

    await bot.replyAlt('/goodbye Tchau, {name}!');
    assert.equal((await event('group_leave', ['5521933333333@c.us']))[0].content, 'Tchau, +5521933333333!');

    await bot.replyAlt('/goodbye -off');
    assert.deepEqual(await event('group_leave', [CICLANO.jid]), []);
});

test('fora de grupo', async () => {
    assert.deepEqual(await bot.replyAlt('/welcome Oi', { chat: OTHERAlt.jid }), ['Apenas utilizado dentro de grupos.']);
    assert.deepEqual(await bot.replyAlt('/goodbye -on', { chat: OTHERAlt.jid }), ['Apenas utilizado dentro de grupos.']);
});
