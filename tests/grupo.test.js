/*
 * Comandos de grupo e de mídia: /todos (/todes), /boletos, /listageral, /walissu (/ualisu),
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

describe('/todos (/todes)', () => {
    test('marca todos menos quem chamou, respondendo a mensagem', async () => {
        const [r] = await bot.executar('/todos', { id: 'CHAMADA' });
        assert.equal(r.chatId, GRUPO);
        assert.equal(r.texto, `@${OUTRO.jid.split('@')[0]} @${CICLANO.jid.split('@')[0]} @777 `);
        assert.deepEqual(r.options.mentions, [OUTRO.jid, CICLANO.jid, '777@lid']);
        assert.match(r.options.quotedMessageId, /CHAMADA$/);
    });

    test('fora de grupo', async () => {
        assert.deepEqual(await bot.responder('/todos', { chat: OUTRO.jid }), [somenteGrupo]);
    });

    test('o alias /todes', async () => {
        const [r] = await bot.executar('/todes');
        assert.equal(r.chatId, GRUPO);
        assert.deepEqual(r.options.mentions, [OUTRO.jid, CICLANO.jid, '777@lid']);
    });

    test('o antigo /everyone não responde mais', async () => {
        assert.deepEqual(await bot.responder('/everyone'), ["⚠️ Comando '/everyone' desconhecido, tente: /help"]);
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

    test('pelo alias /list', async () => {
        assert.match((await bot.responder('/list'))[0], /👥 \*Membros de Família\* \(4\)/);
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

describe('/enquete -r (resultado)', () => {
    const CICLANO_JID = '5521922222222@c.us';

    beforeEach(() => bot.criarContato(CICLANO_JID, 'Ciclano'));

    test('placar da enquete mais recente do chat, com quem votou', async () => {
        const [enviada] = await bot.executar('/enquete Pizza ou hambúrguer? | Pizza | Hambúrguer | Salada');

        // Antes de votarem: a enquete já está registrada
        assert.match((await bot.responder('/enquete -r'))[0], /📊 \*Resultado: Pizza ou hambúrguer\?\*\n_0 votos de 0 pessoas · criada em [^_]+_\n[\s\S]*_Ninguém votou ainda\._/);

        await bot.votar(enviada, OUTRO.jid, ['Pizza']);
        await bot.votar(enviada, CICLANO_JID, ['Hambúrguer']);
        await bot.votar(enviada, DONO.jid, ['Pizza']);

        const [r] = await bot.responder('/enq -r');
        assert.match(r, /_3 votos de 3 pessoas · criada em/);
        assert.match(r, /🏆 \*Pizza\* — 2 \(67%\) █{7}\n   _Fulano, Dono_/);
        assert.match(r, /▫️ \*Hambúrguer\* — 1 \(33%\) ███\n   _Ciclano_/);
        assert.match(r, /▫️ \*Salada\* — 0 \(0%\) ▏$/);
    });

    test('mudar ou tirar o voto; várias respostas', async () => {
        const [enviada] = await bot.executar('/enquete -m Dias? | Seg | Ter');
        await bot.votar(enviada, OUTRO.jid, ['Seg']);
        await bot.votar(enviada, OUTRO.jid, ['Seg', 'Ter']);   // mudou: vale o último
        await bot.votar(enviada, CICLANO_JID, ['Ter']);
        await bot.votar(enviada, CICLANO_JID, []);             // tirou o voto

        const [r] = await bot.responder('/enquete -result');
        assert.match(r, /_2 votos de 1 pessoa · várias respostas ·/);
        assert.match(r, /🏆 \*Seg\* — 1 \(50%\)[^\n]*\n   _Fulano_/);
        assert.match(r, /🏆 \*Ter\* — 1 \(50%\)[^\n]*\n   _Fulano_/);
    });

    test('enquete criada no celular entra com o primeiro voto; respondendo a enquete, o placar é o dela', async () => {
        const doCelular = {
            id: { id: 'POLL1', remote: bot.GRUPO, fromMe: true, _serialized: `true_${bot.GRUPO}_POLL1` },
            pollName: 'Churrasco?',
            pollOptions: [{ name: 'Sim', localId: 0 }, { name: 'Não', localId: 1 }]
        };
        await bot.votar(doCelular, OUTRO.jid, ['Sim']);
        await bot.executar('/enquete Outra? | a | b');   // mais recente

        assert.match((await bot.responder('/enquete -r'))[0], /Resultado: Outra\?/);

        const citada = bot.criarMensagem({ tipo: 'poll_creation', id: 'POLL1' });
        const [r] = await bot.responder('/enquete -r', { citada });
        assert.match(r, /Resultado: Churrasco\?[\s\S]*🏆 \*Sim\* — 1 \(100%\)/);

        const desconhecida = bot.criarMensagem({ tipo: 'poll_creation', id: 'NAOSEI' });
        assert.match((await bot.responder('/enquete -r', { citada: desconhecida }))[0], /📊 Não tenho os votos dessa enquete/);
    });

    test('sem enquete no chat; -r no meio faz parte da pergunta', async () => {
        assert.match((await bot.responder('/enquete -r'))[0], /📊 Nenhuma enquete registrada neste chat/);
        const [r] = await bot.executar('/enquete Vale -r aqui? | sim | não');
        assert.equal(r.content.pollName, 'Vale -r aqui?');
    });

    test('limpeza: enquetes mais antigas que enquete.retentionDays saem com os votos', async () => {
        const { limparEnquetesAntigas } = bot.src('limpeza');
        const [enviada] = await bot.executar('/enquete Velha? | a | b');
        await bot.votar(enviada, OUTRO.jid, ['a']);
        await bot.dbRun('UPDATE polls SET created_at = ?', [Date.now() - 91 * 86400_000]);

        await limparEnquetesAntigas();
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM polls')).n, 0);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM poll_votes')).n, 0);
    });
});

describe('/sticker (/st)', () => {
    const foto = { mimetype: 'image/jpeg', data: Buffer.from('jpg').toString('base64') };

    test('sem responder uma mensagem', async () => {
        assert.match((await bot.responder('/sticker'))[0], /^```Uso: \/sticker/);
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

    test('webp vai como está; vídeo vira figurinha animada pelo ffmpeg, com -ss e -es', async () => {
        const webp = { mimetype: 'image/webp', data: 'AA==' };
        const [r] = await bot.executar('/sticker', { citada: bot.criarMensagem({ de: OUTRO.jid, midia: webp }) });
        assert.equal(r.content, webp);

        const video = bot.criarMensagem({ de: OUTRO.jid, midia: { mimetype: 'video/mp4', data: 'AA==' } });
        const [aviso, sticker] = await bot.executar('/st -ss 4 -es 7', { citada: video });
        assert.equal(aviso.texto, '✅ Sticker criado com sucesso!');
        assert.equal(sticker.options.sendMediaAsSticker, true);

        const [ffmpeg] = bot.processos.chamadas;
        assert.match(ffmpeg.bin, /ffmpeg$/);
        assert.equal(ffmpeg.args[ffmpeg.args.indexOf('-ss') + 1], '4');
        assert.equal(ffmpeg.args[ffmpeg.args.indexOf('-t') + 1], '3');
        assert.match(ffmpeg.args[ffmpeg.args.indexOf('-vf') + 1], /crop=512:512/);
    });

    test('URL ou link respondido: baixa o vídeo, como o /get -st', async () => {
        await bot.executar('/sticker -ss 10 http://8.8.8.8/video');
        assert.deepEqual(bot.processos.chamadas.map(c => c.bin.split('/').pop()), ['yt-dlp', 'ffmpeg']);
        const ff = bot.processos.chamadas[1].args;
        assert.equal(ff[ff.indexOf('-ss') + 1], '10');
        assert.equal(ff[ff.indexOf('-t') + 1], '6', 'sem -es: os 6 s seguintes');

        bot.processos.chamadas.length = 0;
        const [, sticker] = await bot.executar('/sticker', { citada: bot.criarMensagem({ texto: 'olha http://8.8.8.8/v', de: OUTRO.jid }) });
        assert.equal(bot.processos.chamadas[0].args.at(-1), 'http://8.8.8.8/v');
        assert.equal(sticker.options.sendMediaAsSticker, true);
    });

    test('link sem vídeo: usa a prévia do link (interna ou externa) e edita o aviso', async () => {
        bot.processos.falhar = 'yt-dlp';
        const comThumb = bot.criarMensagem({ texto: 'http://8.8.8.8/post', de: OUTRO.jid, extras: { _data: { thumbnail: Buffer.from('thumb').toString('base64') } } });
        const [aviso, interno] = await bot.executar('/sticker', { citada: comThumb });
        assert.equal(aviso.texto, '✅ Sticker criado com sucesso!');
        assert.equal(interno.content.mimetype, 'image/webp');
        assert.equal(interno.options.sendMediaAsSticker, true);

        MessageMedia.urls.set('https://img.x.com/t.jpg', new MessageMedia('image/jpeg', 'AA==', 't.jpg'));
        const externo = bot.criarMensagem({ texto: 'http://8.8.8.8/post', de: OUTRO.jid, extras: { _data: { thumbnailUrl: 'https://img.x.com/t.jpg' } } });
        assert.equal((await bot.executar('/sticker', { citada: externo }))[1].content.mimetype, 'image/webp');

        // Link que não pode ser baixado (endereço privado): a prévia também serve, sem aviso
        const privado = bot.criarMensagem({ texto: 'http://127.0.0.1/post', de: OUTRO.jid, extras: { _data: { thumbnail: 'AA==' } } });
        const r = await bot.executar('/sticker', { citada: privado });
        assert.equal(r.length, 1);
        assert.equal(r[0].options.sendMediaAsSticker, true);
    });

    test('mensagem sem mídia nem link; link sem vídeo nem prévia; áudio', async () => {
        assert.deepEqual(await bot.responder('/sticker', { citada: bot.criarMensagem({ texto: 'só texto', de: OUTRO.jid }) }),
            ['❌ A mensagem respondida não tem mídia nem link.']);

        bot.processos.falhar = 'yt-dlp';
        const r = await bot.executar('/sticker', { citada: bot.criarMensagem({ texto: 'http://8.8.8.8/a', de: OUTRO.jid }), erroEsperado: true });
        assert.equal(r.length, 1);
        assert.match(r[0].texto, /Problemas para baixar com/);

        const audio = bot.criarMensagem({ de: OUTRO.jid, midia: { mimetype: 'audio/ogg', data: 'AA==' } });
        assert.deepEqual(await bot.responder('/sticker', { citada: audio }), ['❌ Não dá para fazer figurinha de um áudio.']);
    });

    test('-txt: os dois quadros em PNG (letra fg no fundo bg, e o contrário), juntados pelo ffmpeg num WEBP animado', async () => {
        const { quadrosDoTexto, lerCor } = bot.src('stickerTexto');
        const sharp = require('sharp');   // o falso do ambiente: guarda o que foi pedido

        sharp.entradas.length = 0;
        await quadrosDoTexto('Bom dia <b>&', { fg: '#000000', bg: '#FFFF00' });
        const [t0, c0, t1, c1] = sharp.entradas;
        assert.equal(t0.text.text, '<span foreground="#000000">Bom dia &lt;b&gt;&amp;</span>', 'o texto vai escapado');
        assert.deepEqual([t0.text.width, t0.text.height, c0.create.width, c0.create.background], [432, 432, 512, '#FFFF00']);
        assert.deepEqual([t1.text.text.slice(0, 26), c1.create.background], ['<span foreground="#FFFF00"', '#000000'], 'o 2º quadro inverte');
        assert.deepEqual([lerCor('#fff'), lerCor('C0392B'), lerCor('azul')], ['#FFFFFF', '#C0392B', null]);

        bot.processos.chamadas.length = 0;
        const [r] = await bot.executar('/sticker -txt "Bom dia, grupo!" -bg "#C0392B" -fg #fff');
        assert.equal(r.content.mimetype, 'image/webp');
        assert.equal(r.options.sendMediaAsSticker, true);

        const [ffmpeg] = bot.processos.chamadas;
        assert.match(ffmpeg.bin, /ffmpeg$/);
        assert.deepEqual(ffmpeg.args.slice(ffmpeg.args.indexOf('-c:v'), ffmpeg.args.indexOf('-c:v') + 2), ['-c:v', 'libwebp']);
        assert.ok(ffmpeg.args.join(' ').includes('-framerate 2') && ffmpeg.args.join(' ').includes('-loop 0'));
        assert.match(ffmpeg.args[ffmpeg.args.indexOf('-i') + 1], /quadro_%d\.png$/);

        // Sem aspas e sem cores: o padrão (letra preta, fundo branco)
        assert.equal((await bot.executar('/st -txt Partiu praia?'))[0].content.mimetype, 'image/webp');
    });

    test('-txt: erros de texto, cor e ffmpeg', async () => {
        const erro = async (linha, esperado) => assert.deepEqual(await bot.responder(linha, { erroEsperado: true }), [esperado], linha);
        await erro('/sticker -txt', '❌ Informe o texto: /sticker -txt "Bom dia!"');
        await erro(`/sticker -txt ${'a'.repeat(201)}`, '❌ Texto longo demais: até 200 caracteres.');
        await erro('/sticker -txt oi -bg azul', '❌ -bg: "azul" não é uma cor. Use #RRGGBB (ex.: #FFFFFF).');
        await erro('/sticker -txt oi -fg #12', '❌ -fg: "#12" não é uma cor. Use #RRGGBB (ex.: #000000).');
        await erro('/sticker -txt oi -bg #000 -fg #000000', '❌ O -bg e o -fg são a mesma cor: o texto não apareceria.');
        await erro('/sticker -bg #fff', '❌ O -bg e o -fg são do -txt: /sticker -txt "Bom dia!" -bg "#FFFFFF" -fg "#000000"');

        bot.processos.falhar = 'ffmpeg';
        await erro('/sticker -txt oi', '❌ Não consegui gerar a figurinha: /usr/bin/ffmpeg exited with code 1');
    });
});
