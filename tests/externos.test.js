/*
 * Comandos que consultam serviços externos (todos simulados):
 * /cve, /tempo, /news, /gpt, /tldr, /traduzir, /giphy, /meme, /joke, /kernel e /pixelart.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { MessageMedia, erroHttp, processos, rede } = bot;

beforeEach(bot.reiniciar);

describe('/cve', () => {
    const cve = (id, score, severidade = 'HIGH') => ({
        cve: {
            id,
            descriptions: [{ lang: 'en', value: `Descrição de ${id}` }],
            metrics: score == null ? {} : { cvssMetricV31: [{ type: 'Primary', cvssData: { baseScore: score, baseSeverity: severidade } }] }
        }
    });

    // O NVD responde da mais antiga para a mais nova; a 1ª consulta só conta
    function simularNvd(lista) {
        rede.responder('get', /services\.nvd\.nist\.gov\/rest\/json\/cves\/2\.0$/, (url, cfg) => cfg.params.startIndex === undefined
            ? { totalResults: lista.length }
            : { vulnerabilities: lista.slice(cfg.params.startIndex, cfg.params.startIndex + cfg.params.resultsPerPage) });
    }

    test('as mais recentes primeiro, com nota e link', async () => {
        simularNvd([cve('CVE-1', 5.0), cve('CVE-2', null), cve('CVE-3', 9.8, 'CRITICAL')]);
        await bot.setSetting('cve.max', 2);
        const [r] = await bot.responder('/cve');
        assert.match(r, /🛡️ \*Últimas 2 CVEs publicadas\* _\(últimos 2 dias\)_/);
        assert.match(r, /\*CVE-3\* — 9\.8 CRITICAL[\s\S]*https:\/\/nvd\.nist\.gov\/vuln\/detail\/CVE-3[\s\S]*\*CVE-2\*\n/);
        assert.doesNotMatch(r, /CVE-1/);
    });

    test('sem N usa o cve.max; -high N fora do limite é recusado', async () => {
        simularNvd(Array.from({ length: 15 }, (_, i) => cve(`CVE-${i}`, 7)));
        await bot.setSetting('cve.max', 3);
        assert.match((await bot.responder('/cve'))[0], /Últimas 3 CVEs/);
        assert.match((await bot.responder('/cve -high 21'))[0], /❌ Quantidade inválida: 21\. Use de 1 a 20/);
        assert.match((await bot.responder('/cve -high abc'))[0], /❌ Quantidade inválida: abc/);
    });

    test('<id>: com ou sem o prefixo CVE-, não encontrada', async () => {
        const feita = cve('CVE-2026-109618', 9.8, 'CRITICAL');
        rede.responder('get', /services\.nvd\.nist\.gov\/rest\/json\/cves\/2\.0$/, (url, cfg) =>
            ({ vulnerabilities: cfg.params.cveId === 'CVE-2026-109618' ? [feita] : [] }));

        for (const entrada of ['CVE-2026-109618', '2026-109618', 'cve-2026-109618']) {
            const [r] = await bot.responder(`/cve ${entrada}`);
            assert.match(r, /^🛡️ \*CVE-2026-109618\* — 9\.8 CRITICAL\n.*\nhttps:\/\/nvd\.nist\.gov\/vuln\/detail\/CVE-2026-109618$/);
            assert.equal(rede.chamadas.at(-1).cfg.params.cveId, 'CVE-2026-109618');
        }

        assert.equal((await bot.responder('/cve 2026-1111'))[0], '🛡️ CVE-2026-1111 não encontrada no NVD.');

        rede.responder('get', /services\.nvd\.nist\.gov\/rest\/json\/cves\/2\.0$/, erroHttp(404));
        assert.equal((await bot.responder('/cve 2026-2222'))[0], '🛡️ CVE-2026-2222 não encontrada no NVD.');
    });

    test('-highscore / -high: só críticas, na janela do cve.maxDays', async () => {
        simularNvd([cve('CVE-9', 9.9, 'CRITICAL')]);
        const [r] = await bot.responder('/cve -high 1');
        assert.match(r, /🔥 \*1 CVEs críticas mais recentes\* _\(CVSS ≥ 9, últimos 7 dias\)_/);
        const params = rede.chamadas.at(-1).cfg.params;
        assert.equal(params.cvssV3Severity, 'CRITICAL');
        assert.equal(params.resultsPerPage, 1);
    });

    test('<texto>: busca nas descrições, as mais recentes primeiro, avisa se há mais', async () => {
        const feita = (id, dia, score, sev) => ({ ...cve(id, score, sev).cve, published: `2026-10-${dia}T10:00:00.000` });
        const lista = [feita('CVE-A', 19, 5, 'MEDIUM'), feita('CVE-B', 20, null), feita('CVE-C', 21, 9.8, 'CRITICAL')];
        rede.responder('get', /services\.nvd\.nist\.gov\/rest\/json\/cves\/2\.0$/, (url, cfg) => cfg.params.startIndex === undefined
            ? { totalResults: lista.length }
            : { vulnerabilities: lista.slice(cfg.params.startIndex, cfg.params.startIndex + cfg.params.resultsPerPage).map(cve => ({ cve })) });
        await bot.setSetting('cve.max', 2);

        const [r] = await bot.responder('/cve PHP uses longjmp()');
        assert.equal(rede.chamadas.at(-1).cfg.params.keywordSearch, 'PHP uses longjmp()');
        assert.match(r, /^🔎 \*2 de 3 CVEs com\* "PHP uses longjmp\(\)"\n\n🔴 \*CVE-C\*\n🗓️ Oct 21, 2026\n🔎 .*\n\n⚪ \*CVE-B\*\n🗓️ Oct 20, 2026\n/);
        assert.match(r, /\n\n💡 _Há mais 1 /);

        rede.responder('get', /services\.nvd\.nist\.gov\/rest\/json\/cves\/2\.0$/, () => ({ totalResults: 0 }));
        assert.equal((await bot.responder('/cve nada por aqui'))[0], '🛡️ Nenhuma CVE com "nada por aqui".');
    });

    test('nenhuma publicada; NVD fora do ar', async () => {
        simularNvd([]);
        assert.deepEqual(await bot.responder('/cve'), ['🛡️ Nenhuma CVE publicada no últimos 2 dias.']);
        rede.responder('get', /services\.nvd\.nist\.gov\/rest\/json\/cves\/2\.0$/, erroHttp(503));
        assert.match((await bot.responder('/cve', { erroEsperado: true }))[0], /❌ Não consegui consultar o NVD agora/);
    });
});

describe('/tempo (/t, /weather)', () => {
    const local = { name: 'Niterói', admin1: 'Rio de Janeiro', country: 'Brasil', latitude: -22.9, longitude: -43.1 };
    const previsao = (temp, codigo = 0) => ({
        current: { temperature_2m: temp, apparent_temperature: temp + 1, relative_humidity_2m: 70, weather_code: codigo, wind_speed_10m: 12.4 },
        daily: { temperature_2m_max: [temp + 3], temperature_2m_min: [temp - 3], precipitation_probability_max: [40] }
    });

    test('sem cidade usa o tempo.city; mostra agora, máx/mín, umidade, vento e chuva', async () => {
        rede.responder('get', 'geocoding-api.open-meteo.com', (url, cfg) => ({ results: [{ ...local, pedido: cfg.params.name }] }));
        rede.responder('get', 'api.open-meteo.com/v1/forecast', previsao(24, 2));

        const [r] = await bot.responder('/tempo');
        assert.equal(rede.chamadas[0].cfg.params.name, 'Niteroi, Rio de Janeiro, Brazil');
        assert.match(r, /⛅ \*Tempo em Niterói, Rio de Janeiro, Brasil\*\n\nParcialmente nublado\n🌡️ \*Agora:\* 24°C _\(sensação 25°C\)_/);
        assert.match(r, /📈 \*Máx:\* 27°C  📉 \*Mín:\* 21°C\n💧 \*Umidade:\* 70%  🌬️ \*Vento:\* 12 km\/h\n☔ \*Chance de chuva:\* 40%/);
    });

    test('cidade informada; calor e frio; valor ausente vira "-"', async () => {
        rede.responder('get', 'geocoding-api.open-meteo.com', { results: [local] });
        rede.responder('get', 'api.open-meteo.com/v1/forecast', previsao(35));
        assert.match((await bot.responder('/weather Recife'))[0], /🔥 Que calor/);
        assert.equal(rede.chamadas[0].cfg.params.name, 'Recife');

        rede.responder('get', 'api.open-meteo.com/v1/forecast', { ...previsao(2), daily: { temperature_2m_max: [null], temperature_2m_min: [null], precipitation_probability_max: [null] } });
        const [frio] = await bot.responder('/tempo Curitiba');
        assert.match(frio, /🥶 Tá congelando!/);
        assert.match(frio, /📈 \*Máx:\* -  📉 \*Mín:\* -/);
    });

    // Previsão de N dias: daily com um item por dia
    const previsaoDias = (n) => ({
        ...previsao(24),
        daily: {
            time: Array.from({ length: n }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`),
            weather_code: Array.from({ length: n }, (_, i) => [0, 63, 95][i % 3]),
            temperature_2m_max: Array.from({ length: n }, (_, i) => 30 + i),
            temperature_2m_min: Array.from({ length: n }, (_, i) => 20 + i),
            precipitation_probability_max: Array.from({ length: n }, (_, i) => Math.min(i * 10, 100))
        }
    });

    test('N ou Nd: previsão dos próximos N dias, com ou sem cidade', async () => {
        rede.responder('get', 'geocoding-api.open-meteo.com', (url, cfg) => ({ results: [{ ...local, name: cfg.params.name }] }));
        rede.responder('get', 'api.open-meteo.com/v1/forecast', (url, cfg) => previsaoDias(cfg.params.forecast_days));

        // Cidade nova (o /tempo guarda a geocodificação em cache entre os testes)
        const [r] = await bot.responder('/tempo 3d Olinda');
        assert.equal(rede.chamadas.at(-1).cfg.params.forecast_days, 3);
        assert.equal(rede.chamadas.find(c => c.url.includes('geocoding')).cfg.params.name, 'Olinda', 'o "3d" não entra no nome');
        assert.match(r, /🌡️ \*Agora:\* 24°C/, 'mantém o tempo de agora');
        assert.match(r, /📅 \*Próximos 3 dias\*\n☀️ \*Hoje \(qui 01\/10\):\* 30°\/20° · ☔ 0% · Céu limpo\n🌧️ \*sex 02\/10:\* 31°\/21° · ☔ 10% · Chuva\n⛈️ \*sáb 03\/10:\* 32°\/22° · ☔ 20% · Trovoada/);

        await bot.setSetting('tempo.city', 'Maricá');
        await bot.responder('/weather 5');
        assert.equal(rede.chamadas.at(-1).cfg.params.forecast_days, 5);
        assert.equal(rede.chamadas.at(-2).cfg.params.name, 'Maricá', 'sem cidade: tempo.city');

        assert.match((await bot.responder('/tempo 1d'))[0], /📅 \*Previsão de hoje\*\n/);
        assert.match((await bot.responder('/tempo 7D Recife'))[0], /Próximos 7 dias/);
    });

    test('sem N: só o dia de hoje (forecast_days 1), sem a lista', async () => {
        rede.responder('get', 'geocoding-api.open-meteo.com', { results: [local] });
        rede.responder('get', 'api.open-meteo.com/v1/forecast', (url, cfg) => previsaoDias(cfg.params.forecast_days));
        const [r] = await bot.responder('/tempo Niteroi');
        assert.equal(rede.chamadas.at(-1).cfg.params.forecast_days, 1);
        assert.doesNotMatch(r, /Próximos|Previsão de hoje/);
    });

    test('N fora de 1..tempo.maxDays é recusado; o máximo vem do setting (até 16)', async () => {
        await bot.setSetting('tempo.maxDays', 7);
        assert.match((await bot.responder('/tempo 8d Recife'))[0], /❌ Quantidade de dias inválida: 8\. Use de 1 a 7\./);
        assert.match((await bot.responder('/tempo 0'))[0], /Quantidade de dias inválida: 0/);
        assert.deepEqual(rede.chamadas, [], 'nem consulta a API');

        await bot.setSetting('tempo.maxDays', 16);
        rede.responder('get', 'geocoding-api.open-meteo.com', { results: [local] });
        rede.responder('get', 'api.open-meteo.com/v1/forecast', (url, cfg) => previsaoDias(cfg.params.forecast_days));
        assert.match((await bot.responder('/tempo 16'))[0], /Próximos 16 dias/);
        await assert.rejects(bot.setSetting('tempo.maxDays', 17), /entre 1 e 16/);
    });

    test('padrão permite 16d com datas válidas; 17 dias é recusado sem consultar a API', async () => {
        assert.equal(bot.getSetting('tempo.maxDays'), 16);
        rede.responder('get', 'geocoding-api.open-meteo.com', { results: [local] });
        rede.responder('get', 'api.open-meteo.com/v1/forecast',
            (url, cfg) => previsaoDias(cfg.params.forecast_days));
        const [r] = await bot.responder('/tempo 16d Recife');
        assert.equal(rede.chamadas.at(-1).cfg.params.forecast_days, 16);
        assert.match(r, /Próximos 16 dias/);
        assert.match(r, /sex 16\/10/);
        assert.doesNotMatch(r, /Invalid Date/);
        assert.equal(r.split('\n').filter(l => l.includes(' · ☔ ')).length, 16);
        rede.chamadas.length = 0;
        assert.match((await bot.responder('/tempo 17d Recife'))[0], /Use de 1 a 16/);
        assert.deepEqual(rede.chamadas, []);
    });

    test('cidade não encontrada; serviço fora do ar', async () => {
        rede.responder('get', 'geocoding-api.open-meteo.com', { results: [] });
        assert.match((await bot.responder('/tempo Xyzabc'))[0], /❌ Cidade não encontrada: Xyzabc/);

        rede.responder('get', 'geocoding-api.open-meteo.com', erroHttp(500));
        assert.deepEqual(await bot.responder('/tempo Lugar', { erroEsperado: true }), ['❌ Não consegui consultar o tempo agora.']);
    });
});

describe('/news', () => {
    const feed = (fonte, itens) => `<?xml version="1.0"?><rss><channel><title>${fonte}</title>${itens.map(([titulo, data]) =>
        `<item><title><![CDATA[${titulo}]]></title><link>https://n.com/${encodeURIComponent(titulo)}</link><pubDate>${data}</pubDate></item>`).join('')}</channel></rss>`;

    test('sem categoria mostra a ajuda', async () => {
        assert.match((await bot.responder('/news'))[0], /Uso: \/news/);
    });

    test('-g1: manchetes da mais nova para a mais antiga, com fonte e link', async () => {
        rede.responder('get', 'g1.globo.com', feed('g1', [['Antiga', 'Mon, 28 Sep 2026 10:00:00 GMT'], ['Nova &amp; boa', 'Wed, 30 Sep 2026 10:00:00 GMT']]));
        const [r] = await bot.responder('/news -g1');
        assert.match(r, /^📰 \*g1\*\n\n1\. \*Nova & boa\*\n_g1 · [^_]+_\nhttps:\/\/n\.com\/[\s\S]*2\. \*Antiga\*/);
    });

    test('quantidade; várias categorias dividem as vagas entre as fontes', async () => {
        await bot.setSetting('news.g1', 'https://a.com/rss');
        await bot.setSetting('news.gazeta', 'https://b.com/rss');
        rede.responder('get', 'a.com', feed('A', [['A1', 'Wed, 30 Sep 2026 12:00:00 GMT'], ['A2', 'Wed, 30 Sep 2026 11:00:00 GMT'], ['A3', 'Wed, 30 Sep 2026 10:00:00 GMT']]));
        rede.responder('get', 'b.com', feed('B', [['B1', 'Tue, 29 Sep 2026 12:00:00 GMT']]));

        const [r] = await bot.responder('/news -g1 -gazeta 2');
        assert.match(r, /^📰 \*News\*/);
        assert.match(r, /\*A1\*[\s\S]*\*B1\*/);
        assert.doesNotMatch(r, /A2/);
    });

    test('quantidade inválida; sem feeds; todos os feeds falham', async () => {
        assert.match((await bot.responder('/news -g1 11'))[0], /❌ Quantidade inválida: 11\. Use de 1 a 10/);

        await bot.setSetting('news.hack', '');
        assert.match((await bot.responder('/news -hack'))[0], /ℹ️ Nenhum feed configurado\.\n💡 _Adicione com \/set news\.hack/);

        rede.responder('get', 'g1.globo.com', erroHttp(403));
        assert.deepEqual(await bot.responder('/news -g1', { erroEsperado: true }), ['❌ Não consegui buscar as manchetes agora.']);
    });
});

