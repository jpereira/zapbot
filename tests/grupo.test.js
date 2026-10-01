/*
 * Comandos de grupo e de mídia: /everyone, /boletos, /listageral, /walissu (/ualisu),
 * /enquete (/enq, /quiz) e /sticker (/st).
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { DONO, GRUPO, OUTRO, MessageMedia, Poll, rede } = bot;

const CICLANO = { jid: '5521922222222@c.us', nome: 'Ciclano' };

beforeEach(async () => {
    await bot.reiniciar();
    bot.criarContato(CICLANO.jid, CICLANO.nome);
    bot.criarGrupo(GRUPO, 'Família', [
        { jid: DONO.jid, isSuperAdmin: true },
        { jid: OUTRO.jid, isAdmin: true },
        CICLANO.jid,
        '777@lid'
    ]);
});

const somenteGrupo = 'Apenas utilizado dentro de grupos.';

describe('/everyone', () => {
    test('marca todos menos quem chamou, respondendo a mensagem', async () => {
        const [r] = await bot.executar('/everyone', { id: 'CHAMADA' });
        assert.equal(r.chatId, GRUPO);
        assert.equal(r.texto, `@${OUTRO.jid.split('@')[0]} @${CICLANO.jid.split('@')[0]} @777 `);
        assert.deepEqual(r.options.mentions, [OUTRO.jid, CICLANO.jid, '777@lid']);
        assert.match(r.options.quotedMessageId, /CHAMADA$/);
    });

    test('fora de grupo', async () => {
        assert.deepEqual(await bot.responder('/everyone', { chat: OUTRO.jid }), [somenteGrupo]);
    });
});

describe('/boletos e /walissu', () => {
    test('/boletos sorteia 2 membros diferentes (nunca o bot)', async () => {
        for (let i = 0; i < 10; i++) {
            const [r] = await bot.executar('/boletos');
            const marcados = r.options.mentions;
            assert.equal(marcados.length, 2);
            assert.notEqual(marcados[0], marcados[1]);
            assert.ok(!marcados.includes(DONO.jid));
            assert.match(r.texto, /🥳 Parabéns @\S+ e @\S+ 🎉\nVocês foram sorteados para pagar um boleto!/);
        }
    });

    test('membros insuficientes e fora de grupo', async () => {
        bot.criarGrupo(GRUPO, 'Família', [DONO.jid, OUTRO.jid]);
        assert.deepEqual(await bot.responder('/boletos'), ['Membros insuficientes no grupo.']);
        assert.deepEqual(await bot.responder('/walissu'), ['Membros insuficientes no grupo.']);
        assert.deepEqual(await bot.responder('/boletos', { chat: OUTRO.jid }), [somenteGrupo]);
        assert.deepEqual(await bot.responder('/walissu', { chat: OUTRO.jid }), [somenteGrupo]);
    });

    test('/walissu: 2 membros e uma CVE recente', async () => {
        rede.responder('get', 'services.nvd.nist.gov', (url, cfg) => cfg.params.startIndex === undefined
            ? { totalResults: 1 }
            : { vulnerabilities: [{ cve: { id: 'CVE-2026-0001', descriptions: [{ lang: 'en', value: 'Bug.' }], metrics: {} } }] });

        const [r] = await bot.executar('/walissu');
        assert.equal(r.options.mentions.length, 2);
        assert.match(r.texto, /Walissu CVE BOT[\s\S]*\*CVE-2026-0001\*[\s\S]*Preciso sair de Brasília!/);
    });

    test('/walissu (e o alias /ualisu) sem CVE ou com o NVD fora do ar', async () => {
        rede.responder('get', 'services.nvd.nist.gov', { totalResults: 0 });
        assert.deepEqual(await bot.responder('/walissu'), ['🛡️ Nenhuma CVE publicada nos últimos 2 dias.']);
        rede.responder('get', 'services.nvd.nist.gov', new Error('503'));
        assert.deepEqual(await bot.responder('/ualisu', { erroEsperado: true }), ['❌ Não consegui consultar o NVD agora.']);
    });
});

describe('/listageral', () => {
    test('número, nome e admins; @lid sem telefone fica oculto', async () => {
        const [r] = await bot.responder('/listageral');
        assert.match(r, /👥 \*Membros de Família\* \(4\)/);
        assert.match(r, /\+5521911111111 - Fulano ⭐/);
        assert.match(r, /\+5521922222222 - Ciclano\n/);
        assert.match(r, /\+5521900000000 - Desconhecido 👑/);
        assert.match(r, /\(número oculto\) - Desconhecido/);
    });

    test('@lid com telefone conhecido mostra o número', async () => {
        bot.client.lids.set('777@lid', '5521933333333@c.us');
        assert.match((await bot.responder('/listageral'))[0], /\+5521933333333 - Desconhecido/);
    });

    test('fora de grupo', async () => {
        assert.deepEqual(await bot.responder('/listageral', { chat: OUTRO.jid }), [somenteGrupo]);
    });
});

describe('/enquete (/enq, /quiz)', () => {
    const enquete = async (linha) => {
        const [r] = await bot.executar(linha);
        assert.ok(r.content instanceof Poll, `sem enquete para: ${linha}`);
        return r.content;
    };

    test('pergunta e opções separadas por |', async () => {
        const p = await enquete('/enquete Pizza ou hambúrguer? | Pizza | Hambúrguer');
        assert.equal(p.pollName, 'Pizza ou hambúrguer?');
        assert.deepEqual(p.pollOptions.map(o => o.name), ['Pizza', 'Hambúrguer']);
        assert.equal(p.options.allowMultipleAnswers, false);
    });

    test('uma por linha; -m no começo permite várias', async () => {
        const p = await enquete('/enq -m Quais dias?\nSeg\nTer\nQua');
        assert.equal(p.pollName, 'Quais dias?');
        assert.equal(p.pollOptions.length, 3);
        assert.equal(p.options.allowMultipleAnswers, true);
        assert.equal((await enquete('/quiz -multi A? | 1 | 2')).options.allowMultipleAnswers, true);
    });

    test('-m no meio faz parte da pergunta', async () => {
        const p = await enquete('/enquete Vale -m aqui? | sim | não');
        assert.equal(p.pollName, 'Vale -m aqui?');
        assert.equal(p.options.allowMultipleAnswers, false);
    });

    test('pergunta começando com "/" nunca parece comando', async () => {
        assert.equal((await enquete('/enquete /cache -a | sim | não')).pollName, '📊 /cache -a');
    });

    test('validações: menos de 2 opções, mais de 12, repetidas, longas', async () => {
        const erro = async (linha, esperado) => assert.match((await bot.responder(linha))[0], esperado, linha);
        await erro('/enquete', /❌ Informe a pergunta e pelo menos 2 opções/);
        await erro('/enquete Só? | uma', /pelo menos 2 opções/);
        await erro(`/enquete P? | ${Array.from({ length: 13 }, (_, i) => `op${i}`).join(' | ')}`, /❌ No máximo 12 opções \(foram 13\)/);
        await erro('/enquete P? | Sim | sim', /❌ Opção repetida: sim/);
        await erro(`/enquete ${'x'.repeat(256)} | a | b`, /❌ A pergunta vai até 255 caracteres/);
        await erro(`/enquete P? | ${'x'.repeat(101)} | b`, /cada opção até 100/);
    });

    test('só o dono usa', async () => {
        assert.deepEqual(await bot.responder('/enquete P? | a | b', { de: OUTRO.jid }), []);
    });
});

describe('/sticker (/st)', () => {
    const foto = { mimetype: 'image/jpeg', data: Buffer.from('jpg').toString('base64') };

    test('sem responder uma mensagem', async () => {
        assert.deepEqual(await bot.responder('/sticker'), ["Syntax: Faça um 'reply' utilizando /sticker"]);
    });

    test('imagem: enquadrada em webp, com o nome e o autor do setting', async () => {
        await bot.setSetting('sticker.name', 'Meu Pacote');
        const citada = bot.criarMensagem({ de: OUTRO.jid, midia: foto });
        const [r] = await bot.executar('/st', { citada });

        assert.ok(r.content instanceof MessageMedia);
        assert.equal(r.content.mimetype, 'image/webp');
        assert.equal(Buffer.from(r.content.data, 'base64').toString(), 'webp-enquadrado');
        assert.deepEqual([r.options.sendMediaAsSticker, r.options.stickerName, r.options.stickerAuthor],
            [true, 'Meu Pacote', 'https://github.com/jpereira/zapbot/']);
    });

    test('webp e vídeo vão como estão', async () => {
        for (const midia of [{ mimetype: 'image/webp', data: 'AA==' }, { mimetype: 'video/mp4', data: 'AA==' }]) {
            const [r] = await bot.executar('/sticker', { citada: bot.criarMensagem({ de: OUTRO.jid, midia }) });
            assert.equal(r.content, midia);
        }
    });

    test('link: usa o thumbnail da prévia (interno ou externo)', async () => {
        const comThumb = bot.criarMensagem({ texto: 'https://x.com/post', de: OUTRO.jid, extras: { _data: { thumbnail: Buffer.from('thumb').toString('base64') } } });
        const [interno] = await bot.executar('/sticker', { citada: comThumb });
        assert.equal(interno.content.mimetype, 'image/webp');

        MessageMedia.urls.set('https://img.x.com/t.jpg', new MessageMedia('image/jpeg', 'AA==', 't.jpg'));
        const externo = bot.criarMensagem({ texto: 'https://x.com/post', de: OUTRO.jid, extras: { _data: { thumbnailUrl: 'https://img.x.com/t.jpg' } } });
        assert.equal((await bot.executar('/sticker', { citada: externo }))[0].content.mimetype, 'image/webp');
    });

    test('mensagem sem mídia nem link; link sem thumbnail', async () => {
        assert.deepEqual(await bot.responder('/sticker', { citada: bot.criarMensagem({ texto: 'só texto', de: OUTRO.jid }) }),
            ['A mensagem respondida não tem mídia nem link.']);
        assert.deepEqual(await bot.responder('/sticker', { citada: bot.criarMensagem({ texto: 'https://x.com/a', de: OUTRO.jid }) }),
            ['Não encontrei thumbnail baixável para:\nhttps://x.com/a']);
    });
});
