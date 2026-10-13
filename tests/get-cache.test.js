/*
 * /get (/download), /cache (/c) e as rotinas de limpeza do cache.
 * yt-dlp e ffmpeg são simulados: o spawn falso só cria os arquivos de saída.
 */
const bot = require('./helpers/bot');

const fs = require('fs');
const path = require('path');
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { CACHE_DIR, MessageMedia, OUTRO, processos } = bot;
const { isUrlPublica, isValidHttpUrl, extractFirstUrl } = bot.src('util/url');
const limpeza = bot.src('limpeza');

const MEDIA_DIR = path.join(CACHE_DIR, 'media');
const TMP_DIR = path.join(CACHE_DIR, 'tmp');
const { BACKUP_DIR } = bot.src('constantes');
const { criarBackup, listarBackups, removerBackup } = bot.src('backup');
const URL = 'http://8.8.8.8/video'; // IP literal: sem consulta de DNS
const DIA = 24 * 60 * 60 * 1000;

beforeEach(bot.reiniciar);

const binarios = () => processos.chamadas.map(c => path.basename(c.bin));
const argsDo = (nome) => processos.chamadas.find(c => path.basename(c.bin) === nome).args;
const arquivosTemporarios = () => fs.readdirSync(TMP_DIR).filter(f => !f.startsWith('.'));

describe('URLs (anti-SSRF do /get)', () => {
    test('só http(s)', () => {
        assert.equal(isValidHttpUrl('https://x.com'), true);
        for (const u of ['ftp://x.com', 'file:///etc/passwd', 'javascript:alert(1)', 'nada']) assert.equal(isValidHttpUrl(u), false, u);
    });

    test('endereços privados, loopback e link-local são recusados', async () => {
        for (const u of ['http://127.0.0.1/', 'http://10.1.2.3/', 'http://192.168.0.1/', 'http://172.16.5.4/',
            'http://169.254.169.254/', 'http://0.0.0.0/', 'http://[::1]/', 'http://[fe80::1]/', 'http://[::ffff:10.0.0.1]/']) {
            assert.equal(await isUrlPublica(u), false, u);
        }
        assert.equal(await isUrlPublica('http://8.8.8.8/'), true);
        assert.equal(await isUrlPublica('http://[2001:4860:4860::8888]/'), true);
    });

    test('extrai a primeira URL de um texto', () => {
        assert.equal(extractFirstUrl('olha isso https://a.com/x?y=1 e http://b.com'), 'https://a.com/x?y=1');
        assert.equal(extractFirstUrl('sem link'), null);
    });
});

