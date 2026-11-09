/*
 * Commands that query external services (all simulated):
 * /cve, /tempo, /news, /gpt, /tldr, /traduzir, /giphy, /meme, /joke, /kernel e /pixelart.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { MessageMedia, errorHttp, network } = bot;

beforeEach(bot.restart);

describe('/cve', () => {
    const cve = (id, score, severity = 'HIGH') => ({
        cve: {
            id,
            descriptions: [{ lang: 'en', value: `Descrição de ${id}` }],
            metrics: score == null ? {} : { cvssMetricV31: [{ type: 'Primary', cvssData: { baseScore: score, baseSeverity: severity } }] }
        }
    });

    // The NVD answers from oldest to newest; the 1st query only counts
    function simulateNvd(list) {
        network.responder('get', /services\.nvd\.nist\.gov\/rest\/json\/cves\/2\.0$/, (url, cfg) => cfg.params.startIndex === undefined
            ? { totalResults: list.length }
            : { vulnerabilities: list.slice(cfg.params.startIndex, cfg.params.startIndex + cfg.params.resultsPerPage) });
    }

    test('as mais recentes primeiro, com nota e link', async () => {
        simulateNvd([cve('CVE-1', 5.0), cve('CVE-2', null), cve('CVE-3', 9.8, 'CRITICAL')]);
        await bot.setSetting('cve.max', 2);
        const [r] = await bot.replyAlt('/cve');
        assert.match(r, /🛡️ \*Últimas 2 CVEs publicadas\* _\(últimos 2 dias\)_/);
        assert.match(r, /\*CVE-3\* — 9\.8 CRITICAL[\s\S]*https:\/\/nvd\.nist\.gov\/vuln\/detail\/CVE-3[\s\S]*\*CVE-2\*\n/);
        assert.doesNotMatch(r, /CVE-1/);
    });

    test('sem N usa o cve.max; -high N fora do limite é recusado', async () => {
        simulateNvd(Array.from({ length: 15 }, (_, i) => cve(`CVE-${i}`, 7)));
        await bot.setSetting('cve.max', 3);
        assert.match((await bot.replyAlt('/cve'))[0], /Últimas 3 CVEs/);
        assert.match((await bot.replyAlt('/cve -high 21'))[0], /❌ Quantidade inválida: 21\. Use de 1 a 20/);
        assert.match((await bot.replyAlt('/cve -high abc'))[0], /❌ Quantidade inválida: abc/);
    });

    test('<id>: com ou sem o prefixo CVE-, não encontrada', async () => {
        const done = cve('CVE-2026-109618', 9.8, 'CRITICAL');
        network.responder('get', /services\.nvd\.nist\.gov\/rest\/json\/cves\/2\.0$/, (url, cfg) =>
            ({ vulnerabilities: cfg.params.cveId === 'CVE-2026-109618' ? [done] : [] }));

        for (const inputAlt of ['CVE-2026-109618', '2026-109618', 'cve-2026-109618']) {
            const [r] = await bot.replyAlt(`/cve ${inputAlt}`);
            assert.match(r, /^🛡️ \*CVE-2026-109618\* — 9\.8 CRITICAL\n.*\nhttps:\/\/nvd\.nist\.gov\/vuln\/detail\/CVE-2026-109618$/);
            assert.equal(network.chamadas.at(-1).cfg.params.cveId, 'CVE-2026-109618');
        }

        assert.equal((await bot.replyAlt('/cve 2026-1111'))[0], '🛡️ CVE-2026-1111 não encontrada no NVD.');

        network.responder('get', /services\.nvd\.nist\.gov\/rest\/json\/cves\/2\.0$/, errorHttp(404));
        assert.equal((await bot.replyAlt('/cve 2026-2222'))[0], '🛡️ CVE-2026-2222 não encontrada no NVD.');
    });

    test('-highscore / -high: só críticas, na janela do cve.maxDays', async () => {
        simulateNvd([cve('CVE-9', 9.9, 'CRITICAL')]);
        const [r] = await bot.replyAlt('/cve -high 1');
        assert.match(r, /🔥 \*1 CVEs críticas mais recentes\* _\(CVSS ≥ 9, últimos 7 dias\)_/);
        const params = network.chamadas.at(-1).cfg.params;
        assert.equal(params.cvssV3Severity, 'CRITICAL');
        assert.equal(params.resultsPerPage, 1);
    });

    test('<texto>: busca nas descrições, as mais recentes primeiro, avisa se há mais', async () => {
        const done = (id, day, score, sev) => ({ ...cve(id, score, sev).cve, published: `2026-10-${day}T10:00:00.000` });
        const list = [done('CVE-A', 19, 5, 'MEDIUM'), done('CVE-B', 20, null), done('CVE-C', 21, 9.8, 'CRITICAL')];
        network.responder('get', /services\.nvd\.nist\.gov\/rest\/json\/cves\/2\.0$/, (url, cfg) => cfg.params.startIndex === undefined
            ? { totalResults: list.length }
            : { vulnerabilities: list.slice(cfg.params.startIndex, cfg.params.startIndex + cfg.params.resultsPerPage).map(cve => ({ cve })) });
        await bot.setSetting('cve.max', 2);

        const [r] = await bot.replyAlt('/cve PHP uses longjmp()');
        assert.equal(network.chamadas.at(-1).cfg.params.keywordSearch, 'PHP uses longjmp()');
        assert.match(r, /^🔎 \*2 de 3 CVEs com\* "PHP uses longjmp\(\)"\n\n🔴 \*CVE-C\*\n🗓️ Oct 21, 2026\n🔎 .*\n\n⚪ \*CVE-B\*\n🗓️ Oct 20, 2026\n/);
        assert.match(r, /\n\n💡 _Há mais 1 /);

        network.responder('get', /services\.nvd\.nist\.gov\/rest\/json\/cves\/2\.0$/, () => ({ totalResults: 0 }));
        assert.equal((await bot.replyAlt('/cve nada por aqui'))[0], '🛡️ Nenhuma CVE com "nada por aqui".');
    });

    test('nenhuma publicada; NVD fora do ar', async () => {
        simulateNvd([]);
        assert.deepEqual(await bot.replyAlt('/cve'), ['🛡️ Nenhuma CVE publicada no últimos 2 dias.']);
        network.responder('get', /services\.nvd\.nist\.gov\/rest\/json\/cves\/2\.0$/, errorHttp(503));
        assert.match((await bot.replyAlt('/cve', { erroEsperado: true }))[0], /❌ Não consegui consultar o NVD agora/);
    });
});

describe('/tempo (/t, /weather)', () => {
    const local = { name: 'Niterói', admin1: 'Rio de Janeiro', country: 'Brasil', latitude: -22.9, longitude: -43.1 };
    const forecast = (temp, codeAlt = 0) => ({
        current: { temperature_2m: temp, apparent_temperature: temp + 1, relative_humidity_2m: 70, weather_code: codeAlt, wind_speed_10m: 12.4 },
        daily: { temperature_2m_max: [temp + 3], temperature_2m_min: [temp - 3], precipitation_probability_max: [40] }
    });

    test('sem cidade usa o tempo.city; mostra agora, máx/mín, umidade, vento e chuva', async () => {
        network.responder('get', 'geocoding-api.open-meteo.com', (url, cfg) => ({ results: [{ ...local, pedido: cfg.params.name }] }));
        network.responder('get', 'api.open-meteo.com/v1/forecast', forecast(24, 2));

        const [r] = await bot.replyAlt('/tempo');
        assert.equal(network.chamadas[0].cfg.params.name, 'Niteroi, Rio de Janeiro, Brazil');
        assert.match(r, /⛅ \*Tempo em Niterói, Rio de Janeiro, Brasil\*\n\nParcialmente nublado\n🌡️ \*Agora:\* 24°C _\(sensação 25°C\)_/);
        assert.match(r, /📈 \*Máx:\* 27°C  📉 \*Mín:\* 21°C\n💧 \*Umidade:\* 70%  🌬️ \*Vento:\* 12 km\/h\n☔ \*Chance de chuva:\* 40%/);
    });

    test('cidade informada; calor e frio; valor ausente vira "-"', async () => {
        network.responder('get', 'geocoding-api.open-meteo.com', { results: [local] });
        network.responder('get', 'api.open-meteo.com/v1/forecast', forecast(35));
        assert.match((await bot.replyAlt('/weather Recife'))[0], /🔥 Que calor/);
        assert.equal(network.chamadas[0].cfg.params.name, 'Recife');

        network.responder('get', 'api.open-meteo.com/v1/forecast', { ...forecast(2), daily: { temperature_2m_max: [null], temperature_2m_min: [null], precipitation_probability_max: [null] } });
        const [cold] = await bot.replyAlt('/tempo Curitiba');
        assert.match(cold, /🥶 Tá congelando!/);
        assert.match(cold, /📈 \*Máx:\* -  📉 \*Mín:\* -/);
    });

    // N-day forecast: daily with one item per day
    const forecastDays = (n) => ({
        ...forecast(24),
        daily: {
            time: Array.from({ length: n }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`),
            weather_code: Array.from({ length: n }, (_, i) => [0, 63, 95][i % 3]),
            temperature_2m_max: Array.from({ length: n }, (_, i) => 30 + i),
            temperature_2m_min: Array.from({ length: n }, (_, i) => 20 + i),
            precipitation_probability_max: Array.from({ length: n }, (_, i) => Math.min(i * 10, 100))
        }
    });

    test('N ou Nd: previsão dos próximos N dias, com ou sem cidade', async () => {
        network.responder('get', 'geocoding-api.open-meteo.com', (url, cfg) => ({ results: [{ ...local, name: cfg.params.name }] }));
        network.responder('get', 'api.open-meteo.com/v1/forecast', (url, cfg) => forecastDays(cfg.params.forecast_days));

        // New city (/tempo caches the geocoding between tests)
        const [r] = await bot.replyAlt('/tempo 3d Olinda');
        assert.equal(network.chamadas.at(-1).cfg.params.forecast_days, 3);
        assert.equal(network.chamadas.find(c => c.url.includes('geocoding')).cfg.params.name, 'Olinda', 'o "3d" não entra no nome');
        assert.match(r, /🌡️ \*Agora:\* 24°C/, 'mantém o tempo de agora');
        assert.match(r, /📅 \*Próximos 3 dias\*\n☀️ \*Hoje \(qui 01\/10\):\* 30°\/20° · ☔ 0% · Céu limpo\n🌧️ \*sex 02\/10:\* 31°\/21° · ☔ 10% · Chuva\n⛈️ \*sáb 03\/10:\* 32°\/22° · ☔ 20% · Trovoada/);

        await bot.setSetting('tempo.city', 'Maricá');
        await bot.replyAlt('/weather 5');
        assert.equal(network.chamadas.at(-1).cfg.params.forecast_days, 5);
        assert.equal(network.chamadas.at(-2).cfg.params.name, 'Maricá', 'sem cidade: tempo.city');

        assert.match((await bot.replyAlt('/tempo 1d'))[0], /📅 \*Previsão de hoje\*\n/);
        assert.match((await bot.replyAlt('/tempo 7D Recife'))[0], /Próximos 7 dias/);
    });

    test('sem N: só o dia de hoje (forecast_days 1), sem a lista', async () => {
        network.responder('get', 'geocoding-api.open-meteo.com', { results: [local] });
        network.responder('get', 'api.open-meteo.com/v1/forecast', (url, cfg) => forecastDays(cfg.params.forecast_days));
        const [r] = await bot.replyAlt('/tempo Niteroi');
        assert.equal(network.chamadas.at(-1).cfg.params.forecast_days, 1);
        assert.doesNotMatch(r, /Próximos|Previsão de hoje/);
    });

    test('N fora de 1..tempo.maxDays é recusado; o máximo vem do setting (até 16)', async () => {
        await bot.setSetting('tempo.maxDays', 7);
        assert.match((await bot.replyAlt('/tempo 8d Recife'))[0], /❌ Quantidade de dias inválida: 8\. Use de 1 a 7\./);
        assert.match((await bot.replyAlt('/tempo 0'))[0], /Quantidade de dias inválida: 0/);
        assert.deepEqual(network.chamadas, [], 'nem consulta a API');

        await bot.setSetting('tempo.maxDays', 16);
        network.responder('get', 'geocoding-api.open-meteo.com', { results: [local] });
        network.responder('get', 'api.open-meteo.com/v1/forecast', (url, cfg) => forecastDays(cfg.params.forecast_days));
        assert.match((await bot.replyAlt('/tempo 16'))[0], /Próximos 16 dias/);
        await assert.rejects(bot.setSetting('tempo.maxDays', 17), /entre 1 e 16/);
    });

    test('padrão permite 16d com datas válidas; 17 dias é recusado sem consultar a API', async () => {
        assert.equal(bot.getSetting('tempo.maxDays'), 16);
        network.responder('get', 'geocoding-api.open-meteo.com', { results: [local] });
        network.responder('get', 'api.open-meteo.com/v1/forecast',
            (url, cfg) => forecastDays(cfg.params.forecast_days));
        const [r] = await bot.replyAlt('/tempo 16d Recife');
        assert.equal(network.chamadas.at(-1).cfg.params.forecast_days, 16);
        assert.match(r, /Próximos 16 dias/);
        assert.match(r, /sex 16\/10/);
        assert.doesNotMatch(r, /Invalid Date/);
        assert.equal(r.split('\n').filter(l => l.includes(' · ☔ ')).length, 16);
        network.chamadas.length = 0;
        assert.match((await bot.replyAlt('/tempo 17d Recife'))[0], /Use de 1 a 16/);
        assert.deepEqual(network.chamadas, []);
    });

    test('cidade não encontrada; serviço fora do ar', async () => {
        network.responder('get', 'geocoding-api.open-meteo.com', { results: [] });
        assert.match((await bot.replyAlt('/tempo Xyzabc'))[0], /❌ Cidade não encontrada: Xyzabc/);

        network.responder('get', 'geocoding-api.open-meteo.com', errorHttp(500));
        assert.deepEqual(await bot.replyAlt('/tempo Lugar', { erroEsperado: true }), ['❌ Não consegui consultar o tempo agora.']);
    });
});

describe('/news', () => {
    const feed = (sourceAlt, items) => `<?xml version="1.0"?><rss><channel><title>${sourceAlt}</title>${items.map(([title, data]) =>
        `<item><title><![CDATA[${title}]]></title><link>https://n.com/${encodeURIComponent(title)}</link><pubDate>${data}</pubDate></item>`).join('')}</channel></rss>`;

    test('sem categoria mostra a ajuda', async () => {
        assert.match((await bot.replyAlt('/news'))[0], /Uso: \/news/);
    });

    test('-g1: manchetes da mais nova para a mais antiga, com fonte e link', async () => {
        network.responder('get', 'g1.globo.com', feed('g1', [['Antiga', 'Mon, 28 Sep 2026 10:00:00 GMT'], ['Nova &amp; boa', 'Wed, 30 Sep 2026 10:00:00 GMT']]));
        const [r] = await bot.replyAlt('/news -g1');
        assert.match(r, /^📰 \*g1\*\n\n1\. \*Nova & boa\*\n_g1 · [^_]+_\nhttps:\/\/n\.com\/[\s\S]*2\. \*Antiga\*/);
    });

    test('quantidade; várias categorias dividem as vagas entre as fontes', async () => {
        await bot.setSetting('news.g1', 'https://a.com/rss');
        await bot.setSetting('news.gazeta', 'https://b.com/rss');
        network.responder('get', 'a.com', feed('A', [['A1', 'Wed, 30 Sep 2026 12:00:00 GMT'], ['A2', 'Wed, 30 Sep 2026 11:00:00 GMT'], ['A3', 'Wed, 30 Sep 2026 10:00:00 GMT']]));
        network.responder('get', 'b.com', feed('B', [['B1', 'Tue, 29 Sep 2026 12:00:00 GMT']]));

        const [r] = await bot.replyAlt('/news -g1 -gazeta 2');
        assert.match(r, /^📰 \*News\*/);
        assert.match(r, /\*A1\*[\s\S]*\*B1\*/);
        assert.doesNotMatch(r, /A2/);
    });

    test('quantidade inválida; sem feeds; todos os feeds falham', async () => {
        assert.match((await bot.replyAlt('/news -g1 11'))[0], /❌ Quantidade inválida: 11\. Use de 1 a 10/);

        await bot.setSetting('news.hack', '');
        assert.match((await bot.replyAlt('/news -hack'))[0], /ℹ️ Nenhum feed configurado\.\n💡 _Adicione com \/set news\.hack/);

        network.responder('get', 'g1.globo.com', errorHttp(403));
        assert.deepEqual(await bot.replyAlt('/news -g1', { erroEsperado: true }), ['❌ Não consegui buscar as manchetes agora.']);
    });
});

