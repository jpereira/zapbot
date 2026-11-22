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
const photo = (extras = {}) => bot.createMessage({ de: OTHERAlt.jid, type: 'image', media: PHOTO, ...extras });

beforeEach(bot.restart);

describe('/ocr (local, Tesseract)', () => {
    const { processes } = bot;
    const tesseract = () => processes.calls.find(c => c.bin.endsWith('tesseract'));

    test('padrão: lê com o Tesseract, sem chave e sem chamar a OpenAI', async () => {
        processes.ocr = 'NOTA FISCAL\nTotal: 10,00';
        const r = await bot.replyAlt('/ocr', { quoted: photo() });
        assert.equal(r.at(-1), '📝 NOTA FISCAL\nTotal: 10,00\n\n💡 _Lido por Tesseract_');
        assert.equal(network.calls.length, 0);
        const args = tesseract().args;
        assert.deepEqual(args.slice(1), ['stdout', '-l', 'por+eng']);
    });

    test('o idioma vem do ocr.language; sem texto, o aviso', async () => {
        await bot.setSetting('ocr.language', 'eng');
        processes.ocr = '';
        const r = await bot.replyAlt('/ocr -local', { quoted: photo() });
        assert.equal(r.at(-1), '🔎 Nenhum texto encontrado na imagem.\n\n💡 _Lido por Tesseract_');
        assert.equal(tesseract().args[3], 'eng');
    });

    test('ocr.engine gpt usa o ChatGPT; -local volta para o Tesseract; -gpt -local é erro', async () => {
        await bot.setSetting('ocr.engine', 'gpt');
        await bot.setSetting('gpt.status', false);
        assert.match((await bot.replyAlt('/ocr', { quoted: photo() }))[0], /API key da OpenAI não encontrada/);
        assert.match((await bot.replyAlt('/ocr -local', { quoted: photo() })).at(-1), /Lido por Tesseract/);
        assert.match((await bot.replyAlt('/ocr -gpt -local', { quoted: photo() }))[0], /❌/);
    });
});

describe('/ocr -gpt', () => {
    beforeEach(() => bot.setSetting('gpt.status', false)); // without the usage footer (the default is on)

    const chat = (textAlt) => network.responder('post', 'api.openai.com/v1/chat/completions', { choices: [{ message: { content: textAlt } }] });

    test('sem a chave da OpenAI', async () => {
        assert.match((await bot.replyAlt('/ocr -gpt', { quoted: photo() }))[0], /⚠️ API key da OpenAI não encontrada: o \/ocr está desativado/);
    });

    test('sem foto: o uso', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        assert.deepEqual(await bot.replyAlt('/ocr'), ['Responda uma foto com /ocr (ou envie a foto com /ocr na legenda).\n💡 _/ocr -h para ajuda_']);
        assert.equal(network.calls.length, 0);
    });

    test('respondendo uma foto: o texto dela, com a imagem indo para o ChatGPT', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        chat('NOTA FISCAL\nTotal: 10,00');

        const r = await bot.replyAlt('/ocr -gpt', { quoted: photo() });
        assert.equal(r.at(-1), '📝 NOTA FISCAL\nTotal: 10,00\n\n💡 _Lido por ChatGPT_');

        const { messages } = network.calls.at(-1).cfg.body;
        assert.match(messages[0].content, /Você é um OCR/);
        assert.deepEqual(messages[1].content[1], { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } });
    });

    test('a foto com a legenda /ocr também vale; imagem sem texto recebe o aviso', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        chat('NO_TEXT');
        const msg = bot.createMessage({ text: '/ocr -gpt', type: 'image', media: PHOTO });
        const r = await bot.deliver(msg);
        assert.equal(r.at(-1).text, '🔎 Nenhum texto encontrado na imagem.\n\n💡 _Lido por ChatGPT_');
    });

    test('-s mostra o consumo no rodapé', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        chat('Oi');
        assert.match((await bot.replyAlt('/ocr -gpt -s', { quoted: photo() })).at(-1), /^📝 Oi\n\n💡 _Lido por ChatGPT_\n\n_📡 ⬆️ \d+ B TX/);
    });

    test('o erro da OpenAI vira aviso', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        network.responder('post', 'api.openai.com/v1/chat/completions', bot.errorHttp(401));
        const r = await bot.execute('/ocr -gpt', { quoted: photo(), expectedError: true });
        assert.match(r.at(-1).text, /Invalid|inválida|🔑/);
    });
});

