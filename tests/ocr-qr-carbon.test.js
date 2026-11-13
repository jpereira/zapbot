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

// Os pixels RGBA de um QR Code (o que o sharp devolveria da foto dele)
function pixelsDoQr(texto, escala = 4) {
    const { size, data } = QRCode.create(texto).modules;
    const lado = (size + 8) * escala;
    const rgba = new Uint8ClampedArray(lado * lado * 4).fill(255);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (!data[y * size + x]) continue;
        for (let dy = 0; dy < escala; dy++) for (let dx = 0; dx < escala; dx++) {
            const i = (((y + 4) * escala + dy) * lado + (x + 4) * escala + dx) * 4;
            rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
        }
    }
    return { data: Buffer.from(rgba), width: lado, height: lado };
}

describe('/qr e /decodeqr', () => {
    test('/qr <texto>: a imagem PNG do QR Code, que o jsqr lê de volta', async () => {
        const r = (await bot.executar('/qr https://exemplo.com/a?b=1')).at(-1);
        assert.ok(r.content instanceof MessageMedia);
        assert.equal(r.content.mimetype, 'image/png');
        assert.equal(r.content.filename, 'qrcode.png');
        const png = Buffer.from(r.content.data, 'base64');
        assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);

        // O texto é o do comando (o PNG é o que a biblioteca qrcode gera; aqui conferimos o pixelsDoQr, usado abaixo)
        const { data, width, height } = pixelsDoQr('https://exemplo.com/a?b=1');
        assert.equal(jsQR(new Uint8ClampedArray(data), width, height).data, 'https://exemplo.com/a?b=1');
    });

    test('sem texto: o da mensagem respondida; sem nada, o uso; grande demais', async () => {
        const citada = bot.criarMensagem({ texto: 'meu texto', de: OUTRO.jid });
        assert.ok((await bot.executar('/qr', { citada })).at(-1).content instanceof MessageMedia);
        assert.match((await bot.responder('/qr'))[0], /^❌ Use: \/qr <texto>/);
        assert.match((await bot.responder(`/qr ${'a'.repeat(1001)}`))[0], /❌ O texto tem 1001 caracteres: o QR Code aceita até 1000\./);
    });

    test('/qr -d e /decodeqr leem o QR Code de uma foto', async () => {
        sharp.pixels = pixelsDoQr('https://exemplo.com/lido');
        assert.deepEqual(await bot.responder('/qr -d', { citada: foto() }), ['📱 https://exemplo.com/lido']);
        assert.deepEqual(await bot.responder('/decodeqr', { citada: foto() }), ['📱 https://exemplo.com/lido']);

        // A foto com a legenda
        const msg = bot.criarMensagem({ texto: '/decodeqr', tipo: 'image', midia: FOTO });
        assert.equal((await bot.entregar(msg)).at(-1).texto, '📱 https://exemplo.com/lido');
    });

    test('/decodeqr -e gera (igual ao /qr)', async () => {
        const r = (await bot.executar('/decodeqr -e oi')).at(-1);
        assert.ok(r.content instanceof MessageMedia);
        assert.equal(r.content.mimetype, 'image/png');
    });

    test('foto sem QR Code, sem foto e sem conseguir baixar', async () => {
        sharp.pixels = { data: Buffer.alloc(40 * 40 * 4, 255), width: 40, height: 40 };
        assert.deepEqual(await bot.responder('/qr -d', { citada: foto() }), ['🔎 Nenhum QR Code encontrado na imagem.']);
        assert.match((await bot.responder('/decodeqr'))[0], /^❌ Responda a foto de um QR Code com \/decodeqr/);
        assert.deepEqual(await bot.responder('/qr -d', { citada: foto({ midia: FOTO, extras: { downloadMedia: async () => null } }) }),
            ['❌ Não consegui baixar a imagem.']);
    });
});

describe('/carbon', () => {
    const { montarSvg, linhasDoCodigo } = bot.src('carbon');

    test('o código vira uma imagem PNG (SVG desenhado pelo sharp)', async () => {
        sharp.entradas.length = 0;
        const r = (await bot.executar('/carbon const x = 42; // oi')).at(-1);
        assert.ok(r.content instanceof MessageMedia);
        assert.equal(r.content.mimetype, 'image/png');
        assert.equal(r.content.filename, 'carbon.png');

        const svg = sharp.entradas.at(-1).toString();
        assert.match(svg, /^<svg /);
        assert.match(svg, /fill="#cba6f7">const<\/tspan>/);     // palavra-chave
        assert.match(svg, /fill="#fab387">42<\/tspan>/);        // número
        assert.match(svg, /fill="#6c7086">\/\/ oi<\/tspan>/);   // comentário
    });

    test('-theme|-t só vale no começo; tema desconhecido', async () => {
        sharp.entradas.length = 0;
        await bot.executar('/carbon -t light print(1)');
        assert.match(sharp.entradas.at(-1).toString(), /fill="#fafafa"/);

        // um "-t" no meio é código
        await bot.executar('/carbon ls -t x');
        assert.match(sharp.entradas.at(-1).toString(), /fill="#1e1e2e"/);
        assert.match(sharp.entradas.at(-1).toString(), /ls -t x/);

        assert.deepEqual(await bot.responder('/carbon -t neon x'), ['❌ Tema "neon" desconhecido. Disponíveis: dark, light.']);
    });

    test('sem código: o da mensagem respondida; sem nada, o uso', async () => {
        sharp.entradas.length = 0;
        const citada = bot.criarMensagem({ texto: 'let a = 1;', de: OUTRO.jid });
        await bot.executar('/carbon', { citada });
        assert.match(sharp.entradas.at(-1).toString(), /let<\/tspan> a = <tspan fill="#fab387">1/);
        assert.match((await bot.responder('/carbon'))[0], /^❌ Use: \/carbon /);
    });

    test('a cerca do Markdown sai, o texto é escapado e os limites valem', () => {
        assert.deepEqual(linhasDoCodigo('```js\na < b\n\tb\n```'), ['a < b', '    b']);
        assert.match(montarSvg('if (a < b && "x") {}'), /a &lt; b &amp;&amp; <tspan fill="#a6e3a1">&quot;x&quot;<\/tspan>/);
        assert.equal(linhasDoCodigo(Array(100).fill('x').join('\n')).length, 60);
        assert.equal(linhasDoCodigo('y'.repeat(500))[0].length, 120);
    });
});