describe('/gpt (/ai)', () => {
    test('sem chave: desativado', async () => {
        assert.match((await bot.replyAlt('/gpt oi'))[0], /⚠️ API key da OpenAI não encontrada/);
    });

    test('pergunta com a chave do setting; texto da mensagem respondida entra antes', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        network.responder('post', 'api.openai.com', { choices: [{ message: { content: ' Resposta! ' } }] });

        const quoted = bot.createMessage({ texto: 'texto citado', de: bot.OTHERAlt.jid });
        assert.deepEqual(await bot.replyAlt('/ai resuma', { citada: quoted }), ['🤖 Resposta!']);

        const { cfg } = network.chamadas.at(-1);
        assert.equal(cfg.headers.Authorization, 'Bearer sk-teste');
        assert.equal(cfg.body.messages[1].content, 'texto citado\n\nresuma');
        assert.equal(cfg.timeout, 60000);
        assert.equal(bot.client.chats.get(bot.GROUP).digitando, 1);
    });

    test('respondendo uma foto: ela vai junto da pergunta (legenda + pergunta + imagem em base64)', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        network.responder('post', 'api.openai.com', { choices: [{ message: { content: 'É um labrador.' } }] });

        const photo = bot.createMessage({ texto: 'meu cachorro', de: bot.OTHERAlt.jid, tipo: 'image',
            midia: { mimetype: 'image/jpeg', data: 'QUJD' } });
        assert.deepEqual(await bot.replyAlt('/gpt qual a raça desse cachorro?', { citada: photo }), ['🤖 É um labrador.']);

        const { body } = network.chamadas.at(-1).cfg;
        assert.deepEqual(body.messages[1].content, [
            { type: 'text', text: 'meu cachorro\n\nqual a raça desse cachorro?' },
            { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } }
        ]);

        // Without a question: describes; text alone continues a string
        const withoutCaption = bot.createMessage({ de: bot.OTHERAlt.jid, tipo: 'image', midia: { mimetype: 'image/png', data: 'QUJD' } });
        await bot.replyAlt('/gpt', { citada: withoutCaption });
        assert.equal(network.chamadas.at(-1).cfg.body.messages[1].content[0].text, 'Descreva esta imagem.');

        const textAlt = bot.createMessage({ texto: 'um texto', de: bot.OTHERAlt.jid });
        await bot.replyAlt('/gpt resuma', { citada: textAlt });
        assert.equal(network.chamadas.at(-1).cfg.body.messages[1].content, 'um texto\n\nresuma');
    });

    test('foto que não dá: não baixa, formato que a OpenAI não lê, grande demais; vídeo não é foto', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        network.responder('post', 'api.openai.com', { choices: [{ message: { content: 'ok' } }] });
        const calls = () => network.chamadas.length;
        const beforeAlt = calls();

        const expiredAlt = bot.createMessage({ de: bot.OTHERAlt.jid, tipo: 'image', extras: { hasMedia: true, downloadMedia: async () => null } });
        assert.match((await bot.replyAlt('/gpt o que é?', { citada: expiredAlt }))[0], /❌ Não consegui baixar a imagem/);

        const heic = bot.createMessage({ de: bot.OTHERAlt.jid, tipo: 'image', midia: { mimetype: 'image/heic', data: 'QUJD' } });
        assert.match((await bot.replyAlt('/gpt o que é?', { citada: heic }))[0], /❌ A OpenAI não lê imagem image\/heic: só jpeg, png, webp, gif\./);

        const huge = bot.createMessage({ de: bot.OTHERAlt.jid, tipo: 'image', midia: { mimetype: 'image/jpeg', data: 'A'.repeat(21 * 1024 * 1024) } });
        assert.match((await bot.replyAlt('/gpt o que é?', { citada: huge }))[0], /❌ A imagem tem mais de 15 MB/);
        assert.equal(calls(), beforeAlt, 'nada foi para a OpenAI');

        // Video: only the text (the caption) follows, without downloading anything
        const video = bot.createMessage({ texto: 'legenda do vídeo', de: bot.OTHERAlt.jid, tipo: 'video', midia: { mimetype: 'video/mp4', data: 'QUJD' } });
        await bot.replyAlt('/gpt resuma', { citada: video });
        assert.equal(network.chamadas.at(-1).cfg.body.messages[1].content, 'legenda do vídeo\n\nresuma');
    });

    test('respondendo um áudio: transcreve (v1/audio/transcriptions); com outra pergunta, o chat em cima da transcrição', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        network.responder('post', 'api.openai.com/v1/audio/transcriptions', { text: ' olá, tudo bem? ' });
        network.responder('post', 'api.openai.com/v1/chat/completions', { choices: [{ message: { content: 'Um cumprimento.' } }] });

        const voice = bot.createMessage({ de: bot.OTHERAlt.jid, tipo: 'ptt', midia: { mimetype: 'audio/ogg; codecs=opus', data: 'QUJD' } });
        assert.deepEqual(await bot.replyAlt('/gpt agora transcreva isso', { citada: voice }), ['🤖 *Transcrição:*\nolá, tudo bem?']);

        const { cfg } = network.chamadas.at(-1);
        assert.equal(network.chamadas.at(-1).url, 'https://api.openai.com/v1/audio/transcriptions');
        assert.equal(cfg.headers.Authorization, 'Bearer sk-teste');
        assert.equal(cfg.body.get('model'), 'whisper-1');
        assert.equal(cfg.body.get('file').name, 'audio.ogg');
        assert.equal(network.chamadas.filter(c => c.url.endsWith('/chat/completions')).length, 0, 'só transcrever não chama o chat');

        // Without a question it also only transcribes; the model comes from the setting
        await bot.setSetting('openai.transcribe.model', 'gpt-4o-mini-transcribe');
        assert.deepEqual(await bot.replyAlt('/gpt', { citada: voice }), ['🤖 *Transcrição:*\nolá, tudo bem?']);
        assert.equal(network.chamadas.at(-1).cfg.body.get('model'), 'gpt-4o-mini-transcribe');

        // Another question: the transcription goes along to the chat
        assert.deepEqual(await bot.replyAlt('/gpt resuma esse áudio', { citada: voice }), ['🤖 Um cumprimento.']);
        assert.equal(network.chamadas.at(-1).cfg.body.messages[1].content,
            'resuma esse áudio\n\nTranscrição do áudio:\nolá, tudo bem?');
    });

    test('áudio que não dá: não baixa, formato que a OpenAI não lê, grande demais, sem fala e erro da OpenAI', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        const beforeAlt = network.chamadas.length;

        const expiredAlt2 = bot.createMessage({ de: bot.OTHERAlt.jid, tipo: 'audio', extras: { hasMedia: true, downloadMedia: async () => null } });
        assert.match((await bot.replyAlt('/gpt', { citada: expiredAlt2 }))[0], /❌ Não consegui baixar o áudio/);

        const aac = bot.createMessage({ de: bot.OTHERAlt.jid, tipo: 'audio', midia: { mimetype: 'audio/aac', data: 'QUJD' } });
        assert.match((await bot.replyAlt('/gpt', { citada: aac }))[0], /❌ A OpenAI não transcreve áudio audio\/aac: só ogg, mp3, m4a, wav, webm, flac\./);

        const huge = bot.createMessage({ de: bot.OTHERAlt.jid, tipo: 'audio', midia: { mimetype: 'audio/mpeg', data: 'A'.repeat(35 * 1024 * 1024) } });
        assert.match((await bot.replyAlt('/gpt', { citada: huge }))[0], /❌ O áudio tem mais de 25 MB/);
        assert.equal(network.chamadas.length, beforeAlt, 'nada foi para a OpenAI');

        const muted = bot.createMessage({ de: bot.OTHERAlt.jid, tipo: 'ptt', midia: { mimetype: 'audio/ogg; codecs=opus', data: 'QUJD' } });
        network.responder('post', 'api.openai.com/v1/audio/transcriptions', { text: '' });
        assert.deepEqual(await bot.replyAlt('/gpt', { citada: muted }), ['🤖 Não ouvi fala nenhuma nesse áudio.']);

        network.responder('post', 'api.openai.com/v1/audio/transcriptions', errorHttp(401));
        assert.match((await bot.replyAlt('/gpt', { citada: muted, erroEsperado: true }))[0], /🔑 API key da OpenAI inválida/);
    });

    test('-voz: o texto digitado (ou o da mensagem respondida) vira uma nota de voz de robô (v1/audio/speech)', async () => {
        assert.match((await bot.replyAlt('/gpt -voz oi'))[0], /⚠️ API key da OpenAI não encontrada/);

        await bot.setSetting('openai.api.key', 'sk-teste');
        network.responder('post', 'api.openai.com/v1/audio/speech', Buffer.from('OGGDATA'));

        const [r] = await bot.executar('/gpt -voz exterminar todos os humanos');
        assert.ok(r.content instanceof MessageMedia);
        assert.equal(r.content.mimetype, 'audio/ogg; codecs=opus');
        assert.equal(r.content.data, Buffer.from('OGGDATA').toString('base64'));
        assert.equal(r.options.sendAudioAsVoice, true);

        const { url, cfg } = network.chamadas.at(-1);
        assert.equal(url, 'https://api.openai.com/v1/audio/speech');
        assert.equal(cfg.headers.Authorization, 'Bearer sk-teste');
        assert.equal(cfg.responseType, 'arraybuffer');
        assert.deepEqual(cfg.body, {
            model: 'gpt-4o-mini-tts', voice: 'onyx', input: 'exterminar todos os humanos', response_format: 'opus',
            instructions: 'Fale como um robô: voz metálica, monótona e pausada, sem emoção.'
        });

        // Without typed text, speaks the replied message's; -voz can come in the middle
        const quoted = bot.createMessage({ texto: 'bom dia, humano', de: bot.OTHERAlt.jid });
        await bot.executar('/gpt -voz', { citada: quoted });
        assert.equal(network.chamadas.at(-1).cfg.body.input, 'bom dia, humano');
        await bot.executar('/gpt fale -v isso aqui');
        assert.equal(network.chamadas.at(-1).cfg.body.input, 'fale isso aqui');

        // The model, voice and style come from the settings; tts-1 does not take the style
        await bot.setSetting('openai.tts.voice', 'nova');
        await bot.setSetting('openai.tts.model', 'tts-1');
        await bot.executar('/gpt -voz oi');
        assert.deepEqual(network.chamadas.at(-1).cfg.body, { model: 'tts-1', voice: 'nova', input: 'oi', response_format: 'opus' });
    });

    test('-voz: sem texto, grande demais e erro da OpenAI (o corpo do erro vem em bytes)', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        const beforeAlt = network.chamadas.length;

        assert.deepEqual(await bot.replyAlt('/gpt -voz'), ['❌ Use: /gpt -voz <texto> (ou responda uma mensagem de texto)']);
        assert.match((await bot.replyAlt(`/gpt -voz ${'a'.repeat(4097)}`))[0], /❌ O texto tem 4097 caracteres: a voz aceita até 4096\./);
        assert.equal(network.chamadas.length, beforeAlt, 'nada foi para a OpenAI');

        network.responder('post', 'api.openai.com/v1/audio/speech', Object.assign(new Error('Request failed with status code 400'), {
            response: { status: 400, data: Buffer.from(JSON.stringify({ error: { message: 'voz inválida' } })) }
        }));
        assert.deepEqual(await bot.replyAlt('/gpt -voz oi', { erroEsperado: true }), ['❌ Erro no /gpt: voz inválida']);
    });

    test('.env vence o setting; a resposta sempre começa com 🤖 (inclusive a que começaria com "/")', async () => {
        process.env.OPENAI_API_KEY = 'sk-env';
        try {
            network.responder('post', 'api.openai.com', { choices: [{ message: { content: '/cache -a' } }] });
            assert.deepEqual(await bot.replyAlt('/gpt diga um comando'), ['🤖 /cache -a']);
            assert.equal(network.chamadas.at(-1).cfg.headers.Authorization, 'Bearer sk-env');
        } finally {
            delete process.env.OPENAI_API_KEY;
        }
    });

    test('modelo: setting openai.api.model (padrão gpt-4o-mini); o OPENAI_MODEL do .env vence', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        network.responder('post', 'api.openai.com', { choices: [{ message: { content: 'ok' } }] });

        await bot.replyAlt('/gpt oi');
        assert.equal(network.chamadas.at(-1).cfg.body.model, 'gpt-4o-mini');

        await bot.setSetting('openai.api.model', 'gpt-6-luna');
        await bot.replyAlt('/gpt oi');
        assert.equal(network.chamadas.at(-1).cfg.body.model, 'gpt-6-luna');

        process.env.OPENAI_MODEL = 'gpt-4.1';
        try {
            await bot.replyAlt('/gpt oi');
            assert.equal(network.chamadas.at(-1).cfg.body.model, 'gpt-4.1');
        } finally {
            delete process.env.OPENAI_MODEL;
        }
    });

    test('-usage: o consumo (Usage API, chave de admin) por dia e por modelo, e os limites de agora (cabeçalhos)', async () => {
        assert.match((await bot.replyAlt('/gpt -usage'))[0], /⚠️ API key da OpenAI não encontrada/);

        await bot.setSetting('openai.api.key', 'sk-teste');
        await bot.setSetting('openai.admin.key', 'sk-admin-teste');
        const day = Math.floor(Date.parse('2026-11-07T00:00:00Z') / 1000);
        network.responder('get', 'api.openai.com/v1/organization/usage/completions', {
            object: 'page',
            has_more: false,
            data: [
                { object: 'bucket', start_time: day, end_time: day + 86400, results: [
                    { model: 'gpt-4o-mini', input_tokens: 1000, output_tokens: 200, input_cached_tokens: 400, num_model_requests: 5 },
                    { model: 'gpt-6-sol', input_tokens: 50, output_tokens: 10, input_cached_tokens: 0, num_model_requests: 1 }
                ] },
                { object: 'bucket', start_time: day + 86400, end_time: day + 172800, results: [
                    { model: 'gpt-4o-mini', input_tokens: 2000, output_tokens: 300, input_cached_tokens: 0, num_model_requests: 7 }
                ] }
            ]
        });
        network.responder('post', 'api.openai.com/v1/chat/completions', network.http({
            data: { choices: [{ message: { content: '' } }] },
            headers: {
                'x-ratelimit-limit-tokens': '200000', 'x-ratelimit-remaining-tokens': '199984', 'x-ratelimit-reset-tokens': '6ms',
                'x-ratelimit-limit-requests': '5000', 'x-ratelimit-remaining-requests': '4999', 'x-ratelimit-reset-requests': '12ms'
            }
        }));

        const [r] = await bot.replyAlt('/gpt -usage 3');
        assert.equal(r, [
            '📊 *Consumo da OpenAI* — últimos 3 dias',
            '🔢 3.560 tokens · entrada 3.050 (cache 400) · saída 510',
            '🔁 13 requisições',
            '',
            '📅 *Por dia* _(UTC)_',
            '• 07/11 · 1.260 tokens · 6 req',
            '• 08/11 · 2.300 tokens · 7 req',
            '',
            '🧠 *Por modelo*',
            '• gpt-4o-mini · 3.500 tokens · 12 req',
            '• gpt-6-sol · 60 tokens · 1 req',
            '',
            '⏱️ *Limites agora* — gpt-4o-mini',
            '• tokens: 199.984 de 200.000 · reseta em 6ms',
            '• requisições: 4.999 de 5.000 · reseta em 12ms'
        ].join('\n'));
        assert.doesNotMatch(r, /sk-/);

        const consumption = network.chamadas.find(c => c.url.includes('/organization/usage/completions'));
        assert.equal(consumption.cfg.headers.Authorization, 'Bearer sk-admin-teste');
        assert.equal(consumption.cfg.params.bucket_width, '1d');
        assert.equal(consumption.cfg.params.limit, 3);
        assert.deepEqual(consumption.cfg.params.group_by, ['model']);
        const limits = network.chamadas.find(c => c.url.endsWith('/chat/completions'));
        assert.equal(limits.cfg.headers.Authorization, 'Bearer sk-teste');
        assert.equal(limits.cfg.body.max_completion_tokens, 16);
    });

    test('-usage: sem a chave de admin só os limites (com a dica); dias inválidos; chave de admin recusada', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        network.responder('post', 'api.openai.com/v1/chat/completions', network.http({
            data: { choices: [] }, headers: { 'x-ratelimit-limit-tokens': '1000', 'x-ratelimit-remaining-tokens': '10' }
        }));

        const [withoutAdmin] = await bot.replyAlt('/gpt -usage');
        assert.match(withoutAdmin, /^💡 _Para ver o consumo, defina a chave de admin/);
        assert.match(withoutAdmin, /• tokens: 10 de 1\.000$/);
        assert.doesNotMatch(withoutAdmin, /requisições/);

        assert.deepEqual(await bot.replyAlt('/gpt -u 99'), ['❌ Use: /gpt -usage [dias] (de 1 a 31; padrão 7)']);
        assert.deepEqual(await bot.replyAlt('/gpt -usage 0'), ['❌ Use: /gpt -usage [dias] (de 1 a 31; padrão 7)']);
        assert.deepEqual(await bot.replyAlt('/gpt -usage 99'), ['❌ Use: /gpt -usage [dias] (de 1 a 31; padrão 7)']);
        assert.deepEqual(await bot.replyAlt('/gpt -usage abc'), ['❌ Use: /gpt -usage [dias] (de 1 a 31; padrão 7)']);

        await bot.setSetting('openai.admin.key', 'sk-admin-teste');
        network.responder('get', 'api.openai.com/v1/organization/usage/completions', errorHttp(403));
        const [rejected] = await bot.replyAlt('/gpt -usage', { erroEsperado: true });
        assert.match(rejected, /^🔑 A chave de admin foi recusada\. A Usage API pede uma Admin key/);
        assert.match(rejected, /⏱️ \*Limites agora\*/);
    });

    test('-m sem modelo: o atual e a lista dos aceitos', async () => {
        const [r] = await bot.replyAlt('/gpt -m');
        assert.match(r, /🤖 \*Modelo do \/gpt:\* gpt-4o-mini\n/);
        assert.match(r, /✅ gpt-4o-mini/);
        assert.match(r, /▫️ gpt-6-astra/);
        assert.doesNotMatch(r, /do OPENAI_MODEL/);
    });

    test('-m <modelo> troca o setting; modelo fora da lista é recusado', async () => {
        assert.deepEqual(await bot.replyAlt('/gpt -model gpt-6-sol'), ['✅ Modelo do /gpt: *gpt-6-sol*']);
        assert.equal(bot.getSetting('openai.api.model'), 'gpt-6-sol');

        assert.match((await bot.replyAlt('/gpt -m gpt-5-pro'))[0], /❌ Modelo não suportado: gpt-5-pro \(aceitos: gpt-6-astra/);
        assert.equal(bot.getSetting('openai.api.model'), 'gpt-6-sol');
        await assert.rejects(bot.setSetting('openai.api.model', 'o1'), /não suportado: o1/);
    });

    test('-m com OPENAI_MODEL no .env: troca o setting e avisa da prioridade', async () => {
        process.env.OPENAI_MODEL = 'gpt-4.1';
        try {
            assert.match((await bot.replyAlt('/gpt -m'))[0], /Modelo do \/gpt:\* gpt-4\.1 _\(do OPENAI_MODEL no \.env\)_/);
            assert.match((await bot.replyAlt('/gpt -m gpt-6-luna'))[0], /✅ Modelo do \/gpt: \*gpt-6-luna\*\n⚠️ _O OPENAI_MODEL do \.env \(gpt-4\.1\) tem prioridade/);
        } finally {
            delete process.env.OPENAI_MODEL;
        }
    });

    test('sem pergunta mostra a sintaxe', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        assert.match((await bot.replyAlt('/gpt'))[0], /Uso: \/gpt/);
    });

    test('erros: chave inválida (sem vazar no log), limite, timeout e outros', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        const cases = [
            [errorHttp(401, 'Incorrect API key provided: sk-tes**ste'), /🔑 API key da OpenAI inválida/],
            [errorHttp(429), /💸 Limite ou créditos da OpenAI esgotados/],
            [errorHttp(0, 'timeout', { code: 'ECONNABORTED' }), /⏱️ A OpenAI não respondeu em 60s/],
            [errorHttp(500, 'x', { data: { error: { message: 'modelo inexistente' } } }), /❌ Erro no \/gpt: modelo inexistente/]
        ];
        for (const [errorAlt, expected] of cases) {
            network.responder('post', 'api.openai.com', errorAlt);
            const logBefore = bot.logs.length;
            assert.match((await bot.replyAlt('/gpt oi', { erroEsperado: true }))[0], expected);
            assert.ok(!bot.logs.slice(logBefore).some(l => l.includes('sk-tes')), 'a chave apareceu no log');
        }
    });
});