describe('/get (/download)', () => {
    test('vídeo: baixa com yt-dlp, converte com ffmpeg e manda como documento', async () => {
        const r = await bot.executar(`/get ${URL}`, { de: OUTRO.jid });
        assert.ok(r[1].content instanceof MessageMedia);
        assert.equal(r[1].options.sendMediaAsDocument, true);
        assert.equal(r[1].options.caption, '📥 Aqui está a mídia para download.');
        assert.equal(r[0].texto, '✅ Mídia baixada com sucesso!', 'o aviso vira a confirmação');

        assert.deepEqual(binarios(), ['yt-dlp', 'ffmpeg']);
        const yt = argsDo('yt-dlp');
        assert.deepEqual(yt.slice(-2), ['--', URL]);
        assert.ok(yt.includes('--no-playlist'));
        assert.equal(yt[yt.indexOf('--max-filesize') + 1], '200M');
        assert.deepEqual(argsDo('ffmpeg').slice(0, 3), ['-y', '-protocol_whitelist', 'file']);
        assert.deepEqual(arquivosTemporarios(), [], 'os temporários foram apagados');
    });

    test('-a: só o áudio em mp3', async () => {
        await bot.executar(`/download -a ${URL}`);
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

    test('-ss e -es cortam o trecho', async () => {
        await bot.executar(`/get -ss 10 -es 25 ${URL}`);
        const ff = argsDo('ffmpeg');
        assert.equal(ff[ff.indexOf('-ss') + 1], '10');
        assert.equal(ff[ff.indexOf('-t') + 1], '15');
    });

    test('-v manda os comandos executados antes da mídia', async () => {
        const r = await bot.executar(`/get -v ${URL}`);
        assert.match(r[1].texto, /🛠️ \*Verbose Mode\*[\s\S]*yt-dlp[\s\S]*ffmpeg/);
        assert.ok(r[2].content instanceof MessageMedia);
    });

    test('-es sozinho corta a partir do início e aceita frações de segundo', async () => {
        await bot.executar(`/get -es 2.5 ${URL}`);
        const ff = argsDo('ffmpeg');
        assert.equal(ff[ff.indexOf('-t') + 1], '2.5');
        assert.ok(ff.indexOf('-t') > ff.indexOf('-i'));
    });

    test('figurinha respeita o fim pedido e o limite de seis segundos', async () => {
        await bot.executar(`/get -st -ss 3 -es 6 ${URL}`);
        let ff = argsDo('ffmpeg');
        assert.equal(ff[ff.indexOf('-t') + 1], '3');
        processos.chamadas.length = 0;
        await bot.executar(`/get -st -ss 3 -es 20 ${URL}`);
        ff = argsDo('ffmpeg');
        assert.equal(ff[ff.indexOf('-t') + 1], '6');
    });

    test('cortes inválidos e áudio junto com figurinha são recusados antes de baixar', async () => {
        for (const opcoes of ['-ss', '-es', '-ss abc', '-ss -1', '-es 0', '-ss 10 -es 5',
            '-ss 3 -es 3', '-ss Infinity', '-ss 1e309', '-a -st']) {
            assert.match((await bot.responder(`/get ${URL} ${opcoes}`))[0], /^❌/);
        }
        assert.deepEqual(processos.chamadas, []);
    });

    test('link da mensagem respondida', async () => {
        const citada = bot.criarMensagem({ texto: `veja ${URL}`, de: OUTRO.jid });
        await bot.executar('/get', { citada });
        assert.equal(argsDo('yt-dlp').at(-1), URL);
    });

    test('opção desconhecida é recusada (sem isto, viraria a URL)', async () => {
        assert.deepEqual(await bot.responder(`/get -x ${URL}`), ['❌ Opção desconhecida: -x\n💡 _Veja as opções com /get -h_']);
        assert.deepEqual(await bot.responder('/sticker -a', { citada: bot.criarMensagem({ texto: URL, de: OUTRO.jid }) }),
            ['❌ Opção desconhecida: -a\n💡 _Veja as opções com /sticker -h_']);
        assert.deepEqual(processos.chamadas, []);
    });

    test('a URL digitada vale mais que a mensagem respondida', async () => {
        const citada = bot.criarMensagem({ texto: 'http://1.1.1.1/outro', de: OUTRO.jid });
        await bot.executar(`/get ${URL}`, { citada });
        assert.equal(argsDo('yt-dlp').at(-1), URL);
    });

    test('mensagem respondida sem mídia nem link', async () => {
        assert.deepEqual(await bot.responder('/get', { citada: bot.criarMensagem({ texto: 'só texto', de: OUTRO.jid }) }),
            ['❌ A mensagem respondida não tem mídia nem link.']);
    });

    test('sem URL mostra a sintaxe; URL inválida ou privada é recusada', async () => {
        assert.match((await bot.responder('/get'))[0], /^```Uso: \/get/);
        assert.match((await bot.responder('/get ftp://x.com', { erroEsperado: true }))[0], /A URL 'ftp:\/\/x\.com' é inválida/);
        assert.match((await bot.responder('/get http://127.0.0.1:2375/', { erroEsperado: true }))[0], /aponta para um endereço não permitido/);
        assert.deepEqual(processos.chamadas, []);
    });

    test('falhas do yt-dlp, do ffmpeg, download vazio e arquivo grande demais editam o aviso', async () => {
        // O erro substitui o "Processando…": nada além dele é enviado
        const erroNoAviso = async (linha) => {
            const r = await bot.executar(linha, { erroEsperado: true });
            assert.equal(r.length, 1);
            assert.equal(r[0].editada, true);
            return r[0].texto;
        };

        processos.falhar = 'yt-dlp';
        assert.match(await erroNoAviso(`/get -st ${URL}`), /Problemas para baixar com '\/venv\/bin\/yt-dlp'[\s\S]*🛠️ \*Cmd\*/);

        processos.falhar = 'ffmpeg';
        assert.match(await erroNoAviso(`/get ${URL}`), /Problemas para decodificar com '\/usr\/bin\/ffmpeg'/);

        processos.falhar = null;
        processos.naoBaixar = true;
        assert.match(await erroNoAviso(`/get ${URL}`), /Nada foi baixado \(acima de 200 MB\?/);

        processos.naoBaixar = false;
        await bot.setSetting('get.maxSizeMB', 1);
        processos.tamanhoSaida = 2 * 1024 * 1024;
        assert.match(await erroNoAviso(`/get ${URL}`), /Arquivo muito grande para WhatsApp Web \(máx\. 1 MB\)/);

        assert.deepEqual(arquivosTemporarios(), [], 'os temporários foram apagados mesmo com erro');
    });

    test('a edição do aviso não vira "mensagem editada" no cache nem avisa no privado', async () => {
        await bot.setSetting('show.alert.edited', true);
        const r = await bot.executar(`/get -st ${URL}`);
        assert.equal(r.length, 2, 'só o aviso e a figurinha');
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM message_edits')).n, 0);

        processos.falhar = 'yt-dlp';
        await bot.executar(`/get -st ${URL}`, { erroEsperado: true });
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM message_edits')).n, 0);
    });

    test('se o WhatsApp não deixa editar o aviso, o erro vai em outra mensagem', async () => {
        bot.client.recusarEdicao = true;
        processos.falhar = 'yt-dlp';
        const r = await bot.executar(`/get -st ${URL}`, { erroEsperado: true });
        assert.equal(r[0].texto, '💡 Processando seu sticker, aguarde.');
        assert.match(r[1].texto, /Problemas para baixar com/);
    });

    test('no máximo 2 downloads ao mesmo tempo', async () => {
        // Os três rodam juntos: conta o que o bot enviou no total
        await Promise.all([1, 2, 3].map(() => bot.executar(`/get ${URL}`)));
        const textos = bot.client.enviadas.map(e => bot.textoDe(e.content, e.options));
        assert.equal(textos.filter(t => /⏳ Já existem 2 downloads em andamento/.test(t)).length, 1);
        assert.equal(textos.filter(t => /✅ Mídia baixada com sucesso!/.test(t)).length, 2);
        assert.deepEqual(binarios(), ['yt-dlp', 'yt-dlp', 'ffmpeg', 'ffmpeg']);
    });
});

describe('/get respondendo uma mídia do WhatsApp', () => {
    const video = { mimetype: 'video/mp4', data: Buffer.from('mp4').toString('base64'), filename: 'v.mp4' };
    const foto = { mimetype: 'image/jpeg', data: Buffer.from('jpg').toString('base64') };
    const audio = { mimetype: 'audio/ogg; codecs=opus', data: Buffer.from('ogg').toString('base64') };
    const respondendo = (midia) => ({ citada: bot.criarMensagem({ de: OUTRO.jid, midia }) });

    test('sem opção: o arquivo original como documento, sem yt-dlp nem ffmpeg', async () => {
        const r = await bot.executar('/get', respondendo(video));
        assert.equal(r.length, 1);
        assert.equal(r[0].content, video, 'com nome, vai como veio');
        assert.equal(r[0].options.sendMediaAsDocument, true);

        // Sem nome (foto da câmera), ganha um pela extensão: o WhatsApp mostraria "Sem título"
        const [f] = await bot.executar('/get', respondendo(foto));
        assert.deepEqual([f.content.mimetype, f.content.data, f.content.filename], [foto.mimetype, foto.data, 'zapbot.jpeg']);
        assert.deepEqual(processos.chamadas, []);
    });

    test('-a: o áudio do vídeo em mp3, só com o ffmpeg', async () => {
        const r = await bot.executar('/get -a', respondendo(video));
        assert.deepEqual(binarios(), ['ffmpeg']);
        const ff = argsDo('ffmpeg');
        assert.match(ff[ff.indexOf('-i') + 1], /_original\.mp4$/);
        assert.match(ff.at(-1), /_output\.mp3$/);
        assert.equal(r[0].texto, '✅ Mídia baixada com sucesso!');
        assert.equal(r[1].options.sendMediaAsDocument, true);
        assert.deepEqual(arquivosTemporarios(), []);
    });

    test('-st com -ss: figurinha de 6 s a partir do segundo pedido', async () => {
        const r = await bot.executar('/get -st -ss 2', respondendo(video));
        const ff = argsDo('ffmpeg');
        assert.equal(ff[ff.indexOf('-ss') + 1], '2');
        assert.equal(ff[ff.indexOf('-t') + 1], '6');
        assert.match(ff[ff.indexOf('-vf') + 1], /crop=512:512/);
        assert.equal(r[0].texto, '✅ Sticker criado com sucesso!');
        assert.equal(r[1].options.sendMediaAsSticker, true);
    });

    test('-ss e -es sem formato: o trecho do vídeo como documento', async () => {
        const r = await bot.executar('/get -ss 1 -es 3', respondendo(video));
        const ff = argsDo('ffmpeg');
        assert.equal(ff[ff.indexOf('-t') + 1], '2');
        assert.equal(r[1].options.sendMediaAsDocument, true);
    });

    test('-v: sem o yt-dlp, que não rodou', async () => {
        const r = await bot.executar('/get -v -a', respondendo(video));
        assert.match(r[1].texto, /🔗 \*ffmpeg\*/);
        assert.doesNotMatch(r[1].texto, /yt-dlp/);
    });

    test('imagem: -st enquadra no sharp; -ss, -es e -a são recusados', async () => {
        const [st] = await bot.executar('/get -st', respondendo(foto));
        assert.equal(Buffer.from(st.content.data, 'base64').toString(), 'webp-enquadrado');
        assert.equal(st.options.sendMediaAsSticker, true);

        assert.deepEqual(await bot.responder('/get -st -ss 1', respondendo(foto)), ['❌ O -ss e o -es só valem para vídeo.']);
        assert.deepEqual(await bot.responder('/get -a', respondendo(foto)), ['❌ A imagem respondida não tem áudio.']);
        assert.deepEqual(processos.chamadas, []);
    });

    test('áudio: com corte sai em mp3; figurinha é recusada', async () => {
        await bot.executar('/get -ss 2', respondendo(audio));
        const ff = argsDo('ffmpeg');
        assert.match(ff[ff.indexOf('-i') + 1], /_original\.ogg$/);
        assert.match(ff.at(-1), /_output\.mp3$/);

        assert.deepEqual(await bot.responder('/get -st', respondendo(audio)), ['❌ Não dá para fazer figurinha de um áudio.']);
    });

    test('outro tipo de arquivo ou mídia que não baixa', async () => {
        const pdf = { mimetype: 'application/pdf', data: 'AA==' };
        assert.deepEqual(await bot.responder('/get', respondendo(pdf)), ['❌ A mídia respondida não é imagem, vídeo nem áudio.']);

        const citada = bot.criarMensagem({ de: OUTRO.jid, extras: { hasMedia: true, async downloadMedia() { throw new Error('sumiu'); } } });
        assert.deepEqual(await bot.responder('/get -st', { citada, erroEsperado: true }),
            ['❌ Não consegui baixar a mídia respondida: ela pode não estar mais disponível no WhatsApp.']);
    });
});

describe('/cache (/c)', () => {
    test('sem opção: conteúdo do cache e contagem de mensagens', async () => {
        await bot.executar('oi', { de: OUTRO.jid });
        const [r] = await bot.responder('/cache');
        assert.match(r, new RegExp(`🗂️ Exibindo conteúdo de ${CACHE_DIR}`));
        assert.match(r, /🗄️ 2 mensagens no cache\.\n🗑️ 0 apagadas\.\n✏️ 0 edições\.\n📦 Backups: 0 \(veja \/backup\)\.$/);
        assert.match(r, /\n─+\nTotal: +\d/);
        assert.match(r, /└── 📁 tmp\/ +/);
    });

    test('contagens separadas com singular e backups', async () => {
        const [vazio] = await bot.responder('/cache');
        assert.match(vazio, /🗄️ 1 mensagem no cache\./);
        await bot.dbRun("INSERT INTO messages (id, revoked) VALUES ('apagada', 1)");
        await bot.dbRun("INSERT INTO message_edits (message_id) VALUES ('editada')");
        const backup = await criarBackup('manual');
        try {
            const [r] = await bot.responder('/cache');
            assert.match(r, /🗑️ 1 apagada\.\n✏️ 1 edição\.\n📦 Backups: 1 \(veja \/backup\)\.$/);
        } finally {
            await removerBackup(backup);
        }
    });

    test('-c: limpa só o que passou das janelas de retenção', async () => {
        const antigo = Date.now() - 69 * 60 * 60 * 1000;
        await bot.dbRun("INSERT INTO messages (id, timestamp, revoked) VALUES ('velha', ?, 0), ('nova', ?, 0)", [antigo, Date.now()]);
        await bot.dbRun("INSERT INTO messages (id, timestamp, revoked, revoked_at) VALUES ('apagada', ?, 1, ?)", [antigo, antigo]);

        assert.deepEqual(await bot.responder('/c -c'), ['🧹 Cache limpo (itens fora da janela de retenção).']);
        // (a própria mensagem "/c -c" também está no banco: conferimos só as do teste)
        const ids = (await bot.dbAll("SELECT id FROM messages WHERE id IN ('velha', 'nova', 'apagada') ORDER BY id")).map(r => r.id);
        assert.deepEqual(ids, ['apagada', 'nova'], 'a apagada fica 30 dias; a comum sai em 68 h');
    });

    test('-a: apaga tudo (mensagens, edições, mídias, temporários e backups)', async () => {
        await bot.executar('oi', { de: OUTRO.jid, midia: { mimetype: 'image/png', data: 'AA==' } });
        await bot.dbRun("INSERT INTO message_edits (message_id, edited_at) VALUES ('x', 1)");
        fs.writeFileSync(path.join(TMP_DIR, 'lixo.mp4'), 'x');
        await criarBackup();

        const [r] = await bot.responder('/cache -all');
        assert.match(r, new RegExp(`🧹 \\*Limpeza geral concluída\\* _\\(${CACHE_DIR}\\)_\\n\\n🗄️ Mensagens removidas: \\*\\d+\\* _\\(0 apagadas\\)_\\n✏️ Edições removidas: \\*1\\*\\n📦 Backups removidos: \\*1\\*`));
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM messages')).n, 0);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM message_edits')).n, 0);
        assert.deepEqual(fs.readdirSync(MEDIA_DIR), []);
        assert.deepEqual(fs.readdirSync(TMP_DIR), []);
        assert.deepEqual(await listarBackups(), []);
    });

    test('-b: apaga só os backups; junta com -c e -m', async () => {
        await criarBackup();
        await criarBackup();
        await bot.executar('oi', { de: OUTRO.jid });

        const [r] = await bot.responder('/cache -backup');
        assert.match(r, new RegExp(`^📦 Backups apagados de ${BACKUP_DIR}: \\*2\\* _\\([\\d.]+ \\w+\\)_$`));
        assert.deepEqual(await listarBackups(), []);
        assert.ok((await bot.dbGet('SELECT COUNT(*) AS n FROM messages')).n > 0, 'as mensagens ficam');

        assert.match((await bot.responder('/c -c -m -b'))[0], /^🧹 Cache limpo .*\n🖼️ Mídias apagadas .*\n📦 Backups apagados .*: \*0\*/);
    });

    test('-m: apaga as mídias baixadas; as mensagens ficam, sem o arquivo', async () => {
        await bot.executar('foto', { de: OUTRO.jid, id: 'COMFOTO', midia: { mimetype: 'image/png', data: Buffer.alloc(2048).toString('base64') } });
        fs.writeFileSync(path.join(TMP_DIR, 'temporario.mp4'), 'x');

        const [r] = await bot.responder('/cache -media');
        assert.equal(r, `🖼️ Mídias apagadas de ${MEDIA_DIR}: *1* _(2.00 KB)_`);
        assert.deepEqual(fs.readdirSync(MEDIA_DIR), []);
        assert.deepEqual(fs.readdirSync(TMP_DIR), ['temporario.mp4'], 'os temporários não são mídias');

        const row = await bot.dbGet("SELECT has_media, media_path FROM messages WHERE id = 'COMFOTO'");
        assert.deepEqual([row.has_media, row.media_path], [1, null]);
        fs.unlinkSync(path.join(TMP_DIR, 'temporario.mp4'));
    });

    test('-c e -m juntos: limpeza por retenção e mídias', async () => {
        const [r] = await bot.responder('/cache -c -m');
        assert.match(r, /^🧹 Cache limpo \(itens fora da janela de retenção\)\.\n🖼️ Mídias apagadas de .*: \*0\*/);
    });

    test('só o dono usa', async () => {
        assert.deepEqual(await bot.responder('/cache -a', { de: OUTRO.jid }), []);
        assert.deepEqual(await bot.responder('/cache -m', { de: OUTRO.jid }), []);
    });
});

describe('limpeza periódica', () => {
    test('editadas, ocorrências do /watch e contadores do /stats fora da retenção', async () => {
        const velho = Date.now() - 40 * DIA;
        await bot.dbRun('INSERT INTO message_edits (message_id, edited_at) VALUES (?, ?), (?, ?)', ['velha', velho, 'nova', Date.now()]);
        await bot.dbRun('INSERT INTO watch_hits (rule, message_id, timestamp) VALUES (?, ?, ?), (?, ?, ?)', ['r', 'velha', velho, 'r', 'nova', Date.now()]);
        await bot.dbRun("INSERT INTO stats (chat_id, day, hour, sender_id, msgs) VALUES ('c', '2020-01-01', 1, 's', 1), ('c', '2999-01-01', 1, 's', 1)");

        await limpeza.limparEditadasAntigas();
        await limpeza.limparWatchAntigo();
        await limpeza.limparStatsAntigas();

        assert.deepEqual((await bot.dbAll('SELECT message_id FROM message_edits')).map(r => r.message_id), ['nova']);
        assert.deepEqual((await bot.dbAll('SELECT message_id FROM watch_hits')).map(r => r.message_id), ['nova']);
        assert.deepEqual((await bot.dbAll('SELECT day FROM stats')).map(r => r.day), ['2999-01-01']);
    });

    test('mensagem comum antiga sai com a mídia; a apagada fica com a dela', async () => {
        const antigo = Date.now() - 69 * 60 * 60 * 1000;
        const velha = path.join(MEDIA_DIR, 'velha.jpg');
        const guardada = path.join(MEDIA_DIR, 'guardada.jpg');
        fs.mkdirSync(MEDIA_DIR, { recursive: true });
        fs.writeFileSync(velha, 'x');
        fs.writeFileSync(guardada, 'x');
        await bot.dbRun('INSERT INTO messages (id, timestamp, revoked, revoked_at, media_path) VALUES (?, ?, 0, NULL, ?), (?, ?, 1, ?, ?)',
            ['velha', antigo, velha, 'guardada', antigo, Date.now(), guardada]);

        await limpeza.limparCacheAntigo();
        assert.ok(!fs.existsSync(velha));
        assert.ok(fs.existsSync(guardada));
        fs.unlinkSync(guardada);
    });

    test('a limpeza periódica roda 1 minuto depois do boot e a cada 10', async (t) => {
        t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
        const velho = Date.now() - 40 * DIA;
        const inserirVelha = () => bot.dbRun('INSERT INTO message_edits (message_id, edited_at) VALUES (?, ?)', [`v${Math.random()}`, velho]);
        const restantes = async () => (await bot.dbGet('SELECT COUNT(*) AS n FROM message_edits')).n;
        const rodar = async (ms) => {
            t.mock.timers.tick(ms);
            for (let i = 0; i < 20; i++) await new Promise(setImmediate);
        };

        await inserirVelha();
        limpeza.iniciarLimpezaPeriodica();
        await rodar(59 * 1000);
        assert.equal(await restantes(), 1);
        await rodar(1000);
        assert.equal(await restantes(), 0, 'primeira limpeza: 1 min');

        await inserirVelha();
        await rodar(10 * 60 * 1000);
        assert.equal(await restantes(), 0, 'depois: a cada 10 min');
    });

    test('temporários com mais de 2 h são apagados', async () => {
        const velho = path.join(TMP_DIR, 'velho.mp4');
        const novo = path.join(TMP_DIR, 'novo.mp4');
        fs.writeFileSync(velho, 'x');
        fs.writeFileSync(novo, 'x');
        const tresHorasAtras = new Date(Date.now() - 3 * 60 * 60 * 1000);
        fs.utimesSync(velho, tresHorasAtras, tresHorasAtras);

        await limpeza.limparArquivosAntigos();
        assert.deepEqual(fs.readdirSync(TMP_DIR), ['novo.mp4']);
        fs.unlinkSync(novo);
    });
});
