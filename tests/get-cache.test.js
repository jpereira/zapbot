/*
 * /get, /cache and the cache cleanup routines.
 * yt-dlp and ffmpeg are simulated: the fake spawn only creates the output files.
 */
const bot = require('./helpers/bot');

const fs = require('fs');
const path = require('path');
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { CACHE_DIR, MessageMedia, OTHERAlt, processes, network } = bot;
const { isUrlPublic, isValidHttpUrl, extractFirstUrl } = bot.src('util/url');
const cleanup = bot.src('cleanup');

const MEDIA_DIR = path.join(CACHE_DIR, 'media');
const TMP_DIR = path.join(CACHE_DIR, 'tmp');
const { BACKUP_DIR } = bot.src('constants');
const { createBackup, listBackups, removeBackup } = bot.src('backup');
const URL = 'http://8.8.8.8/video'; // IP literal: sem consulta de DNS
const DAY = 24 * 60 * 60 * 1000;

beforeEach(bot.restart);

const binaries = () => processes.chamadas.map(c => path.basename(c.bin));
const argsDo = (nameAlt) => processes.chamadas.find(c => path.basename(c.bin) === nameAlt).args;
const filesTemporary = () => fs.readdirSync(TMP_DIR).filter(f => !f.startsWith('.'));

describe('URLs (anti-SSRF do /get)', () => {
    test('só http(s)', () => {
        assert.equal(isValidHttpUrl('https://x.com'), true);
        for (const u of ['ftp://x.com', 'file:///etc/passwd', 'javascript:alert(1)', 'nada']) assert.equal(isValidHttpUrl(u), false, u);
    });

    test('endereços privados, loopback e link-local são recusados', async () => {
        for (const u of ['http://127.0.0.1/', 'http://10.1.2.3/', 'http://192.168.0.1/', 'http://172.16.5.4/',
            'http://169.254.169.254/', 'http://0.0.0.0/', 'http://[::1]/', 'http://[fe80::1]/', 'http://[::ffff:10.0.0.1]/']) {
            assert.equal(await isUrlPublic(u), false, u);
        }
        assert.equal(await isUrlPublic('http://8.8.8.8/'), true);
        assert.equal(await isUrlPublic('http://[2001:4860:4860::8888]/'), true);
    });

    test('extrai a primeira URL de um texto', () => {
        assert.equal(extractFirstUrl('olha isso https://a.com/x?y=1 e http://b.com'), 'https://a.com/x?y=1');
        assert.equal(extractFirstUrl('sem link'), null);
    });
});