describe('/tldr (/resumo)', () => {
    const { readPeriod } = bot.src('commands/tldr');

    // Messages received in the group, saved `minutos` minutes ago
    async function chat(linesAlt, minutes = 10) {
        for (const [i, [textAlt, de = bot.OTHERAlt.jid]] of linesAlt.entries()) {
            const msg = bot.createMessage({ texto: textAlt, de });
            await bot.deliver(msg);
            await bot.dbRun('UPDATE messages SET timestamp = ? WHERE id = ?', [Date.now() - minutes * 60_000 + i * 1000, msg.id.id]);
        }
    }

    beforeEach(async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        network.responder('post', 'api.openai.com', { choices: [{ message: { content: '• Combinaram o almoço de domingo.' } }] });
    });

    test('lerPeriodo: horas, minutos ou quantidade, com ou sem "-"', () => {
        assert.deepEqual(readPeriod('2h'), { ms: 2 * 3600_000 });
        assert.deepEqual(readPeriod('-30m'), { ms: 30 * 60_000 });
        assert.deepEqual(readPeriod('-300'), { n: 300 });
        assert.equal(readPeriod('0'), null);
        assert.equal(readPeriod('ontem'), null);
    });

    test('resume as mensagens do chat; comandos, apagadas e mídias sem legenda ficam de fora', async () => {
        await chat([['almoço domingo?'], ['bora', bot.OWNER.jid], ['eu levo a sobremesa']]);
        await chat([['/ping']]);
        const deleted = bot.createMessage({ texto: 'segredo', de: bot.OTHERAlt.jid });
        await bot.deliver(deleted);
        await bot.apagar(deleted);
        await bot.deliver(bot.createMessage({ de: bot.OTHERAlt.jid, tipo: 'image', midia: { mimetype: 'image/png', data: 'AA==' } }));

        const [r] = await bot.replyAlt('/tldr');
        assert.match(r, /^🤖 \*Resumo de Família\*\n_3 mensagens · \d\d\/\d\d, \d\d:\d\d a \d\d\/\d\d, \d\d:\d\d_\n\n• Combinaram o almoço de domingo\.$/);

        const { cfg } = network.chamadas.at(-1);
        assert.equal(cfg.headers.Authorization, 'Bearer sk-teste');
        assert.match(cfg.body.messages[0].content, /resume conversas de WhatsApp/);
        const textAlt = cfg.body.messages[1].content;
        assert.match(textAlt, /^Conversa "Família" \(3 mensagens\):\n\n\[\d\d\/\d\d, \d\d:\d\d\] Fulano: almoço domingo\?\n.*Dono: bora\n.*Fulano: eu levo a sobremesa$/);
        assert.doesNotMatch(textAlt, /ping|segredo/);
    });

    test('período: 2h pega só as recentes; N limita a quantidade', async () => {
        await chat([['velha 1'], ['velha 2'], ['velha 3']], 300);
        await chat([['nova 1'], ['nova 2'], ['nova 3']], 30);

        await bot.replyAlt('/tldr 2h');
        assert.doesNotMatch(network.chamadas.at(-1).cfg.body.messages[1].content, /velha/);

        await bot.replyAlt('/resumo -4');
        const textAlt = network.chamadas.at(-1).cfg.body.messages[1].content;
        assert.match(textAlt, /\(4 mensagens\)/);
        assert.match(textAlt, /velha 3[\s\S]*nova 3/);
    });

    test('limites: tldr.maxMsgs e a janela de 68 h', async () => {
        await chat([['a'], ['b'], ['c']]);
        await bot.setSetting('tldr.maxMsgs', 10);
        assert.match((await bot.replyAlt('/tldr 50'))[0], /_\(limitado a 10 mensagens \(setting tldr\.maxMsgs\)\)_/);
        assert.match((await bot.replyAlt('/tldr 100h'))[0], /_\(as mensagens comuns ficam só 68 h no banco\)_/);
    });

    test('-c pelo nome e -pv', async () => {
        const WORK = '120363000000000002@g.us';
        bot.createGroup(WORK, 'Trabalho Rio', [bot.OWNER.jid, bot.OTHERAlt.jid]);
        for (const textAlt of ['reunião às 15h', 'ok', 'levo o projetor']) {
            await bot.deliver(bot.createMessage({ texto: textAlt, de: bot.OTHERAlt.jid, chat: WORK }));
        }

        // In private, your messages have the other participant as the sender: from_me tells them apart
        for (const [textAlt, de] of [['oi', bot.OTHERAlt.jid], ['tudo bem?', bot.OWNER.jid], ['tudo', bot.OTHERAlt.jid]]) {
            await bot.deliver(bot.createMessage({ texto: textAlt, de, chat: bot.OTHERAlt.jid }));
        }
        await bot.replyAlt('/tldr', { chat: bot.OTHERAlt.jid });
        assert.match(network.chamadas.at(-1).cfg.body.messages[1].content, /Fulano: oi\n.*Dono: tudo bem\?\n.*Fulano: tudo$/);

        const r = await bot.executar('/tldr -c "rio trabalho" -pv');
        assert.equal(r[0].texto, '🤖 Resumo enviado no seu privado.');
        assert.equal(r[1].chatId, bot.OWNER.jid);
        assert.match(r[1].texto, /🤖 \*Resumo de Trabalho Rio\*/);

        assert.match((await bot.replyAlt('/tldr -c xyz'))[0], /❌ Nenhum chat com mensagens guardadas tem "xyz" no nome/);
    });

    test('poucas mensagens, período inválido, sem chave e erro da OpenAI', async () => {
        assert.match((await bot.replyAlt('/tldr'))[0], /📝 Poucas mensagens para resumir \(0\) em Família/);
        assert.match((await bot.replyAlt('/tldr ontem'))[0], /Uso: \/tldr/);

        await chat([['a'], ['b'], ['c']]);
        network.responder('post', 'api.openai.com', errorHttp(429));
        assert.deepEqual(await bot.replyAlt('/tldr', { erroEsperado: true }), ['💸 Limite ou créditos da OpenAI esgotados. Tente mais tarde.']);

        await bot.setSetting('openai.api.key', '');
        assert.match((await bot.replyAlt('/tldr'))[0], /⚠️ API key da OpenAI não encontrada: o \/tldr está desativado/);
    });
});

