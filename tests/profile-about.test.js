/*
 * /profile -about: people's message; /profile -set <text>: your message.
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, GROUP, OTHERAlt } = bot;

let messages;

beforeEach(async () => {
    await bot.restart();
    messages = [];
    bot.client.setStatus = async (textAlt) => { messages.push(textAlt); };
    bot.createContact(OTHERAlt.jid, OTHERAlt.nome).getAbout = async () => 'Só para emergências';
});

test('-about: o recado de quem foi pedido (nome, número), com o nome da agenda e o telefone', async () => {
    for (const line of ['/profile -a /Fulano/', '/profile -about +' + OTHERAlt.user]) {
        assert.deepEqual(await bot.replyAlt(line),
            ['📝 Recado de ' + OTHERAlt.nome + ' <+' + OTHERAlt.user + '>: Só para emergências'], line);
    }
});

test('-about: no privado, o da pessoa; respondendo uma mensagem, o de quem a escreveu', async () => {
    assert.match((await bot.replyAlt('/profile -a', { chat: OTHERAlt.jid }))[0], /^📝 Recado de .*: Só para emergências$/);

    const quoted = bot.createMessage({ texto: 'oi', chat: GROUP, de: OTHERAlt.jid });
    assert.match((await bot.replyAlt('/profile -a', { citada: quoted }))[0], /^📝 Recado de .*: Só para emergências$/);
});

test('-about: sem recado (ou escondido), avisa; erro no WhatsApp também vira "sem recado"', async () => {
    bot.client.contatos.get(OTHERAlt.jid).getAbout = async () => null;
    assert.match((await bot.replyAlt('/profile -a /Fulano/'))[0], /^🚫 .* não tem recado/);

    bot.client.contatos.get(OTHERAlt.jid).getAbout = async () => { throw new Error('privado'); };
    assert.match((await bot.replyAlt('/profile -a /Fulano/'))[0], /^🚫 .* não tem recado/);
});

test('-about num grupo, sem ninguém: a descrição do grupo (ou que não tem)', async () => {
    const group = bot.client.chats.get(GROUP);
    group.description = 'Regras: sem spam';
    assert.match((await bot.replyAlt('/profile -a'))[0], /^📝 Descrição do grupo .*: Regras: sem spam$/);
    group.description = '';
    assert.match((await bot.replyAlt('/profile -a'))[0], /^🚫 O grupo .* não tem descrição/);
});

test('-set <texto>, sem imagem: troca o SEU recado', async () => {
    assert.deepEqual(await bot.replyAlt('/profile -s Ocupado até segunda 😴'), ['✅ Seu recado agora é: Ocupado até segunda 😴']);
    assert.deepEqual(messages, ['Ocupado até segunda 😴']);
});

test('-set <texto>: 139 caracteres passa (emoji conta um), 140 não; invisíveis e direção não', async () => {
    assert.match((await bot.replyAlt('/profile -s ' + 'a'.repeat(139)))[0], /^✅/);
    assert.match((await bot.replyAlt('/profile -s ' + '😀'.repeat(139)))[0], /^✅/);
    assert.match((await bot.replyAlt('/profile -s ' + 'a'.repeat(140)))[0], /140 caracteres.*até 139/);
    assert.match((await bot.replyAlt('/profile -s com​invisível'))[0], /não pode ter quebra de linha/);
    assert.match((await bot.replyAlt('/profile -s com‮direção'))[0], /não pode ter quebra de linha/);
    assert.equal(messages.length, 2, 'só os dois válidos foram para o WhatsApp');
});

test('-set <texto>: com uma imagem junto continua trocando a foto', async () => {
    let photo = null;
    bot.client.setProfilePicture = async (mediaAlt) => { photo = mediaAlt; return true; };
    const image = bot.createMessage({ tipo: 'image', midia: { mimetype: 'image/jpeg', data: 'AAAA' } });
    const [r] = await bot.replyAlt('/profile -s legenda qualquer', { citada: image, chat: OWNER.jid });
    assert.match(r, /foto/i);
    assert.equal(photo.data, 'AAAA');
    assert.deepEqual(messages, []);
});

test('-set: falha do WhatsApp avisa; quem não é admin é ignorado', async () => {
    bot.client.setStatus = async () => { throw new Error('boom'); };
    assert.match((await bot.replyAlt('/profile -s oi', { erroEsperado: true }))[0], /boom/);
    assert.deepEqual(await bot.replyAlt('/profile -s oi', { de: OTHERAlt.jid, chat: GROUP }), []);
});