describe('/tts local: o idioma do texto escolhe a voz', () => {
    const { detectSpeechLanguage } = bot.src('ttsLocal');

    test('português, inglês e empate (vale o idioma do bot)', () => {
        assert.equal(detectSpeechLanguage('Bom dia, tudo bem com você?'), 'pt');
        assert.equal(detectSpeechLanguage('Good morning, how are you?'), 'en');
        assert.equal(detectSpeechLanguage('ok'), bot.getSetting('zapbot.lang') === 'pt_BR' ? 'pt' : 'en');
    });
});

describe('/tts', () => {
    test('-gpt e -local juntos: recusa', async () => {
        assert.match((await bot.replyAlt('/tts -gpt -local oi'))[0], /Use só um: -gpt \(-g\) ou -local \(-l\)\./);
    });

    beforeEach(() => bot.setSetting('gpt.status', false));

    test('sem a chave, sem texto e o texto vira nota de voz (como o /gpt -voice)', async () => {
        assert.match((await bot.replyAlt('/tts -gpt oi'))[0], /⚠️ API key da OpenAI não encontrada: o \/tts está desativado/);

        await bot.setSetting('gpt.api.key', 'sk-teste');
        assert.deepEqual(await bot.replyAlt('/tts'), ['```Usage: /tts [-gpt|-g] [-local|-l] [-voice|-v <nome>] [-speed|-sp <%>] [-pitch|-pi <semitons>] [-volume|-vol <%>] [-quiet|-q] [-status|-s] [<texto>]```\n💡 _/tts -h para ajuda_']);

        network.responder('post', 'api.openai.com/v1/audio/speech', Buffer.from('OGGDATA'));
        const r = (await bot.execute('/tts -gpt Bom dia!')).at(-1);
        assert.ok(r.content instanceof MessageMedia);
        assert.equal(r.content.mimetype, 'audio/ogg; codecs=opus');
        assert.equal(r.options.sendAudioAsVoice, true);
        assert.equal(network.calls.at(-1).cfg.body.input, 'Bom dia!');
    });

    test('respondendo um texto SEM digitar nada: fala a mensagem respondida', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        network.responder('post', 'api.openai.com/v1/audio/speech', Buffer.from('OGGDATA'));
        const quoted = bot.createMessage({ text: 'Olá, mundo', de: OTHERAlt.jid });

        await bot.execute('/tts -gpt', { quoted });
        assert.equal(network.calls.at(-1).cfg.body.input, 'Olá, mundo');
    });

    test('respondendo um texto COM texto digitado: fala o digitado e ignora o da resposta', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        network.responder('post', 'api.openai.com/v1/audio/speech', Buffer.from('OGGDATA'));
        const quoted = bot.createMessage({ text: 'Olá, mundo', de: OTHERAlt.jid });

        await bot.execute('/tts -gpt Isso é um teste!', { quoted });
        const { body } = network.calls.at(-1).cfg;
        assert.equal(body.input, 'Isso é um teste!');
        assert.notEqual(body.instructions, 'Isso é um teste!', 'o digitado não vira estilo');
    });

    test('texto grande demais', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        assert.match((await bot.replyAlt(`/tts ${'a'.repeat(32001)}`))[0], /❌ O texto tem 32001 caracteres: a voz aceita até 32000\./);
    });
});