describe('/traduzir (/tr, /translate)', () => {
    const translation = (text, iso = 'en') => ({ text, from: { language: { iso, didYouMean: false } } });
    const packageError = (statusText, status, nameAlt = 'Error') => {
        const err = new Error(statusText, { cause: { response: { status } } });
        err.name = nameAlt;
        return err;
    };

    test('traduz para o idioma padrão, sem chave nenhuma', async () => {
        network.responder('post', 'google-translate-api-x', translation('Olá, mundo!\nTudo bem?'));

        assert.deepEqual(await bot.replyAlt('/traduzir Hello, world!\nHow are you?'), ['🌐 *Tradução* _(en → pt)_\n\nOlá, mundo!\nTudo bem?']);
        const { texto: textAlt, to } = network.chamadas.at(-1).cfg.body;
        assert.deepEqual({ texto: textAlt, to }, { texto: 'Hello, world!\nHow are you?', to: 'pt' });
    });

    test('o pedido tem tempo limite (o fetch do pacote não tem)', async t => {
        network.responder('post', 'google-translate-api-x', translation('olá'));
        await bot.replyAlt('/traduzir hello');
        const { requestFunction } = network.chamadas.at(-1).cfg.body;

        const fetchFake = t.mock.method(globalThis, 'fetch', async () => ({ ok: true }));
        await requestFunction('https://translate.google.com/x', { method: 'POST' });
        const init = fetchFake.mock.calls[0].arguments[1];
        assert.equal(init.method, 'POST');
        assert.ok(init.signal instanceof AbortSignal);
    });

    test('-para (sem diferenciar maiúsculas), mensagem respondida e o setting traduzir.lang', async () => {
        network.responder('post', 'google-translate-api-x', translation('Good morning', 'pt'));

        await bot.replyAlt('/traduzir -para en bom dia');
        assert.equal(network.chamadas.at(-1).cfg.body.to, 'en');
        assert.equal(network.chamadas.at(-1).cfg.body.texto, 'bom dia');

        await bot.replyAlt('/traduzir -p ZH-cn bom dia');
        assert.equal(network.chamadas.at(-1).cfg.body.to, 'zh-CN');

        const quoted = bot.createMessage({ texto: 'buenos días', de: bot.OTHERAlt.jid });
        await bot.replyAlt('/translate -p fr', { citada: quoted });
        assert.equal(network.chamadas.at(-1).cfg.body.to, 'fr');
        assert.equal(network.chamadas.at(-1).cfg.body.texto, 'buenos días');

        await bot.setSetting('traduzir.lang', 'es');
        await bot.replyAlt('/traduzir oi');
        assert.equal(network.chamadas.at(-1).cfg.body.to, 'es');
    });

    test('texto já no idioma de destino ganha uma dica', async () => {
        network.responder('post', 'google-translate-api-x', translation('bom dia', 'pt'));
        assert.match((await bot.replyAlt('/traduzir bom dia'))[0], /_\(pt → pt\)_\n\nbom dia\n\n💡 _O texto já estava em pt/);
    });

    test('-l lista os idiomas (sem o auto), sem chamar a rede', async () => {
        const beforeAlt = network.chamadas.length;
        const [r] = await bot.replyAlt('/traduzir -l');
        assert.match(r, /🌐 \*Idiomas do \/traduzir\* \(5\)\n\n```en English\nes Spanish\nfr French\npt Portuguese\nzh-CN Chinese \(Simplified\)```/);
        assert.equal(network.chamadas.length, beforeAlt);
    });

    test('validações e erros do Google', async () => {
        assert.match((await bot.replyAlt('/traduzir'))[0], /Uso: \/traduzir/);
        assert.match((await bot.replyAlt('/traduzir -para português oi'))[0], /❌ Idioma inválido: português/);
        assert.match((await bot.replyAlt(`/traduzir ${'a'.repeat(5001)}`))[0], /❌ Texto grande demais: 5001 caracteres/);

        const cases = [
            [packageError('Too Many Requests', 429), /💸 O Google Translate limitou os pedidos deste servidor/],
            [packageError('Too Many Requests', undefined), /💸 O Google Translate limitou/],
            [packageError('Forbidden', 403), /⛔ O Google recusou o pedido deste servidor/],
            [packageError('The operation was aborted due to timeout', undefined, 'TimeoutError'), /⏱️ O Google Translate não respondeu/],
            [packageError('Bad Gateway', 502), /❌ Erro no \/traduzir: Bad Gateway/]
        ];
        for (const [errorAlt, expected] of cases) {
            network.responder('post', 'google-translate-api-x', errorAlt);
            assert.match((await bot.replyAlt('/traduzir hi', { erroEsperado: true }))[0], expected);
        }
    });

    test('qualquer pessoa usa (com o bot.users true)', async () => {
        network.responder('post', 'google-translate-api-x', translation('olá'));
        assert.match((await bot.replyAlt('/traduzir hello', { de: bot.OTHERAlt.jid }))[0], /olá/);
    });
});