describe('/get', () => {
    // The downloads cache (get.cache.tmp) has its tests, further below
    beforeEach(() => bot.setSetting('get.cache.tmp', false));

    test('vídeo: baixa com yt-dlp, converte com ffmpeg e manda como documento', async () => {
        const r = await bot.executar(`/get ${URL}`, { de: OTHERAlt.jid });
        assert.ok(r[1].content instanceof MessageMedia);
        assert.equal(r[1].options.sendMediaAsDocument, true);
        assert.equal(r[1].options.caption, '📥 Aqui está a mídia para download.');
        assert.equal(r[0].texto, '✅ Mídia baixada com sucesso!', 'o aviso vira a confirmação');

        assert.deepEqual(binaries(), ['yt-dlp', 'ffmpeg']);
        const yt = argsDo('yt-dlp');
        assert.deepEqual(yt.slice(-2), ['--', URL]);
        assert.ok(yt.includes('--no-playlist'));
        assert.equal(yt[yt.indexOf('--max-filesize') + 1], '200M');
        assert.deepEqual(argsDo('ffmpeg').slice(0, 3), ['-y', '-protocol_whitelist', 'file']);
        assert.deepEqual(filesTemporary(), [], 'os temporários foram apagados');
    });

    test('-a: só o áudio em mp3', async () => {
        await bot.executar(`/get -a ${URL}`);
        const ff = argsDo('ffmpeg');
        assert.ok(ff.includes('-vn') && ff.includes('libmp3lame'));
        assert.match(ff.at(-1), /_output\.mp3$/);
    });

    test('-st: figurinha animada de até 6 s', async () => {
        const r = await bot.executar(`/get -st ${URL}`);
        assert.equal(r[1].options.sendMediaAsSticker, true);
        assert.equal(r[0].texto, '✅ Sticker criado com sucesso!', 'o aviso vira a confirmação');
        assert.equal(r.length, 2);
        const ff = argsDo('ffmpeg');
        assert.equal(ff[ff.indexOf('-t') + 1], '6');
        assert.match(ff[ff.indexOf('-vf') + 1], /crop=512:512/);
    });

    // The snippet yt-dlp downloads (--download-sections) and the ffmpeg cuts
    const snippet = () => {
        const yt = processes.chamadas.find(c => path.basename(c.bin) === 'yt-dlp' && c.args.includes('-o')).args;
        const ff = argsDo('ffmpeg');
        return {
            secao: yt.includes('--download-sections') ? yt[yt.indexOf('--download-sections') + 1] : null,
            keyframes: yt.includes('--force-keyframes-at-cuts'),
            ss: ff.includes('-ss') ? ff[ff.indexOf('-ss') + 1] : null,
            t: ff.includes('-t') ? ff[ff.indexOf('-t') + 1] : null
        };
    };

    test('-ss e -es: o yt-dlp baixa só o trecho, e o ffmpeg não corta de novo o início', async () => {
        await bot.executar(`/get -ss 10 -es 25 ${URL}`);
        assert.deepEqual(snippet(), { secao: '*10-25', keyframes: true, ss: null, t: '15' });
    });

    test('-ss e -es aceitam min:seg e h:min:seg', async () => {
        await bot.executar(`/get -ss 09:33 -es 09:45 ${URL}`);
        assert.deepEqual(snippet(), { secao: '*573-585', keyframes: true, ss: null, t: '12' });
        processes.chamadas.length = 0;
        await bot.executar(`/get -ss 1:00:00.5 -es 1:00:02 ${URL}`);
        assert.deepEqual(snippet(), { secao: '*3600.5-3602', keyframes: true, ss: null, t: '1.5' });
    });

    test('só -ss: o trecho vai até o final; sem corte, baixa o vídeo inteiro', async () => {
        await bot.executar(`/get -a -ss 30 ${URL}`);
        assert.deepEqual(snippet(), { secao: '*30-inf', keyframes: true, ss: null, t: null });
        processes.chamadas.length = 0;
        await bot.executar(`/get -a ${URL}`);
        assert.deepEqual(snippet(), { secao: null, keyframes: false, ss: null, t: null });
    });

    test('-ss e -es negativos contam do final: a duração vem do yt-dlp e o trecho é baixado', async () => {
        processes.duracao = 200;
        await bot.executar(`/get -ss -10 ${URL}`);
        assert.deepEqual(binaries(), ['yt-dlp', 'yt-dlp', 'ffmpeg']);
        assert.deepEqual(processes.chamadas[0].args, ['--no-playlist', '--print', 'duration', '--', URL]);
        assert.equal(snippet().secao, '*190-inf');

        processes.chamadas.length = 0;
        await bot.executar(`/get -ss -01:44 -es -00:30 ${URL}`);
        assert.deepEqual(snippet(), { secao: '*96-170', keyframes: true, ss: null, t: '74' });

        processes.chamadas.length = 0;
        await bot.executar(`/get -ss 150 -es -10 ${URL}`);
        assert.deepEqual(snippet(), { secao: '*150-190', keyframes: true, ss: null, t: '40' });

        // Larger than the video: starts from 0
        processes.chamadas.length = 0;
        await bot.executar(`/get -ss -999 -es 5 ${URL}`);
        assert.equal(snippet().secao, '*0-5');
    });

    test('/sticker -ss -10: os 6 s a partir de 10 s antes do fim; -ss é o valor, não outra opção', async () => {
        processes.duracao = 200;
        await bot.executar(`/sticker -ss -10 ${URL}`);
        assert.deepEqual(snippet(), { secao: '*190-196', keyframes: true, ss: null, t: '6' });
        processes.chamadas.length = 0;
        await bot.executar(`/sticker -es -194 -ss -200 ${URL}`);
        assert.equal(snippet().secao, '*0-6');
    });

    test('cache/cookies.txt: o yt-dlp recebe --cookies só se o arquivo existe', async () => {
        const cookies = path.join(CACHE_DIR, 'cookies.txt');
        fs.rmSync(cookies, { force: true });
        await bot.executar(`/get ${URL}`);
        assert.equal(argsDo('yt-dlp').includes('--cookies'), false, 'sem arquivo: sem cookies');

        fs.writeFileSync(cookies, '# Netscape HTTP Cookie File\n');
        try {
            processes.chamadas.length = 0;
            await bot.executar(`/get ${URL}`);
            const yt = argsDo('yt-dlp');
            assert.equal(yt[yt.indexOf('--cookies') + 1], cookies);

            // Also in the duration query (negative -ss)
            processes.chamadas.length = 0;
            await bot.executar(`/get -ss -10 ${URL}`);
            assert.ok(processes.chamadas[0].args.includes('--cookies'));
        } finally {
            fs.rmSync(cookies, { force: true });
        }
    });

    test('negativo sem a duração do site: baixa o vídeo inteiro, mede com o ffprobe e o ffmpeg corta', async () => {
        processes.siteSemDuracao = true;
        const r = await bot.executar(`/get -a -ss -10 ${URL}`);
        assert.equal(r[0].texto, '✅ Mídia baixada com sucesso!');
        assert.deepEqual(binaries(), ['yt-dlp', 'yt-dlp', 'ffprobe', 'ffmpeg']);
        assert.equal(processes.chamadas[2].args.at(-1), argsDo('ffmpeg')[argsDo('ffmpeg').indexOf('-i') + 1]);
        processes.chamadas.length = 0;
        processes.siteSemDuracao = false;
        // ffprobe only runs if yt-dlp did not report it
        await bot.executar(`/get -a -ss -10 ${URL}`);
        assert.deepEqual(binaries(), ['yt-dlp', 'yt-dlp', 'ffmpeg']);
    });

    test('negativo: início e final que não formam um trecho, e valores inválidos', async () => {
        processes.duracao = 100;
        const errorAlt = async (line) => (await bot.executar(line, { erroEsperado: true }))[0].texto;
        assert.match(await errorAlt(`/get -ss -10 -es -20 ${URL}`), /❌ O segundo final \(-es\)/);
        assert.match(await errorAlt(`/get -ss 95 -es -10 ${URL}`), /O trecho pedido ficou vazio: o vídeo tem 100 s/);
        assert.match(await errorAlt(`/get -ss -0 ${URL}`), /❌ -startSec precisa de um tempo[\s\S]*conta do final/);
        assert.match(await errorAlt(`/get -ss -1:75 ${URL}`), /precisa de um tempo/);
    });

    test('o site não deixa baixar o trecho: baixa o vídeo inteiro e o ffmpeg corta', async () => {
        processes.falharTrecho = true;
        const r = await bot.executar(`/get -ss 10 -es 25 ${URL}`);
        assert.equal(r[0].texto, '✅ Mídia baixada com sucesso!');
        assert.deepEqual(binaries(), ['yt-dlp', 'yt-dlp', 'ffmpeg']);
        const [withSnippet, integer] = processes.chamadas.map(c => c.args);
        assert.ok(withSnippet.includes('--download-sections') && !integer.includes('--download-sections'));
        const ff = argsDo('ffmpeg');
        assert.equal(ff[ff.indexOf('-ss') + 1], '10');
        assert.equal(ff[ff.indexOf('-t') + 1], '15');
        assert.deepEqual(filesTemporary(), []);
    });

    test('-v manda os comandos executados antes da mídia', async () => {
        const r = await bot.executar(`/get -v ${URL}`);
        assert.match(r[1].texto, /🛠️ \*Verbose Mode\*[\s\S]*yt-dlp[\s\S]*ffmpeg/);
        assert.ok(r[2].content instanceof MessageMedia);
    });

    test('-es sozinho corta a partir do início e aceita frações de segundo', async () => {
        await bot.executar(`/get -es 2.5 ${URL}`);
        assert.deepEqual(snippet(), { secao: '*0-2.5', keyframes: true, ss: null, t: '2.5' });
        const ff = argsDo('ffmpeg');
        assert.ok(ff.indexOf('-t') > ff.indexOf('-i'));
    });

    test('figurinha respeita o fim pedido e o limite de seis segundos', async () => {
        await bot.executar(`/get -st -ss 3 -es 6 ${URL}`);
        assert.deepEqual(snippet(), { secao: '*3-6', keyframes: true, ss: null, t: '3' });
        processes.chamadas.length = 0;
        await bot.executar(`/get -st -ss 3 -es 20 ${URL}`);
        assert.deepEqual(snippet(), { secao: '*3-9', keyframes: true, ss: null, t: '6' }, 'baixa só os 6 s');
        processes.chamadas.length = 0;
        await bot.executar(`/get -st ${URL}`);
        assert.deepEqual(snippet(), { secao: '*0-6', keyframes: true, ss: null, t: '6' });
    });

    test('cortes inválidos e áudio junto com figurinha são recusados antes de baixar', async () => {
        for (const optionsAlt of ['-ss', '-es', '-ss abc', '-ss -0', '-ss -abc', '-es -1:60', '-es 0', '-ss 10 -es 5',
            '-ss 3 -es 3', '-ss Infinity', '-ss 1e309', '-ss 1:60', '-ss 1:60:00', '-ss :30',
            '-ss 1:', '-ss 1:2:3:4', '-ss 09:45 -es 09:33', '-a -st']) {
            assert.match((await bot.replyAlt(`/get ${URL} ${optionsAlt}`))[0], /^❌/);
        }
        assert.deepEqual(processes.chamadas, []);
    });

    test('link da mensagem respondida', async () => {
        const quoted = bot.createMessage({ texto: `veja ${URL}`, de: OTHERAlt.jid });
        await bot.executar('/get', { citada: quoted });
        assert.equal(argsDo('yt-dlp').at(-1), URL);
    });

    test('opção desconhecida é recusada (sem isto, viraria a URL)', async () => {
        assert.deepEqual(await bot.replyAlt(`/get -x ${URL}`), ['❌ Opção desconhecida: -x\n💡 _Veja as opções com /get -h_']);
        assert.deepEqual(await bot.replyAlt('/sticker -a', { citada: bot.createMessage({ texto: URL, de: OTHERAlt.jid }) }),
            ['❌ Opção desconhecida: -a\n💡 _Veja as opções com /sticker -h_']);
        assert.deepEqual(processes.chamadas, []);
    });

    test('a URL digitada vale mais que a mensagem respondida', async () => {
        const quoted = bot.createMessage({ texto: 'http://1.1.1.1/outro', de: OTHERAlt.jid });
        await bot.executar(`/get ${URL}`, { citada: quoted });
        assert.equal(argsDo('yt-dlp').at(-1), URL);
    });

    test('mensagem respondida sem mídia nem link', async () => {
        assert.deepEqual(await bot.replyAlt('/get', { citada: bot.createMessage({ texto: 'só texto', de: OTHERAlt.jid }) }),
            ['❌ A mensagem respondida não tem mídia nem link.']);
    });

    test('sem URL mostra a sintaxe; URL inválida ou privada é recusada', async () => {
        assert.match((await bot.replyAlt('/get'))[0], /^```Usage: \/get/);
        assert.match((await bot.replyAlt('/get ftp://x.com', { erroEsperado: true }))[0], /A URL 'ftp:\/\/x\.com' é inválida/);
        assert.match((await bot.replyAlt('/get http://127.0.0.1:2375/', { erroEsperado: true }))[0], /aponta para um endereço não permitido/);
        assert.deepEqual(processes.chamadas, []);
    });

    test('falhas do yt-dlp, do ffmpeg, download vazio e arquivo grande demais editam o aviso', async () => {
        // The error replaces the "Processando…": nothing besides it is sent
        const errorInNotice = async (line) => {
            const r = await bot.executar(line, { erroEsperado: true });
            assert.equal(r.length, 1);
            assert.equal(r[0].editada, true);
            return r[0].texto;
        };

        processes.falhar = 'yt-dlp';
        assert.match(await errorInNotice(`/get -st ${URL}`), /Problemas para baixar com '\/venv\/bin\/yt-dlp'[\s\S]*🛠️ \*Cmd\*/);

        processes.falhar = 'ffmpeg';
        assert.match(await errorInNotice(`/get ${URL}`), /Problemas para decodificar com '\/usr\/bin\/ffmpeg'/);

        processes.falhar = null;
        processes.naoBaixar = true;
        assert.match(await errorInNotice(`/get ${URL}`), /Nada foi baixado \(acima de 200 MB\?/);

        processes.naoBaixar = false;
        await bot.setSetting('get.maxSizeMB', 1);
        processes.tamanhoSaida = 2 * 1024 * 1024;
        assert.match(await errorInNotice(`/get ${URL}`), /Arquivo muito grande para WhatsApp Web \(máx\. 1 MB\)/);

        assert.deepEqual(filesTemporary(), [], 'os temporários foram apagados mesmo com erro');
    });

    test('a edição do aviso não vira "mensagem editada" no cache nem avisa no privado', async () => {
        await bot.setSetting('show.alert.edited', true);
        const r = await bot.executar(`/get -st ${URL}`);
        assert.equal(r.length, 2, 'só o aviso e a figurinha');
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM message_edits')).n, 0);

        processes.falhar = 'yt-dlp';
        await bot.executar(`/get -st ${URL}`, { erroEsperado: true });
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM message_edits')).n, 0);
    });

    test('se o WhatsApp não deixa editar o aviso, o erro vai em outra mensagem', async () => {
        bot.client.recusarEdicao = true;
        processes.falhar = 'yt-dlp';
        const r = await bot.executar(`/get -st ${URL}`, { erroEsperado: true });
        assert.equal(r[0].texto, '⏳ Processando seu sticker, aguarde.');
        assert.match(r[1].texto, /Problemas para baixar com/);
    });

    test('no máximo 2 downloads ao mesmo tempo', async () => {
        // The three run together: counts what the bot sent in total
        await Promise.all([1, 2, 3].map(() => bot.executar(`/get ${URL}`)));
        const texts = bot.client.enviadas.map(e => bot.text(e.content, e.options));
        assert.equal(texts.filter(t => /⏳ Já existem 2 downloads em andamento/.test(t)).length, 1);
        assert.equal(texts.filter(t => /✅ Mídia baixada com sucesso!/.test(t)).length, 2);
        assert.deepEqual(binaries(), ['yt-dlp', 'yt-dlp', 'ffmpeg', 'ffmpeg']);
    });
});

describe('/get respondendo uma mídia do WhatsApp', () => {
    beforeEach(() => bot.setSetting('get.cache.tmp', false));

    const video = { mimetype: 'video/mp4', data: Buffer.from('mp4').toString('base64'), filename: 'v.mp4' };
    const photo = { mimetype: 'image/jpeg', data: Buffer.from('jpg').toString('base64') };
    const audio = { mimetype: 'audio/ogg; codecs=opus', data: Buffer.from('ogg').toString('base64') };
    const replying = (mediaAlt) => ({ citada: bot.createMessage({ de: OTHERAlt.jid, midia: mediaAlt }) });

    test('sem opção: o arquivo original como documento, sem yt-dlp nem ffmpeg', async () => {
        const r = await bot.executar('/get', replying(video));
        assert.equal(r.length, 1);
        assert.equal(r[0].content, video, 'com nome, vai como veio');
        assert.equal(r[0].options.sendMediaAsDocument, true);

        // Without a name (camera photo), it gets one from the extension: WhatsApp would show "Sem título"
        const [f] = await bot.executar('/get', replying(photo));
        assert.deepEqual([f.content.mimetype, f.content.data, f.content.filename], [photo.mimetype, photo.data, 'zapbot.jpeg']);
        assert.deepEqual(processes.chamadas, []);
    });

    test('-a: o áudio do vídeo em mp3, só com o ffmpeg', async () => {
        const r = await bot.executar('/get -a', replying(video));
        assert.deepEqual(binaries(), ['ffmpeg']);
        const ff = argsDo('ffmpeg');
        assert.match(ff[ff.indexOf('-i') + 1], /_original\.mp4$/);
        assert.match(ff.at(-1), /_output\.mp3$/);
        assert.equal(r[0].texto, '✅ Mídia baixada com sucesso!');
        assert.equal(r[1].options.sendMediaAsDocument, true);
        assert.deepEqual(filesTemporary(), []);
    });

    test('-st com -ss: figurinha de 6 s a partir do segundo pedido', async () => {
        const r = await bot.executar('/get -st -ss 2', replying(video));
        const ff = argsDo('ffmpeg');
        assert.equal(ff[ff.indexOf('-ss') + 1], '2');
        assert.equal(ff[ff.indexOf('-t') + 1], '6');
        assert.match(ff[ff.indexOf('-vf') + 1], /crop=512:512/);
        assert.equal(r[0].texto, '✅ Sticker criado com sucesso!');
        assert.equal(r[1].options.sendMediaAsSticker, true);
    });

    test('-ss e -es negativos na mídia respondida: o ffprobe mede o arquivo', async () => {
        processes.duracao = 60;
        await bot.executar('/get -ss -10', replying(video));
        assert.deepEqual(binaries(), ['ffprobe', 'ffmpeg']);
        const ff = argsDo('ffmpeg');
        assert.equal(ff[ff.indexOf('-ss') + 1], '50');
        assert.equal(ff.includes('-t'), false);

        processes.chamadas.length = 0;
        await bot.executar('/get -st -ss -01:00 -es -50', replying(video));
        const st = argsDo('ffmpeg');
        assert.equal(st[st.indexOf('-ss') + 1], '0');
        assert.equal(st[st.indexOf('-t') + 1], '6');

        processes.chamadas.length = 0;
        processes.duracao = null;
        const [r] = await bot.executar('/get -ss -10', { ...replying(video), erroEsperado: true });
        assert.match(r.texto, /Não consegui descobrir a duração do vídeo/);
    });

    test('-ss e -es sem formato: o trecho do vídeo como documento', async () => {
        const r = await bot.executar('/get -ss 1 -es 3', replying(video));
        const ff = argsDo('ffmpeg');
        assert.equal(ff[ff.indexOf('-t') + 1], '2');
        assert.equal(r[1].options.sendMediaAsDocument, true);
    });

    test('-v: sem o yt-dlp, que não rodou', async () => {
        const r = await bot.executar('/get -v -a', replying(video));
        assert.match(r[1].texto, /🔗 \*ffmpeg\*/);
        assert.doesNotMatch(r[1].texto, /yt-dlp/);
    });

    test('imagem: -st enquadra no sharp; -ss, -es e -a são recusados', async () => {
        const [st] = await bot.executar('/get -st', replying(photo));
        assert.equal(Buffer.from(st.content.data, 'base64').toString(), 'webp-enquadrado');
        assert.equal(st.options.sendMediaAsSticker, true);

        assert.deepEqual(await bot.replyAlt('/get -st -ss 1', replying(photo)), ['❌ O -ss e o -es só valem para vídeo.']);
        assert.deepEqual(await bot.replyAlt('/get -a', replying(photo)), ['❌ A imagem respondida não tem áudio.']);
        assert.deepEqual(processes.chamadas, []);
    });

    test('áudio: com corte sai em mp3; figurinha é recusada', async () => {
        await bot.executar('/get -ss 2', replying(audio));
        const ff = argsDo('ffmpeg');
        assert.match(ff[ff.indexOf('-i') + 1], /_original\.ogg$/);
        assert.match(ff.at(-1), /_output\.mp3$/);

        assert.deepEqual(await bot.replyAlt('/get -st', replying(audio)), ['❌ Não dá para fazer figurinha de um áudio.']);
    });

    test('outro tipo de arquivo ou mídia que não baixa', async () => {
        const pdf = { mimetype: 'application/pdf', data: 'AA==' };
        assert.deepEqual(await bot.replyAlt('/get', replying(pdf)), ['❌ A mídia respondida não é imagem, vídeo nem áudio.']);

        const quoted = bot.createMessage({ de: OTHERAlt.jid, extras: { hasMedia: true, async downloadMedia() { throw new Error('sumiu'); } } });
        assert.deepEqual(await bot.replyAlt('/get -st', { citada: quoted, erroEsperado: true }),
            ['❌ Não consegui baixar a mídia respondida: ela pode não estar mais disponível no WhatsApp.']);
    });
});

describe('cache dos downloads (get.cache.tmp)', () => {
    const savedAlt = () => filesTemporary().filter(f => f.endsWith('_original.mp4'));

    test('ligado (padrão): o mesmo link não baixa de novo e o original fica em cache/tmp', async () => {
        const r = await bot.executar(`/get ${URL}`);
        assert.equal(r[0].texto, '✅ Mídia baixada com sucesso!');
        assert.deepEqual(binaries(), ['yt-dlp', 'ffmpeg']);
        assert.match(savedAlt()[0] ?? '', /^[0-9a-f]{40}_original\.mp4$/);
        assert.equal(filesTemporary().length, 1, 'só o original: a saída e o log são apagados');

        processes.chamadas.length = 0;
        const monday = await bot.executar(`/get -a ${URL}`);
        assert.equal(monday[0].texto, '✅ Mídia baixada com sucesso!');
        assert.deepEqual(binaries(), ['ffmpeg'], 'sem yt-dlp: veio do cache');
        assert.equal(savedAlt().length, 1);
        assert.equal(monday[1].options.sendMediaAsDocument, true);
    });

    test('o /sticker usa o mesmo cache do /get; outro link baixa', async () => {
        await bot.executar(`/get ${URL}`);
        processes.chamadas.length = 0;
        await bot.executar(`/sticker ${URL}`);
        assert.deepEqual(binaries(), ['ffmpeg']);

        processes.chamadas.length = 0;
        await bot.executar(`/get ${URL}?outro`);
        assert.deepEqual(binaries(), ['yt-dlp', 'ffmpeg']);
        assert.equal(savedAlt().length, 2);
    });

    test('imagem com a legenda /sticker (sem responder ninguém) vira figurinha', async () => {
        const mediaAlt = { mimetype: 'image/png', data: Buffer.from('png').toString('base64'), filename: 'foto.png' };
        const r = await bot.executar('/sticker', { tipo: 'image', midia: mediaAlt });
        assert.ok(r.some(e => e.options?.sendMediaAsSticker), 'enviou a figurinha');
        assert.equal(processes.chamadas.length, 0, 'imagem não precisa de yt-dlp nem ffmpeg');
    });

    test('o trecho é parte da chave; o vídeo inteiro em cache serve a qualquer trecho', async () => {
        await bot.executar(`/get -ss 10 -es 25 ${URL}`);
        assert.equal(savedAlt().length, 1);

        processes.chamadas.length = 0;
        await bot.executar(`/get -ss 10 -es 25 ${URL}`);
        assert.deepEqual(binaries(), ['ffmpeg'], 'o mesmo trecho vem do cache');
        const ff = argsDo('ffmpeg');
        assert.equal(ff.includes('-ss'), false, 'o trecho já começa no 0');
        assert.equal(ff[ff.indexOf('-t') + 1], '15');

        processes.chamadas.length = 0;
        await bot.executar(`/get -ss 30 -es 40 ${URL}`);
        assert.deepEqual(binaries(), ['yt-dlp', 'ffmpeg'], 'outro trecho baixa');
        assert.equal(savedAlt().length, 2);

        // The whole downloaded video serves any snippet (ffmpeg cuts)
        await bot.executar(`/get ${URL}?inteiro`);
        processes.chamadas.length = 0;
        await bot.executar(`/get -ss 5 -es 8 ${URL}?inteiro`);
        assert.deepEqual(binaries(), ['ffmpeg'], 'sem yt-dlp');
        const cut = argsDo('ffmpeg');
        assert.equal(cut[cut.indexOf('-ss') + 1], '5');
    });

    test('desligado: o original é apagado a cada execução e nada é aproveitado', async () => {
        await bot.setSetting('get.cache.tmp', false);
        await bot.executar(`/get ${URL}`);
        assert.deepEqual(filesTemporary(), []);

        processes.chamadas.length = 0;
        await bot.executar(`/get ${URL}`);
        assert.deepEqual(binaries(), ['yt-dlp', 'ffmpeg']);
        assert.deepEqual(filesTemporary(), []);
    });

    test('a mídia respondida não vai para o cache', async () => {
        const video = new MessageMedia('video/mp4', Buffer.from('video').toString('base64'), 'v.mp4');
        await bot.executar('/get -a', { citada: bot.createMessage({ de: OTHERAlt.jid, midia: video }) });
        assert.deepEqual(filesTemporary(), []);
    });
});

describe('/cache', () => {
    test('sem opção: conteúdo do cache e contagem de mensagens', async () => {
        await bot.executar('oi', { de: OTHERAlt.jid });
        const [r] = await bot.replyAlt('/cache');
        assert.match(r, new RegExp(`🗂️ Exibindo conteúdo de ${CACHE_DIR}`));
        assert.match(r, /🗄️ 2 mensagens no cache\.\n🗑️ 0 apagadas\.\n✏️ 0 edições\.\n😶 0 reações removidas ou trocadas\.\n📦 Backups: 0 \(veja \/backup\)\.$/);
        assert.match(r, /\n─+\nTotal: +\d/);
        assert.match(r, /└── 📁 tmp\/ +/);
    });

    test('contagens separadas com singular e backups', async () => {
        const [empty] = await bot.replyAlt('/cache');
        assert.match(empty, /🗄️ 1 mensagem no cache\./);
        await bot.dbRun("INSERT INTO messages (id, revoked) VALUES ('apagada', 1)");
        await bot.dbRun("INSERT INTO message_edits (message_id) VALUES ('editada')");
        const backup = await createBackup('manual');
        try {
            const [r] = await bot.replyAlt('/cache');
            assert.match(r, /🗑️ 1 apagada\.\n✏️ 1 edição\.\n😶 0 reações removidas ou trocadas\.\n📦 Backups: 1 \(veja \/backup\)\.$/);
        } finally {
            await removeBackup(backup);
        }
    });

    test('-c: limpa só o que passou das janelas de retenção', async () => {
        const oldAlt2 = Date.now() - 69 * 60 * 60 * 1000;
        await bot.dbRun("INSERT INTO messages (id, timestamp, revoked) VALUES ('velha', ?, 0), ('nova', ?, 0)", [oldAlt2, Date.now()]);
        await bot.dbRun("INSERT INTO messages (id, timestamp, revoked, revoked_at) VALUES ('apagada', ?, 1, ?)", [oldAlt2, oldAlt2]);

        assert.deepEqual(await bot.replyAlt('/cache -c'), ['🧹 Cache limpo (itens fora da janela de retenção).']);
        // (the own message "/cache -c" is also in the database: we only check the test's)
        const ids = (await bot.dbAll("SELECT id FROM messages WHERE id IN ('velha', 'nova', 'apagada') ORDER BY id")).map(r => r.id);
        assert.deepEqual(ids, ['apagada', 'nova'], 'a apagada fica 30 dias; a comum sai em 68 h');
    });

    test('-a: apaga tudo (mensagens, edições, mídias, temporários e backups)', async () => {
        await bot.executar('oi', { de: OTHERAlt.jid, midia: { mimetype: 'image/png', data: 'AA==' } });
        await bot.dbRun("INSERT INTO message_edits (message_id, edited_at) VALUES ('x', 1)");
        fs.writeFileSync(path.join(TMP_DIR, 'lixo.mp4'), 'x');
        await createBackup();

        const [r] = await bot.replyAlt('/cache -all');
        assert.match(r, new RegExp(`🧹 \\*Limpeza geral concluída\\* _\\(${CACHE_DIR}\\)_\\n\\n🗄️ Mensagens removidas: \\*\\d+\\* _\\(0 apagadas\\)_\\n✏️ Edições removidas: \\*1\\*\\n😶 Reações removidas: \\*0\\*\\n📦 Backups removidos: \\*1\\*`));
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM messages')).n, 0);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM message_edits')).n, 0);
        assert.deepEqual(fs.readdirSync(MEDIA_DIR), []);
        assert.deepEqual(fs.readdirSync(TMP_DIR), []);
        assert.deepEqual(await listBackups(), []);
    });

    test('-b: apaga só os backups; junta com -c e -m', async () => {
        await createBackup();
        await createBackup();
        await bot.executar('oi', { de: OTHERAlt.jid });

        const [r] = await bot.replyAlt('/cache -backup');
        assert.match(r, new RegExp(`^📦 Backups apagados de ${BACKUP_DIR}: \\*2\\* _\\([\\d.]+ \\w+\\)_$`));
        assert.deepEqual(await listBackups(), []);
        assert.ok((await bot.dbGet('SELECT COUNT(*) AS n FROM messages')).n > 0, 'as mensagens ficam');

        assert.match((await bot.replyAlt('/cache -c -m -b'))[0], /^🧹 Cache limpo .*\n🖼️ Mídias apagadas .*\n📦 Backups apagados .*: \*0\*/);
    });

    test('-m: apaga as mídias baixadas; as mensagens ficam, sem o arquivo', async () => {
        await bot.executar('foto', { de: OTHERAlt.jid, id: 'COMFOTO', midia: { mimetype: 'image/png', data: Buffer.alloc(2048).toString('base64') } });
        fs.writeFileSync(path.join(TMP_DIR, 'temporario.mp4'), 'x');

        const [r] = await bot.replyAlt('/cache -media');
        assert.equal(r, `🖼️ Mídias apagadas de ${MEDIA_DIR}: *1* _(2.00 KB)_`);
        assert.deepEqual(fs.readdirSync(MEDIA_DIR), []);
        assert.deepEqual(fs.readdirSync(TMP_DIR), ['temporario.mp4'], 'os temporários não são mídias');

        const row = await bot.dbGet("SELECT has_media, media_path FROM messages WHERE id = 'COMFOTO'");
        assert.deepEqual([row.has_media, row.media_path], [1, null]);
        fs.unlinkSync(path.join(TMP_DIR, 'temporario.mp4'));
    });

    test('-c e -m juntos: limpeza por retenção e mídias', async () => {
        const [r] = await bot.replyAlt('/cache -c -m');
        assert.match(r, /^🧹 Cache limpo \(itens fora da janela de retenção\)\.\n🖼️ Mídias apagadas de .*: \*0\*/);
    });

    test('só o dono usa', async () => {
        assert.deepEqual(await bot.replyAlt('/cache -a', { de: OTHERAlt.jid }), []);
        assert.deepEqual(await bot.replyAlt('/cache -m', { de: OTHERAlt.jid }), []);
    });
});

describe('limpeza periódica', () => {
    test('editadas, ocorrências do /watch e contadores do /stats fora da retenção', async () => {
        const oldAlt = Date.now() - 40 * DAY;
        await bot.dbRun('INSERT INTO message_edits (message_id, edited_at) VALUES (?, ?), (?, ?)', ['velha', oldAlt, 'nova', Date.now()]);
        await bot.dbRun('INSERT INTO watch_hits (rule, message_id, timestamp) VALUES (?, ?, ?), (?, ?, ?)', ['r', 'velha', oldAlt, 'r', 'nova', Date.now()]);
        await bot.dbRun("INSERT INTO stats (chat_id, day, hour, sender_id, msgs) VALUES ('c', '2020-01-01', 1, 's', 1), ('c', '2999-01-01', 1, 's', 1)");

        await cleanup.cleanEditedOld();
        await cleanup.cleanWatchOld();
        await cleanup.cleanStatsOld();

        assert.deepEqual((await bot.dbAll('SELECT message_id FROM message_edits')).map(r => r.message_id), ['nova']);
        assert.deepEqual((await bot.dbAll('SELECT message_id FROM watch_hits')).map(r => r.message_id), ['nova']);
        assert.deepEqual((await bot.dbAll('SELECT day FROM stats')).map(r => r.day), ['2999-01-01']);
    });

    test('mensagem comum antiga sai com a mídia; a apagada fica com a dela', async () => {
        const oldAlt2 = Date.now() - 69 * 60 * 60 * 1000;
        const old = path.join(MEDIA_DIR, 'velha.jpg');
        const saved = path.join(MEDIA_DIR, 'guardada.jpg');
        fs.mkdirSync(MEDIA_DIR, { recursive: true });
        fs.writeFileSync(old, 'x');
        fs.writeFileSync(saved, 'x');
        await bot.dbRun('INSERT INTO messages (id, timestamp, revoked, revoked_at, media_path) VALUES (?, ?, 0, NULL, ?), (?, ?, 1, ?, ?)',
            ['velha', oldAlt2, old, 'guardada', oldAlt2, Date.now(), saved]);

        await cleanup.cleanCacheOld();
        assert.ok(!fs.existsSync(old));
        assert.ok(fs.existsSync(saved));
        fs.unlinkSync(saved);
    });

    test('cache.messageRetentionHours guarda o texto; a mídia tem o seu prazo (cache.messageMediaRetentionHours)', async () => {
        const hour = 60 * 60 * 1000;
        const create = (nameAlt) => {
            const fileAlt = path.join(MEDIA_DIR, nameAlt);
            fs.mkdirSync(MEDIA_DIR, { recursive: true });
            fs.writeFileSync(fileAlt, 'x');
            return fileAlt;
        };
        const meio = create('meio.jpg');
        const longe = create('longe.jpg');
        await bot.setSetting('cache.messageRetentionHours', 240);
        await bot.dbRun('INSERT INTO messages (id, timestamp, revoked, media_path) VALUES (?, ?, 0, ?), (?, ?, 0, ?)',
            ['meio', Date.now() - 100 * hour, meio, 'longe', Date.now() - 300 * hour, longe]);

        // Media at the default (68 h): the 100 h one goes, but the text stays; the 300 h one goes with everything
        await cleanup.cleanCacheOld();
        assert.ok(!fs.existsSync(meio));
        assert.ok(!fs.existsSync(longe));
        assert.deepEqual(await bot.dbAll("SELECT id, media_path FROM messages WHERE id IN ('meio', 'longe') ORDER BY id"),
            [{ id: 'meio', media_path: null }]);

        // 200 h media: the 100 h one keeps the text
        const fica = create('fica.jpg');
        await bot.setSetting('cache.messageMediaRetentionHours', 200);
        await bot.dbRun("UPDATE messages SET media_path = ? WHERE id = 'meio'", [fica]);
        await cleanup.cleanCacheOld();
        assert.ok(fs.existsSync(fica), 'com 100 h (de 200), a mídia fica');
        fs.unlinkSync(fica);

        // Never goes past the text: with media at 2160 h and text at 240 h, it goes out with the text
        const lost = create('perdida.jpg');
        await bot.setSetting('cache.messageMediaRetentionHours', 2160);
        await bot.dbRun('INSERT INTO messages (id, timestamp, revoked, media_path) VALUES (?, ?, 0, ?)', ['perdida', Date.now() - 300 * hour, lost]);
        await cleanup.cleanCacheOld();
        assert.ok(!fs.existsSync(lost));
        await assert.rejects(bot.setSetting('cache.messageMediaRetentionHours', 10), /68/);
    });

    test('a limpeza periódica roda 1 minuto depois do boot e a cada 10', async (t) => {
        t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
        const oldAlt = Date.now() - 40 * DAY;
        const insertOld = () => bot.dbRun('INSERT INTO message_edits (message_id, edited_at) VALUES (?, ?)', [`v${Math.random()}`, oldAlt]);
        const remaining = async () => (await bot.dbGet('SELECT COUNT(*) AS n FROM message_edits')).n;
        const run = async (ms) => {
            t.mock.timers.tick(ms);
            for (let i = 0; i < 20; i++) await new Promise(setImmediate);
        };

        await insertOld();
        cleanup.startCleanupPeriodic();
        await run(59 * 1000);
        assert.equal(await remaining(), 1);
        await run(1000);
        assert.equal(await remaining(), 0, 'primeira limpeza: 1 min');

        await insertOld();
        await run(10 * 60 * 1000);
        assert.equal(await remaining(), 0, 'depois: a cada 10 min');
    });

    test('temporários com mais de 2 h são apagados', async () => {
        const oldAlt = path.join(TMP_DIR, 'velho.mp4');
        const freshAlt = path.join(TMP_DIR, 'novo.mp4');
        fs.writeFileSync(oldAlt, 'x');
        fs.writeFileSync(freshAlt, 'x');
        const threeHoursBack = new Date(Date.now() - 3 * 60 * 60 * 1000);
        fs.utimesSync(oldAlt, threeHoursBack, threeHoursBack);

        await cleanup.cleanFilesOld();
        assert.deepEqual(fs.readdirSync(TMP_DIR), ['novo.mp4']);
        fs.unlinkSync(freshAlt);
    });

    test('downloads em cache duram get.cache.maxDays dias (2 por padrão); com o cache desligado, 2 h', async () => {
        const hours = (h) => new Date(Date.now() - h * 60 * 60 * 1000);
        const fileAlt = (nameAlt, ageHours) => {
            const pathAlt = path.join(TMP_DIR, nameAlt);
            fs.writeFileSync(pathAlt, 'x');
            fs.utimesSync(pathAlt, hours(ageHours), hours(ageHours));
        };
        const [a, b, c] = ['a', 'b', 'c'].map(l => `${l.repeat(40)}_original.mp4`);

        fileAlt(a, 47); // within 2 days
        fileAlt(b, 49); // went over 2 days
        fileAlt('temporario_original.mp4', 3); // is not from the cache (uuid): 2 h
        await cleanup.cleanFilesOld();
        assert.deepEqual(fs.readdirSync(TMP_DIR), [a]);

        await bot.setSetting('get.cache.maxDays', 3);
        fileAlt(b, 71);
        fileAlt(c, 73);
        await cleanup.cleanFilesOld();
        assert.deepEqual(fs.readdirSync(TMP_DIR).sort(), [a, b]);

        await bot.setSetting('get.cache.tmp', false);
        await cleanup.cleanFilesOld();
        assert.deepEqual(fs.readdirSync(TMP_DIR), [], 'desligado, valem como temporários: 2 h');
    });
});

describe('/get -stt', () => {
    beforeEach(() => bot.setSetting('get.cache.tmp', false));

    test('de um link: baixa só o áudio mais leve, converte para wav 16 kHz mono e responde o texto', async () => {
        const r = await bot.executar(`/get -t ${URL}`, { de: OTHERAlt.jid });
        assert.equal(r[0].texto, '📝 *Transcrição* · 🗣️ pt · 1:40\n\nolá mundo, isto é um teste\n\n💡 _Transcrito por faster-whisper_', 'o aviso vira o texto');
        assert.equal(r.length, 1, 'nenhum arquivo é enviado');

        assert.deepEqual(binaries(), ['yt-dlp', 'ffmpeg', 'ffprobe', 'python']);
        const yt = argsDo('yt-dlp');
        assert.equal(yt[yt.indexOf('-f') + 1], 'worstaudio[language_preference>0]/worstaudio/worst');
        assert.deepEqual(yt.slice(-2), ['--', URL]);
        const ff = argsDo('ffmpeg');
        for (const par of [['-ac', '1'], ['-ar', '16000'], ['-c:a', 'pcm_s16le']]) {
            assert.equal(ff[ff.indexOf(par[0]) + 1], par[1], par[0]);
        }
        assert.ok(ff.includes('-vn'));
        const py = argsDo('python');
        assert.match(py[0], /scripts\/transcribe\.py$/);
        assert.deepEqual(py.slice(2), ['small', '/opt/whisper', 'auto']);
        assert.deepEqual(filesTemporary(), [], 'os temporários foram apagados');
    });

    test('-ss e -es viram o corte do ffmpeg, e o modelo e o idioma vêm dos settings', async () => {
        bot.setSetting('stt.model', 'medium');
        bot.setSetting('stt.language', 'pt');
        await bot.executar(`/get -t -ss 30 -es 1:30 ${URL}`);
        const ff = argsDo('ffmpeg');
        assert.equal(ff[ff.indexOf('-ss') + 1], '30');
        assert.equal(ff[ff.indexOf('-to') + 1], '90');
        assert.equal(argsDo('python')[2], 'medium');
        assert.equal(argsDo('python')[4], 'pt');
    });

    test('respondendo um áudio do WhatsApp: transcreve sem baixar nada', async () => {
        const audio = { mimetype: 'audio/ogg; codecs=opus', data: Buffer.from('ogg').toString('base64') };
        const r = await bot.executar('/get -t', { citada: bot.createMessage({ de: OTHERAlt.jid, midia: audio }) });
        assert.match(r[0].texto, /olá mundo/);
        assert.deepEqual(binaries(), ['ffmpeg', 'ffprobe', 'python']);
    });

    test('respondendo uma foto: recusa', async () => {
        const photo = { mimetype: 'image/jpeg', data: Buffer.from('jpg').toString('base64') };
        const r = await bot.executar('/get -t', { citada: bot.createMessage({ de: OTHERAlt.jid, midia: photo }) });
        assert.match(r[0].texto, /responda um vídeo ou um áudio/);
        assert.deepEqual(binaries(), []);
    });

    test('áudio acima de stt.maxMinutes é recusado, sem rodar o whisper', async () => {
        processes.duracao = 21 * 60;
        const r = await bot.executar(`/get -t ${URL}`, { erroEsperado: true });
        assert.match(r[0].texto, /Áudio longo demais para transcrever \(21:00; máx\. 20 min/);
        assert.ok(!binaries().includes('python'));
        assert.deepEqual(filesTemporary(), []);
    });

    test('sem fala: avisa', async () => {
        processes.fala = '';
        const r = await bot.executar(`/get -t ${URL}`);
        assert.equal(r[0].texto, '🔇 Não achei fala no áudio.');
    });

    test('link sem vídeo (carrossel só de fotos): diz que não há mídia, em vez de "problemas para baixar"', async () => {
        processes.falhar = 'yt-dlp';
        processes.saidaErro = 'ERROR: [Instagram] Dfx26KXKQuo: No video formats found!; please report this issue\n';
        const r = await bot.executar(`/stt ${URL}`, { erroEsperado: true });
        assert.match(r.at(-1).texto, /Esse link não tem vídeo nem áudio para baixar \(é um post só de fotos\?\)/);
        assert.doesNotMatch(r.at(-1).texto, /Problemas para baixar/);

        const g = await bot.executar(`/get ${URL}`, { erroEsperado: true });
        assert.match(g.at(-1).texto, /não tem vídeo nem áudio/);

        // Another yt-dlp error is still the general one
        processes.saidaErro = 'ERROR: HTTP Error 403';
        assert.match((await bot.executar(`/stt ${URL}`, { erroEsperado: true })).at(-1).texto, /Problemas para baixar com/);
    });

    test('não mistura com -a, -st nem -pos', async () => {
        for (const o of ['-a', '-st', '-pos meio']) {
            const r = await bot.executar(`/get -t ${o} ${URL}`);
            assert.match(r[0].texto, /O -stt responde com texto/, o);
        }
        assert.deepEqual(binaries(), []);
    });

    test('URL interna é recusada, como no resto do /get', async () => {
        const r = await bot.executar('/get -t http://127.0.0.1/x', { erroEsperado: true });
        assert.match(r.at(-1).texto, /endereço não permitido/);
        assert.deepEqual(binaries(), []);
    });
});

describe('/stt', () => {
    beforeEach(() => bot.setSetting('get.cache.tmp', false));

    test('é o /get -t: a URL vira texto', async () => {
        const r = await bot.executar(`/stt ${URL}`);
        assert.equal(r[0].texto, '📝 *Transcrição* · 🗣️ pt · 1:40\n\nolá mundo, isto é um teste\n\n💡 _Transcrito por faster-whisper_');
        assert.deepEqual(binaries(), ['yt-dlp', 'ffmpeg', 'ffprobe', 'python']);
    });

    test('-q: SÓ o texto, sem cabeçalho (idioma e duração), sem a dica do motor e sem o aviso ⏳', async () => {
        const r = await bot.executar(`/stt -q ${URL}`);
        assert.equal(r.length, 1, 'nem o ⏳ nem outra mensagem');
        assert.equal(r[0].texto, 'olá mundo, isto é um teste');
        assert.equal((await bot.executar(`/get -t -q ${URL}`))[0].texto, 'olá mundo, isto é um teste');
        // the long ones are cut as always, with no header either
        processes.fala = 'x'.repeat(61000);
        const [long] = await bot.executar(`/stt -q ${URL}`);
        assert.equal(long.texto, `${'x'.repeat(60000)}…`);
    });

    test('-q com -sum: o resumo e a transcrição, sem títulos nem dica', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        network.responder('post', 'api.openai.com/v1/chat/completions', { choices: [{ message: { content: '• fala de um teste' } }] });
        const r = await bot.executar(`/stt -q -sum ${URL}`);
        assert.equal(r.length, 1);
        assert.equal(r[0].texto, '• fala de um teste\n\nolá mundo, isto é um teste');
    });

    test('-v: manda os comandos do yt-dlp, ffmpeg e faster-whisper antes do texto', async () => {
        const r = await bot.executar(`/stt -v ${URL}`);
        assert.match(r[1].texto, /🛠️ \*Verbose Mode\*[\s\S]*yt-dlp[\s\S]*ffmpeg[\s\S]*faster-whisper\* \(\d+\.\d s\)[\s\S]*transcribe\.py[\s\S]*small/);
        assert.match(r[0].texto, /olá mundo/, 'o aviso vira o texto');
        const g = await bot.executar(`/get -t -v ${URL}`);
        assert.match(g[1].texto, /Verbose Mode/);
    });

    test('-sum: o resumo do ChatGPT no alto e a transcrição embaixo', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        network.responder('post', 'api.openai.com/v1/chat/completions', { choices: [{ message: { content: '• fala de um teste' } }] });
        const r = await bot.executar(`/stt -sum ${URL}`);
        assert.equal(r[0].texto, '📝 *Resumo* · 🗣️ pt · 1:40\n\n• fala de um teste\n\n📄 *Transcrição*\nolá mundo, isto é um teste\n\n💡 _Transcrito por faster-whisper + ChatGPT_');
        const call = network.chamadas.find(c => c.url.endsWith('/chat/completions'));
        assert.match(call.cfg.body.messages[1].content, /olá mundo, isto é um teste/);
        assert.deepEqual(binaries(), ['yt-dlp', 'ffmpeg', 'ffprobe', 'python']);
        const g = await bot.executar(`/get -t -sum ${URL}`);
        assert.match(g[0].texto, /^📝 \*Resumo\*/);
    });

    test('-sum sem a chave da OpenAI: avisa antes de baixar, sem gastar a CPU', async () => {
        const r = await bot.executar(`/stt -sum ${URL}`, { erroEsperado: true });
        assert.match(r.at(-1).texto, /OPENAI_API_KEY|gpt\.api\.key/);
        assert.deepEqual(binaries(), []);
    });

    test('-sum com a OpenAI falhando: a transcrição sai mesmo assim', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        network.responder('post', 'api.openai.com/v1/chat/completions', network.http({ status: 429, data: {} }));
        const r = await bot.executar(`/stt -sum ${URL}`, { erroEsperado: true });
        assert.match(r[0].texto, /📄 \*Transcrição\*\nolá mundo/);
    });

    test('respondendo qualquer vídeo, áudio ou arquivo de mídia (documento): transcreve sem baixar', async () => {
        for (const mimetype of ['video/mp4', 'audio/mpeg', 'application/octet-stream']) {
            processes.chamadas.length = 0;
            const mediaAlt = { mimetype, data: Buffer.from('x').toString('base64') };
            const r = await bot.executar('/stt', { citada: bot.createMessage({ de: OTHERAlt.jid, midia: mediaAlt }) });
            assert.match(r[0].texto, /olá mundo/, mimetype);
            assert.deepEqual(binaries(), ['ffmpeg', 'ffprobe', 'python'], mimetype);
        }
    });

    test('respondendo uma imagem ou um PDF: recusa', async () => {
        for (const mimetype of ['image/jpeg', 'application/pdf']) {
            const mediaAlt = { mimetype, data: Buffer.from('x').toString('base64') };
            const r = await bot.executar('/stt', { citada: bot.createMessage({ de: OTHERAlt.jid, midia: mediaAlt }) });
            assert.match(r[0].texto, /responda um vídeo ou um áudio/, mimetype);
        }
        assert.deepEqual(binaries(), []);
    });

    test('-ss e -es valem; opção do /get que não é dele é recusada', async () => {
        await bot.executar(`/stt -ss 30 -es 90 ${URL}`);
        assert.equal(argsDo('ffmpeg')[argsDo('ffmpeg').indexOf('-to') + 1], '90');
        const r = await bot.executar(`/stt -a ${URL}`);
        assert.match(r[0].texto, /Opção desconhecida: -a[\s\S]*\/stt -h/);
    });
});

describe('/get de um post só de fotos (carrossel)', () => {
    beforeEach(() => {
        bot.setSetting('get.cache.tmp', false);
        processes.falhar = 'yt-dlp';
        processes.saidaErro = 'ERROR: [Instagram] X: No video formats found!; please report this issue\n';
    });

    const photo = (n) => `http://8.8.8.8/foto${n}.jpg`;
    const post = (n, description = 'Enquanto Suzane vê sua história virar filme...') => ({
        _type: 'playlist',
        description,
        entries: Array.from({ length: n }, (_, i) => ({ id: `f${i}`, thumbnails: [{ url: `http://8.8.8.8/pequena${i}.jpg` }, { url: photo(i) }] }))
    });
    const jpeg = (n) => network.http({ data: Buffer.from(`jpeg-${n}`), headers: { 'content-type': 'image/jpeg' } });

    test('baixa a maior foto de cada item e manda todas, a última com o texto do post', async () => {
        processes.post = post(3);
        for (let i = 0; i < 3; i++) network.responder('get', photo(i), jpeg(i));

        const r = await bot.executar(`/get ${URL}`);
        const mediaAltAlt = r.filter(x => x.content instanceof MessageMedia);
        assert.equal(mediaAltAlt.length, 3);
        assert.equal(mediaAltAlt[0].options.caption, '🖼️ Imagem 1/3');
        assert.equal(mediaAltAlt[1].options.caption, '🖼️ Imagem 2/3');
        assert.equal(mediaAltAlt[2].options.caption, '🖼️ Imagem 3/3\n\nEnquanto Suzane vê sua história virar filme...', 'o texto do post na última');
        assert.equal(Buffer.from(mediaAltAlt[0].content.data, 'base64').toString(), 'jpeg-0');
        assert.ok(network.chamadas.every(c => !/pequena/.test(c.url)), 'só a maior de cada item');
        assert.equal(r[0].texto, '✅ 3 fotos enviadas!', 'o aviso vira a confirmação');
        assert.deepEqual(binaries().filter(b => b === 'ffmpeg'), [], 'nada de ffmpeg');
    });

    test('texto acima de 1000 caracteres: a legenda é cortada e o resto vai numa mensagem', async () => {
        processes.post = post(1, 'x'.repeat(1500));
        network.responder('get', photo(0), jpeg(0));
        const r = await bot.executar(`/get ${URL}`);
        const mediaAlt = r.find(x => x.content instanceof MessageMedia);
        // "🖼️ Imagem 1/1" + blank line + the text, all within 1000 characters; the rest goes after
        assert.equal(mediaAlt.options.caption.length, 1000);
        assert.ok(mediaAlt.options.caption.startsWith('🖼️ Imagem 1/1\n\nxxx') && mediaAlt.options.caption.endsWith('…'));
        const inside = mediaAlt.options.caption.length - '🖼️ Imagem 1/1\n\n'.length - 1;
        assert.ok(r.some(x => x.texto === 'x'.repeat(1500 - inside)), 'o resto em outra mensagem');
    });

    test('uma foto que não baixa fica de fora e o aviso conta; nenhuma baixando: o erro de sempre', async () => {
        processes.post = post(2);
        network.responder('get', photo(0), new Error('timeout'));
        network.responder('get', photo(1), jpeg(1));
        const r = await bot.executar(`/get ${URL}`, { erroEsperado: true });
        assert.equal(r.filter(x => x.content instanceof MessageMedia).length, 1);
        assert.equal(r[0].texto, '✅ 1 foto enviada! (1 não baixaram)');

        network.limpar();
        network.responder('get', photo(0), new Error('timeout'));
        network.responder('get', photo(1), new Error('timeout'));
        const r2 = await bot.executar(`/get ${URL}`, { erroEsperado: true });
        assert.match(r2.at(-1).texto, /Esse link não tem vídeo nem áudio/);
    });

    test('-a, -st e /stt não mandam fotos; sem os dados do post, o erro de sempre', async () => {
        processes.post = post(2);
        for (let i = 0; i < 2; i++) network.responder('get', photo(i), jpeg(i));
        const a = await bot.executar(`/get -a ${URL}`, { erroEsperado: true });
        assert.ok(!a.some(x => x.content instanceof MessageMedia));
        const t = await bot.executar(`/stt ${URL}`, { erroEsperado: true });
        assert.match(t.at(-1).texto, /Esse link não tem vídeo nem áudio/);

        processes.post = null;
        const s = await bot.executar(`/get ${URL}`, { erroEsperado: true });
        assert.match(s.at(-1).texto, /Esse link não tem vídeo nem áudio/);
    });
});