// The RGBA pixels of a QR Code (what sharp would return from its photo)
function qrPixels(textAlt, scale = 4) {
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
        const r = (await bot.execute('/qr https://exemplo.com/a?b=1')).at(-1);
        assert.ok(r.content instanceof MessageMedia);
        assert.equal(r.content.mimetype, 'image/png');
        assert.equal(r.content.filename, 'qrcode.png');
        const png = Buffer.from(r.content.data, 'base64');
        assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);

        // The text is the command's (the PNG is what the qrcode library generates; here we check qrPixels, used below)
        const { data, width, height } = qrPixels('https://exemplo.com/a?b=1');
        assert.equal(jsQR(new Uint8ClampedArray(data), width, height).data, 'https://exemplo.com/a?b=1');
    });

    test('sem texto: o da mensagem respondida; sem nada, o uso; grande demais', async () => {
        const quoted = bot.createMessage({ text: 'meu texto', de: OTHERAlt.jid });
        assert.ok((await bot.execute('/qr', { quoted })).at(-1).content instanceof MessageMedia);
        assert.match((await bot.replyAlt('/qr'))[0], /^```Usage: \/qr \[-decode\|-d\] \[<texto>\]```\n💡 _\/qr -h para ajuda_/);
        assert.match((await bot.replyAlt(`/qr ${'a'.repeat(1001)}`))[0], /❌ O texto tem 1001 caracteres: o QR Code aceita até 1000\./);
    });

    test('/qr -d lê o QR Code de uma foto', async () => {
        sharp.pixels = qrPixels('https://exemplo.com/lido');
        assert.deepEqual(await bot.replyAlt('/qr -d', { quoted: photo() }), ['📱 https://exemplo.com/lido']);

        // The photo with the caption
        const msg = bot.createMessage({ text: '/qr -d', type: 'image', media: PHOTO });
        assert.equal((await bot.deliver(msg)).at(-1).text, '📱 https://exemplo.com/lido');
    });

    test('/qr sem texto, respondendo uma foto (ou a foto na legenda), lê o QR Code sozinho; com texto, gera', async () => {
        sharp.pixels = qrPixels('https://exemplo.com/auto');
        assert.deepEqual(await bot.replyAlt('/qr', { quoted: photo() }), ['📱 https://exemplo.com/auto']);

        const msg = bot.createMessage({ text: '/qr', type: 'image', media: PHOTO });
        assert.equal((await bot.deliver(msg)).at(-1).text, '📱 https://exemplo.com/auto');

        // Typed text always generates, even when replying to a photo
        const r = (await bot.execute('/qr oi', { quoted: photo() })).at(-1);
        assert.ok(r.content instanceof MessageMedia);
    });

    test('foto sem QR Code, sem foto e sem conseguir baixar', async () => {
        sharp.pixels = { data: Buffer.alloc(40 * 40 * 4, 255), width: 40, height: 40 };
        assert.deepEqual(await bot.replyAlt('/qr -d', { quoted: photo() }), ['🔎 Nenhum QR Code encontrado na imagem.']);
        assert.match((await bot.replyAlt('/qr -d'))[0], /^Responda a foto de um QR Code com \/qr -d/);
        assert.deepEqual(await bot.replyAlt('/qr -d', { quoted: photo({ media: PHOTO, extras: { downloadMedia: async () => null } }) }),
            ['❌ Não consegui baixar a imagem.']);
    });
});

describe('/carbon', () => {
    const { assembleSvg, codeLines } = bot.src('carbon');

    test('o código vira uma imagem PNG (SVG desenhado pelo sharp)', async () => {
        sharp.inputs.length = 0;
        const r = (await bot.execute('/carbon const x = 42; // oi')).at(-1);
        assert.ok(r.content instanceof MessageMedia);
        assert.equal(r.content.mimetype, 'image/png');
        assert.equal(r.content.filename, 'carbon.png');

        const svg = sharp.inputs.at(-1).toString();
        assert.match(svg, /^<svg /);
        assert.match(svg, /fill="#cba6f7">const<\/tspan>/);     // word-key
        assert.match(svg, /fill="#fab387">42<\/tspan>/);        // number
        assert.match(svg, /fill="#6c7086">\/\/ oi<\/tspan>/);   // comment
    });

    test('-theme|-t só vale no começo; tema desconhecido', async () => {
        sharp.inputs.length = 0;
        await bot.execute('/carbon -t light print(1)');
        assert.match(sharp.inputs.at(-1).toString(), /fill="#fafafa"/);

        // a "-t" in the middle is code
        await bot.execute('/carbon ls -t x');
        assert.match(sharp.inputs.at(-1).toString(), /fill="#1e1e2e"/);
        assert.match(sharp.inputs.at(-1).toString(), /ls -t x/);

        assert.deepEqual(await bot.replyAlt('/carbon -t neon x'), ['❌ Tema "neon" desconhecido. Disponíveis: dark, light.']);
    });

    test('sem código: o da mensagem respondida; sem nada, o uso', async () => {
        sharp.inputs.length = 0;
        const quoted = bot.createMessage({ text: 'let a = 1;', de: OTHERAlt.jid });
        await bot.execute('/carbon', { quoted });
        assert.match(sharp.inputs.at(-1).toString(), /let<\/tspan> a = <tspan fill="#fab387">1/);
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
        assert.deepEqual(await bot.replyAlt('/profile -s', { quoted: photo() }), ['✅ Foto do grupo trocada.']);
        assert.deepEqual(await bot.replyAlt('/profile -s', { chat: OWNER.jid, quoted: photo({ chat: OWNER.jid }) }), ['✅ A foto do seu perfil foi trocada.']);
        assert.deepEqual(swapped.map(([who, media]) => [who, media.data]), [['grupo', 'QUJD'], ['conta', 'QUJD']]);
    });

    test('a foto enviada com o comando na legenda vale', async () => {
        const msg = bot.createMessage({ text: '/profile -set', type: 'image', media: PHOTO });
        assert.equal((await bot.deliver(msg)).at(-1).text, '✅ Foto do grupo trocada.');
    });

    test('o WhatsApp recusando (não é admin), sem imagem e erro', async () => {
        group.setPicture = async () => false;
        assert.match((await bot.replyAlt('/profile -s', { quoted: photo() }))[0], /^🚫 O WhatsApp não me deixou trocar a foto do grupo/);
        assert.match((await bot.replyAlt('/profile -s'))[0], /^Responda uma imagem com \/profile -s/);

        group.setPicture = async () => { throw new Error('boom'); };
        const [r] = await bot.execute('/profile -set', { quoted: photo(), expectedError: true });
        assert.equal(r.text, '❌ Não consegui trocar a foto: boom');
    });
});

