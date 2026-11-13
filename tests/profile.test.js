/*
 * /profile: the contact's profile photo, with the name from your address book and the phone.
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OTHERAlt, OWNER, network } = bot;
const PHOTO = 'https://pps.whatsapp.net/v/foto-do-fulano.jpg';
const bytes = Buffer.from('jpeg-falso');

beforeEach(async () => {
    await bot.restart();
    bot.client.fotos.clear();
});

function withPhoto(jid = OTHERAlt.jid, url = PHOTO) {
    bot.client.fotos.set(jid, url);
    network.responder('get', url, network.http({ data: bytes, headers: { 'content-type': 'image/jpeg' } }));
}

const last = () => bot.client.enviadas.at(-1);

test('foto com a legenda "Contato: nome da agenda <telefone>", por nome, menção e número', async () => {
    withPhoto();
    for (const line of ['/profile /Fulano/', '/profile Fulano', `/profile +${OTHERAlt.user}`, '/profile Ful']) {
        const beforeAlt = bot.client.enviadas.length;
        await bot.replyAlt(line);
        const e = last();
        assert.equal(bot.client.enviadas.length, beforeAlt + 1, line);
        assert.equal(e.content.mimetype, 'image/jpeg');
        assert.equal(e.content.data, bytes.toString('base64'));
        assert.equal(e.options.caption, `Contato: ${OTHERAlt.nome} <+${OTHERAlt.user}>`);
    }
    assert.equal(network.chamadas.at(-1).cfg.responseType, 'arraybuffer');
});

test('o nome é o da agenda, não o pushname da pessoa', async () => {
    const contactAlt = bot.createContact(OTHERAlt.jid, 'Fulano da Agenda');
    contactAlt.pushname = 'fulaninho_99';
    withPhoto();
    await bot.replyAlt(`/profile +${OTHERAlt.user}`);
    assert.equal(last().options.caption, `Contato: Fulano da Agenda <+${OTHERAlt.user}>`);
    bot.createContact(OTHERAlt.jid, OTHERAlt.nome);
});

test('sem ninguém no seu privado: o seu perfil; respondendo uma mensagem: quem a escreveu', async () => {
    withPhoto(OWNER.jid, 'https://pps.whatsapp.net/v/dono.jpg');
    await bot.replyAlt('/profile', { chat: OWNER.jid });
    assert.match(last().options.caption, new RegExp(`^Contato: .* <\\+${OWNER.user}>$`));

    withPhoto();
    const quoted = bot.createMessage({ texto: 'oi', de: OTHERAlt.jid });
    await bot.replyAlt('/profile', { citada: quoted, chat: OWNER.jid });
    assert.equal(last().options.caption, `Contato: ${OTHERAlt.nome} <+${OTHERAlt.user}>`);
});

test('sem ninguém no privado: a foto da pessoa da conversa', async () => {
    withPhoto();
    await bot.replyAlt('/profile', { chat: OTHERAlt.jid });
    assert.equal(last().options.caption, `Contato: ${OTHERAlt.nome} <+${OTHERAlt.user}>`);
});

test('sem ninguém no grupo: a foto do grupo; nome vira parâmetro mesmo no grupo', async () => {
    withPhoto(bot.GROUP, 'https://pps.whatsapp.net/v/grupo.jpg');
    await bot.replyAlt('/profile');
    assert.match(last().options.caption, /^Grupo: /);
    withPhoto();
    await bot.replyAlt('/profile /Fulano/');
    assert.equal(last().options.caption, `Contato: ${OTHERAlt.nome} <+${OTHERAlt.user}>`);
});

test('várias pessoas: uma foto para cada, sem repetir', async () => {
    withPhoto();
    withPhoto(OWNER.jid, 'https://pps.whatsapp.net/v/dono.jpg');
    const beforeAlt = bot.client.enviadas.length;
    await bot.replyAlt(`/profile +${OTHERAlt.user} +${OWNER.user} +${OTHERAlt.user}`);
    assert.equal(bot.client.enviadas.length - beforeAlt, 2);
});

test('sem foto (ou foto privada): só o texto, com o aviso', async () => {
    const [r] = await bot.replyAlt('/profile /Fulano/');
    assert.equal(r, `Contato: ${OTHERAlt.nome} <+${OTHERAlt.user}>\n🚫 Sem foto de perfil (ou ela está escondida pela privacidade do contato).`);
});

test('o download da foto falha: cai no texto e registra o erro', async () => {
    bot.client.fotos.set(OTHERAlt.jid, PHOTO);
    network.responder('get', PHOTO, new Error('timeout'));
    const [r] = await bot.replyAlt('/profile /Fulano/', { erroEsperado: true });
    assert.match(r, /^Contato: .*\n🚫 Sem foto de perfil/);
});

test('@lid: o telefone vem do LID; sem telefone conhecido, a legenda fica sem ele', async () => {
    bot.client.lids.set('555@lid', OTHERAlt.jid);
    withPhoto();
    await bot.replyAlt('/profile', { citada: bot.createMessage({ texto: 'oi', de: '555@lid' }) });
    assert.match(last().options.caption, new RegExp(`<\\+${OTHERAlt.user}>$`));
});

test('-mask ofusca o telefone; grupo não é contato; é só do dono', async () => {
    withPhoto();
    await bot.replyAlt(`/profile -mask +${OTHERAlt.user}`);
    assert.match(last().options.caption, /<\+\d{5}\*+\d{2}>$/);

    bot.createGroup('120363000000000200@g.us', 'Grupo sobre L200', [OWNER.jid]);
    assert.match((await bot.replyAlt('/profile /Grupo sobre L200/'))[0], /Nenhum contato com "Grupo sobre L200"/);

    const beforeAlt = bot.client.enviadas.length;
    assert.deepEqual(await bot.replyAlt('/profile', { de: OTHERAlt.jid }), []);
    assert.equal(bot.client.enviadas.length, beforeAlt);
});