describe('/giphy (/gif)', () => {
    test('sem chave', async () => {
        assert.match((await bot.replyAlt('/giphy'))[0], /⚠️ Chave do GIPHY não configurada/);
    });

    test('tag padrão (gif.tag) ou informada; envia como GIF', async () => {
        await bot.setSetting('giphy.api.key', 'giphy');
        network.responder('get', 'api.giphy.com', { data: { images: { original: { mp4: 'https://media.giphy.com/x.mp4' } } } });
        network.responder('get', 'https://media.giphy.com/', Buffer.from('mp4'));

        const [r] = await bot.executar('/giphy');
        assert.equal(network.chamadas[0].cfg.params.tag, 'fail');
        assert.ok(r.content instanceof MessageMedia);
        assert.equal(r.content.mimetype, 'video/mp4');
        assert.equal(r.options.sendVideoAsGif, true);

        await bot.executar('/gif gatos');
        assert.equal(network.chamadas.at(-2).cfg.params.tag, 'gatos');
    });

    test('ID ou URL: busca o GIF escolhido e aceita o MP4 alternativo', async () => {
        await bot.setSetting('giphy.api.key', 'giphy');
        const id = 'h5WUvmDSB0njFcFeCE';
        const endpoint = `https://api.giphy.com/v1/gifs/${id}`;
        const mp4 = 'https://media.giphy.com/escolhido.mp4';
        network.responder('get', endpoint, {
            data: { images: { downsized_medium: { mp4 } } }
        });
        network.responder('get', mp4, Buffer.from('gif escolhido'));

        for (const inputAlt of [id, `https://giphy.com/gifs/reaction-${id}?origem=chat`]) {
            const beforeAlt = network.chamadas.length;
            const [r] = await bot.executar(`/gif ${inputAlt}`);
            const query = network.chamadas[beforeAlt];
            assert.equal(query.url, endpoint);
            assert.deepEqual(query.cfg.params, { api_key: 'giphy' });
            assert.equal(network.chamadas[beforeAlt + 1].url, mp4);
            assert.ok(r.content instanceof MessageMedia);
            assert.equal(r.content.mimetype, 'video/mp4');
            assert.equal(r.content.data, Buffer.from('gif escolhido').toString('base64'));
            assert.equal(r.options.sendVideoAsGif, true);
        }
    });

    test('nenhum GIF; GIPHY fora do ar', async () => {
        await bot.setSetting('giphy.api.key', 'giphy');
        network.responder('get', 'api.giphy.com', { data: {} });
        assert.deepEqual(await bot.replyAlt('/gif'), ['❌ Nenhum GIF encontrado.']);
        network.responder('get', 'api.giphy.com', errorHttp(500));
        assert.deepEqual(await bot.replyAlt('/gif', { erroEsperado: true }),
            ['❌ Não consegui buscar esse GIF.']);
    });
});