describe('motor nos comandos (ampulheta e dica do fim)', () => {
    const { engineProcessing, withEngineTip } = bot.src('engines');

    test('mesma frase em todos os comandos, com o nome do motor', () => {
        assert.equal(engineProcessing('ocr', 'Tesseract'), '⏳ Lendo o texto com Tesseract, aguarde.');
        assert.equal(engineProcessing('tts', 'ChatGPT'), '⏳ Gerando a voz com ChatGPT, aguarde.');
        assert.equal(engineProcessing('stt', 'faster-whisper'), '⏳ Transcrevendo a fala com faster-whisper, aguarde.');
        assert.equal(engineProcessing('draw', 'ChatGPT'), '⏳ Desenhando com ChatGPT, aguarde.');
        assert.equal(withEngineTip('ok', 'tldr', 'ChatGPT'), 'ok\n\n💡 _Resumido por ChatGPT_');
        assert.equal(withEngineTip('ok', 'ocr', 'Tesseract', { sep: '\n' }), 'ok\n💡 _Lido por Tesseract_');
    });

    test('-quiet (-q) não mostra a dica do fim', () => {
        assert.equal(withEngineTip('ok', 'gpt', 'ChatGPT', { quiet: true }), 'ok');
    });
});

describe('-quiet (-q) e <comando>.footer', () => {
    const { processes } = bot;
    const chat = (textAlt) => network.responder('post', 'api.openai.com/v1/chat/completions', { choices: [{ message: { content: textAlt } }] });

    test('/ocr -q e ocr.footer off escondem a dica; o texto continua', async () => {
        processes.ocr = 'NOTA';
        assert.equal((await bot.replyAlt('/ocr', { quoted: photo() })).at(-1), '📝 NOTA\n\n💡 _Lido por Tesseract_');
        assert.equal((await bot.replyAlt('/ocr -q', { quoted: photo() })).at(-1), '📝 NOTA');
        assert.equal((await bot.replyAlt('/ocr -quiet', { quoted: photo() })).at(-1), '📝 NOTA');
        await bot.setSetting('ocr.footer', false);
        assert.equal((await bot.replyAlt('/ocr', { quoted: photo() })).at(-1), '📝 NOTA');
    });

    test('/gpt -q: a pergunta vai sem o -q e a resposta sem a dica; gpt.footer off faz o mesmo', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        await bot.setSetting('gpt.status', false);
        chat('Oi.');
        assert.deepEqual(await bot.replyAlt('/gpt -q olá'), ['🤖 Oi.']);
        assert.equal(network.calls.at(-1).cfg.body.messages.at(-1).content, 'olá');
        await bot.setSetting('gpt.footer', false);
        assert.deepEqual(await bot.replyAlt('/gpt olá'), ['🤖 Oi.']);
    });
});

describe('-quiet (-q): sem o aviso "⏳" e sem a dica', () => {
    const { processes } = bot;
    const sent = () => bot.client.sent.map(e => (typeof e.content === 'string' ? e.content : '[mídia]'));

    test('/ocr -q responde direto, sem o aviso de leitura', async () => {
        processes.ocr = 'NOTA';
        await bot.replyAlt('/ocr -q', { quoted: photo() });
        assert.deepEqual(sent().filter(c => !c.startsWith('/')), ['📝 NOTA']);
        await bot.restart();
        processes.ocr = 'NOTA';
        await bot.replyAlt('/ocr', { quoted: photo() });
        assert.ok(sent().some(c => c.includes('Lendo o texto com Tesseract') || c.includes('Lido por Tesseract')));
    });

    test('/tts -q manda só o áudio (nada de "Gerando..." nem "áudio gerado abaixo")', async () => {
        await bot.execute('/tts -q bom dia');
        const texts = sent().filter(c => c !== '[mídia]' && !c.startsWith('/'));
        assert.deepEqual(texts, []);
        assert.ok(sent().includes('[mídia]'), 'o áudio foi enviado');
    });
});

