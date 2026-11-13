/*
 * /ocr, /tts, /qr, /decodeqr, /carbon e o /profile -set.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const QRCode = require('qrcode');
const jsQR = require('jsqr');

const { DONO, GRUPO, MessageMedia, OUTRO, rede } = bot;
const sharp = require('sharp');

const FOTO = { mimetype: 'image/jpeg', data: 'QUJD' };
const foto = (extras = {}) => bot.criarMensagem({ de: OUTRO.jid, tipo: 'image', midia: FOTO, ...extras });

beforeEach(bot.reiniciar);

describe('/ocr', () => {
    beforeEach(() => bot.setSetting('openai.status', false)); // sem o rodapé de consumo (o padrão é ligado)

    const chat = (texto) => rede.responder('post', 'api.openai.com/v1/chat/completions', { choices: [{ message: { content: texto } }] });

    test('sem a chave da OpenAI', async () => {
        assert.match((await bot.responder('/ocr', { citada: foto() }))[0], /⚠️ API key da OpenAI não encontrada: o \/ocr está desativado/);
    });

    test('sem foto: o uso', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        assert.deepEqual(await bot.responder('/ocr'), ['❌ Responda uma foto com /ocr (ou envie a foto com /ocr na legenda).']);
        assert.equal(rede.chamadas.length, 0);
    });

    test('respondendo uma foto: o texto dela, com a imagem indo para o ChatGPT', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        chat('NOTA FISCAL\nTotal: 10,00');

        const r = await bot.responder('/ocr', { citada: foto() });
        assert.equal(r.at(-1), '📝 NOTA FISCAL\nTotal: 10,00');

        const { messages } = rede.chamadas.at(-1).cfg.body;
        assert.match(messages[0].content, /Você é um OCR/);
        assert.deepEqual(messages[1].content[1], { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } });
    });

    test('a foto com a legenda /ocr também vale; imagem sem texto recebe o aviso', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        chat('NO_TEXT');
        const msg = bot.criarMensagem({ texto: '/ocr', tipo: 'image', midia: FOTO });
        const r = await bot.entregar(msg);
        assert.equal(r.at(-1).texto, '🔎 Nenhum texto encontrado na imagem.');
    });

    test('-s mostra o consumo no rodapé', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        chat('Oi');
        assert.match((await bot.responder('/ocr -s', { citada: foto() })).at(-1), /^📝 Oi\n\n_📡 ⬆️ \d+ B TX/);
    });

    test('o erro da OpenAI vira aviso', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        rede.responder('post', 'api.openai.com/v1/chat/completions', bot.erroHttp(401));
        const r = await bot.executar('/ocr', { citada: foto(), erroEsperado: true });
        assert.match(r.at(-1).texto, /Invalid|inválida|🔑/);
    });
});