describe('/gpt (/ai)', () => {
    test('sem chave: desativado', async () => {
        assert.match((await bot.responder('/gpt oi'))[0], /⚠️ API key da OpenAI não encontrada/);
    });

    test('pergunta com a chave do setting; texto da mensagem respondida entra antes', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        rede.responder('post', 'api.openai.com', { choices: [{ message: { content: ' Resposta! ' } }] });

        const citada = bot.criarMensagem({ texto: 'texto citado', de: bot.OUTRO.jid });
        assert.deepEqual(await bot.responder('/ai resuma', { citada }), ['🤖 Resposta!']);

        const { cfg } = rede.chamadas.at(-1);
        assert.equal(cfg.headers.Authorization, 'Bearer sk-teste');
        assert.equal(cfg.body.messages[1].content, 'texto citado\n\nresuma');
        assert.equal(cfg.timeout, 60000);
        assert.equal(bot.client.chats.get(bot.GRUPO).digitando, 1);
    });

    test('respondendo uma foto: ela vai junto da pergunta (legenda + pergunta + imagem em base64)', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        rede.responder('post', 'api.openai.com', { choices: [{ message: { content: 'É um labrador.' } }] });

        const foto = bot.criarMensagem({ texto: 'meu cachorro', de: bot.OUTRO.jid, tipo: 'image',
            midia: { mimetype: 'image/jpeg', data: 'QUJD' } });
        assert.deepEqual(await bot.responder('/gpt qual a raça desse cachorro?', { citada: foto }), ['🤖 É um labrador.']);

        const { body } = rede.chamadas.at(-1).cfg;
        assert.deepEqual(body.messages[1].content, [
            { type: 'text', text: 'meu cachorro\n\nqual a raça desse cachorro?' },
            { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } }
        ]);

        // Sem pergunta: descreve; só texto continua uma string
        const semLegenda = bot.criarMensagem({ de: bot.OUTRO.jid, tipo: 'image', midia: { mimetype: 'image/png', data: 'QUJD' } });
        await bot.responder('/gpt', { citada: semLegenda });
        assert.equal(rede.chamadas.at(-1).cfg.body.messages[1].content[0].text, 'Descreva esta imagem.');

        const texto = bot.criarMensagem({ texto: 'um texto', de: bot.OUTRO.jid });
        await bot.responder('/gpt resuma', { citada: texto });
        assert.equal(rede.chamadas.at(-1).cfg.body.messages[1].content, 'um texto\n\nresuma');
    });

    test('foto que não dá: não baixa, formato que a OpenAI não lê, grande demais; vídeo não é foto', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        rede.responder('post', 'api.openai.com', { choices: [{ message: { content: 'ok' } }] });
        const chamadas = () => rede.chamadas.length;
        const antes = chamadas();

        const expirada = bot.criarMensagem({ de: bot.OUTRO.jid, tipo: 'image', extras: { hasMedia: true, downloadMedia: async () => null } });
        assert.match((await bot.responder('/gpt o que é?', { citada: expirada }))[0], /❌ Não consegui baixar a imagem/);

        const heic = bot.criarMensagem({ de: bot.OUTRO.jid, tipo: 'image', midia: { mimetype: 'image/heic', data: 'QUJD' } });
        assert.match((await bot.responder('/gpt o que é?', { citada: heic }))[0], /❌ A OpenAI não lê imagem image\/heic: só jpeg, png, webp, gif\./);

        const enorme = bot.criarMensagem({ de: bot.OUTRO.jid, tipo: 'image', midia: { mimetype: 'image/jpeg', data: 'A'.repeat(21 * 1024 * 1024) } });
        assert.match((await bot.responder('/gpt o que é?', { citada: enorme }))[0], /❌ A imagem tem mais de 15 MB/);
        assert.equal(chamadas(), antes, 'nada foi para a OpenAI');

        // Vídeo: segue só o texto (a legenda), sem baixar nada
        const video = bot.criarMensagem({ texto: 'legenda do vídeo', de: bot.OUTRO.jid, tipo: 'video', midia: { mimetype: 'video/mp4', data: 'QUJD' } });
        await bot.responder('/gpt resuma', { citada: video });
        assert.equal(rede.chamadas.at(-1).cfg.body.messages[1].content, 'legenda do vídeo\n\nresuma');
    });

    test('respondendo um áudio: transcreve (v1/audio/transcriptions); com outra pergunta, o chat em cima da transcrição', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        rede.responder('post', 'api.openai.com/v1/audio/transcriptions', { text: ' olá, tudo bem? ' });
        rede.responder('post', 'api.openai.com/v1/chat/completions', { choices: [{ message: { content: 'Um cumprimento.' } }] });

        const voz = bot.criarMensagem({ de: bot.OUTRO.jid, tipo: 'ptt', midia: { mimetype: 'audio/ogg; codecs=opus', data: 'QUJD' } });
        assert.deepEqual(await bot.responder('/gpt agora transcreva isso', { citada: voz }), ['🤖 *Transcrição:*\nolá, tudo bem?']);

        const { cfg } = rede.chamadas.at(-1);
        assert.equal(rede.chamadas.at(-1).url, 'https://api.openai.com/v1/audio/transcriptions');
        assert.equal(cfg.headers.Authorization, 'Bearer sk-teste');
        assert.equal(cfg.body.get('model'), 'gpt-transcribe');
        assert.equal(cfg.body.get('file').name, 'audio.ogg');
        assert.equal(rede.chamadas.filter(c => c.url.endsWith('/chat/completions')).length, 0, 'só transcrever não chama o chat');

        // Sem pergunta também só transcreve; o modelo vem do setting
        await bot.setSetting('openai.transcribe.model', 'gpt-4o-mini-transcribe');
        assert.deepEqual(await bot.responder('/gpt', { citada: voz }), ['🤖 *Transcrição:*\nolá, tudo bem?']);
        assert.equal(rede.chamadas.at(-1).cfg.body.get('model'), 'gpt-4o-mini-transcribe');

        // Outra pergunta: a transcrição vai junto para o chat
        assert.deepEqual(await bot.responder('/gpt resuma esse áudio', { citada: voz }), ['🤖 Um cumprimento.']);
        assert.equal(rede.chamadas.at(-1).cfg.body.messages[1].content,
            'resuma esse áudio\n\nTranscrição do áudio:\nolá, tudo bem?');
    });

    test('áudio que não dá: não baixa, formato que a OpenAI não lê, grande demais, sem fala e erro da OpenAI', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        const antes = rede.chamadas.length;

        const expirado = bot.criarMensagem({ de: bot.OUTRO.jid, tipo: 'audio', extras: { hasMedia: true, downloadMedia: async () => null } });
        assert.match((await bot.responder('/gpt', { citada: expirado }))[0], /❌ Não consegui baixar o áudio/);

        const aac = bot.criarMensagem({ de: bot.OUTRO.jid, tipo: 'audio', midia: { mimetype: 'audio/aac', data: 'QUJD' } });
        assert.match((await bot.responder('/gpt', { citada: aac }))[0], /❌ A OpenAI não transcreve áudio audio\/aac: só ogg, mp3, m4a, wav, webm, flac\./);

        const enorme = bot.criarMensagem({ de: bot.OUTRO.jid, tipo: 'audio', midia: { mimetype: 'audio/mpeg', data: 'A'.repeat(35 * 1024 * 1024) } });
        assert.match((await bot.responder('/gpt', { citada: enorme }))[0], /❌ O áudio tem mais de 25 MB/);
        assert.equal(rede.chamadas.length, antes, 'nada foi para a OpenAI');

        const mudo = bot.criarMensagem({ de: bot.OUTRO.jid, tipo: 'ptt', midia: { mimetype: 'audio/ogg; codecs=opus', data: 'QUJD' } });
        rede.responder('post', 'api.openai.com/v1/audio/transcriptions', { text: '' });
        assert.deepEqual(await bot.responder('/gpt', { citada: mudo }), ['🤖 Não ouvi fala nenhuma nesse áudio.']);

        rede.responder('post', 'api.openai.com/v1/audio/transcriptions', erroHttp(401));
        assert.match((await bot.responder('/gpt', { citada: mudo, erroEsperado: true }))[0], /🔑 API key da OpenAI inválida/);
    });

    test('-voz: o texto digitado (ou o da mensagem respondida) vira uma nota de voz de robô (v1/audio/speech)', async () => {
        assert.match((await bot.responder('/gpt -voz oi'))[0], /⚠️ API key da OpenAI não encontrada/);

        await bot.setSetting('openai.api.key', 'sk-teste');
        rede.responder('post', 'api.openai.com/v1/audio/speech', Buffer.from('OGGDATA'));

        const r = (await bot.executar('/gpt -voz exterminar todos os humanos')).at(-1);
        assert.ok(r.content instanceof MessageMedia);
        assert.equal(r.content.mimetype, 'audio/ogg; codecs=opus');
        assert.equal(r.content.data, Buffer.from('OGGDATA').toString('base64'));
        assert.equal(r.options.sendAudioAsVoice, true);

        const { url, cfg } = rede.chamadas.at(-1);
        assert.equal(url, 'https://api.openai.com/v1/audio/speech');
        assert.equal(cfg.headers.Authorization, 'Bearer sk-teste');
        assert.equal(cfg.responseType, 'arraybuffer');
        assert.deepEqual(cfg.body, {
            model: 'gpt-4o-mini-tts', voice: 'onyx', input: 'exterminar todos os humanos', response_format: 'opus',
            instructions: 'Fale como um robô: voz metálica, monótona e pausada, sem emoção.'
        });

        // Sem texto digitado, fala o da mensagem respondida; o -voz pode vir no meio
        const citada = bot.criarMensagem({ texto: 'bom dia, humano', de: bot.OUTRO.jid });
        await bot.executar('/gpt -voz', { citada });
        assert.equal(rede.chamadas.at(-1).cfg.body.input, 'bom dia, humano');
        // Com texto digitado e uma mensagem respondida: fala a respondida, no estilo digitado
        await bot.executar('/gpt -voz fale como um robô meio metálico', { citada });
        assert.equal(rede.chamadas.at(-1).cfg.body.input, 'bom dia, humano');
        assert.equal(rede.chamadas.at(-1).cfg.body.instructions, 'fale como um robô meio metálico');
        await bot.executar('/gpt fale -v isso aqui');
        assert.equal(rede.chamadas.at(-1).cfg.body.input, 'fale isso aqui');

        // O modelo, a voz e o estilo vêm dos settings; o tts-1 não leva o estilo
        await bot.setSetting('openai.tts.voice', 'nova');
        await bot.setSetting('openai.tts.model', 'tts-1');
        await bot.executar('/gpt -voz oi');
        assert.deepEqual(rede.chamadas.at(-1).cfg.body, { model: 'tts-1', voice: 'nova', input: 'oi', response_format: 'opus' });
    });

    test('-voz: sem texto, grande demais e erro da OpenAI (o corpo do erro vem em bytes)', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        const antes = rede.chamadas.length;

        assert.deepEqual(await bot.responder('/gpt -voz'), ['❌ Use: /gpt -voz <texto> (ou responda uma mensagem de texto)']);
        assert.match((await bot.responder(`/gpt -voz ${'a'.repeat(4097)}`))[0], /❌ O texto tem 4097 caracteres: a voz aceita até 4096\./);
        assert.equal(rede.chamadas.length, antes, 'nada foi para a OpenAI');

        rede.responder('post', 'api.openai.com/v1/audio/speech', Object.assign(new Error('Request failed with status code 400'), {
            response: { status: 400, data: Buffer.from(JSON.stringify({ error: { message: 'voz inválida' } })) }
        }));
        assert.deepEqual(await bot.responder('/gpt -voz oi', { erroEsperado: true }), ['❌ Erro no /gpt: voz inválida']);
    });

    // O sharp dos testes lê as dimensões de "png:LxA" (veja o sharpFalso em tests/helpers/ambiente.js)
    const PNG_4X2 = Buffer.from('png:4x2').toString('base64');

    test('-img: gera uma imagem (v1/images/generations) e, respondendo uma foto, a edita (v1/images/edits)', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        assert.deepEqual(await bot.responder('/gpt -img'), ['❌ Use: /gpt -img <o que criar> (respondendo uma foto, ela é editada)']);

        rede.responder('post', 'api.openai.com/v1/images/generations', { data: [{ b64_json: 'UE5H' }] });
        const r = (await bot.executar('/gpt -img um robô nadando em aquarela')).at(-1);
        assert.ok(r.content instanceof MessageMedia);
        assert.equal(r.content.mimetype, 'image/png');
        assert.equal(r.content.data, 'UE5H');
        const gerar = rede.chamadas.at(-1);
        assert.equal(gerar.url, 'https://api.openai.com/v1/images/generations');
        assert.deepEqual(gerar.cfg.body, { model: 'gpt-image-2.6-flare', prompt: 'um robô nadando em aquarela', n: 1 });

        // Respondendo uma foto: a edição (multipart), com a foto em PNG
        rede.responder('post', 'api.openai.com/v1/images/edits', { data: [{ b64_json: 'RURJVA==' }] });
        const foto = bot.criarMensagem({ de: bot.OUTRO.jid, tipo: 'image', midia: { mimetype: 'image/jpeg', data: PNG_4X2 } });
        const editada = (await bot.executar('/gpt -img coloque um chapéu nele', { citada: foto })).at(-1);
        assert.equal(editada.content.data, 'RURJVA==');
        const edicao = rede.chamadas.at(-1);
        assert.equal(edicao.url, 'https://api.openai.com/v1/images/edits');
        assert.equal(edicao.cfg.body.get('prompt'), 'coloque um chapéu nele');
        assert.equal(edicao.cfg.body.get('model'), 'gpt-image-2.6-flare');
        assert.equal(edicao.cfg.body.get('image').type, 'image/png');

        // A OpenAI sem a imagem na resposta: erro legível
        rede.responder('post', 'api.openai.com/v1/images/generations', { data: [] });
        assert.deepEqual(await bot.responder('/gpt -img x', { erroEsperado: true }), ['❌ Erro no /gpt: a OpenAI não devolveu a imagem']);
    });

    test('modelo que a conta não tem: o erro lista os que a chave vê (GET /v1/models) e diz como trocar', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        const semModelo = (modelo) => erroHttp(400, 'HTTP 400', { data: { error: { message: `The model '${modelo}' does not exist.` } } });
        rede.responder('get', 'api.openai.com/v1/models', { data: [{ id: 'gpt-4o' }, { id: 'gpt-image-2' }, { id: 'dall-e-3' }, { id: 'sora-2' }, { id: 'whisper-1' }, { id: 'tts-1' }] });

        // Imagem
        rede.responder('post', 'api.openai.com/v1/images/generations', semModelo('gpt-image-2.6-flare'));
        assert.deepEqual(await bot.responder('/gpt -img um robô', { erroEsperado: true }), [
            '❌ O modelo gpt-image-2.6-flare não existe na sua conta da OpenAI (imagem).\n' +
            '💡 _A sua chave vê: dall-e-3, gpt-image-2_\n' +
            '💡 _Troque com /set openai.image.model <modelo>_'
        ]);

        // O modelo é livre: troca para o que a conta tem e funciona
        await bot.setSetting('openai.image.model', 'gpt-image-2');
        rede.responder('post', 'api.openai.com/v1/images/generations', { data: [{ b64_json: 'UE5H' }] });
        const ok = (await bot.executar('/gpt -img um robô')).at(-1);
        assert.equal(ok.content.data, 'UE5H');
        assert.equal(rede.chamadas.filter(c => c.url.endsWith('/images/generations')).at(-1).cfg.body.model, 'gpt-image-2');

        // Voz, transcrição e vídeo seguem o mesmo aviso
        rede.responder('post', 'api.openai.com/v1/audio/speech', semModelo('gpt-4o-mini-tts'));
        assert.match((await bot.responder('/gpt -voz oi', { erroEsperado: true }))[0], /^❌ O modelo gpt-4o-mini-tts não existe na sua conta da OpenAI \(voz\)\.\n💡 _A sua chave vê: tts-1_\n/);

        rede.responder('post', 'api.openai.com/v1/audio/transcriptions', semModelo('gpt-transcribe'));
        const voz = bot.criarMensagem({ de: bot.OUTRO.jid, tipo: 'ptt', midia: { mimetype: 'audio/ogg; codecs=opus', data: 'QUJD' } });
        assert.match((await bot.responder('/gpt', { citada: voz, erroEsperado: true }))[0], /^❌ O modelo gpt-transcribe não existe .*\(transcrição\)\.\n💡 _A sua chave vê: whisper-1_\n💡 _Troque com \/set openai\.transcribe\.model/s);

        await bot.setSetting('openai.image.model', 'gpt-image-1');
        rede.responder('post', 'api.openai.com/v1/images/generations', semModelo('gpt-image-1'));
        assert.match((await bot.responder('/gpt -gif um gato', { erroEsperado: true })).at(-1), /^❌ O modelo gpt-image-1 não existe .*\(imagem\)\.\n💡 _A sua chave vê: dall-e-3, gpt-image-2_/s);

        // Sem a lista (o /v1/models também falha): só o aviso
        rede.responder('get', 'api.openai.com/v1/models', erroHttp(500));
        rede.responder('post', 'api.openai.com/v1/images/generations', semModelo('gpt-image-2'));
        assert.match((await bot.responder('/gpt -img x', { erroEsperado: true }))[0], /💡 _Não achei na lista da sua chave nenhum modelo parecido\._/);
    });

    test('-gif: o GIF animado da API de imagens (output_format gif) vira um MP4 mandado como GIF; respondendo uma foto, ela é a base', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        assert.deepEqual(await bot.responder('/gpt -gif'), ['❌ Use: /gpt -gif <o que animar> (respondendo uma foto, ela é animada)']);

        rede.responder('post', 'api.openai.com/v1/images/generations', { data: [{ b64_json: Buffer.from('GIF89a').toString('base64') }] });
        rede.responder('post', 'api.openai.com/v1/images/edits', { data: [{ b64_json: Buffer.from('GIF89a').toString('base64') }] });

        // Sem foto: só o texto
        const gif = (await bot.executar('/gpt -gif um gato de óculos escuros')).at(-1);
        assert.ok(gif.content instanceof MessageMedia);
        assert.equal(gif.content.mimetype, 'video/mp4');
        assert.equal(gif.options.sendVideoAsGif, true);
        const geracao = rede.chamadas.at(-1);
        assert.equal(geracao.url, 'https://api.openai.com/v1/images/generations');
        assert.deepEqual(geracao.cfg.body, {
            model: 'gpt-image-2.6-flare', prompt: 'um gato de óculos escuros', n: 1,
            output_format: 'gif', frame_count: 9, frame_duration_ms: 200
        });
        // O GIF passou pelo ffmpeg: entrada .gif, saída .mp4 sem áudio
        const ffmpeg = processos.chamadas.at(-1);
        assert.match(ffmpeg.bin, /ffmpeg$/);
        assert.ok(ffmpeg.args.includes('-an') && ffmpeg.args.at(-1).endsWith('saida.mp4'));
        assert.ok(ffmpeg.args[ffmpeg.args.indexOf('-i') + 1].endsWith('entrada.gif'));

        // Os quadros e o tempo vêm dos settings
        await bot.setSetting('openai.gif.frames', 12);
        await bot.setSetting('openai.gif.frameMs', 150);
        await bot.executar('/gpt -gif um gato');
        assert.equal(rede.chamadas.at(-1).cfg.body.frame_count, 12);
        assert.equal(rede.chamadas.at(-1).cfg.body.frame_duration_ms, 150);

        // "gere um gif animado..." respondendo uma foto, sem o -gif: a edição (multipart) com a foto em PNG
        const foto = bot.criarMensagem({ de: bot.OUTRO.jid, tipo: 'image', midia: { mimetype: 'image/jpeg', data: PNG_4X2 } });
        const animado = (await bot.executar('/gpt gere um gif animado de como se estivesse nadando', { citada: foto })).at(-1);
        assert.equal(animado.options.sendVideoAsGif, true);
        const edicao = rede.chamadas.at(-1);
        assert.equal(edicao.url, 'https://api.openai.com/v1/images/edits');
        assert.equal(edicao.cfg.body.get('output_format'), 'gif');
        assert.equal(edicao.cfg.body.get('frame_count'), '12');
        assert.equal(edicao.cfg.body.get('frame_duration_ms'), '150');
        assert.equal(edicao.cfg.body.get('image').type, 'image/png');
        assert.equal(edicao.cfg.body.get('prompt'),
            'Anime esta imagem em um GIF. gere um gif animado de como se estivesse nadando');
    });

    test('-gif: conta sem a prévia do GIF, a OpenAI sem a imagem e o ffmpeg falhando', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');

        rede.responder('post', 'api.openai.com/v1/images/generations',
            erroHttp(400, 'HTTP 400', { data: { error: { message: 'output_format gif requires access to the GIF preview' } } }));
        const [semPrevia] = await bot.responder('/gpt -gif x', { erroEsperado: true });
        assert.match(semPrevia, /^🔒 A sua conta\/modelo não faz GIF animado: output_format gif requires access to the GIF preview\n/);
        assert.match(semPrevia, /Só os gpt-image-2\.6-\* fazem GIF/);

        rede.responder('post', 'api.openai.com/v1/images/generations', { data: [] });
        assert.deepEqual(await bot.responder('/gpt -gif x', { erroEsperado: true }), ['❌ Erro no /gpt: a OpenAI não devolveu a imagem']);

        rede.responder('post', 'api.openai.com/v1/images/generations', { data: [{ b64_json: 'R0lG' }] });
        processos.falhar = 'ffmpeg';
        try {
            assert.match((await bot.responder('/gpt -gif x', { erroEsperado: true }))[0], /^❌ Erro no \/gpt: .*ffmpeg/);
        } finally {
            processos.falhar = null;
        }
    });

    test('-img e -gif gastam a conta: só o dono e os admins, também no "gere um gif..." sem o -gif', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        await bot.setSetting('bot.users', [bot.OUTRO.user]);
        await bot.setSetting('bot.users.cmds', [`${bot.OUTRO.user}=/gpt`]);
        const antes = rede.chamadas.length;

        assert.deepEqual(await bot.responder('/gpt -img um robô', { de: bot.OUTRO.jid }),
            ['⛔ Apenas o dono do bot (ou um admin) pode usar o -img do /gpt.']);
        assert.deepEqual(await bot.responder('/gpt -gif um gato', { de: bot.OUTRO.jid }),
            ['⛔ Apenas o dono do bot (ou um admin) pode usar o -gif do /gpt.']);

        const foto = bot.criarMensagem({ de: bot.OUTRO.jid, tipo: 'image', midia: { mimetype: 'image/png', data: PNG_4X2 } });
        assert.deepEqual(await bot.responder('/gpt gere um gif animado dele nadando', { de: bot.OUTRO.jid, citada: foto }),
            ['⛔ Apenas o dono do bot (ou um admin) pode gerar GIF.']);
        assert.equal(rede.chamadas.length, antes, 'nada foi para a OpenAI');
    });

    test('a resposta em Markdown chega na formatação do WhatsApp (títulos, negrito duplo, tabela)', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        rede.responder('post', 'api.openai.com/v1/chat/completions', { choices: [{ message: { content:
            '# 🧺 O que é um conjunto?\n\nUm **conjunto** é uma coleção.\n\n| Símbolo | Significado |\n|---|---|\n| **∈** | Pertence |\n\n---\n\n* **União ∪:** tudo junto' } }] });

        assert.deepEqual(await bot.responder('/gpt o que é um conjunto?'), [
            '🤖 *🧺 O que é um conjunto?*\n\nUm *conjunto* é uma coleção.\n\n```\nSímbolo  Significado\n-------  -----------\n∈        Pertence\n```\n\n- *União ∪:* tudo junto'
        ]);

        // E o modelo é instruído a escrever para o WhatsApp
        const sistema = rede.chamadas.at(-1).cfg.body.messages[0].content;
        assert.match(sistema, /Formate para o WhatsApp.*\*negrito\* com um asterisco só.*Não use títulos com #, tabelas/s);
    });

    test('.env vence o setting; a resposta sempre começa com 🤖 (inclusive a que começaria com "/")', async () => {
        process.env.OPENAI_API_KEY = 'sk-env';
        try {
            rede.responder('post', 'api.openai.com', { choices: [{ message: { content: '/cache -a' } }] });
            assert.deepEqual(await bot.responder('/gpt diga um comando'), ['🤖 /cache -a']);
            assert.equal(rede.chamadas.at(-1).cfg.headers.Authorization, 'Bearer sk-env');
        } finally {
            delete process.env.OPENAI_API_KEY;
        }
    });

    test('modelo: setting openai.api.model (padrão gpt-4o-mini); o OPENAI_MODEL do .env vence', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        rede.responder('post', 'api.openai.com', { choices: [{ message: { content: 'ok' } }] });

        await bot.responder('/gpt oi');
        assert.equal(rede.chamadas.at(-1).cfg.body.model, 'gpt-4o-mini');

        await bot.setSetting('openai.api.model', 'gpt-6-luna');
        await bot.responder('/gpt oi');
        assert.equal(rede.chamadas.at(-1).cfg.body.model, 'gpt-6-luna');

        process.env.OPENAI_MODEL = 'gpt-4.1';
        try {
            await bot.responder('/gpt oi');
            assert.equal(rede.chamadas.at(-1).cfg.body.model, 'gpt-4.1');
        } finally {
            delete process.env.OPENAI_MODEL;
        }
    });

    test('-usage: o consumo (Usage API, chave de admin) por dia e por modelo, e os limites de agora (cabeçalhos)', async () => {
        assert.match((await bot.responder('/gpt -usage'))[0], /⚠️ API key da OpenAI não encontrada/);

        await bot.setSetting('openai.api.key', 'sk-teste');
        await bot.setSetting('openai.admin.key', 'sk-admin-teste');
        const dia = Math.floor(Date.parse('2026-11-07T00:00:00Z') / 1000);
        rede.responder('get', 'api.openai.com/v1/organization/usage/completions', {
            object: 'page',
            has_more: false,
            data: [
                { object: 'bucket', start_time: dia, end_time: dia + 86400, results: [
                    { model: 'gpt-4o-mini', input_tokens: 1000, output_tokens: 200, input_cached_tokens: 400, num_model_requests: 5 },
                    { model: 'gpt-6-sol', input_tokens: 50, output_tokens: 10, input_cached_tokens: 0, num_model_requests: 1 }
                ] },
                { object: 'bucket', start_time: dia + 86400, end_time: dia + 172800, results: [
                    { model: 'gpt-4o-mini', input_tokens: 2000, output_tokens: 300, input_cached_tokens: 0, num_model_requests: 7 }
                ] }
            ]
        });
        const item = (line_item, value) => ({ line_item, amount: { value, currency: 'usd' } });
        const desdeCompra = Date.parse('2026-11-01T00:00:00Z') / 1000;
        rede.responder('get', 'api.openai.com/v1/organization/costs', (url, cfg) => ({
            has_more: false,
            data: cfg.params.start_time === desdeCompra
                ? [{ start_time: desdeCompra, results: [item('gpt-4o-mini, input', 1.51)] }]
                : [
                    { start_time: dia, results: [item('gpt-4o-mini, input', 0.0004), item('gpt-4o-mini, output', 0.0003), item('gpt-6-sol, input', 0)] },
                    { start_time: dia + 86400, results: [item('gpt-4o-mini, input', 0.0012), item('gpt-image-2.6-flare, image', 0.04)] }
                ]
        }));
        const vazio = { has_more: false, data: [{ start_time: dia, results: [] }] };
        rede.responder('get', 'api.openai.com/v1/organization/usage/images', { has_more: false, data: [{ start_time: dia, results: [{ images: 3, num_model_requests: 2 }] }] });
        rede.responder('get', 'api.openai.com/v1/organization/usage/audio_speeches', { has_more: false, data: [{ start_time: dia, results: [{ characters: 1200, num_model_requests: 1 }] }] });
        rede.responder('get', 'api.openai.com/v1/organization/usage/audio_transcriptions', { has_more: false, data: [{ start_time: dia, results: [{ seconds: 42, num_model_requests: 1 }] }] });
        rede.responder('get', 'api.openai.com/v1/organization/usage/embeddings', vazio);
        await bot.setSetting('openai.credit.total', '10');
        await bot.setSetting('openai.credit.since', '2026-11-01');
        rede.responder('post', 'api.openai.com/v1/chat/completions', rede.http({
            data: { choices: [{ message: { content: '' } }] },
            headers: {
                'x-ratelimit-limit-tokens': '200000', 'x-ratelimit-remaining-tokens': '199984', 'x-ratelimit-reset-tokens': '6ms',
                'x-ratelimit-limit-requests': '5000', 'x-ratelimit-remaining-requests': '4999', 'x-ratelimit-reset-requests': '12ms'
            }
        }));

        const [r] = await bot.responder('/gpt -usage 3');
        assert.equal(r, [
            '💰 *Créditos:* $1,51/$10,00 · restam *$8,49* _(gasto desde 01/11/2026)_',
            '',
            '📊 *Consumo da OpenAI* — últimos 3 dias',
            '💵 Gasto: *$0,04*',
            '🔢 3.560 tokens · entrada 3.050 (cache 400) · saída 510',
            '🔁 13 requisições',
            '',
            '📅 *Por dia* _(UTC)_',
            '• 07/11 · 1.260 tokens · 6 req · $0,0007',
            '• 08/11 · 2.300 tokens · 7 req · $0,04',
            '',
            '🧠 *Por modelo*',
            '• gpt-4o-mini · 3.500 tokens · 12 req · $0,0019',
            '• gpt-6-sol · 60 tokens · 1 req · $0,00',
            '',
            '🧾 *Outros custos*',
            '• gpt-image-2.6-flare · $0,04',
            '',
            '🧰 *Outros usos*',
            '• 🖼️ Imagens · 3 imagens · 2 req',
            '• 🔊 Voz · 1.200 caracteres · 1 req',
            '• 🎙️ Transcrição · 42 s de áudio · 1 req',
            '',
            '⏱️ *Limites agora* — gpt-4o-mini',
            '• tokens: 199.984 de 200.000 · reseta em 6ms',
            '• requisições: 4.999 de 5.000 · reseta em 12ms'
        ].join('\n'));
        assert.doesNotMatch(r, /sk-/);

        const consumo = rede.chamadas.find(c => c.url.includes('/organization/usage/completions'));
        assert.equal(consumo.cfg.headers.Authorization, 'Bearer sk-admin-teste');
        assert.equal(consumo.cfg.params.bucket_width, '1d');
        assert.equal(consumo.cfg.params.limit, 3);
        assert.deepEqual(consumo.cfg.params.group_by, ['model']);
        const limites = rede.chamadas.find(c => c.url.endsWith('/chat/completions'));
        assert.equal(limites.cfg.headers.Authorization, 'Bearer sk-teste');
        assert.equal(limites.cfg.body.max_completion_tokens, 16);
    });

    test('-usage: sem a chave de admin só os limites (com a dica); dias inválidos; chave de admin recusada', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        rede.responder('post', 'api.openai.com/v1/chat/completions', rede.http({
            data: { choices: [] }, headers: { 'x-ratelimit-limit-tokens': '1000', 'x-ratelimit-remaining-tokens': '10' }
        }));

        const [semAdmin] = await bot.responder('/gpt -usage');
        assert.match(semAdmin, /^💡 _Para ver o consumo, defina a chave de admin/);
        assert.match(semAdmin, /• tokens: 10 de 1\.000$/);
        assert.doesNotMatch(semAdmin, /requisições/);

        assert.deepEqual(await bot.responder('/gpt -u 99'), ['❌ Use: /gpt -usage [dias] (de 1 a 31; padrão 7)']);
        assert.deepEqual(await bot.responder('/gpt -usage 0'), ['❌ Use: /gpt -usage [dias] (de 1 a 31; padrão 7)']);
        assert.deepEqual(await bot.responder('/gpt -usage 99'), ['❌ Use: /gpt -usage [dias] (de 1 a 31; padrão 7)']);
        assert.deepEqual(await bot.responder('/gpt -usage abc'), ['❌ Use: /gpt -usage [dias] (de 1 a 31; padrão 7)']);

        await bot.setSetting('openai.admin.key', 'sk-admin-teste');
        rede.responder('get', 'api.openai.com/v1/organization/usage/completions', erroHttp(403));
        const [recusada] = await bot.responder('/gpt -usage', { erroEsperado: true });
        assert.match(recusada, /^🔑 A chave de admin foi recusada\.\n💡 _A Usage API pede uma Admin key/);
        assert.match(recusada, /⏱️ \*Limites agora\*/);
    });

    test('-m sem modelo e sem a lista da chave: os usos, com os padrões e os atuais', async () => {
        const [r] = await bot.responder('/gpt -m');
        assert.match(r, /^🤖 \*Modelos do \/gpt\*\n\n\*Padrão\* \(perguntas\) — \/gpt -m <modelo>\n✅ gpt-4o-mini\n/);
        assert.match(r, /▫️ gpt-6-astra/);
        assert.match(r, /\*-img, -gif\* \(imagens e GIF\) — \/gpt -m <modelo> -gif\n✅ gpt-image-2\.6-flare\n\n/);
        assert.match(r, /\*-audio\* \(transcrição de áudio\) — \/gpt -m <modelo> -audio\n✅ gpt-transcribe\n\n/);
        assert.match(r, /\*-voz\* \(voz\) — \/gpt -m <modelo> -voz\n✅ gpt-4o-mini-tts\n\n/);
        assert.match(r, /💡 _Sem a lista da sua chave/);
        assert.doesNotMatch(r, /OPENAI_MODEL/);
    });

    test('-m com a chave: os modelos que ela vê, por uso; -m <modelo> [-gif|-audio|-voz] troca o do uso', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        rede.responder('get', 'api.openai.com/v1/models', { data: [
            { id: 'gpt-4.1' }, { id: 'gpt-4o-mini' }, { id: 'gpt-5-pro' }, { id: 'text-embedding-3-small' },
            { id: 'gpt-image-2.5-flare' }, { id: 'gpt-image-2.6-flare' }, { id: 'dall-e-3' },
            { id: 'gpt-transcribe' }, { id: 'whisper-1' }, { id: 'gpt-4o-mini-tts' }, { id: 'tts-1' }
        ] });

        const [lista] = await bot.responder('/gpt -m');
        assert.equal(lista, [
            '🤖 *Modelos do /gpt*',
            '',
            '*Padrão* (perguntas) — /gpt -m <modelo>',
            '✅ gpt-4o-mini',
            '▫️ gpt-4.1',
            '',
            '*-img, -gif* (imagens e GIF) — /gpt -m <modelo> -gif',
            '✅ gpt-image-2.6-flare ⚠️ a sua chave não vê'.replace(' ⚠️ a sua chave não vê', ''),
            '▫️ dall-e-3',
            '▫️ gpt-image-2.5-flare',
            '',
            '*-audio* (transcrição de áudio) — /gpt -m <modelo> -audio',
            '✅ gpt-transcribe',
            '▫️ whisper-1',
            '',
            '*-voz* (voz) — /gpt -m <modelo> -voz',
            '✅ gpt-4o-mini-tts',
            '▫️ tts-1',
            '',
            '💡 _A lista é a da sua chave (GET /v1/models)._'
        ].join('\n'));

        // Só um uso
        const [soImagem] = await bot.responder('/gpt -m -gif');
        assert.match(soImagem, /^🤖 \*Modelos do \/gpt\*\n\n\*-img, -gif\*/);
        assert.doesNotMatch(soImagem, /Padrão|-audio|-voz/);

        // Troca por uso
        assert.deepEqual(await bot.responder('/gpt -m gpt-4.1'), ['✅ Modelo do /gpt: *gpt-4.1*']);
        assert.deepEqual(await bot.responder('/gpt -m gpt-image-2.5-flare -gif'), ['✅ Modelo de imagens e GIF do /gpt: *gpt-image-2.5-flare*']);
        assert.deepEqual(await bot.responder('/gpt -m whisper-1 -audio'), ['✅ Modelo de transcrição de áudio do /gpt: *whisper-1*']);
        assert.deepEqual(await bot.responder('/gpt -m tts-1 -voz'), ['✅ Modelo de voz do /gpt: *tts-1*']);
        assert.deepEqual([bot.getSetting('openai.api.model'), bot.getSetting('openai.image.model'),
            bot.getSetting('openai.transcribe.model'), bot.getSetting('openai.tts.model')],
        ['gpt-4.1', 'gpt-image-2.5-flare', 'whisper-1', 'tts-1']);

        // O modelo que a chave não vê não é gravado, e o erro mostra os do uso; o das perguntas segue a lista fixa
        assert.deepEqual(await bot.responder('/gpt -m gpt-image-1 -img'), [
            '❌ A sua chave não vê o modelo gpt-image-1 (imagens e GIF).\n💡 _Os que ela vê: dall-e-3, gpt-image-2.5-flare, gpt-image-2.6-flare_'
        ]);
        assert.equal(bot.getSetting('openai.image.model'), 'gpt-image-2.5-flare');
        assert.match((await bot.responder('/gpt -m gpt-5-pro'))[0], /❌ Modelo não suportado: gpt-5-pro \(aceitos: gpt-6-astra/);

        // Um atual que a chave não vê aparece com o aviso
        await bot.setSetting('openai.image.model', 'gpt-image-1');
        assert.match((await bot.responder('/gpt -m -gif'))[0], /✅ gpt-image-1 ⚠️ a sua chave não vê\n▫️ dall-e-3/);
    });

    test('-m <modelo> troca o setting; modelo fora da lista é recusado', async () => {
        assert.deepEqual(await bot.responder('/gpt -model gpt-6-sol'), ['✅ Modelo do /gpt: *gpt-6-sol*']);
        assert.equal(bot.getSetting('openai.api.model'), 'gpt-6-sol');

        assert.match((await bot.responder('/gpt -m gpt-5-pro'))[0], /❌ Modelo não suportado: gpt-5-pro \(aceitos: gpt-6-astra/);
        assert.equal(bot.getSetting('openai.api.model'), 'gpt-6-sol');
        await assert.rejects(bot.setSetting('openai.api.model', 'o1'), /não suportado: o1/);
    });

    test('-m com OPENAI_MODEL no .env: troca o setting e avisa da prioridade', async () => {
        process.env.OPENAI_MODEL = 'gpt-4.1';
        try {
            assert.match((await bot.responder('/gpt -m'))[0], /\*Padrão\* \(perguntas\) — \/gpt -m <modelo> _\(o atual vem do OPENAI_MODEL no \.env\)_\n✅ gpt-4\.1\n/);
            assert.match((await bot.responder('/gpt -m gpt-6-luna'))[0], /✅ Modelo do \/gpt: \*gpt-6-luna\*\n⚠️ _O OPENAI_MODEL do \.env \(gpt-4\.1\) tem prioridade/);
        } finally {
            delete process.env.OPENAI_MODEL;
        }
    });

    test('sem pergunta mostra a sintaxe', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        assert.match((await bot.responder('/gpt'))[0], /Uso: \/gpt/);
    });

    test('erros: chave inválida (sem vazar no log), limite, timeout e outros', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        const casos = [
            [erroHttp(401, 'Incorrect API key provided: sk-tes**ste'), /🔑 API key da OpenAI inválida/],
            [erroHttp(429), /💸 Limite ou créditos da OpenAI esgotados/],
            [erroHttp(0, 'timeout', { code: 'ECONNABORTED' }), /⏱️ A OpenAI não respondeu em 60s/],
            [erroHttp(500, 'x', { data: { error: { message: 'modelo inexistente' } } }), /❌ Erro no \/gpt: modelo inexistente/]
        ];
        for (const [erro, esperado] of casos) {
            rede.responder('post', 'api.openai.com', erro);
            const logAntes = bot.logs.length;
            assert.match((await bot.responder('/gpt oi', { erroEsperado: true }))[0], esperado);
            assert.ok(!bot.logs.slice(logAntes).some(l => l.includes('sk-tes')), 'a chave apareceu no log');
        }
    });
});

