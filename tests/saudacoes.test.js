/*
 * /welcome e /goodbye: a mensagem de entrada e de saída de cada grupo (eventos group_join e group_leave).
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { DONO, GRUPO, OUTRO } = bot;
const CICLANO = { jid: '5521922222222@c.us', nome: 'Ciclano' };

beforeEach(async () => {
    await bot.reiniciar();
    bot.criarContato(CICLANO.jid, CICLANO.nome);
    bot.criarGrupo(GRUPO, 'Família', [DONO.jid, OUTRO.jid, CICLANO.jid]);
});

// O evento do whatsapp-web.js (GroupNotification) e o que o bot enviou por causa dele
async function evento(nome, recipientIds, chatId = GRUPO) {
    const antes = bot.client.enviadas.length;
    for (const h of bot.client.listeners(nome)) await h({ chatId, recipientIds });
    return bot.client.enviadas.slice(antes);
}

test('sem configurar, entrar e sair não manda nada', async () => {
    assert.deepEqual(await evento('group_join', [CICLANO.jid]), []);
    assert.deepEqual(await evento('group_leave', [CICLANO.jid]), []);
});

test('/welcome <texto> liga: {name} vira a menção de quem entrou e {group}, o nome do grupo', async () => {
    const [r] = await bot.responder('/welcome Boas-vindas ao {group}, {name}! 🎉');
    assert.match(r, /^✅ A mensagem de boas-vindas está ligada neste grupo:\n\nBoas-vindas ao \{group\}, \{name\}! 🎉$/);

    const [e] = await evento('group_join', [CICLANO.jid]);
    assert.equal(e.chatId, GRUPO);
    assert.equal(e.content, 'Boas-vindas ao Família, @5521922222222! 🎉');
    assert.deepEqual(e.options.mentions, [CICLANO.jid]);
});

test('mais de uma pessoa entrando: uma mensagem para cada', async () => {
    await bot.responder('/welcome Oi {name}');
    const enviadas = await evento('group_join', [CICLANO.jid, OUTRO.jid]);
    assert.deepEqual(enviadas.map(e => e.content), ['Oi @5521922222222', 'Oi @5521911111111']);
});

test('o bot entrando num grupo não se cumprimenta', async () => {
    await bot.responder('/welcome Oi {name}');
    assert.deepEqual(await evento('group_join', [DONO.jid]), []);
});

test('o texto é por grupo: outro grupo sem a mensagem fica quieto', async () => {
    const OUTRO_GRUPO = '120363000000000002@g.us';
    bot.criarGrupo(OUTRO_GRUPO, 'Trabalho', [DONO.jid]);
    await bot.responder('/welcome Oi {name}');
    assert.deepEqual(await evento('group_join', [CICLANO.jid], OUTRO_GRUPO), []);
});

test('/welcome -on usa o texto padrão do idioma', async () => {
    const [r] = await bot.responder('/welcome -on');
    assert.match(r, /Boas-vindas ao \{group\}, \{name\}!/);
    const [e] = await evento('group_join', [CICLANO.jid]);
    assert.equal(e.content, '👋 Boas-vindas ao Família, @5521922222222!');
});

test('/welcome sem nada mostra a mensagem do grupo (ou diz que não tem)', async () => {
    assert.match((await bot.responder('/welcome'))[0], /Este grupo não tem mensagem de boas-vindas\./);
    await bot.responder('/welcome Oi {name}');
    const [r] = await bot.responder('/welcome');
    assert.match(r, /A mensagem de boas-vindas deste grupo \(ligada\):\n\nOi \{name\}/);
});

test('/welcome -off desliga', async () => {
    await bot.responder('/welcome Oi {name}');
    assert.deepEqual(await bot.responder('/welcome -off'), ['🔕 A mensagem de boas-vindas está desligada neste grupo.']);
    assert.deepEqual(await evento('group_join', [CICLANO.jid]), []);
});

test('/welcome -test manda como ficaria, com você no lugar de quem entra, sem gravar', async () => {
    const [e] = await bot.executar('/welcome -test Oi {name}, bem-vindo ao {group}', { de: DONO.jid });
    assert.equal(e.texto, `Oi @${DONO.user}, bem-vindo ao Família`);
    assert.deepEqual(e.options.mentions, [DONO.jid]);
    assert.match((await bot.responder('/welcome'))[0], /Este grupo não tem mensagem/);
});

test('texto com várias linhas e grande demais', async () => {
    await bot.responder('/welcome Linha 1\nLinha 2 {name}');
    const [e] = await evento('group_join', [CICLANO.jid]);
    assert.equal(e.content, 'Linha 1\nLinha 2 @5521922222222');

    assert.match((await bot.responder(`/welcome ${'a'.repeat(1001)}`))[0], /❌ O texto tem 1001 caracteres: até 1000\./);
});

test('/goodbye: {name} é o nome da agenda (sem menção) de quem saiu', async () => {
    assert.match((await bot.responder('/goodbye -on'))[0], /A mensagem de despedida está ligada/);
    const [e] = await evento('group_leave', [CICLANO.jid]);
    assert.equal(e.content, '👋 Ciclano saiu do Família.');
    assert.deepEqual(e.options, {});

    await bot.responder('/goodbye Tchau, {name}!');
    assert.equal((await evento('group_leave', ['5521933333333@c.us']))[0].content, 'Tchau, +5521933333333!');

    await bot.responder('/goodbye -off');
    assert.deepEqual(await evento('group_leave', [CICLANO.jid]), []);
});

test('fora de grupo', async () => {
    assert.deepEqual(await bot.responder('/welcome Oi', { chat: OUTRO.jid }), ['Apenas utilizado dentro de grupos.']);
    assert.deepEqual(await bot.responder('/goodbye -on', { chat: OUTRO.jid }), ['Apenas utilizado dentro de grupos.']);
});
