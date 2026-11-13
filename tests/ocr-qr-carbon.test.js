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