describe('/tldr (/resumo)', () => {
    const { lerPeriodo } = bot.src('comandos/tldr');

    // Mensagens recebidas no grupo, gravadas há `minutos` minutos
    async function conversa(linhas, minutos = 10) {
        for (const [i, [texto, de = bot.OUTRO.jid]] of linhas.entries()) {
            const msg = bot.criarMensagem({ texto, de });
            await bot.entregar(msg);
            await bot.dbRun('UPDATE messages SET timestamp = ? WHERE id = ?', [Date.now() - minutos * 60_000 + i * 1000, msg.id.id]);
        }
    }

    beforeEach(async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        rede.responder('post', 'api.openai.com', { choices: [{ message: { content: '• Combinaram o almoço de domingo.' } }] });
    });

    test('lerPeriodo: horas, minutos ou quantidade, com ou sem "-"', () => {
        assert.deepEqual(lerPeriodo('2h'), { ms: 2 * 3600_000 });
        assert.deepEqual(lerPeriodo('-30m'), { ms: 30 * 60_000 });
        assert.deepEqual(lerPeriodo('-300'), { n: 300 });
        assert.equal(lerPeriodo('0'), null);
        assert.equal(lerPeriodo('ontem'), null);
    });

    test('resume as mensagens do chat; comandos, apagadas e mídias sem legenda ficam de fora', async () => {
        await conversa([['almoço domingo?'], ['bora', bot.DONO.jid], ['eu levo a sobremesa']]);
        await conversa([['/ping']]);
        const apagada = bot.criarMensagem({ texto: 'segredo', de: bot.OUTRO.jid });
        await bot.entregar(apagada);
        await bot.apagar(apagada);
        await bot.entregar(bot.criarMensagem({ de: bot.OUTRO.jid, tipo: 'image', midia: { mimetype: 'image/png', data: 'AA==' } }));

        const [r] = await bot.responder('/tldr');
        assert.match(r, /^🤖 \*Resumo de Família\*\n_3 mensagens · \d\d\/\d\d, \d\d:\d\d a \d\d\/\d\d, \d\d:\d\d_\n\n• Combinaram o almoço de domingo\.$/);

        const { cfg } = rede.chamadas.at(-1);
        assert.equal(cfg.headers.Authorization, 'Bearer sk-teste');
        assert.match(cfg.body.messages[0].content, /resume conversas de WhatsApp/);
        const texto = cfg.body.messages[1].content;
        assert.match(texto, /^Conversa "Família" \(3 mensagens\):\n\n\[\d\d\/\d\d, \d\d:\d\d\] Fulano: almoço domingo\?\n.*Dono: bora\n.*Fulano: eu levo a sobremesa$/);
        assert.doesNotMatch(texto, /ping|segredo/);
    });

    test('período: 2h pega só as recentes; N limita a quantidade', async () => {
        await conversa([['velha 1'], ['velha 2'], ['velha 3']], 300);
        await conversa([['nova 1'], ['nova 2'], ['nova 3']], 30);

        await bot.responder('/tldr 2h');
        assert.doesNotMatch(rede.chamadas.at(-1).cfg.body.messages[1].content, /velha/);

        await bot.responder('/resumo -4');
        const texto = rede.chamadas.at(-1).cfg.body.messages[1].content;
        assert.match(texto, /\(4 mensagens\)/);
        assert.match(texto, /velha 3[\s\S]*nova 3/);
    });

    test('limites: tldr.maxMsgs e a janela de 68 h', async () => {
        await conversa([['a'], ['b'], ['c']]);
        await bot.setSetting('tldr.maxMsgs', 10);
        assert.match((await bot.responder('/tldr 50'))[0], /_\(limitado a 10 mensagens \(setting tldr\.maxMsgs\)\)_/);
        assert.match((await bot.responder('/tldr 100h'))[0], /_\(as mensagens comuns ficam só 68 h no banco\)_/);
    });

    test('-c pelo nome e -pv', async () => {
        const TRABALHO = '120363000000000002@g.us';
        bot.criarGrupo(TRABALHO, 'Trabalho Rio', [bot.DONO.jid, bot.OUTRO.jid]);
        for (const texto of ['reunião às 15h', 'ok', 'levo o projetor']) {
            await bot.entregar(bot.criarMensagem({ texto, de: bot.OUTRO.jid, chat: TRABALHO }));
        }

        // No privado, as suas mensagens têm o outro participante como remetente: o from_me separa
        for (const [texto, de] of [['oi', bot.OUTRO.jid], ['tudo bem?', bot.DONO.jid], ['tudo', bot.OUTRO.jid]]) {
            await bot.entregar(bot.criarMensagem({ texto, de, chat: bot.OUTRO.jid }));
        }
        await bot.responder('/tldr', { chat: bot.OUTRO.jid });
        assert.match(rede.chamadas.at(-1).cfg.body.messages[1].content, /Fulano: oi\n.*Dono: tudo bem\?\n.*Fulano: tudo$/);

        const r = await bot.executar('/tldr -c "rio trabalho" -pv');
        assert.equal(r[0].texto, '🤖 Resumo enviado no seu privado.');
        assert.equal(r[1].chatId, bot.DONO.jid);
        assert.match(r[1].texto, /🤖 \*Resumo de Trabalho Rio\*/);

        assert.match((await bot.responder('/tldr -c xyz'))[0], /❌ Nenhum chat com mensagens guardadas tem "xyz" no nome/);
    });

    test('poucas mensagens, período inválido, sem chave e erro da OpenAI', async () => {
        assert.match((await bot.responder('/tldr'))[0], /📝 Poucas mensagens para resumir \(0\) em Família/);
        assert.match((await bot.responder('/tldr ontem'))[0], /Uso: \/tldr/);

        await conversa([['a'], ['b'], ['c']]);
        rede.responder('post', 'api.openai.com', erroHttp(429));
        assert.deepEqual(await bot.responder('/tldr', { erroEsperado: true }), ['💸 Limite ou créditos da OpenAI esgotados. Tente mais tarde.']);

        await bot.setSetting('openai.api.key', '');
        assert.match((await bot.responder('/tldr'))[0], /⚠️ API key da OpenAI não encontrada: o \/tldr está desativado/);
    });
});

