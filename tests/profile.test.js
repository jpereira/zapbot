/*
 * /profile: a foto de perfil do contato, com o nome da sua agenda e o telefone.
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OUTRO, DONO, rede } = bot;
const FOTO = 'https://pps.whatsapp.net/v/foto-do-fulano.jpg';
const bytes = Buffer.from('jpeg-falso');

beforeEach(async () => {
    await bot.reiniciar();
    bot.client.fotos.clear();
});

function comFoto(jid = OUTRO.jid, url = FOTO) {
    bot.client.fotos.set(jid, url);
    rede.responder('get', url, rede.http({ data: bytes, headers: { 'content-type': 'image/jpeg' } }));
}

const ultima = () => bot.client.enviadas.at(-1);

test('foto com a legenda "Contato: nome da agenda <telefone>", por nome, menção e número', async () => {
    comFoto();
    for (const linha of ['/profile /Fulano/', '/profile Fulano', `/profile +${OUTRO.user}`, '/perfil Ful']) {
        const antes = bot.client.enviadas.length;
        await bot.responder(linha);
        const e = ultima();
        assert.equal(bot.client.enviadas.length, antes + 1, linha);
        assert.equal(e.content.mimetype, 'image/jpeg');
        assert.equal(e.content.data, bytes.toString('base64'));
        assert.equal(e.options.caption, `Contato: ${OUTRO.nome} <+${OUTRO.user}>`);
    }
    assert.equal(rede.chamadas.at(-1).cfg.responseType, 'arraybuffer');
});

test('o nome é o da agenda, não o pushname da pessoa', async () => {
    const contato = bot.criarContato(OUTRO.jid, 'Fulano da Agenda');
    contato.pushname = 'fulaninho_99';
    comFoto();
    await bot.responder(`/profile +${OUTRO.user}`);
    assert.equal(ultima().options.caption, `Contato: Fulano da Agenda <+${OUTRO.user}>`);
    bot.criarContato(OUTRO.jid, OUTRO.nome);
});

test('sem ninguém no seu privado: o seu perfil; respondendo uma mensagem: quem a escreveu', async () => {
    comFoto(DONO.jid, 'https://pps.whatsapp.net/v/dono.jpg');
    await bot.responder('/profile', { chat: DONO.jid });
    assert.match(ultima().options.caption, new RegExp(`^Contato: .* <\\+${DONO.user}>$`));

    comFoto();
    const citada = bot.criarMensagem({ texto: 'oi', de: OUTRO.jid });
    await bot.responder('/profile', { citada, chat: DONO.jid });
    assert.equal(ultima().options.caption, `Contato: ${OUTRO.nome} <+${OUTRO.user}>`);
});

test('sem ninguém no privado: a foto da pessoa da conversa', async () => {
    comFoto();
    await bot.responder('/profile', { chat: OUTRO.jid });
    assert.equal(ultima().options.caption, `Contato: ${OUTRO.nome} <+${OUTRO.user}>`);
});

test('sem ninguém no grupo: a foto do grupo; nome vira parâmetro mesmo no grupo', async () => {
    comFoto(bot.GRUPO, 'https://pps.whatsapp.net/v/grupo.jpg');
    await bot.responder('/profile');
    assert.match(ultima().options.caption, /^Grupo: /);
    comFoto();
    await bot.responder('/profile /Fulano/');
    assert.equal(ultima().options.caption, `Contato: ${OUTRO.nome} <+${OUTRO.user}>`);
});

test('várias pessoas: uma foto para cada, sem repetir', async () => {
    comFoto();
    comFoto(DONO.jid, 'https://pps.whatsapp.net/v/dono.jpg');
    const antes = bot.client.enviadas.length;
    await bot.responder(`/profile +${OUTRO.user} +${DONO.user} +${OUTRO.user}`);
    assert.equal(bot.client.enviadas.length - antes, 2);
});

test('sem foto (ou foto privada): só o texto, com o aviso', async () => {
    const [r] = await bot.responder('/profile /Fulano/');
    assert.equal(r, `Contato: ${OUTRO.nome} <+${OUTRO.user}>\n🚫 Sem foto de perfil (ou ela está escondida pela privacidade do contato).`);
});

test('o download da foto falha: cai no texto e registra o erro', async () => {
    bot.client.fotos.set(OUTRO.jid, FOTO);
    rede.responder('get', FOTO, new Error('timeout'));
    const [r] = await bot.responder('/profile /Fulano/', { erroEsperado: true });
    assert.match(r, /^Contato: .*\n🚫 Sem foto de perfil/);
});

test('@lid: o telefone vem do LID; sem telefone conhecido, a legenda fica sem ele', async () => {
    bot.client.lids.set('555@lid', OUTRO.jid);
    comFoto();
    await bot.responder('/profile', { citada: bot.criarMensagem({ texto: 'oi', de: '555@lid' }) });
    assert.match(ultima().options.caption, new RegExp(`<\\+${OUTRO.user}>$`));
});

test('-mask ofusca o telefone; grupo não é contato; é só do dono', async () => {
    comFoto();
    await bot.responder(`/profile -mask +${OUTRO.user}`);
    assert.match(ultima().options.caption, /<\+\d{5}\*+\d{2}>$/);

    bot.criarGrupo('120363000000000200@g.us', 'Grupo sobre L200', [DONO.jid]);
    assert.match((await bot.responder('/profile /Grupo sobre L200/'))[0], /Nenhum contato com "Grupo sobre L200"/);

    const antes = bot.client.enviadas.length;
    assert.deepEqual(await bot.responder('/profile', { de: OUTRO.jid }), []);
    assert.equal(bot.client.enviadas.length, antes);
});