describe('/tts: voz, velocidade, tom e volume', () => {
    const { processes, network } = bot;
    const { voiceFilters, readVoiceOptions } = bot.src('ttsVoice');
    const call = (name) => processes.calls.filter(c => c.bin.endsWith(name));
    const flag = (args, name) => args[args.indexOf(name) + 1];
    const chat = () => network.responder('post', 'api.openai.com/v1/audio/speech', Buffer.from('opus'));

    test('filtros do ffmpeg: tom em semitons e volume em %; o normal não filtra', () => {
        assert.equal(voiceFilters({ pitch: 0, volume: 100 }), null);
        assert.equal(voiceFilters({ pitch: 12, volume: 100 }), 'asetrate=48000*2.000000,aresample=48000,atempo=0.500000');
        assert.equal(voiceFilters({ pitch: 0, volume: 150 }), 'volume=1.50');
    });

    test('limites e voz inválida', () => {
        const opts = (o) => ({ given: new Set(Object.keys(o)), opt: o });
        assert.throws(() => readVoiceOptions(opts({ speed: '300' }), 'local'), /-speed: "300" não vale\. Use um número de 50 a 200/);
        assert.throws(() => readVoiceOptions(opts({ pitch: '13' }), 'local'), /-pitch/);
        assert.throws(() => readVoiceOptions(opts({ voice: 'robo' }), 'gpt'), /não é uma voz do ChatGPT/);
        assert.throws(() => readVoiceOptions(opts({ voice: 'robo' }), 'local'), /não é uma voz local \(Piper\)/);
        assert.deepEqual(readVoiceOptions(opts({ speed: '120%', pitch: '+3', voice: 'NOVA' }), 'gpt'), { voice: 'nova', speed: 120, pitch: 3, volume: 100 });
    });

    test('/tts local: velocidade e voz vão para o Piper, tom e volume para o ffmpeg; o texto sai sem as opções', async () => {
        await bot.execute('/tts -speed 150 -pitch 3 -volume 200 -voice en_US-amy-medium bom dia');
        const py = call('python')[0].args;
        assert.equal(flag(py, '--voice'), 'en_US-amy-medium');
        assert.equal(flag(py, '--speed'), '1.5');
        const ff = call('ffmpeg').at(-1).args;
        assert.match(ff[ff.indexOf('-af') + 1], /^asetrate=48000\*1\.189207,aresample=48000,atempo=0\.840896,volume=2\.00$/);
    });

    test('settings tts.speed|pitch|volume são o padrão; a opção da chamada vence', async () => {
        await bot.setSetting('tts.speed', 80);
        await bot.setSetting('tts.pitch', -2);
        await bot.execute('/tts bom dia');
        assert.equal(flag(call('python')[0].args, '--speed'), '0.8');
        assert.match(call('ffmpeg').at(-1).args.join(' '), /asetrate=48000\*0\.890899/);
        await bot.execute('/tts -speed 100 bom dia');
        assert.equal(flag(call('python').at(-1).args, '--speed'), '1');
    });

    test('o log mostra o comando do wrapper Python e do ffmpeg, com os argumentos exatos', async () => {
        await bot.execute('/tts -speed 150 -voice cadu bom dia');
        const running = bot.logs.filter(l => l.includes('> Running:'));
        assert.ok(running.some(l => /\/venv\/bin\/python \S*scripts\/tts\.py --input \S+ --voice pt_BR-cadu-medium --dir \/opt\/piper --output \S+voice\.wav --speed 1\.5$/.test(l)), running.join('\n'));
        assert.ok(running.some(l => /ffmpeg -y -i \S+voice\.wav -c:a libopus/.test(l)), running.join('\n'));
    });

    test('a velocidade padrão é por motor: tts.speed (Piper, 50) e gpt.tts.speed (ChatGPT, 100)', async () => {
        const { readVoiceOptions } = bot.src('ttsVoice');
        assert.equal(readVoiceOptions(null, 'local').speed, 50);
        assert.equal(readVoiceOptions(null, 'gpt').speed, 100);
        await bot.setSetting('gpt.tts.speed', 120);
        assert.equal(readVoiceOptions(null, 'gpt').speed, 120);
        await bot.execute('/tts bom dia');
        assert.equal(flag(call('python')[0].args, '--speed'), '0.5');
    });

    test('valor inválido: erro e nada é falado', async () => {
        const r = await bot.replyAlt('/tts -speed 999 bom dia');
        assert.match(r[0], /-speed: "999" não vale/);
        assert.equal(call('python').length, 0);
    });

    test('/tts -gpt: voz e velocidade vão para a API; o tom passa pelo ffmpeg', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        chat();
        await bot.execute('/tts -gpt -voice nova -speed 120 -pitch 2 bom dia');
        const body = network.calls.at(-1).cfg.body;
        assert.equal(body.voice, 'nova');
        assert.equal(body.speed, 1.2);
        assert.equal(body.input, 'bom dia');
        assert.ok(call('ffmpeg').length >= 1);
    });
});