describe('/traduzir (/tr, /translate)', () => {
    const traducao = (text, iso = 'en') => ({ text, from: { language: { iso, didYouMean: false } } });
    const erroDoPacote = (statusText, status, nome = 'Error') => {
        const err = new Error(statusText, { cause: { response: { status } } });
        err.name = nome;
        return err;
    };

    test('traduz para o idioma padrão, sem chave nenhuma', async () => {
        rede.responder('post', 'google-translate-api-x', traducao('Olá, mundo!\nTudo bem?'));

        assert.deepEqual(await bot.responder('/traduzir Hello, world!\nHow are you?'), ['🌐 *Tradução* _(en → pt)_\n\nOlá, mundo!\nTudo bem?']);
        const { texto, to } = rede.chamadas.at(-1).cfg.body;
        assert.deepEqual({ texto, to }, { texto: 'Hello, world!\nHow are you?', to: 'pt' });
    });

    test('o pedido tem tempo limite (o fetch do pacote não tem)', async t => {
        rede.responder('post', 'google-translate-api-x', traducao('olá'));
        await bot.responder('/traduzir hello');
        const { requestFunction } = rede.chamadas.at(-1).cfg.body;

        const fetchFalso = t.mock.method(globalThis, 'fetch', async () => ({ ok: true }));
        await requestFunction('https://translate.google.com/x', { method: 'POST' });
        const init = fetchFalso.mock.calls[0].arguments[1];
        assert.equal(init.method, 'POST');
        assert.ok(init.signal instanceof AbortSignal);
    });

    test('-para (sem diferenciar maiúsculas), mensagem respondida e o setting traduzir.lang', async () => {
        rede.responder('post', 'google-translate-api-x', traducao('Good morning', 'pt'));

        await bot.responder('/traduzir -para en bom dia');
        assert.equal(rede.chamadas.at(-1).cfg.body.to, 'en');
        assert.equal(rede.chamadas.at(-1).cfg.body.texto, 'bom dia');

        await bot.responder('/traduzir -p ZH-cn bom dia');
        assert.equal(rede.chamadas.at(-1).cfg.body.to, 'zh-CN');

        const citada = bot.criarMensagem({ texto: 'buenos días', de: bot.OUTRO.jid });
        await bot.responder('/translate -p fr', { citada });
        assert.equal(rede.chamadas.at(-1).cfg.body.to, 'fr');
        assert.equal(rede.chamadas.at(-1).cfg.body.texto, 'buenos días');

        await bot.setSetting('traduzir.lang', 'es');
        await bot.responder('/traduzir oi');
        assert.equal(rede.chamadas.at(-1).cfg.body.to, 'es');
    });

    test('texto já no idioma de destino ganha uma dica', async () => {
        rede.responder('post', 'google-translate-api-x', traducao('bom dia', 'pt'));
        assert.match((await bot.responder('/traduzir bom dia'))[0], /_\(pt → pt\)_\n\nbom dia\n\n💡 _O texto já estava em pt/);
    });

    test('-l lista os idiomas (sem o auto), sem chamar a rede', async () => {
        const antes = rede.chamadas.length;
        const [r] = await bot.responder('/traduzir -l');
        assert.match(r, /🌐 \*Idiomas do \/traduzir\* \(5\)\n\n```en English\nes Spanish\nfr French\npt Portuguese\nzh-CN Chinese \(Simplified\)```/);
        assert.equal(rede.chamadas.length, antes);
    });

    test('validações e erros do Google', async () => {
        assert.match((await bot.responder('/traduzir'))[0], /Uso: \/traduzir/);
        assert.match((await bot.responder('/traduzir -para português oi'))[0], /❌ Idioma inválido: português/);
        assert.match((await bot.responder(`/traduzir ${'a'.repeat(5001)}`))[0], /❌ Texto grande demais: 5001 caracteres/);

        const casos = [
            [erroDoPacote('Too Many Requests', 429), /💸 O Google Translate limitou os pedidos deste servidor/],
            [erroDoPacote('Too Many Requests', undefined), /💸 O Google Translate limitou/],
            [erroDoPacote('Forbidden', 403), /⛔ O Google recusou o pedido deste servidor/],
            [erroDoPacote('The operation was aborted due to timeout', undefined, 'TimeoutError'), /⏱️ O Google Translate não respondeu/],
            [erroDoPacote('Bad Gateway', 502), /❌ Erro no \/traduzir: Bad Gateway/]
        ];
        for (const [erro, esperado] of casos) {
            rede.responder('post', 'google-translate-api-x', erro);
            assert.match((await bot.responder('/traduzir hi', { erroEsperado: true }))[0], esperado);
        }
    });

    test('qualquer pessoa usa (com o bot.users true)', async () => {
        rede.responder('post', 'google-translate-api-x', traducao('olá'));
        assert.match((await bot.responder('/traduzir hello', { de: bot.OUTRO.jid }))[0], /olá/);
    });
});