describe('/meme', () => {
    const memes = { data: { memes: [{ name: 'Drake Hotline Bling', url: 'https://i.imgflip.com/drake.jpg' }, { name: 'Distracted Boyfriend', url: 'https://i.imgflip.com/db.jpg' }] } };

    test('aleatório ou pela busca, com o nome na legenda', async () => {
        network.responder('get', 'api.imgflip.com', memes);
        network.responder('get', 'https://i.imgflip.com/', network.http({ data: Buffer.from('jpg'), headers: { 'content-type': 'image/png' } }));

        const [r] = await bot.executar('/meme drake');
        assert.equal(r.options.caption, '🖼️ Drake Hotline Bling');
        assert.equal(r.content.mimetype, 'image/png');
    });

    test('busca sem resultado; imgflip fora do ar', async () => {
        network.responder('get', 'api.imgflip.com', memes);
        assert.deepEqual(await bot.replyAlt('/meme xyz'), ['❌ Nenhum meme com "xyz".']);
        network.responder('get', 'api.imgflip.com', errorHttp(500));
        assert.deepEqual(await bot.replyAlt('/meme', { erroEsperado: true }), ['❌ Não consegui buscar um meme agora.']);
    });
});

describe('/pixelart (/ansi, /px)', () => {
    const { readSauce, restartPacks } = bot.src('commands/pixelart');

    beforeEach(restartPacks);

    // sharp is simulated: the "png:WxH" image only carries the dimensions
    const png = (widthAlt, heightAlt) => Buffer.from(`png:${widthAlt}x${heightAlt}`);

    // File with the 128-byte SAUCE record at the end
    function withSauce({ titulo: title = '', autor: author = '', grupo: group = '', data = '' }) {
        const sauce = Buffer.alloc(128, 0);
        sauce.write('SAUCE00', 0, 'latin1');
        sauce.write(title, 7, 35, 'latin1');
        sauce.write(author, 42, 20, 'latin1');
        sauce.write(group, 62, 20, 'latin1');
        sauce.write(data, 82, 8, 'latin1');
        return Buffer.concat([Buffer.from('\x1b[0marte'), sauce]);
    }

    function simulatePack(nameAlt, { arquivos: files = ['CHUCK.ANS'], altura: heightAlt = 100, sauce } = {}) {
        network.responder('get', `api.16colo.rs/v0/pack/${nameAlt}`, { name: nameAlt, year: 2021, files: files.map(filename => ({ filename })) });
        network.responder('get', `16colo.rs/pack/${nameAlt}/x1/`, png(80, heightAlt));
        network.responder('get', `16colo.rs/pack/${nameAlt}/raw/`, sauce ? withSauce(sauce) : errorHttp(404));
    }

    test('SAUCE: título, autor, grupo e data; sem registro é null', () => {
        assert.deepEqual(readSauce(withSauce({ titulo: 'Chuck', autor: 'lord jazz', grupo: 'ACiD', data: '20210401' })),
            { titulo: 'Chuck', autor: 'lord jazz', grupo: 'ACiD', data: '01/04/2021' });
        assert.equal(readSauce(Buffer.from('sem sauce')), null);
    });

    test('pack padrão do setting, com a autoria do SAUCE na legenda e em HD', async () => {
        simulatePack('chuck-norris-lvl', { arquivos: ['FILE_ID.DIZ', 'LEIAME.TXT', 'CHUCK.ANS'], sauce: { titulo: 'Chuck', autor: 'lord jazz', grupo: 'ACiD', data: '20210401' } });

        const [r] = await bot.executar('/px');
        assert.equal(r.content.mimetype, 'image/png');
        assert.equal(r.options.caption, '🎨 *Chuck*\n👤 lord jazz / ACiD\n📦 chuck-norris-lvl (01/04/2021)\n🔗 https://16colo.rs/pack/chuck-norris-lvl/CHUCK.ANS');
        assert.equal(r.options.sendMediaAsHd, true);
    });

    test('sem SAUCE: nome do arquivo e ano do pack', async () => {
        simulatePack('mimic100');
        const [r] = await bot.executar('/pixelart mimic100');
        assert.equal(r.options.caption, '🎨 *CHUCK.ANS*\n📦 mimic100 (2021)\n🔗 https://16colo.rs/pack/mimic100/CHUCK.ANS');
    });

    test('arte alta vai em partes, até o pixelart.maxParts', async () => {
        await bot.setSetting('pixelart.maxParts', 2);
        simulatePack('alta', { altura: 10000 });

        const sentAlt3 = await bot.executar('/pixelart alta');
        assert.equal(sentAlt3.length, 2);
        assert.match(sentAlt3[0].options.caption, /🧩 Parte 1\/2 _\(arte cortada: veja inteira no link\)_$/);
        assert.equal(sentAlt3[1].options.caption, '🧩 Parte 2/2');
    });

    test('-y e -r sorteiam entre os packs do ano ou do arquivo', async () => {
        network.responder('get', 'api.16colo.rs/v0/year/1996', [{ name: 'acid-1096' }]);
        simulatePack('acid-1096');
        assert.match((await bot.executar('/pixelart -y 1996'))[0].options.caption, /📦 acid-1096/);

        network.responder('get', /api\.16colo\.rs\/v0\/pack$/, [{ name: 'blocktronics' }]);
        simulatePack('blocktronics');
        assert.match((await bot.executar('/pixelart -r'))[0].options.caption, /📦 blocktronics/);
    });

    test('ano ou pack inválidos, pack inexistente ou sem artes, 16colo.rs fora do ar', async () => {
        assert.deepEqual(await bot.replyAlt('/pixelart -y 1900'), ['❌ Ano inválido. Ex.: /pixelart -y 1996']);
        assert.deepEqual(await bot.replyAlt('/pixelart ../etc'), ['❌ Nome de pack inválido. Ex.: /pixelart chuck-norris-lvl']);

        network.responder('get', 'api.16colo.rs/v0/pack/nada', []);
        assert.deepEqual(await bot.replyAlt('/pixelart nada'), ['❌ Pack não encontrado: nada\n💡 _Veja os packs em https://16colo.rs_']);

        network.responder('get', 'api.16colo.rs/v0/pack/so-txt', { name: 'so-txt', year: 1995, files: [{ filename: 'LEIAME.TXT' }] });
        assert.deepEqual(await bot.replyAlt('/pixelart so-txt'), ['❌ O pack so-txt não tem artes ANSI/ASCII.']);

        network.responder('get', 'api.16colo.rs', errorHttp(500));
        assert.deepEqual(await bot.replyAlt('/pixelart', { erroEsperado: true }), ['❌ Não consegui buscar a arte no 16colo.rs agora.']);
    });
});