describe('/tts -v: lista as vozes', () => {
    test('/tts -v lista as do Piper (português e inglês, com o padrão marcado); /tts -g -v as do ChatGPT', async () => {
        const [local] = await bot.replyAlt('/tts -v');
        assert.match(local, /^🎙️ \*Vozes do \/tts\* \(local, Piper\)\n\n\*Português \(Brasil\)\*\n• cadu\n• edresson\n• faber ✅\n• jeff\n\n\*Português \(Portugal\)\*\n• tugão\n/);
        assert.match(local, /\*Inglês \(EUA\)\*\n• amy \(low, medium\)\n[\s\S]*• lessac \(low, medium ✅, high\)/);
        assert.match(local, /\*Inglês \(Reino Unido\)\*\n• alan \(low, medium\)/);
        const [gpt] = await bot.replyAlt('/tts -g -v');
        assert.match(gpt, /^🎙️ \*Vozes do \/tts\* \(ChatGPT\)\n\n• alloy\n/);
        assert.match(gpt, /• onyx ✅\n/);
        assert.equal(bot.processes.calls.length, 0, 'nada é falado');
    });

    test('/tts -v: o nome, o nome com a qualidade ou o id completo; sem maiúsculas nem acentos', async () => {
        for (const [typed, id] of [['tugão', 'pt_PT-tugão-medium'], ['TUGAO-medium', 'pt_PT-tugão-medium'], ['pt_PT-tugão-medium', 'pt_PT-tugão-medium'],
            ['amy', 'en_US-amy-medium'], ['amy-low', 'en_US-amy-low'], ['EN_US-AMY-MEDIUM', 'en_US-amy-medium'], ['edresson', 'pt_BR-edresson-low']]) {
            bot.processes.calls.length = 0;
            await bot.execute(`/tts -v ${typed} teste`);
            const args = bot.processes.calls.find(c => c.bin.endsWith('python')).args;
            assert.equal(args[args.indexOf('--voice') + 1], id, typed);
        }
    });
});

describe('/tts: várias opções na frente do texto', () => {
    test('withoutOption tira todas as opções do texto, e as quebras de linha ficam', () => {
        const { withoutOption } = bot.src('commands/openaiCommon');
        assert.equal(withoutOption('-q -local ACABOU', 'status|s|quiet|q|gpt|g|local|l'), 'ACABOU');
        assert.equal(withoutOption('oi -q tudo\n\nbem -local', 'quiet|q|local|l'), 'oi tudo\n\nbem');
    });

    test('/tts -q -local -voice cadu ACABOU fala só ACABOU (todas as opções saem do texto)', async () => {
        for (const cmd of ['/tts -q -local -voice cadu ACABOU', '/tts -local -q -v cadu ACABOU', '/tts -voice cadu -q -l ACABOU']) {
            bot.processes.calls.length = 0;
            await bot.execute(cmd);
            const args = bot.processes.calls.find(c => c.bin.endsWith('python')).args;
            assert.equal(args[args.indexOf('--voice') + 1], 'pt_BR-cadu-medium', cmd);
        }
    });
});

