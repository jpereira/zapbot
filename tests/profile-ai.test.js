/*
 * -profile|-p of /draw and /gpt: the profile photo of one or more people along with the request images.
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { MessageMedia, OTHERAlt, OWNER, GROUP, network } = bot;
const PHOTO_PROFILE = 'https://pps.whatsapp.net/v/perfil-fulano.jpg';
const PNG_4X2 = Buffer.from('png:4x2').toString('base64');
const IMG = 'api.openai.com/v1/images/edits';

beforeEach(async () => {
    await bot.restart();
    bot.src('commands/profileInAi').restartNames();
    await bot.setSetting('gpt.api.key', 'sk-teste');
    bot.client.fotos.clear();
    bot.client.fotos.set(OTHERAlt.jid, PHOTO_PROFILE);
    network.responder('get', PHOTO_PROFILE, network.http({ data: Buffer.from('jpeg-falso'), headers: { 'content-type': 'image/jpeg' } }));
    network.responder('post', IMG, { data: [{ b64_json: 'RURJVA==' }] });
});

const photo = () => bot.createMessage({ de: OTHERAlt.jid, tipo: 'image', midia: { mimetype: 'image/jpeg', data: PNG_4X2 } });
const last = () => network.chamadas.at(-1).cfg.body;

test('/draw -p /Pessoa/ pedido: só a foto de perfil vai (campo image) e o pedido não leva o nome', async () => {
    const sentAlt2 = await bot.executar('/draw -p /Fulano/ desenhe ele como astronauta');
    assert.ok(sentAlt2.some(e => e.content instanceof MessageMedia));
    const form = last();
    assert.equal(network.chamadas.at(-1).url, 'https://api.openai.com/v1/images/edits');
    assert.equal(form.getAll('image').length, 1);
    assert.match(form.get('prompt'), /^desenhe ele como astronauta\n\nImagens anexadas, nesta ordem: 1\) a foto de perfil de Fulano\.$/);
});

test('respondendo uma foto: a foto da mensagem primeiro e depois o perfil (image[])', async () => {
    await bot.executar('/draw -p /Fulano/ ponha essa pessoa na foto', { citada: photo() });
    const form = last();
    assert.equal(form.getAll('image[]').length, 2);
    assert.match(form.get('prompt'), /1\) a foto da mensagem; 2\) a foto de perfil de Fulano\./);
});

test('sem pessoa: no privado, a do chat; no grupo, quem escreveu a mensagem respondida; sem resposta, erro', async () => {
    await bot.executar('/draw -p crie um gif desse cachorro', { chat: OTHERAlt.jid, de: OWNER.jid });
    assert.match(last().get('prompt'), /foto de perfil de Fulano/);

    const [errorAlt] = await bot.replyAlt('/draw -p desenhe', { chat: GROUP });
    assert.match(errorAlt, /No grupo, o \/draw -p precisa de alguém/);

    await bot.executar('/draw -p desenhe', { chat: GROUP, citada: photo() });
    assert.match(last().get('prompt'), /foto de perfil de Fulano/);
});

test('quem esconde a foto é recusado, e nada vai para a OpenAI', async () => {
    bot.client.fotos.clear();
    const beforeAlt = network.chamadas.length;
    const [r] = await bot.replyAlt('/draw -p /Fulano/ desenhe');
    assert.match(r, /🙈 Fulano não tem foto de perfil que eu consiga ver/);
    assert.equal(network.chamadas.length, beforeAlt);
});

test('/draw -g -p: o GIF parte das fotos (a de perfil como base)', async () => {
    await bot.executar('/draw -g -p /Fulano/ aplicando uma injeção');
    const form = last();
    assert.equal(form.get('output_format'), 'gif');
    assert.match(form.get('prompt'), /aplicando uma injeção/);
    assert.equal(form.getAll('image').length, 1);
});

test('/gpt -p /Pessoa/ pergunta: as imagens vão na conversa (foto respondida e perfil); -img também', async () => {
    network.responder('post', 'api.openai.com/v1/chat/completions', { choices: [{ message: { content: 'Um homem sorrindo.' } }] });
    const r = (await bot.executar('/gpt -p /Fulano/ descreva essa pessoa')).at(-1);
    assert.match(r.texto, /Um homem sorrindo\./);
    const { body } = network.chamadas.at(-1).cfg;
    const partsAlt = body.messages.at(-1).content;
    assert.equal(partsAlt.filter(p => p.type === 'image_url').length, 1);
    assert.match(partsAlt[0].text, /^descreva essa pessoa\n\nImagens anexadas, nesta ordem: 1\) a foto de perfil de Fulano\.$/);

    await bot.executar('/gpt -p /Fulano/ o que há de diferente?', { citada: photo() });
    assert.equal(network.chamadas.at(-1).cfg.body.messages.at(-1).content.filter(p => p.type === 'image_url').length, 2);

    await bot.executar('/gpt -img -p /Fulano/ ponha um chapéu nele');
    assert.match(last().get('prompt'), /^ponha um chapéu nele\n\nImagens anexadas/);
});

test('sem o -p nada muda: uma imagem só, sem o contexto', async () => {
    await bot.executar('/draw ponha um chapéu', { citada: photo() });
    const form = last();
    assert.equal(form.getAll('image').length, 1);
    assert.equal(form.get('prompt'), 'ponha um chapéu');
});

test('-p com vários contatos: uma imagem por pessoa, na ordem (e a foto respondida primeiro), no /draw e no /gpt', async () => {
    const jid2 = '5521922222222@c.us';
    const jid3 = '5521933333333@c.us';
    for (const [jid, nameAlt] of [[jid2, 'Beltrano'], [jid3, 'Sicrano']]) {
        bot.createContact(jid, nameAlt);
        const url = 'https://pps.whatsapp.net/v/perfil-' + nameAlt + '.jpg';
        bot.client.fotos.set(jid, url);
        network.responder('get', url, network.http({ data: Buffer.from('jpeg-' + nameAlt), headers: { 'content-type': 'image/jpeg' } }));
    }

    await bot.executar('/draw -p /Fulano/ /Beltrano/ desenhe os dois numa festa');
    let form = last();
    assert.equal(form.getAll('image[]').length, 2);
    assert.match(form.get('prompt'), /^desenhe os dois numa festa\n\nImagens anexadas, nesta ordem: 1\) a foto de perfil de Fulano; 2\) a foto de perfil de Beltrano\.$/);

    // by number and with a message's photo along: it comes first
    await bot.executar('/draw -p /Fulano/ +5521922222222 +5521933333333 os três no sofá', { citada: photo() });
    form = last();
    assert.equal(form.getAll('image[]').length, 4);
    assert.match(form.get('prompt'), /1\) a foto da mensagem; 2\) a foto de perfil de Fulano; 3\) a foto de perfil de Beltrano; 4\) a foto de perfil de Sicrano\./);

    // the same contact twice counts as one
    await bot.executar('/draw -p /Fulano/ /Fulano/ ele sozinho');
    assert.equal(last().getAll('image').length, 1);

    // /gpt: one image_url per person
    network.responder('post', 'api.openai.com/v1/chat/completions', { choices: [{ message: { content: 'Dois amigos.' } }] });
    await bot.executar('/gpt -p /Fulano/ /Beltrano/ quem são?');
    const partsAlt = network.chamadas.at(-1).cfg.body.messages.at(-1).content;
    assert.equal(partsAlt.filter(p => p.type === 'image_url').length, 2);
    assert.match(partsAlt[0].text, /1\) a foto de perfil de Fulano; 2\) a foto de perfil de Beltrano\./);
});

test('-p com os nomes soltos, sem barras: fulano beltrano, e a foto respondida junto', async () => {
    const jid2 = '5521922222222@c.us';
    bot.createContact(jid2, 'Beltrano da Silva');
    bot.client.fotos.set(jid2, 'https://pps.whatsapp.net/v/perfil-beltrano.jpg');
    network.responder('get', 'https://pps.whatsapp.net/v/perfil-beltrano.jpg', network.http({ data: Buffer.from('jpeg-b'), headers: { 'content-type': 'image/jpeg' } }));

    // without accents, in any case; the first word that is not a contact starts the request
    await bot.executar('/draw -p fulano BELTRANO desenhe os dois numa festa');
    let form = last();
    assert.equal(form.getAll('image[]').length, 2);
    assert.match(form.get('prompt'), /^desenhe os dois numa festa\n\nImagens anexadas, nesta ordem: 1\) a foto de perfil de Fulano; 2\) a foto de perfil de Beltrano da Silva\.$/);

    // a contact's whole name (with spaces) too, and along with the replied photo
    await bot.executar('/draw -p Fulano Beltrano da Silva ponha eles nessa foto', { citada: photo() });
    form = last();
    assert.equal(form.getAll('image[]').length, 3);
    assert.match(form.get('prompt'), /^ponha eles nessa foto\n\nImagens anexadas, nesta ordem: 1\) a foto da mensagem; 2\) a foto de perfil de Fulano; 3\) a foto de perfil de Beltrano da Silva\.$/);

    // mixing: loose name, /Name/ and number; -p in the middle of the options
    await bot.executar('/draw -g -p fulano /Beltrano da Silva/ +' + OTHERAlt.user + ' eles dançando');
    assert.equal(last().getAll('image[]').length, 2, 'o Fulano duas vezes vale uma');
    assert.match(last().get('prompt'), /eles dançando\n\nImagens anexadas/);

    // a request that starts with a common word (that is not a contact): only -p with nobody
    await bot.executar('/draw -p desenhe essa pessoa de astronauta', { chat: OTHERAlt.jid });
    assert.equal(last().getAll('image').length, 1);
    assert.match(last().get('prompt'), /^desenhe essa pessoa de astronauta\n\nImagens anexadas, nesta ordem: 1\) a foto de perfil de Fulano\.$/);

    // /gpt too
    network.responder('post', 'api.openai.com/v1/chat/completions', { choices: [{ message: { content: 'Dois amigos.' } }] });
    await bot.executar('/gpt -p fulano beltrano quem são eles?');
    const partsAlt = network.chamadas.at(-1).cfg.body.messages.at(-1).content;
    assert.equal(partsAlt.filter(p => p.type === 'image_url').length, 2);
    assert.match(partsAlt[0].text, /^quem são eles\?\n\n/);
});

test('-p @me e $me: a sua própria foto, sozinha ou com os outros, e sem duplicar', async () => {
    const PHOTO_OWNER = 'https://pps.whatsapp.net/v/perfil-dono.jpg';
    bot.client.fotos.set(OWNER.jid, PHOTO_OWNER);
    network.responder('get', PHOTO_OWNER, network.http({ data: Buffer.from('jpeg-dono'), headers: { 'content-type': 'image/jpeg' } }));

    for (const eu of ['@me', '$me', '@ME']) {
        await bot.executar('/draw -p ' + eu + ' me desenhe como cavaleiro', { chat: GROUP });
        const form = last();
        assert.equal(form.getAll('image').length, 1, eu);
        assert.match(form.get('prompt'), /^me desenhe como cavaleiro\n\nImagens anexadas, nesta ordem: 1\) a foto de perfil de /, eu);
    }

    // with one friend, in the typed order, and a repeated @me counts as one
    await bot.executar('/draw -p @me fulano $me nós dois de piratas');
    const form = last();
    assert.equal(form.getAll('image[]').length, 2);
    assert.match(form.get('prompt'), /^nós dois de piratas\n\n/);

    // /gpt too
    network.responder('post', 'api.openai.com/v1/chat/completions', { choices: [{ message: { content: 'Você está sorrindo.' } }] });
    await bot.executar('/gpt -p @me como eu estou?');
    const partsAlt = network.chamadas.at(-1).cfg.body.messages.at(-1).content;
    assert.equal(partsAlt.filter(p => p.type === 'image_url').length, 1);
    assert.match(partsAlt[0].text, /^como eu estou\?\n\n/);
});

test('-p @this e $this: o chat (a outra pessoa no privado, a foto do grupo no grupo), junto com o @me e os outros', async () => {
    bot.client.fotos.set(OWNER.jid, 'https://pps.whatsapp.net/v/perfil-dono.jpg');
    network.responder('get', 'https://pps.whatsapp.net/v/perfil-dono.jpg', network.http({ data: Buffer.from('jpeg-dono'), headers: { 'content-type': 'image/jpeg' } }));

    // in private: the other one, and a repeated @this (or -p alone) counts as one
    await bot.executar('/draw -p @me @this $THIS nós dois de piratas', { chat: OTHERAlt.jid, de: OWNER.jid });
    const form = last();
    assert.equal(form.getAll('image[]').length, 2);
    assert.match(form.get('prompt'), /^nós dois de piratas\n\nImagens anexadas, nesta ordem: 1\) a foto de perfil de .*; 2\) a foto de perfil de Fulano\./);

    // in the group: the group's own photo, with or without a reply
    bot.client.fotos.set(GROUP, 'https://pps.whatsapp.net/v/perfil-grupo.jpg');
    network.responder('get', 'https://pps.whatsapp.net/v/perfil-grupo.jpg', network.http({ data: Buffer.from('jpeg-grupo'), headers: { 'content-type': 'image/jpeg' } }));
    await bot.executar('/draw -p @this desenhe o logo deste grupo', { chat: GROUP });
    assert.match(last().get('prompt'), /^desenhe o logo deste grupo\n\nImagens anexadas, nesta ordem: 1\) a foto de perfil de /);

    // group without a photo: refused, nothing goes to OpenAI
    bot.client.fotos.delete(GROUP);
    const beforeAlt = network.chamadas.length;
    const [without] = await bot.replyAlt('/draw -p @this desenhe', { chat: GROUP });
    assert.match(without, /não tem foto de perfil|has no profile photo/);
    assert.equal(network.chamadas.length, beforeAlt);
});

test('sem o -p: @me/$me e @this/$this no começo do pedido valem o -p (e uma @menção solta continua texto)', async () => {
    bot.client.fotos.set(OWNER.jid, 'https://pps.whatsapp.net/v/perfil-dono.jpg');
    network.responder('get', 'https://pps.whatsapp.net/v/perfil-dono.jpg', network.http({ data: Buffer.from('jpeg-dono'), headers: { 'content-type': 'image/jpeg' } }));

    await bot.executar('/draw @me @this desenhe nós dois como piratas', { chat: OTHERAlt.jid, de: OWNER.jid });
    let form = last();
    assert.equal(form.getAll('image[]').length, 2);
    assert.match(form.get('prompt'), /^desenhe nós dois como piratas\n\nImagens anexadas, nesta ordem: 1\) a foto de perfil de .*; 2\) a foto de perfil de Fulano\./);

    // with another option in front, and with $
    await bot.executar('/draw -g $me $this nós dois dançando', { chat: OTHERAlt.jid, de: OWNER.jid });
    form = last();
    assert.equal(form.getAll('image[]').length, 2);
    assert.match(form.get('prompt'), /nós dois dançando\n\nImagens anexadas/);

    // /gpt too
    network.responder('post', 'api.openai.com/v1/chat/completions', { choices: [{ message: { content: 'Vocês combinam.' } }] });
    await bot.executar('/gpt @me @this o que temos em comum?', { chat: OTHERAlt.jid, de: OWNER.jid });
    const partsAlt = network.chamadas.at(-1).cfg.body.messages.at(-1).content;
    assert.equal(partsAlt.filter(p => p.type === 'image_url').length, 2);
    assert.match(partsAlt[0].text, /^o que temos em comum\?\n\n/);

    // in the middle of the text, or any @mention: no profile photo (it goes through generation, without images)
    network.responder('post', 'api.openai.com/v1/images/generations', { data: [{ b64_json: 'RURJVA==' }] });
    await bot.executar('/draw desenhe @me de astronauta', { chat: OTHERAlt.jid, de: OWNER.jid });
    assert.equal(network.chamadas.at(-1).cfg.body.prompt, 'desenhe @me de astronauta');
    await bot.executar('/draw @Fulano de astronauta', { chat: OTHERAlt.jid, de: OWNER.jid });
    assert.equal(network.chamadas.at(-1).cfg.body.prompt, '@Fulano de astronauta');
});

test('imagem pronta: o aviso "Processando" vira "Imagem gerada abaixo" (e fica), e a imagem vem depois', async () => {
    network.responder('post', 'api.openai.com/v1/images/generations', { data: [{ b64_json: 'RURJVA==' }] });
    const sentAlt2 = await bot.executar('/draw um gato astronauta');
    const notice = bot.client.enviadas.find(e => e.editada);
    assert.ok(notice, 'o aviso foi editado, não apagado');
    assert.equal(notice.content, '🖼️ Imagem gerada abaixo.');
    assert.equal(notice.deleted, undefined);
    const posNotice = bot.client.enviadas.indexOf(notice);
    const posImage = bot.client.enviadas.findIndex(e => e.content instanceof MessageMedia);
    assert.ok(posImage > posNotice, 'a imagem sai depois do aviso');
    assert.equal(sentAlt2.filter(e => e.content instanceof MessageMedia).length, 1);
});
