/*
 * Group and media commands: /everybody, /bills, /members, /walissu,
 * /poll e /sticker.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, GROUP, OTHERAlt, MessageMedia, Poll, network } = bot;

const CICLANO = { jid: '5521922222222@c.us', name: 'Ciclano' };

beforeEach(async () => {
    await bot.restart();
    bot.createContact(CICLANO.jid, CICLANO.name);
    bot.createGroup(GROUP, 'Família', [
        { jid: OWNER.jid, isSuperAdmin: true },
        { jid: OTHERAlt.jid, isAdmin: true },
        CICLANO.jid,
        '777@lid'
    ]);
});

const onlyGroup = 'Apenas utilizado dentro de grupos.';

describe('/everybody', () => {
    test('marca todos menos quem chamou, respondendo a mensagem', async () => {
        const [r] = await bot.execute('/everybody', { id: 'CHAMADA' });
        assert.equal(r.chatId, GROUP);
        assert.equal(r.text, `@${OTHERAlt.jid.split('@')[0]} @${CICLANO.jid.split('@')[0]} @777 `);
        assert.deepEqual(r.options.mentions, [OTHERAlt.jid, CICLANO.jid, '777@lid']);
        assert.match(r.options.quotedMessageId, /CHAMADA$/);
    });

    test('fora de grupo', async () => {
        assert.deepEqual(await bot.replyAlt('/everybody', { chat: OTHERAlt.jid }), [onlyGroup]);
    });

    test('o alias /everybody', async () => {
        const [r] = await bot.execute('/everybody');
        assert.equal(r.chatId, GROUP);
        assert.deepEqual(r.options.mentions, [OTHERAlt.jid, CICLANO.jid, '777@lid']);
    });

    test('o antigo /everyone não responde mais', async () => {
        assert.deepEqual(await bot.replyAlt('/everyone'), ["⚠️ Comando '/everyone' desconhecido, tente: /help"]);
    });
});

describe('/bills e /walissu', () => {
    test('/bills sorteia 2 membros diferentes (nunca o bot)', async () => {
        for (let i = 0; i < 10; i++) {
            const [r] = await bot.execute('/bills');
            const marked = r.options.mentions;
            assert.equal(marked.length, 2);
            assert.notEqual(marked[0], marked[1]);
            assert.ok(!marked.includes(OWNER.jid));
            assert.match(r.text, /🥳 Parabéns @\S+ e @\S+ 🎉\nVocês foram sorteados para pagar um boleto!/);
            assert.match(r.text, /\n\n🤡 _É só uma piada! Não existe boleto nenhum: não pague nada\._$/);
        }
    });

    test('membros insuficientes e fora de grupo', async () => {
        bot.createGroup(GROUP, 'Família', [OWNER.jid, OTHERAlt.jid]);
        assert.deepEqual(await bot.replyAlt('/bills'), ['Membros insuficientes no grupo.']);
        assert.deepEqual(await bot.replyAlt('/walissu'), ['Membros insuficientes no grupo.']);
        assert.deepEqual(await bot.replyAlt('/bills', { chat: OTHERAlt.jid }), ['⚠️ O comando /bills só pode ser chamado dentro de grupos!']);
        assert.deepEqual(await bot.replyAlt('/walissu', { chat: OTHERAlt.jid }), [onlyGroup]);
    });

    test('/walissu: 2 membros e uma CVE recente (com o aviso de piada)', async () => {
        network.responder('get', 'services.nvd.nist.gov', (url, cfg) => cfg.params.startIndex === undefined
            ? { totalResults: 1 }
            : { vulnerabilities: [{ cve: { id: 'CVE-2026-0001', descriptions: [{ lang: 'en', value: 'Bug.' }], metrics: {} } }] });

        const [r] = await bot.execute('/walissu');
        assert.equal(r.options.mentions.length, 2);
        assert.match(r.text, /Walissu CVE BOT[\s\S]*\*CVE-2026-0001\*[\s\S]*Preciso sair de Brasília!\n\n🤡 _É só uma piada do Walissu CVE BOT/);
    });

    test('/walissu sem CVE ou com o NVD fora do ar', async () => {
        network.responder('get', 'services.nvd.nist.gov', { totalResults: 0 });
        assert.deepEqual(await bot.replyAlt('/walissu'), ['🛡️ Nenhuma CVE publicada nos últimos 2 dias.']);
        network.responder('get', 'services.nvd.nist.gov', new Error('503'));
        assert.deepEqual(await bot.replyAlt('/walissu', { expectedError: true }), ['❌ Não consegui consultar o NVD agora.']);
    });
});

describe('/members', () => {
    test('número, nome e admins; @lid sem telefone fica oculto', async () => {
        const [r] = await bot.replyAlt('/members');
        assert.match(r, /👥 \*Membros de Família\* \(4\)/);
        assert.match(r, /\+5521911111111 - Fulano ⭐/);
        assert.match(r, /\+5521922222222 - Ciclano\n/);
        assert.match(r, /\+5521900000000 - Desconhecido 👑/);
        assert.match(r, /\(número oculto\) - Desconhecido/);
    });

    test('@lid com telefone conhecido mostra o número', async () => {
        bot.client.lids.set('777@lid', '5521933333333@c.us');
        assert.match((await bot.replyAlt('/members'))[0], /\+5521933333333 - Desconhecido/);
    });

    test('fora de grupo', async () => {
        assert.deepEqual(await bot.replyAlt('/members', { chat: OTHERAlt.jid }), [onlyGroup]);
    });
});

describe('/g namespace', () => {
    test('space, dot and unique prefixes select the same action', async () => {
        const expected = await bot.replyAlt('/members');
        for (const line of ['/g members', '/g.members', '/g mem', '/g.mem', '/group members']) {
            assert.deepEqual(await bot.replyAlt(line), expected, line);
        }
        assert.match((await bot.replyAlt('/g inv -h'))[0], /\/g\.invite/);
        const [choices] = await bot.replyAlt('/g.an');
        assert.match(choices, /\/g\.antibadword.*\/g\.antilink.*\/g\.antitag/);
        assert.match((await bot.replyAlt('/g -h'))[0], /\/g\.members/);
    });

    test('only the canonical action is granted and suggestions respect permissions', async () => {
        await bot.setSetting('bot.users', []);
        await bot.replyAlt('/bot +u +cmd /g.members,/g.antilink');
        assert.deepEqual(bot.getSetting('bot.users.cmds'), [`${GROUP}=/g.members,/g.antilink`]);
        const fromUser = { de: OTHERAlt.jid };
        assert.match((await bot.replyAlt('/g.mem', fromUser))[0], /Família/);
        const [choices] = await bot.replyAlt('/g.an', fromUser);
        assert.match(choices, /\/g\.antilink/);
        assert.doesNotMatch(choices, /antibadword|antitag/);
        const [menu] = await bot.replyAlt('/g -h', fromUser);
        assert.match(menu, /\/g\.members/);
        assert.doesNotMatch(menu, /\/g\.(?:name|promote|invite)/);
        const group = bot.client.chats.get(GROUP);
        await bot.replyAlt('/g.name Outro nome', fromUser);
        assert.equal(group.name, 'Família');
    });

    test('an alias stores a full action name and keeps the action permission', async () => {
        const expected = await bot.replyAlt('/members');
        await bot.replyAlt('/alias -q /quem /g members');
        assert.deepEqual(await bot.replyAlt('/quem'), expected);
        assert.match((await bot.replyAlt('/alias /curto /g.mem'))[0], /❌/);
    });

    test('a scoped info action cannot change a group name through another flag', async () => {
        const group = bot.client.chats.get(GROUP);
        await bot.replyAlt('/g.info -name Outro nome');
        assert.equal(group.name, 'Família');
    });
});

describe('/poll', () => {
    const pollAlt = async (line) => {
        const [r] = await bot.execute(line);
        assert.ok(r.content instanceof Poll, `sem enquete para: ${line}`);
        return r.content;
    };

    test('pergunta e opções separadas por |', async () => {
        const p = await pollAlt('/poll Pizza ou hambúrguer? | Pizza | Hambúrguer');
        assert.equal(p.pollName, 'Pizza ou hambúrguer?');
        assert.deepEqual(p.pollOptions.map(o => o.name), ['Pizza', 'Hambúrguer']);
        assert.equal(p.options.allowMultipleAnswers, false);
    });

    test('uma por linha; -m no começo permite várias', async () => {
        const p = await pollAlt('/poll -m Quais dias?\nSeg\nTer\nQua');
        assert.equal(p.pollName, 'Quais dias?');
        assert.equal(p.pollOptions.length, 3);
        assert.equal(p.options.allowMultipleAnswers, true);
        assert.equal((await pollAlt('/poll -m A? | 1 | 2')).options.allowMultipleAnswers, true);
    });

    test('-m no meio faz parte da pergunta', async () => {
        const p = await pollAlt('/poll Vale -m aqui? | sim | não');
        assert.equal(p.pollName, 'Vale -m aqui?');
        assert.equal(p.options.allowMultipleAnswers, false);
    });

    test('pergunta começando com "/" nunca parece comando', async () => {
        assert.equal((await pollAlt('/poll /cache -a | sim | não')).pollName, '📊 /cache -a');
    });

    test('validações: menos de 2 opções, mais de 12, repetidas, longas', async () => {
        const errorAlt = async (line, expected) => assert.match((await bot.replyAlt(line))[0], expected, line);
        await errorAlt('/poll', /❌ Informe a pergunta e pelo menos 2 opções/);
        await errorAlt('/poll Só? | uma', /pelo menos 2 opções/);
        await errorAlt(`/poll P? | ${Array.from({ length: 13 }, (_, i) => `op${i}`).join(' | ')}`, /❌ No máximo 12 opções \(foram 13\)/);
        await errorAlt('/poll P? | Sim | sim', /❌ Opção repetida: sim/);
        await errorAlt(`/poll ${'x'.repeat(256)} | a | b`, /❌ A pergunta vai até 255 caracteres/);
        await errorAlt(`/poll P? | ${'x'.repeat(101)} | b`, /cada opção até 100/);
    });

    test('só o dono usa', async () => {
        assert.deepEqual(await bot.replyAlt('/poll P? | a | b', { de: OTHERAlt.jid }), []);
    });
});

describe('/poll -r (resultado)', () => {
    const CICLANO_JID = '5521922222222@c.us';

    beforeEach(() => bot.createContact(CICLANO_JID, 'Ciclano'));

    test('placar da enquete mais recente do chat, com quem votou', async () => {
        const [sent] = await bot.execute('/poll Pizza ou hambúrguer? | Pizza | Hambúrguer | Salada');

        // Before they vote: the poll is already registered
        assert.match((await bot.replyAlt('/poll -r'))[0], /📊 \*Resultado: Pizza ou hambúrguer\?\*\n_0 votos de 0 pessoas · criada em [^_]+_\n[\s\S]*_Ninguém votou ainda\._/);

        await bot.voteAlt(sent, OTHERAlt.jid, ['Pizza']);
        await bot.voteAlt(sent, CICLANO_JID, ['Hambúrguer']);
        await bot.voteAlt(sent, OWNER.jid, ['Pizza']);

        const [r] = await bot.replyAlt('/poll -r');
        assert.match(r, /_3 votos de 3 pessoas · criada em/);
        assert.match(r, /🏆 \*Pizza\* — 2 \(67%\) █{7}\n   _Fulano, Dono_/);
        assert.match(r, /▫️ \*Hambúrguer\* — 1 \(33%\) ███\n   _Ciclano_/);
        assert.match(r, /▫️ \*Salada\* — 0 \(0%\) ▏$/);
    });

    test('mudar ou tirar o voto; várias respostas', async () => {
        const [sent] = await bot.execute('/poll -m Dias? | Seg | Ter');
        await bot.voteAlt(sent, OTHERAlt.jid, ['Seg']);
        await bot.voteAlt(sent, OTHERAlt.jid, ['Seg', 'Ter']);   // changed: the last one counts
        await bot.voteAlt(sent, CICLANO_JID, ['Ter']);
        await bot.voteAlt(sent, CICLANO_JID, []);             // tirou o voto

        const [r] = await bot.replyAlt('/poll -result');
        assert.match(r, /_2 votos de 1 pessoa · várias respostas ·/);
        assert.match(r, /🏆 \*Seg\* — 1 \(50%\)[^\n]*\n   _Fulano_/);
        assert.match(r, /🏆 \*Ter\* — 1 \(50%\)[^\n]*\n   _Fulano_/);
    });

    test('enquete criada no celular entra com o primeiro voto; respondendo a enquete, o placar é o dela', async () => {
        const phone = {
            id: { id: 'POLL1', remote: bot.GROUP, fromMe: true, _serialized: `true_${bot.GROUP}_POLL1` },
            pollName: 'Churrasco?',
            pollOptions: [{ name: 'Sim', localId: 0 }, { name: 'Não', localId: 1 }]
        };
        await bot.voteAlt(phone, OTHERAlt.jid, ['Sim']);
        await bot.execute('/poll Outra? | a | b');   // most recent

        assert.match((await bot.replyAlt('/poll -r'))[0], /Resultado: Outra\?/);

        const quoted = bot.createMessage({ type: 'poll_creation', id: 'POLL1' });
        const [r] = await bot.replyAlt('/poll -r', { quoted });
        assert.match(r, /Resultado: Churrasco\?[\s\S]*🏆 \*Sim\* — 1 \(100%\)/);

        const unknown = bot.createMessage({ type: 'poll_creation', id: 'NAOSEI' });
        assert.match((await bot.replyAlt('/poll -r', { quoted: unknown }))[0], /📊 Não tenho os votos dessa enquete/);
    });

    test('sem enquete no chat; -r no meio faz parte da pergunta', async () => {
        assert.match((await bot.replyAlt('/poll -r'))[0], /📊 Nenhuma enquete registrada neste chat/);
        const [r] = await bot.execute('/poll Vale -r aqui? | sim | não');
        assert.equal(r.content.pollName, 'Vale -r aqui?');
    });

    test('limpeza: enquetes mais antigas que poll.retentionDays saem com os votos', async () => {
        const { cleanPollsOld } = bot.src('cleanup');
        const [sent] = await bot.execute('/poll Velha? | a | b');
        await bot.voteAlt(sent, OTHERAlt.jid, ['a']);
        await bot.dbRun('UPDATE polls SET created_at = ?', [Date.now() - 91 * 86400_000]);

        await cleanPollsOld();
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM polls')).n, 0);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM poll_votes')).n, 0);
    });
});

describe('/sticker', () => {
    const photo = { mimetype: 'image/jpeg', data: Buffer.from('jpg').toString('base64') };

    test('sem responder uma mensagem', async () => {
        assert.match((await bot.replyAlt('/sticker'))[0], /^```Usage: \/sticker/);
    });

    test('imagem: enquadrada em webp, com o nome e o autor do setting', async () => {
        await bot.setSetting('sticker.name', 'Meu Pacote');
        const quoted = bot.createMessage({ de: OTHERAlt.jid, media: photo });
        const [r] = await bot.execute('/sticker', { quoted });

        assert.ok(r.content instanceof MessageMedia);
        assert.equal(r.content.mimetype, 'image/webp');
        assert.equal(Buffer.from(r.content.data, 'base64').toString(), 'webp-enquadrado');
        assert.deepEqual([r.options.sendMediaAsSticker, r.options.stickerName, r.options.stickerAuthor],
            [true, 'Meu Pacote', 'https://github.com/jpereira/zapbot/']);
    });

    test('webp vai como está; vídeo vira figurinha animada pelo ffmpeg, com -ss e -es', async () => {
        const webp = { mimetype: 'image/webp', data: 'AA==' };
        const [r] = await bot.execute('/sticker', { quoted: bot.createMessage({ de: OTHERAlt.jid, media: webp }) });
        assert.equal(r.content, webp);

        const video = bot.createMessage({ de: OTHERAlt.jid, media: { mimetype: 'video/mp4', data: 'AA==' } });
        const [notice, sticker] = await bot.execute('/sticker -ss 4 -es 7', { quoted: video });
        assert.equal(notice.text, '✅ Sticker criado com sucesso!');
        assert.equal(sticker.options.sendMediaAsSticker, true);

        const [ffmpeg] = bot.processes.calls;
        assert.match(ffmpeg.bin, /ffmpeg$/);
        assert.equal(ffmpeg.args[ffmpeg.args.indexOf('-ss') + 1], '4');
        assert.equal(ffmpeg.args[ffmpeg.args.indexOf('-t') + 1], '3');
        assert.match(ffmpeg.args[ffmpeg.args.indexOf('-vf') + 1], /^fps=15,.*crop=512:512/);

        // Already comes out as webp: whatsapp-web.js does not convert again (no size limit)
        assert.equal(ffmpeg.args[ffmpeg.args.indexOf('-c:v') + 1], 'libwebp');
        assert.match(ffmpeg.args.at(-1), /_output\.webp$/);
        assert.equal(sticker.content.mimetype, 'image/webp');
    });

    test('vídeo: reduz qualidade e fps até a figurinha caber em 500 KB', async () => {
        const video = bot.createMessage({ de: OTHERAlt.jid, media: { mimetype: 'video/mp4', data: 'AA==' } });
        bot.processes.outputSize = 500 * 1024 + 1;
        const r = await bot.execute('/sticker', { quoted: video, expectedError: true });

        const ffmpegs = bot.processes.calls.map(c => c.args);
        assert.deepEqual(ffmpegs.map(a => a[a.indexOf('-q:v') + 1]), ['75', '50', '30', '20']);
        assert.match(ffmpegs.at(-1)[ffmpegs.at(-1).indexOf('-vf') + 1], /^fps=8,/);
        assert.equal(r.length, 1, 'só o aviso, editado com o erro');
        assert.match(r[0].text, /Figurinha grande demais para o WhatsApp \(máx\. 500 KB\)/);
    });

    test('URL ou link respondido: baixa o vídeo, como o /get -st', async () => {
        await bot.execute('/sticker -ss 10 http://8.8.8.8/video');
        assert.deepEqual(bot.processes.calls.map(c => c.bin.split('/').pop()), ['yt-dlp', 'ffmpeg']);
        // yt-dlp downloads only the snippet: ffmpeg only limits the duration
        const section = () => {
            const yt = bot.processes.calls[0].args;
            return yt[yt.indexOf('--download-sections') + 1];
        };
        const ff = bot.processes.calls[1].args;
        assert.equal(section(), '*10-16', 'sem -es: os 6 s seguintes');
        assert.ok(!ff.includes('-ss'));
        assert.equal(ff[ff.indexOf('-t') + 1], '6');

        bot.processes.calls.length = 0;
        await bot.execute('/sticker -ss 01:10 -es 01:13 http://8.8.8.8/video');
        const ffMin = bot.processes.calls[1].args;
        assert.equal(section(), '*70-73', 'min:seg vira segundos');
        assert.equal(ffMin[ffMin.indexOf('-t') + 1], '3');

        bot.processes.calls.length = 0;
        const [, sticker] = await bot.execute('/sticker', { quoted: bot.createMessage({ text: 'olha http://8.8.8.8/v', de: OTHERAlt.jid }) });
        assert.equal(bot.processes.calls[0].args.at(-1), 'http://8.8.8.8/v');
        assert.equal(sticker.options.sendMediaAsSticker, true);
    });

    test('link sem vídeo: usa a prévia do link (interna ou externa) e edita o aviso', async () => {
        bot.processes.fail = 'yt-dlp';
        const withThumb = bot.createMessage({ text: 'http://8.8.8.8/post', de: OTHERAlt.jid, extras: { _data: { thumbnail: Buffer.from('thumb').toString('base64') } } });
        const [notice, internal] = await bot.execute('/sticker', { quoted: withThumb });
        assert.equal(notice.text, '✅ Sticker criado com sucesso!');
        assert.equal(internal.content.mimetype, 'image/webp');
        assert.equal(internal.options.sendMediaAsSticker, true);

        // The external preview is fetched with an IP pin (httpGetSafe), not MessageMedia.fromUrl
        bot.network.responder('get', '8.8.4.4', bot.network.http({ data: Buffer.from('jpg'), headers: { 'content-type': 'image/jpeg' } }));
        const external = bot.createMessage({ text: 'http://8.8.8.8/post', de: OTHERAlt.jid, extras: { _data: { thumbnailUrl: 'http://8.8.4.4/t.jpg' } } });
        assert.equal((await bot.execute('/sticker', { quoted: external }))[1].content.mimetype, 'image/webp');

        // The external preview goes through the anti-SSRF: on the internal network, it is not downloaded (and the yt-dlp error stays)
        const internalThumb = bot.createMessage({ text: 'http://8.8.8.8/post', de: OTHERAlt.jid, extras: { _data: { thumbnailUrl: 'http://192.168.0.1/t.jpg' } } });
        const withoutPreview = await bot.execute('/sticker', { quoted: internalThumb, expectedError: true });
        assert.equal(withoutPreview.length, 1);
        assert.match(withoutPreview[0].text, /Não consegui baixar ou processar essa mídia/);

        // A link that cannot be downloaded (private address): the preview also works, without a warning
        const private = bot.createMessage({ text: 'http://127.0.0.1/post', de: OTHERAlt.jid, extras: { _data: { thumbnail: 'AA==' } } });
        const r = await bot.execute('/sticker', { quoted: private });
        assert.equal(r.length, 1);
        assert.equal(r[0].options.sendMediaAsSticker, true);
    });

    test('mensagem sem mídia nem link; link sem vídeo nem prévia; áudio', async () => {
        assert.deepEqual(await bot.replyAlt('/sticker', { quoted: bot.createMessage({ text: 'só texto', de: OTHERAlt.jid }) }),
            ['❌ A mensagem respondida não tem mídia nem link.']);

        bot.processes.fail = 'yt-dlp';
        const r = await bot.execute('/sticker', { quoted: bot.createMessage({ text: 'http://8.8.8.8/a', de: OTHERAlt.jid }), expectedError: true });
        assert.equal(r.length, 1);
        assert.match(r[0].text, /Não consegui baixar ou processar essa mídia/);

        const audio = bot.createMessage({ de: OTHERAlt.jid, media: { mimetype: 'audio/ogg', data: 'AA==' } });
        assert.deepEqual(await bot.replyAlt('/sticker', { quoted: audio }), ['❌ Não dá para fazer figurinha de um áudio.']);
    });

    test('-txt: os dois quadros em PNG (letra fg no fundo bg, e o contrário), juntados pelo ffmpeg num WEBP animado', async () => {
        const { textFrames, readColor } = bot.src('stickerText');
        const sharp = require('sharp');   // the environment's fake: stores what was requested

        sharp.inputs.length = 0;
        await textFrames('Bom dia <b>&', { fg: '#000000', bg: '#FFFF00' });
        const [t0, c0, t1, c1] = sharp.inputs;
        assert.equal(t0.text.text, '<span foreground="#000000">Bom dia &lt;b&gt;&amp;</span>', 'o texto vai escapado');
        assert.deepEqual([t0.text.width, t0.text.height, c0.create.width, c0.create.background], [432, 432, 512, '#FFFF00']);
        assert.deepEqual([t1.text.text.slice(0, 26), c1.create.background], ['<span foreground="#FFFF00"', '#000000'], 'o 2º quadro inverte');
        assert.deepEqual([readColor('#fff'), readColor('C0392B'), readColor('azul')], ['#FFFFFF', '#C0392B', null]);

        bot.processes.calls.length = 0;
        const [r] = await bot.execute('/sticker -txt "Bom dia, grupo!" -bg "#C0392B" -fg #fff');
        assert.equal(r.content.mimetype, 'image/webp');
        assert.equal(r.options.sendMediaAsSticker, true);

        const [ffmpeg] = bot.processes.calls;
        assert.match(ffmpeg.bin, /ffmpeg$/);
        assert.deepEqual(ffmpeg.args.slice(ffmpeg.args.indexOf('-c:v'), ffmpeg.args.indexOf('-c:v') + 2), ['-c:v', 'libwebp']);
        assert.ok(ffmpeg.args.join(' ').includes('-framerate 2') && ffmpeg.args.join(' ').includes('-loop 0'));
        assert.match(ffmpeg.args[ffmpeg.args.indexOf('-i') + 1], /quadro_%d\.png$/);

        // Without quotes and without colors: the default (black letter, white background)
        assert.equal((await bot.execute('/sticker -txt Partiu praia?'))[0].content.mimetype, 'image/webp');
    });

    test('-txt: erros de texto, cor e ffmpeg', async () => {
        const errorAlt = async (line, expected) => assert.deepEqual(await bot.replyAlt(line, { expectedError: true }), [expected], line);
        await errorAlt('/sticker -txt', 'Informe o texto: /sticker -txt "Bom dia!"');
        await errorAlt(`/sticker -txt ${'a'.repeat(201)}`, '❌ Texto longo demais: até 200 caracteres.');
        await errorAlt('/sticker -txt oi -bg azul', '❌ -bg: "azul" não é uma cor. Use #RRGGBB (ex.: #FFFFFF).');
        await errorAlt('/sticker -txt oi -fg #12', '❌ -fg: "#12" não é uma cor. Use #RRGGBB (ex.: #000000).');
        await errorAlt('/sticker -txt oi -bg #000 -fg #000000', '❌ O -bg e o -fg são a mesma cor: o texto não apareceria.');
        await errorAlt('/sticker -bg #fff', '❌ O -bg e o -fg são do -txt: /sticker -txt "Bom dia!" -bg "#FFFFFF" -fg "#000000"');
        for (const line of ['/sticker -ss 3 -txt oi', '/sticker -v -txt oi', '/sticker http://8.8.8.8/v -txt oi']) {
            await errorAlt(line, '❌ O -txt não combina com -ss, -es, -v nem com uma URL: ele faz a figurinha só do texto.');
        }
        // After -txt it is all text
        assert.equal((await bot.execute('/sticker -txt corre -ss 3'))[0].content.mimetype, 'image/webp');

        bot.processes.fail = 'ffmpeg';
        await errorAlt('/sticker -txt oi', '❌ Não consegui gerar a figurinha: /usr/bin/ffmpeg exited with code 1');
    });
});