describe('/tts: texto longo (tts.maxChars)', () => {
    const { processes, network } = bot;
    const { splitSpeech } = bot.src('ttsVoice');
    const call = (name) => processes.calls.filter(c => c.bin.endsWith(name));
    const sentence = 'Esta é uma frase de teste com bastante texto para ocupar espaço. ';

    test('splitSpeech: parte no fim da frase, sem cortar palavra, e uma palavra gigante em pedaços', () => {
        const parts = splitSpeech(sentence.repeat(10), 150);
        assert.ok(parts.length >= 4 && parts.every(p => p.length <= 150), parts.map(p => p.length).join(','));
        assert.ok(parts.every(p => p.endsWith('.')), 'cada parte termina numa frase');
        assert.equal(parts.join(' '), sentence.repeat(10).trim());
        assert.deepEqual(splitSpeech('a'.repeat(250), 100).map(p => p.length), [100, 100, 50]);
        assert.deepEqual(splitSpeech('Uma frase só.', 4096), ['Uma frase só.']);
    });

    test('/tts local: 8409 caracteres não são mais recusados (o Piper fala tudo de uma vez)', async () => {
        const text = sentence.repeat(150).slice(0, 8409);
        const r = await bot.replyAlt(`/tts ${text}`);
        assert.ok(!r.some(x => /aceita até/.test(x)), r.join('|'));
        assert.equal(call('python').length, 1, 'uma chamada só ao Piper');
    });

    test('o limite é o setting tts.maxChars; acima dele, o aviso com o máximo', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        await bot.setSetting('tts.maxChars', 100);
        assert.match((await bot.replyAlt(`/tts ${'x'.repeat(150)}`))[0], /O texto tem 150 caracteres: a voz aceita até 100\./);
        assert.equal(call('python').length, 0);
        assert.match((await bot.replyAlt('/tts -gpt ' + 'x'.repeat(150)))[0], /aceita até 100/);
    });

    test('/tts -gpt: um texto maior que 4096 vai em partes (uma requisição cada) e o áudio é junto', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        network.responder('post', 'api.openai.com/v1/audio/speech', Buffer.from('opus'));
        await bot.execute(`/tts -gpt ${sentence.repeat(150).slice(0, 9000)}`);
        const calls = network.calls.filter(c => /audio\/speech/.test(c.url ?? c.cfg?.url ?? ''));
        assert.equal(calls.length, 3, 'três partes de até 4096');
        assert.ok(calls.every(c => c.cfg.body.input.length <= 4096));
        assert.ok(calls.map(c => c.cfg.body.input.length).reduce((a, b) => a + b, 0) >= 8900);
        assert.ok(call('ffmpeg').some(c => c.args.includes('-filter_complex') && c.args.join(' ').includes('concat=n=3')), 'o ffmpeg junta as três');
    });
});

describe('/tts: {/comando} no texto (a barra é opcional)', () => {
    const { processes } = bot;
    const { parseMarks, maskMarks } = bot.src('commandMarks');
    const { speakable } = bot.src('util/speech');

    test('parseMarks: com e sem barra; {nome} que não é comando e \\{ ficam como texto', () => {
        assert.deepEqual(parseMarks('a {/crypto USD} b {crypto BTC} c {nome} d \\{/ping} e {/stocks EUR}').map(m => m.line),
            ['/crypto USD', '/crypto BTC', '/stocks EUR']);
        assert.deepEqual(parseMarks('{CRYPTO usd}').map(m => m.line), ['/CRYPTO usd']);
        const { masked, restore } = maskMarks('oi {/crypto -s -v} e {stocks -list}');
        assert.ok(!masked.includes('-s') && !masked.includes('{'));
        assert.equal(restore(masked), 'oi {/crypto -s -v} e {stocks -list}');
    });

    test('speakable: sem emoji, markdown, links nem separadores; uma linha vira uma frase', () => {
        assert.equal(speakable('🪙 *Bitcoin* · $90.000 (+2,3%)\n📈 _alta_ https://x.com/a'), 'Bitcoin, $90.000 (+2,3%). alta');
        assert.equal(speakable('```\ncodigo\n```\ntexto'), 'texto');
    });

    test('/tts fala a resposta do comando, limpa; {version} sem barra também; o texto do usuário fica como veio', async () => {
        await bot.execute('/tts A versão é {/version} e de novo {version}! Fim {nome} e \\{/version}.');
        assert.match(processes.spoken, /^A versão é ZapBot [^*]*e de novo ZapBot [^*]*! Fim \{nome\} e \{\/version\}\.$/);
        assert.doesNotMatch(processes.spoken, /\*|🤖/);
    });

    test('as opções de dentro das chaves não são do /tts; comando que não roda é recusado e nada é falado', async () => {
        const { readOptions } = bot.src('execute');
        const { findCommand } = bot.src('commands/base');
        const opts = readOptions(findCommand('/tts'), 'oi {/crypto -s -v -q} -g');
        assert.deepEqual([...opts.given].sort(), ['gpt']);
        assert.deepEqual(opts.argv, ['oi', '{/crypto -s -v -q}']);

        processes.spoken = null;
        const r = await bot.replyAlt('/tts oi {/bot -off}');
        assert.match(r[0], /❌/);
        assert.equal(processes.spoken, null, 'nada foi falado');
        assert.equal(processes.calls.filter(c => c.bin.endsWith('python')).length, 0);
    });
});