describe('/giphy (/gif)', () => {
    test('sem chave', async () => {
        assert.match((await bot.responder('/giphy'))[0], /⚠️ Chave do GIPHY não configurada/);
    });

    test('tag padrão (gif.tag) ou informada; envia como GIF', async () => {
        await bot.setSetting('giphy.api.key', 'giphy');
        rede.responder('get', 'api.giphy.com', { data: { images: { original: { mp4: 'https://media.giphy.com/x.mp4' } } } });
        rede.responder('get', 'https://media.giphy.com/', Buffer.from('mp4'));

        const [r] = await bot.executar('/giphy');
        assert.equal(rede.chamadas[0].cfg.params.tag, 'fail');
        assert.ok(r.content instanceof MessageMedia);
        assert.equal(r.content.mimetype, 'video/mp4');
        assert.equal(r.options.sendVideoAsGif, true);

        await bot.executar('/gif gatos');
        assert.equal(rede.chamadas.at(-2).cfg.params.tag, 'gatos');
    });

    test('ID ou URL: busca o GIF escolhido e aceita o MP4 alternativo', async () => {
        await bot.setSetting('giphy.api.key', 'giphy');
        const id = 'h5WUvmDSB0njFcFeCE';
        const endpoint = `https://api.giphy.com/v1/gifs/${id}`;
        const mp4 = 'https://media.giphy.com/escolhido.mp4';
        rede.responder('get', endpoint, {
            data: { images: { downsized_medium: { mp4 } } }
        });
        rede.responder('get', mp4, Buffer.from('gif escolhido'));

        for (const entrada of [id, `https://giphy.com/gifs/reaction-${id}?origem=chat`]) {
            const antes = rede.chamadas.length;
            const [r] = await bot.executar(`/gif ${entrada}`);
            const consulta = rede.chamadas[antes];
            assert.equal(consulta.url, endpoint);
            assert.deepEqual(consulta.cfg.params, { api_key: 'giphy' });
            assert.equal(rede.chamadas[antes + 1].url, mp4);
            assert.ok(r.content instanceof MessageMedia);
            assert.equal(r.content.mimetype, 'video/mp4');
            assert.equal(r.content.data, Buffer.from('gif escolhido').toString('base64'));
            assert.equal(r.options.sendVideoAsGif, true);
        }
    });

    test('nenhum GIF; GIPHY fora do ar', async () => {
        await bot.setSetting('giphy.api.key', 'giphy');
        rede.responder('get', 'api.giphy.com', { data: {} });
        assert.deepEqual(await bot.responder('/gif'), ['❌ Nenhum GIF encontrado.']);
        rede.responder('get', 'api.giphy.com', erroHttp(500));
        assert.deepEqual(await bot.responder('/gif', { erroEsperado: true }),
            ['❌ Não consegui buscar esse GIF.']);
    });
});