describe('/joke (/piada, /humor)', () => {
    const { JOKES, restartJokes } = bot.src('commands/joke');

    test('pergunta e resposta, sem rede', async () => {
        const [r] = await bot.replyAlt('/joke');
        assert.match(r, /^.+\?\n\n\.\.\. .+ 🥁$/);
        assert.ok(JOKES.some(p => r === `${p.pergunta}\n\n... ${p.resposta} 🥁`));
        assert.equal(network.chamadas.length, 0);
    });

    test('nenhuma se repete até todas saírem, nem na virada de uma rodada para a outra', async () => {
        restartJokes();
        const counted = [];
        for (let i = 0; i < JOKES.length * 10; i++) counted.push((await bot.replyAlt(i % 2 ? '/piada' : '/humor'))[0]);

        for (let r = 0; r < 10; r++) {
            const round = counted.slice(r * JOKES.length, (r + 1) * JOKES.length);
            assert.equal(new Set(round).size, JOKES.length, `rodada ${r}: repetiu antes de acabar`);
        }
        for (let i = 1; i < counted.length; i++) assert.notEqual(counted[i], counted[i - 1], `a mesma duas vezes seguidas (${i})`);
    });

    test('a lista: perguntas únicas, todas com resposta', () => {
        assert.ok(JOKES.length >= 40);
        assert.equal(new Set(JOKES.map(p => p.pergunta)).size, JOKES.length);
        assert.ok(JOKES.every(p => p.pergunta.trim() && p.resposta.trim()));
    });
});

describe('/kernel', () => {
    test('versões mainline, stable e longterm', async () => {
        network.responder('get', 'kernel.org', {
            latest_stable: { version: '6.17.2' },
            releases: [
                { moniker: 'mainline', version: '6.18-rc1', released: { isodate: '2026-09-28' } },
                { moniker: 'stable', version: '6.17.2', released: { isodate: '2026-09-25' } },
                { moniker: 'linux-next', version: 'next-2026', released: { isodate: '2026-09-29' } },
                { moniker: 'longterm', version: '6.12.50', released: { isodate: '2026-09-20' } }
            ]
        });
        const [r] = await bot.replyAlt('/kernel');
        assert.match(r, /🐧 \*Linux 6\.17\.2\* _\(latest stable\)_/);
        assert.match(r, /mainline  6\.18-rc1     2026-09-28\nstable    6\.17\.2       2026-09-25\nlongterm  6\.12\.50/);
        assert.doesNotMatch(r, /linux-next/);
    });

    test('kernel.org fora do ar', async () => {
        network.responder('get', 'kernel.org', errorHttp(500));
        assert.deepEqual(await bot.replyAlt('/kernel', { erroEsperado: true }), ['❌ Não consegui consultar o kernel.org agora.']);
    });
});