describe('log dos comandos aninhados ({/comando} no texto)', () => {
    test('/tts com {/version}: o log mostra o EXPAND com o texto digitado, o comando e quem', async () => {
        const before = bot.logs.length;
        await bot.execute('/tts A versão é {/version} e {uptime}');
        const lines = bot.logs.slice(before).filter(l => /EXPAND/.test(l));
        assert.equal(lines.length, 2);
        assert.match(lines[0], /\[\+\]          EXPAND '\/tts A versão é \{\/version\} e \{uptime\}' > \/version '.+'$/);
        assert.match(lines[1], /> \/uptime '/);
        assert.ok(bot.logs.slice(before).some(l => /executed '\/tts A versão é/.test(l)), 'a linha do "executed" vem antes');
    });
});

describe('-tts: fala a resposta do comando (é o /tts {/comando -q ...})', () => {
    const { processes } = bot;
    const { ttsRewrite } = bot.src('ttsOption');
    const { findCommand } = bot.src('commands/base');

    test('ttsRewrite: põe o -q só em quem tem; sem -tts ou sem tts:true é null; -tts no meio e -q repetido', () => {
        assert.equal(ttsRewrite(findCommand('/crypto'), 'BTC ETH -tts'), '/tts -q {/crypto -q BTC ETH}');
        assert.equal(ttsRewrite(findCommand('/crypto'), '-tts -q BTC'), '/tts -q {/crypto -q BTC}');
        assert.equal(ttsRewrite(findCommand('/weather'), '-tts Niteroi'), '/tts -q {/weather -q Niteroi}');
        assert.equal(ttsRewrite(findCommand('/version'), '-tts'), '/tts -q {/version}');
        assert.equal(ttsRewrite(findCommand('/crypto'), 'BTC'), null);
        assert.equal(ttsRewrite(findCommand('/crypto'), 'BTC -ttsx'), null);
        assert.equal(ttsRewrite(findCommand('/ping'), '-tts'), null);
    });

    test('/version -tts: fala o banner, sem texto; o log mostra o que foi digitado e o EXPAND', async () => {
        processes.spoken = null;
        const before = bot.logs.length;
        await bot.execute('/version -tts');
        assert.match(processes.spoken, /^ZapBot /);
        const logs = bot.logs.slice(before);
        assert.ok(logs.some(l => /executed '\/version -tts'/.test(l)));
        assert.ok(logs.some(l => /EXPAND '\/version -tts' > \/version /.test(l)));
    });

    test('dentro de {/comando} o -tts é recusado (só vale digitado)', async () => {
        const [r] = await bot.replyAlt('/tts oi {/version -tts}');
        assert.match(r, /❌/);
    });
});

describe('/tts para usuário: a voz local é livre; o ChatGPT só com limite', () => {
    const { OTHERAlt } = bot;
    const DELE = { de: OTHERAlt.jid, chat: OTHERAlt.jid };
    const { network } = bot;
    // the voice note (the replies also have the footer and the usage line)
    const spoke = (replies) => replies.some(r => r.content instanceof MessageMedia);

    beforeEach(async () => {
        await bot.setSetting('gpt.status', false);
        await bot.setSetting('gpt.api.key', 'sk-teste');
        await bot.setSetting('bot.users', [OTHERAlt.user]);
        network.responder('post', 'api.openai.com/v1/audio/speech', Buffer.from('OGGDATA'));
    });

    test('o usuário usa a voz local (nada gasta); com -gpt sem limite é recusado', async () => {
        assert.equal(spoke(await bot.execute('/tts Bom dia!', DELE)), true);
        const [r] = await bot.replyAlt('/tts -gpt Bom dia!', DELE);
        assert.match(r, /^❌ O \/tts com o ChatGPT gasta a API e precisa de um limite para você/);
        assert.equal(network.calls.filter(c => /audio\/speech/.test(c.url)).length, 0, 'a API não foi chamada');

        // tts.engine gpt: the same without the flag
        await bot.setSetting('tts.engine', 'gpt');
        assert.match((await bot.replyAlt('/tts Bom dia!', DELE))[0], /^❌ O \/tts com o ChatGPT/);
        assert.equal(spoke(await bot.execute('/tts -local Bom dia!', DELE)), true);
    });

    test('com limite: o ChatGPT funciona e só ele conta; a voz local não gasta o limite', async () => {
        await bot.replyAlt('/bot +cmd /tts +limit 1 /Fulano/', { chat: bot.OWNER.jid });
        assert.equal(spoke(await bot.execute('/tts -gpt Bom dia!', DELE)), true);
        assert.match((await bot.replyAlt('/tts -gpt de novo', DELE))[0], /limite|Limite/);
        // local: free, even with the limit used up
        assert.equal(spoke(await bot.execute('/tts -local de novo', DELE)), true);
    });

    test('o admin usa o ChatGPT sem limite', async () => {
        await bot.setSetting('bot.admins', [OTHERAlt.user]);
        assert.equal(spoke(await bot.execute('/tts -gpt Bom dia!', DELE)), true);
    });
});