describe('/meme', () => {
    const memes = { data: { memes: [{ name: 'Drake Hotline Bling', url: 'https://i.imgflip.com/drake.jpg' }, { name: 'Distracted Boyfriend', url: 'https://i.imgflip.com/db.jpg' }] } };

    test('aleatório ou pela busca, com o nome na legenda', async () => {
        rede.responder('get', 'api.imgflip.com', memes);
        rede.responder('get', 'https://i.imgflip.com/', rede.http({ data: Buffer.from('jpg'), headers: { 'content-type': 'image/png' } }));

        const [r] = await bot.executar('/meme drake');
        assert.equal(r.options.caption, '🖼️ Drake Hotline Bling');
        assert.equal(r.content.mimetype, 'image/png');
    });

    test('busca sem resultado; imgflip fora do ar', async () => {
        rede.responder('get', 'api.imgflip.com', memes);
        assert.deepEqual(await bot.responder('/meme xyz'), ['❌ Nenhum meme com "xyz".']);
        rede.responder('get', 'api.imgflip.com', erroHttp(500));
        assert.deepEqual(await bot.responder('/meme', { erroEsperado: true }), ['❌ Não consegui buscar um meme agora.']);
    });
});

describe('/pixelart (/ansi, /px)', () => {
    const { lerSauce, reiniciarPacks } = bot.src('comandos/pixelart');

    beforeEach(reiniciarPacks);

    // O sharp é simulado: a imagem "png:LxA" só carrega as dimensões
    const png = (largura, altura) => Buffer.from(`png:${largura}x${altura}`);

    // Arquivo com o registro SAUCE de 128 bytes no fim
    function comSauce({ titulo = '', autor = '', grupo = '', data = '' }) {
        const sauce = Buffer.alloc(128, 0);
        sauce.write('SAUCE00', 0, 'latin1');
        sauce.write(titulo, 7, 35, 'latin1');
        sauce.write(autor, 42, 20, 'latin1');
        sauce.write(grupo, 62, 20, 'latin1');
        sauce.write(data, 82, 8, 'latin1');
        return Buffer.concat([Buffer.from('\x1b[0marte'), sauce]);
    }

    function simularPack(nome, { arquivos = ['CHUCK.ANS'], altura = 100, sauce } = {}) {
        rede.responder('get', `api.16colo.rs/v0/pack/${nome}`, { name: nome, year: 2021, files: arquivos.map(filename => ({ filename })) });
        rede.responder('get', `16colo.rs/pack/${nome}/x1/`, png(80, altura));
        rede.responder('get', `16colo.rs/pack/${nome}/raw/`, sauce ? comSauce(sauce) : erroHttp(404));
    }

    test('SAUCE: título, autor, grupo e data; sem registro é null', () => {
        assert.deepEqual(lerSauce(comSauce({ titulo: 'Chuck', autor: 'lord jazz', grupo: 'ACiD', data: '20210401' })),
            { titulo: 'Chuck', autor: 'lord jazz', grupo: 'ACiD', data: '01/04/2021' });
        assert.equal(lerSauce(Buffer.from('sem sauce')), null);
    });

    test('pack padrão do setting, com a autoria do SAUCE na legenda e em HD', async () => {
        simularPack('chuck-norris-lvl', { arquivos: ['FILE_ID.DIZ', 'LEIAME.TXT', 'CHUCK.ANS'], sauce: { titulo: 'Chuck', autor: 'lord jazz', grupo: 'ACiD', data: '20210401' } });

        const [r] = await bot.executar('/px');
        assert.equal(r.content.mimetype, 'image/png');
        assert.equal(r.options.caption, '🎨 *Chuck*\n👤 lord jazz / ACiD\n📦 chuck-norris-lvl (01/04/2021)\n🔗 https://16colo.rs/pack/chuck-norris-lvl/CHUCK.ANS');
        assert.equal(r.options.sendMediaAsHd, true);
    });

    test('sem SAUCE: nome do arquivo e ano do pack', async () => {
        simularPack('mimic100');
        const [r] = await bot.executar('/pixelart mimic100');
        assert.equal(r.options.caption, '🎨 *CHUCK.ANS*\n📦 mimic100 (2021)\n🔗 https://16colo.rs/pack/mimic100/CHUCK.ANS');
    });

    test('arte alta vai em partes, até o pixelart.maxParts', async () => {
        await bot.setSetting('pixelart.maxParts', 2);
        simularPack('alta', { altura: 10000 });

        const enviados = await bot.executar('/pixelart alta');
        assert.equal(enviados.length, 2);
        assert.match(enviados[0].options.caption, /🧩 Parte 1\/2 _\(arte cortada: veja inteira no link\)_$/);
        assert.equal(enviados[1].options.caption, '🧩 Parte 2/2');
    });

    test('-y e -r sorteiam entre os packs do ano ou do arquivo', async () => {
        rede.responder('get', 'api.16colo.rs/v0/year/1996', [{ name: 'acid-1096' }]);
        simularPack('acid-1096');
        assert.match((await bot.executar('/pixelart -y 1996'))[0].options.caption, /📦 acid-1096/);

        rede.responder('get', /api\.16colo\.rs\/v0\/pack$/, [{ name: 'blocktronics' }]);
        simularPack('blocktronics');
        assert.match((await bot.executar('/pixelart -r'))[0].options.caption, /📦 blocktronics/);
    });

    test('ano ou pack inválidos, pack inexistente ou sem artes, 16colo.rs fora do ar', async () => {
        assert.deepEqual(await bot.responder('/pixelart -y 1900'), ['❌ Ano inválido. Ex.: /pixelart -y 1996']);
        assert.deepEqual(await bot.responder('/pixelart ../etc'), ['❌ Nome de pack inválido. Ex.: /pixelart chuck-norris-lvl']);

        rede.responder('get', 'api.16colo.rs/v0/pack/nada', []);
        assert.deepEqual(await bot.responder('/pixelart nada'), ['❌ Pack não encontrado: nada\n💡 _Veja os packs em https://16colo.rs_']);

        rede.responder('get', 'api.16colo.rs/v0/pack/so-txt', { name: 'so-txt', year: 1995, files: [{ filename: 'LEIAME.TXT' }] });
        assert.deepEqual(await bot.responder('/pixelart so-txt'), ['❌ O pack so-txt não tem artes ANSI/ASCII.']);

        rede.responder('get', 'api.16colo.rs', erroHttp(500));
        assert.deepEqual(await bot.responder('/pixelart', { erroEsperado: true }), ['❌ Não consegui buscar a arte no 16colo.rs agora.']);
    });
});

