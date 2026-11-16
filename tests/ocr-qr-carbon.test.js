/*
 * /ocr, /tts, /qr, /carbon e o /profile -set.
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
    beforeEach(() => bot.setSetting('gpt.status', false)); // without the usage footer (the default is on)

    const chat = (textAlt) => network.responder('post', 'api.openai.com/v1/chat/completions', { choices: [{ message: { content: textAlt } }] });

    test('sem a chave da OpenAI', async () => {
        assert.match((await bot.replyAlt('/ocr', { citada: photo() }))[0], /⚠️ API key da OpenAI não encontrada: o \/ocr está desativado/);
    });

    test('sem foto: o uso', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        assert.deepEqual(await bot.replyAlt('/ocr'), ['Responda uma foto com /ocr (ou envie a foto com /ocr na legenda).\n💡 _/ocr -h para ajuda_']);
        assert.equal(network.chamadas.length, 0);
    });

    test('respondendo uma foto: o texto dela, com a imagem indo para o ChatGPT', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        chat('NOTA FISCAL\nTotal: 10,00');

        const r = await bot.replyAlt('/ocr', { citada: photo() });
        assert.equal(r.at(-1), '📝 NOTA FISCAL\nTotal: 10,00');

        const { messages } = network.chamadas.at(-1).cfg.body;
        assert.match(messages[0].content, /Você é um OCR/);
        assert.deepEqual(messages[1].content[1], { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } });
    });

    test('a foto com a legenda /ocr também vale; imagem sem texto recebe o aviso', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        chat('NO_TEXT');
        const msg = bot.createMessage({ texto: '/ocr', tipo: 'image', midia: PHOTO });
        const r = await bot.deliver(msg);
        assert.equal(r.at(-1).texto, '🔎 Nenhum texto encontrado na imagem.');
    });

    test('-s mostra o consumo no rodapé', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        chat('Oi');
        assert.match((await bot.replyAlt('/ocr -s', { citada: photo() })).at(-1), /^📝 Oi\n\n_📡 ⬆️ \d+ B TX/);
    });

    test('o erro da OpenAI vira aviso', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        network.responder('post', 'api.openai.com/v1/chat/completions', bot.errorHttp(401));
        const r = await bot.executar('/ocr', { citada: photo(), erroEsperado: true });
        assert.match(r.at(-1).texto, /Invalid|inválida|🔑/);
    });
});

describe('/tts', () => {
    beforeEach(() => bot.setSetting('gpt.status', false));

    test('sem a chave, sem texto e o texto vira nota de voz (como o /gpt -voice)', async () => {
        assert.match((await bot.replyAlt('/tts oi'))[0], /⚠️ API key da OpenAI não encontrada: o \/tts está desativado/);

        await bot.setSetting('gpt.api.key', 'sk-teste');
        assert.deepEqual(await bot.replyAlt('/tts'), ['```Usage: /tts [-status|-s] [<texto>]```\n💡 _/tts -h para ajuda_']);

        network.responder('post', 'api.openai.com/v1/audio/speech', Buffer.from('OGGDATA'));
        const r = (await bot.executar('/tts Bom dia!')).at(-1);
        assert.ok(r.content instanceof MessageMedia);
        assert.equal(r.content.mimetype, 'audio/ogg; codecs=opus');
        assert.equal(r.options.sendAudioAsVoice, true);
        assert.equal(network.chamadas.at(-1).cfg.body.input, 'Bom dia!');
    });

    test('respondendo um texto: fala a mensagem, e o que foi digitado é o estilo', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        network.responder('post', 'api.openai.com/v1/audio/speech', Buffer.from('OGGDATA'));
        const quoted = bot.createMessage({ texto: 'Olá, mundo', de: OTHERAlt.jid });

        await bot.executar('/tts fale devagar', { citada: quoted });
        const { body } = network.chamadas.at(-1).cfg;
        assert.equal(body.input, 'Olá, mundo');
        assert.equal(body.instructions, 'fale devagar');
    });

    test('texto grande demais', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
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

describe('/qr', () => {
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
        assert.match((await bot.replyAlt('/qr'))[0], /^```Usage: \/qr \[-decode\|-d\] \[<texto>\]```\n💡 _\/qr -h para ajuda_/);
        assert.match((await bot.replyAlt(`/qr ${'a'.repeat(1001)}`))[0], /❌ O texto tem 1001 caracteres: o QR Code aceita até 1000\./);
    });

    test('/qr -d lê o QR Code de uma foto', async () => {
        sharp.pixels = pixelsDoQr('https://exemplo.com/lido');
        assert.deepEqual(await bot.replyAlt('/qr -d', { citada: photo() }), ['📱 https://exemplo.com/lido']);

        // The photo with the caption
        const msg = bot.createMessage({ texto: '/qr -d', tipo: 'image', midia: PHOTO });
        assert.equal((await bot.deliver(msg)).at(-1).texto, '📱 https://exemplo.com/lido');
    });

    test('/qr sem texto, respondendo uma foto (ou a foto na legenda), lê o QR Code sozinho; com texto, gera', async () => {
        sharp.pixels = pixelsDoQr('https://exemplo.com/auto');
        assert.deepEqual(await bot.replyAlt('/qr', { citada: photo() }), ['📱 https://exemplo.com/auto']);

        const msg = bot.createMessage({ texto: '/qr', tipo: 'image', midia: PHOTO });
        assert.equal((await bot.deliver(msg)).at(-1).texto, '📱 https://exemplo.com/auto');

        // Typed text always generates, even when replying to a photo
        const r = (await bot.executar('/qr oi', { citada: photo() })).at(-1);
        assert.ok(r.content instanceof MessageMedia);
    });

    test('foto sem QR Code, sem foto e sem conseguir baixar', async () => {
        sharp.pixels = { data: Buffer.alloc(40 * 40 * 4, 255), width: 40, height: 40 };
        assert.deepEqual(await bot.replyAlt('/qr -d', { citada: photo() }), ['🔎 Nenhum QR Code encontrado na imagem.']);
        assert.match((await bot.replyAlt('/qr -d'))[0], /^Responda a foto de um QR Code com \/qr -d/);
        assert.deepEqual(await bot.replyAlt('/qr -d', { citada: photo({ midia: PHOTO, extras: { downloadMedia: async () => null } }) }),
            ['❌ Não consegui baixar a imagem.']);
    });
});

describe('/carbon', () => {
    const { assembleSvg, codeLines } = bot.src('carbon');

    test('o código vira uma imagem PNG (SVG desenhado pelo sharp)', async () => {
        sharp.entradas.length = 0;
        const r = (await bot.executar('/carbon const x = 42; // oi')).at(-1);
        assert.ok(r.content instanceof MessageMedia);
        assert.equal(r.content.mimetype, 'image/png');
        assert.equal(r.content.filename, 'carbon.png');

        const svg = sharp.entradas.at(-1).toString();
        assert.match(svg, /^<svg /);
        assert.match(svg, /fill="#cba6f7">const<\/tspan>/);     // palavra-chave
        assert.match(svg, /fill="#fab387">42<\/tspan>/);        // number
        assert.match(svg, /fill="#6c7086">\/\/ oi<\/tspan>/);   // comment
    });

    test('-theme|-t só vale no começo; tema desconhecido', async () => {
        sharp.entradas.length = 0;
        await bot.executar('/carbon -t light print(1)');
        assert.match(sharp.entradas.at(-1).toString(), /fill="#fafafa"/);

        // a "-t" in the middle is code
        await bot.executar('/carbon ls -t x');
        assert.match(sharp.entradas.at(-1).toString(), /fill="#1e1e2e"/);
        assert.match(sharp.entradas.at(-1).toString(), /ls -t x/);

        assert.deepEqual(await bot.replyAlt('/carbon -t neon x'), ['❌ Tema "neon" desconhecido. Disponíveis: dark, light.']);
    });

    test('sem código: o da mensagem respondida; sem nada, o uso', async () => {
        sharp.entradas.length = 0;
        const quoted = bot.createMessage({ texto: 'let a = 1;', de: OTHERAlt.jid });
        await bot.executar('/carbon', { citada: quoted });
        assert.match(sharp.entradas.at(-1).toString(), /let<\/tspan> a = <tspan fill="#fab387">1/);
        assert.match((await bot.replyAlt('/carbon'))[0], /^```Usage: \/carbon /);
    });

    test('a cerca do Markdown sai, o texto é escapado e os limites valem', () => {
        assert.deepEqual(codeLines('```js\na < b\n\tb\n```'), ['a < b', '    b']);
        assert.match(assembleSvg('if (a < b && "x") {}'), /a &lt; b &amp;&amp; <tspan fill="#a6e3a1">&quot;x&quot;<\/tspan>/);
        assert.equal(codeLines(Array(100).fill('x').join('\n')).length, 60);
        assert.equal(codeLines('y'.repeat(500))[0].length, 120);
    });
});

describe('/profile -set', () => {
    let group;
    let swapped;

    beforeEach(() => {
        swapped = [];
        group = bot.createGroup(GROUP, 'Família', [OWNER.jid, OTHERAlt.jid]);
        group.setPicture = async (media) => { swapped.push(['grupo', media]); return true; };
        bot.client.setProfilePicture = async (media) => { swapped.push(['conta', media]); return true; };
    });

    test('no grupo troca a foto do grupo; nos outros chats, a da conta', async () => {
        assert.deepEqual(await bot.replyAlt('/profile -set', { citada: photo() }), ['✅ Foto do grupo trocada.']);
        assert.deepEqual(await bot.replyAlt('/profile -s', { chat: OWNER.jid, citada: photo({ chat: OWNER.jid }) }), ['✅ A foto do seu perfil foi trocada.']);
        assert.deepEqual(swapped.map(([who, media]) => [who, media.data]), [['grupo', 'QUJD'], ['conta', 'QUJD']]);
    });

    test('a foto enviada com o comando na legenda vale', async () => {
        const msg = bot.createMessage({ texto: '/profile -set', tipo: 'image', midia: PHOTO });
        assert.equal((await bot.deliver(msg)).at(-1).texto, '✅ Foto do grupo trocada.');
    });

    test('o WhatsApp recusando (não é admin), sem imagem e erro', async () => {
        group.setPicture = async () => false;
        assert.match((await bot.replyAlt('/profile -set', { citada: photo() }))[0], /^🚫 O WhatsApp não me deixou trocar a foto do grupo/);
        assert.match((await bot.replyAlt('/profile -set'))[0], /^Responda uma imagem com \/profile -set/);

        group.setPicture = async () => { throw new Error('boom'); };
        const [r] = await bot.executar('/profile -set', { citada: photo(), erroEsperado: true });
        assert.equal(r.texto, '❌ Não consegui trocar a foto: boom');
    });
});
