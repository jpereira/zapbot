/*
 * Group and media commands: /todos (/todes), /boletos, /listageral, /walissu (/ualisu),
 * /enquete (/enq, /quiz) e /sticker (/st).
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, GROUP, OTHERAlt, MessageMedia, Poll, network } = bot;

const CICLANO = { jid: '5521922222222@c.us', nome: 'Ciclano' };

beforeEach(async () => {
    await bot.restart();
    bot.createContact(CICLANO.jid, CICLANO.nome);
    bot.createGroup(GROUP, 'Família', [
        { jid: OWNER.jid, isSuperAdmin: true },
        { jid: OTHERAlt.jid, isAdmin: true },
        CICLANO.jid,
        '777@lid'
    ]);
});

const onlyGroup = 'Apenas utilizado dentro de grupos.';

describe('/todos (/todes)', () => {
    test('marca todos menos quem chamou, respondendo a mensagem', async () => {
        const [r] = await bot.executar('/todos', { id: 'CHAMADA' });
        assert.equal(r.chatId, GROUP);
        assert.equal(r.texto, `@${OTHERAlt.jid.split('@')[0]} @${CICLANO.jid.split('@')[0]} @777 `);
        assert.deepEqual(r.options.mentions, [OTHERAlt.jid, CICLANO.jid, '777@lid']);
        assert.match(r.options.quotedMessageId, /CHAMADA$/);
    });

    test('fora de grupo', async () => {
        assert.deepEqual(await bot.replyAlt('/todos', { chat: OTHERAlt.jid }), [onlyGroup]);
    });

    test('o alias /todes', async () => {
        const [r] = await bot.executar('/todes');
        assert.equal(r.chatId, GROUP);
        assert.deepEqual(r.options.mentions, [OTHERAlt.jid, CICLANO.jid, '777@lid']);
    });

    test('o antigo /everyone não responde mais', async () => {
        assert.deepEqual(await bot.replyAlt('/everyone'), ["⚠️ Comando '/everyone' desconhecido, tente: /help"]);
    });
});

describe('/boletos e /walissu', () => {
    test('/boletos sorteia 2 membros diferentes (nunca o bot)', async () => {
        for (let i = 0; i < 10; i++) {
            const [r] = await bot.executar('/boletos');
            const marked = r.options.mentions;
            assert.equal(marked.length, 2);
            assert.notEqual(marked[0], marked[1]);
            assert.ok(!marked.includes(OWNER.jid));
            assert.match(r.texto, /🥳 Parabéns @\S+ e @\S+ 🎉\nVocês foram sorteados para pagar um boleto!/);
        }
    });

    test('membros insuficientes e fora de grupo', async () => {
        bot.createGroup(GROUP, 'Família', [OWNER.jid, OTHERAlt.jid]);
        assert.deepEqual(await bot.replyAlt('/boletos'), ['Membros insuficientes no grupo.']);
        assert.deepEqual(await bot.replyAlt('/walissu'), ['Membros insuficientes no grupo.']);
        assert.deepEqual(await bot.replyAlt('/boletos', { chat: OTHERAlt.jid }), [onlyGroup]);
        assert.deepEqual(await bot.replyAlt('/walissu', { chat: OTHERAlt.jid }), [onlyGroup]);
    });

    test('/walissu: 2 membros e uma CVE recente', async () => {
        network.responder('get', 'services.nvd.nist.gov', (url, cfg) => cfg.params.startIndex === undefined
            ? { totalResults: 1 }
            : { vulnerabilities: [{ cve: { id: 'CVE-2026-0001', descriptions: [{ lang: 'en', value: 'Bug.' }], metrics: {} } }] });

        const [r] = await bot.executar('/walissu');
        assert.equal(r.options.mentions.length, 2);
        assert.match(r.texto, /Walissu CVE BOT[\s\S]*\*CVE-2026-0001\*[\s\S]*Preciso sair de Brasília!/);
    });

    test('/walissu (e o alias /ualisu) sem CVE ou com o NVD fora do ar', async () => {
        network.responder('get', 'services.nvd.nist.gov', { totalResults: 0 });
        assert.deepEqual(await bot.replyAlt('/walissu'), ['🛡️ Nenhuma CVE publicada nos últimos 2 dias.']);
        network.responder('get', 'services.nvd.nist.gov', new Error('503'));
        assert.deepEqual(await bot.replyAlt('/ualisu', { erroEsperado: true }), ['❌ Não consegui consultar o NVD agora.']);
    });
});

describe('/listageral', () => {
    test('número, nome e admins; @lid sem telefone fica oculto', async () => {
        const [r] = await bot.replyAlt('/listageral');
        assert.match(r, /👥 \*Membros de Família\* \(4\)/);
        assert.match(r, /\+5521911111111 - Fulano ⭐/);
        assert.match(r, /\+5521922222222 - Ciclano\n/);
        assert.match(r, /\+5521900000000 - Desconhecido 👑/);
        assert.match(r, /\(número oculto\) - Desconhecido/);
    });

    test('pelo alias /list', async () => {
        assert.match((await bot.replyAlt('/list'))[0], /👥 \*Membros de Família\* \(4\)/);
    });

    test('@lid com telefone conhecido mostra o número', async () => {
        bot.client.lids.set('777@lid', '5521933333333@c.us');
        assert.match((await bot.replyAlt('/listageral'))[0], /\+5521933333333 - Desconhecido/);
    });

    test('fora de grupo', async () => {
        assert.deepEqual(await bot.replyAlt('/listageral', { chat: OTHERAlt.jid }), [onlyGroup]);
    });
});

describe('/enquete (/enq, /quiz)', () => {
    const pollAlt = async (line) => {
        const [r] = await bot.executar(line);
        assert.ok(r.content instanceof Poll, `sem enquete para: ${line}`);
        return r.content;
    };

    test('pergunta e opções separadas por |', async () => {
        const p = await pollAlt('/enquete Pizza ou hambúrguer? | Pizza | Hambúrguer');
        assert.equal(p.pollName, 'Pizza ou hambúrguer?');
        assert.deepEqual(p.pollOptions.map(o => o.name), ['Pizza', 'Hambúrguer']);
        assert.equal(p.options.allowMultipleAnswers, false);
    });

    test('uma por linha; -m no começo permite várias', async () => {
        const p = await pollAlt('/enq -m Quais dias?\nSeg\nTer\nQua');
        assert.equal(p.pollName, 'Quais dias?');
        assert.equal(p.pollOptions.length, 3);
        assert.equal(p.options.allowMultipleAnswers, true);
        assert.equal((await pollAlt('/quiz -multi A? | 1 | 2')).options.allowMultipleAnswers, true);
    });

    test('-m no meio faz parte da pergunta', async () => {
        const p = await pollAlt('/enquete Vale -m aqui? | sim | não');
        assert.equal(p.pollName, 'Vale -m aqui?');
        assert.equal(p.options.allowMultipleAnswers, false);
    });

    test('pergunta começando com "/" nunca parece comando', async () => {
        assert.equal((await pollAlt('/enquete /cache -a | sim | não')).pollName, '📊 /cache -a');
    });

    test('validações: menos de 2 opções, mais de 12, repetidas, longas', async () => {
        const errorAlt = async (line, expected) => assert.match((await bot.replyAlt(line))[0], expected, line);
        await errorAlt('/enquete', /❌ Informe a pergunta e pelo menos 2 opções/);
        await errorAlt('/enquete Só? | uma', /pelo menos 2 opções/);
        await errorAlt(`/enquete P? | ${Array.from({ length: 13 }, (_, i) => `op${i}`).join(' | ')}`, /❌ No máximo 12 opções \(foram 13\)/);
        await errorAlt('/enquete P? | Sim | sim', /❌ Opção repetida: sim/);
        await errorAlt(`/enquete ${'x'.repeat(256)} | a | b`, /❌ A pergunta vai até 255 caracteres/);
        await errorAlt(`/enquete P? | ${'x'.repeat(101)} | b`, /cada opção até 100/);
    });

    test('só o dono usa', async () => {
        assert.deepEqual(await bot.replyAlt('/enquete P? | a | b', { de: OTHERAlt.jid }), []);
    });
});

describe('/enquete -r (resultado)', () => {
    const CICLANO_JID = '5521922222222@c.us';

    beforeEach(() => bot.createContact(CICLANO_JID, 'Ciclano'));

    test('placar da enquete mais recente do chat, com quem votou', async () => {
        const [sent] = await bot.executar('/enquete Pizza ou hambúrguer? | Pizza | Hambúrguer | Salada');

        // Before they vote: the poll is already registered
        assert.match((await bot.replyAlt('/enquete -r'))[0], /📊 \*Resultado: Pizza ou hambúrguer\?\*\n_0 votos de 0 pessoas · criada em [^_]+_\n[\s\S]*_Ninguém votou ainda\._/);

        await bot.voteAlt(sent, OTHERAlt.jid, ['Pizza']);
        await bot.voteAlt(sent, CICLANO_JID, ['Hambúrguer']);
        await bot.voteAlt(sent, OWNER.jid, ['Pizza']);

        const [r] = await bot.replyAlt('/enq -r');
        assert.match(r, /_3 votos de 3 pessoas · criada em/);
        assert.match(r, /🏆 \*Pizza\* — 2 \(67%\) █{7}\n   _Fulano, Dono_/);
        assert.match(r, /▫️ \*Hambúrguer\* — 1 \(33%\) ███\n   _Ciclano_/);
        assert.match(r, /▫️ \*Salada\* — 0 \(0%\) ▏$/);
    });

    test('mudar ou tirar o voto; várias respostas', async () => {
        const [sent] = await bot.executar('/enquete -m Dias? | Seg | Ter');
        await bot.voteAlt(sent, OTHERAlt.jid, ['Seg']);
        await bot.voteAlt(sent, OTHERAlt.jid, ['Seg', 'Ter']);   // changed: the last one counts
        await bot.voteAlt(sent, CICLANO_JID, ['Ter']);
        await bot.voteAlt(sent, CICLANO_JID, []);             // tirou o voto

        const [r] = await bot.replyAlt('/enquete -result');
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
        await bot.executar('/enquete Outra? | a | b');   // most recent

        assert.match((await bot.replyAlt('/enquete -r'))[0], /Resultado: Outra\?/);

        const quoted = bot.createMessage({ tipo: 'poll_creation', id: 'POLL1' });
        const [r] = await bot.replyAlt('/enquete -r', { citada: quoted });
        assert.match(r, /Resultado: Churrasco\?[\s\S]*🏆 \*Sim\* — 1 \(100%\)/);

        const unknown = bot.createMessage({ tipo: 'poll_creation', id: 'NAOSEI' });
        assert.match((await bot.replyAlt('/enquete -r', { citada: unknown }))[0], /📊 Não tenho os votos dessa enquete/);
    });

    test('sem enquete no chat; -r no meio faz parte da pergunta', async () => {
        assert.match((await bot.replyAlt('/enquete -r'))[0], /📊 Nenhuma enquete registrada neste chat/);
        const [r] = await bot.executar('/enquete Vale -r aqui? | sim | não');
        assert.equal(r.content.pollName, 'Vale -r aqui?');
    });

    test('limpeza: enquetes mais antigas que enquete.retentionDays saem com os votos', async () => {
        const { cleanPollsOld } = bot.src('cleanup');
        const [sent] = await bot.executar('/enquete Velha? | a | b');
        await bot.voteAlt(sent, OTHERAlt.jid, ['a']);
        await bot.dbRun('UPDATE polls SET created_at = ?', [Date.now() - 91 * 86400_000]);

        await cleanPollsOld();
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM polls')).n, 0);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM poll_votes')).n, 0);
    });
});

describe('/sticker (/st)', () => {
    const photo = { mimetype: 'image/jpeg', data: Buffer.from('jpg').toString('base64') };

    test('sem responder uma mensagem', async () => {
        assert.match((await bot.replyAlt('/sticker'))[0], /^```Uso: \/sticker/);
    });

    test('imagem: enquadrada em webp, com o nome e o autor do setting', async () => {
        await bot.setSetting('sticker.name', 'Meu Pacote');
        const quoted = bot.createMessage({ de: OTHERAlt.jid, midia: photo });
        const [r] = await bot.executar('/st', { citada: quoted });

        assert.ok(r.content instanceof MessageMedia);
        assert.equal(r.content.mimetype, 'image/webp');
        assert.equal(Buffer.from(r.content.data, 'base64').toString(), 'webp-enquadrado');
        assert.deepEqual([r.options.sendMediaAsSticker, r.options.stickerName, r.options.stickerAuthor],
            [true, 'Meu Pacote', 'https://github.com/jpereira/zapbot/']);
    });

    test('webp e vídeo vão como estão', async () => {
        for (const mediaAlt of [{ mimetype: 'image/webp', data: 'AA==' }, { mimetype: 'video/mp4', data: 'AA==' }]) {
            const [r] = await bot.executar('/sticker', { citada: bot.createMessage({ de: OTHERAlt.jid, midia: mediaAlt }) });
            assert.equal(r.content, mediaAlt);
        }
    });

    test('link: usa o thumbnail da prévia (interno ou externo)', async () => {
        const withThumb = bot.createMessage({ texto: 'https://x.com/post', de: OTHERAlt.jid, extras: { _data: { thumbnail: Buffer.from('thumb').toString('base64') } } });
        const [internal] = await bot.executar('/sticker', { citada: withThumb });
        assert.equal(internal.content.mimetype, 'image/webp');

        MessageMedia.urls.set('https://img.x.com/t.jpg', new MessageMedia('image/jpeg', 'AA==', 't.jpg'));
        const external = bot.createMessage({ texto: 'https://x.com/post', de: OTHERAlt.jid, extras: { _data: { thumbnailUrl: 'https://img.x.com/t.jpg' } } });
        assert.equal((await bot.executar('/sticker', { citada: external }))[0].content.mimetype, 'image/webp');
    });

    test('mensagem sem mídia nem link; link sem thumbnail', async () => {
        assert.deepEqual(await bot.replyAlt('/sticker', { citada: bot.createMessage({ texto: 'só texto', de: OTHERAlt.jid }) }),
            ['A mensagem respondida não tem mídia nem link.']);
        assert.deepEqual(await bot.replyAlt('/sticker', { citada: bot.createMessage({ texto: 'https://x.com/a', de: OTHERAlt.jid }) }),
            ['Não encontrei thumbnail baixável para:\nhttps://x.com/a']);
    });

    test('-txt: os dois quadros em PNG (letra fg no fundo bg, e o contrário), juntados pelo ffmpeg num WEBP animado', async () => {
        const { textFrames, readCor } = bot.src('stickerText');
        const sharp = require('sharp');   // the environment's fake: stores what was requested

        sharp.entradas.length = 0;
        await textFrames('Bom dia <b>&', { fg: '#000000', bg: '#FFFF00' });
        const [t0, c0, t1, c1] = sharp.entradas;
        assert.equal(t0.text.text, '<span foreground="#000000">Bom dia &lt;b&gt;&amp;</span>', 'o texto vai escapado');
        assert.deepEqual([t0.text.width, t0.text.height, c0.create.width, c0.create.background], [432, 432, 512, '#FFFF00']);
        assert.deepEqual([t1.text.text.slice(0, 26), c1.create.background], ['<span foreground="#FFFF00"', '#000000'], 'o 2º quadro inverte');
        assert.deepEqual([readCor('#fff'), readCor('C0392B'), readCor('azul')], ['#FFFFFF', '#C0392B', null]);

        bot.processes.chamadas.length = 0;
        const [r] = await bot.executar('/sticker -txt "Bom dia, grupo!" -bg "#C0392B" -fg #fff');
        assert.equal(r.content.mimetype, 'image/webp');
        assert.equal(r.options.sendMediaAsSticker, true);

        const [ffmpeg] = bot.processes.chamadas;
        assert.match(ffmpeg.bin, /ffmpeg$/);
        assert.deepEqual(ffmpeg.args.slice(ffmpeg.args.indexOf('-c:v'), ffmpeg.args.indexOf('-c:v') + 2), ['-c:v', 'libwebp']);
        assert.ok(ffmpeg.args.join(' ').includes('-framerate 2') && ffmpeg.args.join(' ').includes('-loop 0'));
        assert.match(ffmpeg.args[ffmpeg.args.indexOf('-i') + 1], /quadro_%d\.png$/);

        // Without quotes and without colors: the default (black letter, white background)
        assert.equal((await bot.executar('/st -txt Partiu praia?'))[0].content.mimetype, 'image/webp');
    });

    test('-txt: erros de texto, cor e ffmpeg', async () => {
        const errorAlt = async (line, expected) => assert.deepEqual(await bot.replyAlt(line, { erroEsperado: true }), [expected], line);
        await errorAlt('/sticker -txt', '❌ Informe o texto: /sticker -txt "Bom dia!"');
        await errorAlt(`/sticker -txt ${'a'.repeat(201)}`, '❌ Texto longo demais: até 200 caracteres.');
        await errorAlt('/sticker -txt oi -bg azul', '❌ -bg: "azul" não é uma cor. Use #RRGGBB (ex.: #FFFFFF).');
        await errorAlt('/sticker -txt oi -fg #12', '❌ -fg: "#12" não é uma cor. Use #RRGGBB (ex.: #000000).');
        await errorAlt('/sticker -txt oi -bg #000 -fg #000000', '❌ O -bg e o -fg são a mesma cor: o texto não apareceria.');
        await errorAlt('/sticker -bg #fff', '❌ O -bg e o -fg são do -txt: /sticker -txt "Bom dia!" -bg "#FFFFFF" -fg "#000000"');

        bot.processes.falhar = 'ffmpeg';
        await errorAlt('/sticker -txt oi', '❌ Não consegui gerar a figurinha: /usr/bin/ffmpeg exited with code 1');
    });
});
