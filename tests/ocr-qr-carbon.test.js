/*
 * /ocr, /tts, /qr, /decodeqr, /carbon e o /profile -set.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const QRCode = require('qrcode');
const jsQR = require('jsqr');

const { OWNER, GROUP, MessageMedia, OTHERAlt, network } = bot;
const sharp = require('sharp');

const PHOTO = { mimetype: 'image/jpeg', data: 'QUJD' };
const photo = (extras = {}) => bot.createMessage({ de: OTHERAlt.jid, tipo: 'image', midia: PHOTO, ...extras });

beforeEach(bot.restart);

describe('/ocr', () => {
    beforeEach(() => bot.setSetting('openai.status', false)); // without the usage footer (the default is on)

    const chat = (textAlt) => network.responder('post', 'api.openai.com/v1/chat/completions', { choices: [{ message: { content: textAlt } }] });

    test('sem a chave da OpenAI', async () => {
        assert.match((await bot.replyAlt('/ocr', { citada: photo() }))[0], /⚠️ API key da OpenAI não encontrada: o \/ocr está desativado/);
    });

    test('sem foto: o uso', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        assert.deepEqual(await bot.replyAlt('/ocr'), ['❌ Responda uma foto com /ocr (ou envie a foto com /ocr na legenda).']);
        assert.equal(network.chamadas.length, 0);
    });

    test('respondendo uma foto: o texto dela, com a imagem indo para o ChatGPT', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        chat('NOTA FISCAL\nTotal: 10,00');

        const r = await bot.replyAlt('/ocr', { citada: photo() });
        assert.equal(r.at(-1), '📝 NOTA FISCAL\nTotal: 10,00');

        const { messages } = network.chamadas.at(-1).cfg.body;
        assert.match(messages[0].content, /Você é um OCR/);
        assert.deepEqual(messages[1].content[1], { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } });
    });

    test('a foto com a legenda /ocr também vale; imagem sem texto recebe o aviso', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        chat('NO_TEXT');
        const msg = bot.createMessage({ texto: '/ocr', tipo: 'image', midia: PHOTO });
        const r = await bot.deliver(msg);
        assert.equal(r.at(-1).texto, '🔎 Nenhum texto encontrado na imagem.');
    });

    test('-s mostra o consumo no rodapé', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        chat('Oi');
        assert.match((await bot.replyAlt('/ocr -s', { citada: photo() })).at(-1), /^📝 Oi\n\n_📡 ⬆️ \d+ B TX/);
    });

    test('o erro da OpenAI vira aviso', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        network.responder('post', 'api.openai.com/v1/chat/completions', bot.errorHttp(401));
        const r = await bot.executar('/ocr', { citada: photo(), erroEsperado: true });
        assert.match(r.at(-1).texto, /Invalid|inválida|🔑/);
    });
});

describe('/tts', () => {
    beforeEach(() => bot.setSetting('openai.status', false));

    test('sem a chave, sem texto e o texto vira nota de voz (como o /gpt -voz)', async () => {
        assert.match((await bot.replyAlt('/tts oi'))[0], /⚠️ API key da OpenAI não encontrada: o \/tts está desativado/);

        await bot.setSetting('openai.api.key', 'sk-teste');
        assert.deepEqual(await bot.replyAlt('/tts'), ['❌ Use: /tts <texto> (ou responda uma mensagem de texto)']);

        network.responder('post', 'api.openai.com/v1/audio/speech', Buffer.from('OGGDATA'));
        const r = (await bot.executar('/tts Bom dia!')).at(-1);
        assert.ok(r.content instanceof MessageMedia);
        assert.equal(r.content.mimetype, 'audio/ogg; codecs=opus');
        assert.equal(r.options.sendAudioAsVoice, true);
        assert.equal(network.chamadas.at(-1).cfg.body.input, 'Bom dia!');
    });

    test('respondendo um texto: fala a mensagem, e o que foi digitado é o estilo', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        network.responder('post', 'api.openai.com/v1/audio/speech', Buffer.from('OGGDATA'));
        const quoted = bot.createMessage({ texto: 'Olá, mundo', de: OTHERAlt.jid });

        await bot.executar('/tts fale devagar', { citada: quoted });
        const { body } = network.chamadas.at(-1).cfg;
        assert.equal(body.input, 'Olá, mundo');
        assert.equal(body.instructions, 'fale devagar');
    });

    test('texto grande demais', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        assert.match((await bot.replyAlt(`/tts ${'a'.repeat(4097)}`))[0], /❌ O texto tem 4097 caracteres: a voz aceita até 4096\./);
    });
});

// The RGBA pixels of a QR Code (what sharp would return from its photo)
function pixelsDoQr(textAlt, scale = 4) {
    const { size, data } = QRCode.create(textAlt).modules;
    const side = (size + 8) * scale;
    const rgba = new Uint8ClampedArray(side * side * 4).fill(255);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (!data[y * size + x]) continue;
        for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
            const i = (((y + 4) * scale + dy) * side + (x + 4) * scale + dx) * 4;
            rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
        }
    }
    return { data: Buffer.from(rgba), width: side, height: side };
}

describe('/qr e /decodeqr', () => {
    test('/qr <texto>: a imagem PNG do QR Code, que o jsqr lê de volta', async () => {
        const r = (await bot.executar('/qr https://exemplo.com/a?b=1')).at(-1);
        assert.ok(r.content instanceof MessageMedia);
        assert.equal(r.content.mimetype, 'image/png');
        assert.equal(r.content.filename, 'qrcode.png');
        const png = Buffer.from(r.content.data, 'base64');
        assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);

        // The text is the command's (the PNG is what the qrcode library generates; here we check pixelsDoQr, used below)
        const { data, width, height } = pixelsDoQr('https://exemplo.com/a?b=1');
        assert.equal(jsQR(new Uint8ClampedArray(data), width, height).data, 'https://exemplo.com/a?b=1');
    });

    test('sem texto: o da mensagem respondida; sem nada, o uso; grande demais', async () => {
        const quoted = bot.createMessage({ texto: 'meu texto', de: OTHERAlt.jid });
        assert.ok((await bot.executar('/qr', { citada: quoted })).at(-1).content instanceof MessageMedia);
        assert.match((await bot.replyAlt('/qr'))[0], /^❌ Use: \/qr <texto>/);
        assert.match((await bot.replyAlt(`/qr ${'a'.repeat(1001)}`))[0], /❌ O texto tem 1001 caracteres: o QR Code aceita até 1000\./);
    });

    test('/qr -d e /decodeqr leem o QR Code de uma foto', async () => {
        sharp.pixels = pixelsDoQr('https://exemplo.com/lido');
        assert.deepEqual(await bot.replyAlt('/qr -d', { citada: photo() }), ['📱 https://exemplo.com/lido']);
        assert.deepEqual(await bot.replyAlt('/decodeqr', { citada: photo() }), ['📱 https://exemplo.com/lido']);

        // The photo with the caption
        const msg = bot.createMessage({ texto: '/decodeqr', tipo: 'image', midia: PHOTO });
        assert.equal((await bot.deliver(msg)).at(-1).texto, '📱 https://exemplo.com/lido');
    });

    test('/decodeqr -e gera (igual ao /qr)', async () => {
        const r = (await bot.executar('/decodeqr -e oi')).at(-1);
        assert.ok(r.content instanceof MessageMedia);
        assert.equal(r.content.mimetype, 'image/png');
    });

    test('foto sem QR Code, sem foto e sem conseguir baixar', async () => {
        sharp.pixels = { data: Buffer.alloc(40 * 40 * 4, 255), width: 40, height: 40 };
        assert.deepEqual(await bot.replyAlt('/qr -d', { citada: photo() }), ['🔎 Nenhum QR Code encontrado na imagem.']);
        assert.match((await bot.replyAlt('/decodeqr'))[0], /^❌ Responda a foto de um QR Code com \/decodeqr/);
        assert.deepEqual(await bot.replyAlt('/qr -d', { citada: photo({ midia: PHOTO, extras: { downloadMedia: async () => null } }) }),
            ['❌ Não consegui baixar a imagem.']);
    });
});