describe('/joke (/piada, /humor)', () => {
    const { PIADAS, reiniciarPiadas } = bot.src('comandos/joke');

    test('pergunta e resposta, sem rede', async () => {
        const [r] = await bot.responder('/joke');
        assert.match(r, /^.+\?\n\n\.\.\. .+ 🥁$/);
        assert.ok(PIADAS.some(p => r === `${p.pergunta}\n\n... ${p.resposta} 🥁`));
        assert.equal(rede.chamadas.length, 0);
    });

    test('nenhuma se repete até todas saírem, nem na virada de uma rodada para a outra', async () => {
        reiniciarPiadas();
        const contadas = [];
        for (let i = 0; i < PIADAS.length * 10; i++) contadas.push((await bot.responder(i % 2 ? '/piada' : '/humor'))[0]);

        for (let r = 0; r < 10; r++) {
            const rodada = contadas.slice(r * PIADAS.length, (r + 1) * PIADAS.length);
            assert.equal(new Set(rodada).size, PIADAS.length, `rodada ${r}: repetiu antes de acabar`);
        }
        for (let i = 1; i < contadas.length; i++) assert.notEqual(contadas[i], contadas[i - 1], `a mesma duas vezes seguidas (${i})`);
    });

    test('a lista: perguntas únicas, todas com resposta', () => {
        assert.ok(PIADAS.length >= 40);
        assert.equal(new Set(PIADAS.map(p => p.pergunta)).size, PIADAS.length);
        assert.ok(PIADAS.every(p => p.pergunta.trim() && p.resposta.trim()));
    });
});

describe('/kernel', () => {
    test('versões mainline, stable e longterm', async () => {
        rede.responder('get', 'kernel.org', {
            latest_stable: { version: '6.17.2' },
            releases: [
                { moniker: 'mainline', version: '6.18-rc1', released: { isodate: '2026-09-28' } },
                { moniker: 'stable', version: '6.17.2', released: { isodate: '2026-09-25' } },
                { moniker: 'linux-next', version: 'next-2026', released: { isodate: '2026-09-29' } },
                { moniker: 'longterm', version: '6.12.50', released: { isodate: '2026-09-20' } }
            ]
        });
        const [r] = await bot.responder('/kernel');
        assert.match(r, /🐧 \*Linux 6\.17\.2\* _\(latest stable\)_/);
        assert.match(r, /mainline  6\.18-rc1     2026-09-28\nstable    6\.17\.2       2026-09-25\nlongterm  6\.12\.50/);
        assert.doesNotMatch(r, /linux-next/);
    });

    test('kernel.org fora do ar', async () => {
        rede.responder('get', 'kernel.org', erroHttp(500));
        assert.deepEqual(await bot.responder('/kernel', { erroEsperado: true }), ['❌ Não consegui consultar o kernel.org agora.']);
    });
});
