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

describe('/tts', () => {
    beforeEach(() => bot.setSetting('openai.status', false));

    test('sem a chave, sem texto e o texto vira nota de voz (como o /gpt -voz)', async () => {
        assert.match((await bot.responder('/tts oi'))[0], /⚠️ API key da OpenAI não encontrada: o \/tts está desativado/);

        await bot.setSetting('openai.api.key', 'sk-teste');
        assert.deepEqual(await bot.responder('/tts'), ['❌ Use: /tts <texto> (ou responda uma mensagem de texto)']);

        rede.responder('post', 'api.openai.com/v1/audio/speech', Buffer.from('OGGDATA'));
        const r = (await bot.executar('/tts Bom dia!')).at(-1);
        assert.ok(r.content instanceof MessageMedia);
        assert.equal(r.content.mimetype, 'audio/ogg; codecs=opus');
        assert.equal(r.options.sendAudioAsVoice, true);
        assert.equal(rede.chamadas.at(-1).cfg.body.input, 'Bom dia!');
    });

    test('respondendo um texto: fala a mensagem, e o que foi digitado é o estilo', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        rede.responder('post', 'api.openai.com/v1/audio/speech', Buffer.from('OGGDATA'));
        const citada = bot.criarMensagem({ texto: 'Olá, mundo', de: OUTRO.jid });

        await bot.executar('/tts fale devagar', { citada });
        const { body } = rede.chamadas.at(-1).cfg;
        assert.equal(body.input, 'Olá, mundo');
        assert.equal(body.instructions, 'fale devagar');
    });

    test('texto grande demais', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        assert.match((await bot.responder(`/tts ${'a'.repeat(4097)}`))[0], /❌ O texto tem 4097 caracteres: a voz aceita até 4096\./);
    });
});
