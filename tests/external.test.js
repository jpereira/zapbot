/*
 * Commands that query external services (all simulated):
 * /cve, /weather, /news, /gpt, /tldr, /translate, /giphy, /meme, /joke, /kernel e /pixelart.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { MessageMedia, errorHttp, processes, network } = bot;

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

describe('/weather', () => {
    const local = { name: 'Niterói', admin1: 'Rio de Janeiro', country: 'Brasil', latitude: -22.9, longitude: -43.1 };
    const forecast = (temp, codeAlt = 0) => ({
        current: { temperature_2m: temp, apparent_temperature: temp + 1, relative_humidity_2m: 70, weather_code: codeAlt, wind_speed_10m: 12.4 },
        daily: { temperature_2m_max: [temp + 3], temperature_2m_min: [temp - 3], precipitation_probability_max: [40] }
    });

    test('sem cidade usa o weather.city; mostra agora, máx/mín, umidade, vento e chuva', async () => {
        network.responder('get', 'geocoding-api.open-meteo.com', (url, cfg) => ({ results: [{ ...local, pedido: cfg.params.name }] }));
        network.responder('get', 'api.open-meteo.com/v1/forecast', forecast(24, 2));

        const [r] = await bot.replyAlt('/weather');
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
        const [cold] = await bot.replyAlt('/weather Curitiba');
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

        // New city (/weather caches the geocoding between tests)
        const [r] = await bot.replyAlt('/weather 3d Olinda');
        assert.equal(network.chamadas.at(-1).cfg.params.forecast_days, 3);
        assert.equal(network.chamadas.find(c => c.url.includes('geocoding')).cfg.params.name, 'Olinda', 'o "3d" não entra no nome');
        assert.match(r, /🌡️ \*Agora:\* 24°C/, 'mantém o tempo de agora');
        assert.match(r, /📅 \*Próximos 3 dias\*\n☀️ \*Hoje \(qui 01\/10\):\* 30°\/20° · ☔ 0% · Céu limpo\n🌧️ \*sex 02\/10:\* 31°\/21° · ☔ 10% · Chuva\n⛈️ \*sáb 03\/10:\* 32°\/22° · ☔ 20% · Trovoada/);

        await bot.setSetting('weather.city', 'Maricá');
        await bot.replyAlt('/weather 5');
        assert.equal(network.chamadas.at(-1).cfg.params.forecast_days, 5);
        assert.equal(network.chamadas.at(-2).cfg.params.name, 'Maricá', 'sem cidade: weather.city');

        assert.match((await bot.replyAlt('/weather 1d'))[0], /📅 \*Previsão de hoje\*\n/);
        assert.match((await bot.replyAlt('/weather 7D Recife'))[0], /Próximos 7 dias/);
    });

    test('sem N: só o dia de hoje (forecast_days 1), sem a lista', async () => {
        network.responder('get', 'geocoding-api.open-meteo.com', { results: [local] });
        network.responder('get', 'api.open-meteo.com/v1/forecast', (url, cfg) => forecastDays(cfg.params.forecast_days));
        const [r] = await bot.replyAlt('/weather Niteroi');
        assert.equal(network.chamadas.at(-1).cfg.params.forecast_days, 1);
        assert.doesNotMatch(r, /Próximos|Previsão de hoje/);
    });

    test('N fora de 1..weather.maxDays é recusado; o máximo vem do setting (até 16)', async () => {
        await bot.setSetting('weather.maxDays', 7);
        assert.match((await bot.replyAlt('/weather 8d Recife'))[0], /❌ Quantidade de dias inválida: 8\. Use de 1 a 7\./);
        assert.match((await bot.replyAlt('/weather 0'))[0], /Quantidade de dias inválida: 0/);
        assert.deepEqual(network.chamadas, [], 'nem consulta a API');

        await bot.setSetting('weather.maxDays', 16);
        network.responder('get', 'geocoding-api.open-meteo.com', { results: [local] });
        network.responder('get', 'api.open-meteo.com/v1/forecast', (url, cfg) => forecastDays(cfg.params.forecast_days));
        assert.match((await bot.replyAlt('/weather 16'))[0], /Próximos 16 dias/);
        await assert.rejects(bot.setSetting('weather.maxDays', 17), /entre 1 e 16/);
    });

    test('padrão permite 16d com datas válidas; 17 dias é recusado sem consultar a API', async () => {
        assert.equal(bot.getSetting('weather.maxDays'), 16);
        network.responder('get', 'geocoding-api.open-meteo.com', { results: [local] });
        network.responder('get', 'api.open-meteo.com/v1/forecast',
            (url, cfg) => forecastDays(cfg.params.forecast_days));
        const [r] = await bot.replyAlt('/weather 16d Recife');
        assert.equal(network.chamadas.at(-1).cfg.params.forecast_days, 16);
        assert.match(r, /Próximos 16 dias/);
        assert.match(r, /sex 16\/10/);
        assert.doesNotMatch(r, /Invalid Date/);
        assert.equal(r.split('\n').filter(l => l.includes(' · ☔ ')).length, 16);
        network.chamadas.length = 0;
        assert.match((await bot.replyAlt('/weather 17d Recife'))[0], /Use de 1 a 16/);
        assert.deepEqual(network.chamadas, []);
    });

    test('cidade não encontrada; serviço fora do ar', async () => {
        network.responder('get', 'geocoding-api.open-meteo.com', { results: [] });
        assert.match((await bot.replyAlt('/weather Xyzabc'))[0], /❌ Cidade não encontrada: Xyzabc/);

        network.responder('get', 'geocoding-api.open-meteo.com', errorHttp(500));
        assert.deepEqual(await bot.replyAlt('/weather Lugar', { erroEsperado: true }), ['❌ Não consegui consultar o tempo agora.']);
    });
});

describe('/news', () => {
    const feed = (sourceAlt, items) => `<?xml version="1.0"?><rss><channel><title>${sourceAlt}</title>${items.map(([title, data]) =>
        `<item><title><![CDATA[${title}]]></title><link>https://n.com/${encodeURIComponent(title)}</link><pubDate>${data}</pubDate></item>`).join('')}</channel></rss>`;

    test('sem categoria mostra a ajuda', async () => {
        assert.match((await bot.replyAlt('/news'))[0], /Usage: \/news/);
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

describe('/gpt', () => {
    // The status footer is on by default: the tests compare the exact reply, without it
    beforeEach(() => bot.setSetting('gpt.status', false));

    test('sem chave: desativado', async () => {
        assert.match((await bot.replyAlt('/gpt oi'))[0], /⚠️ API key da OpenAI não encontrada/);
    });

    test('pergunta com a chave do setting; texto da mensagem respondida entra antes', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        network.responder('post', 'api.openai.com', { choices: [{ message: { content: ' Resposta! ' } }] });

        const quoted = bot.createMessage({ texto: 'texto citado', de: bot.OTHERAlt.jid });
        assert.deepEqual(await bot.replyAlt('/gpt resuma', { citada: quoted }), ['🤖 Resposta!']);

        const { cfg } = network.chamadas.at(-1);
        assert.equal(cfg.headers.Authorization, 'Bearer sk-teste');
        assert.equal(cfg.body.messages[1].content, 'texto citado\n\nresuma');
        assert.equal(cfg.timeout, 60000);
        assert.equal(bot.client.chats.get(bot.GROUP).digitando, 1);
    });

    test('respondendo uma foto: ela vai junto da pergunta (legenda + pergunta + imagem em base64)', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
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
        await bot.setSetting('gpt.api.key', 'sk-teste');
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

    test('1ª palavra que parece opção e não existe (/gpt -price): erro com a dica do -h, sem chamar a OpenAI', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        network.responder('post', 'api.openai.com/v1/chat/completions', { choices: [{ message: { content: 'Oi.' } }] });

        assert.deepEqual(await bot.replyAlt('/gpt -price'), ['❌ Opção desconhecida: -price\n💡 _Veja as opções com /gpt -h|-help_']);
        assert.deepEqual(await bot.replyAlt('/gpt -x oi'), ['❌ Opção desconhecida: -x\n💡 _Veja as opções com /gpt -h|-help_']);
        assert.equal(network.chamadas.length, 0);

        // Only the 1st word: in the middle of the text, "-price" is a question; "-1" and "- item" too
        assert.equal((await bot.replyAlt('/gpt o que faz o -price?'))[0], '🤖 Oi.');
        assert.equal((await bot.replyAlt('/gpt -1 é negativo?'))[0], '🤖 Oi.');
    });

    test('-status|-s (ou o setting gpt.status): rodapé com os bytes TX/RX e os tokens gastos', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        network.responder('post', 'api.openai.com/v1/chat/completions', {
            choices: [{ message: { content: 'Oi.' } }],
            usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 }
        });

        const [without] = await bot.replyAlt('/gpt oi');
        assert.equal(without, '🤖 Oi.');

        // The prices come empty: cost n/a until /gpt -prices (or the automatic update)
        await bot.setSetting('gpt.status', true);
        assert.match((await bot.replyAlt('/gpt oi'))[0], /_💵 custo n\/d \(rode \/gpt -prices\)_$/);
        await bot.setSetting('gpt.status', false);
        await bot.setSetting('gpt.pricing', ['gpt-4o-mini=0.15/0.6']);

        // Default (on)
        await bot.setSetting('gpt.status', true);
        assert.match((await bot.replyAlt('/gpt oi'))[0], /📡 ⬆️/);
        await bot.setSetting('gpt.status', false);

        const [withValue] = await bot.replyAlt('/gpt -s oi');
        assert.match(withValue, /^🤖 Oi\.\n\n_📡 ⬆️ \d+ B TX · ⬇️ \d+ B RX · 🪙 25 tokens \(📥 20 · 📤 5\)_\n_💵 ~\$0\.00000\d_$/);

        // Model without a price in gpt.pricing: cost n/a
        await bot.setSetting('gpt.pricing', ['gpt-4.1=2/8']);
        assert.match((await bot.replyAlt('/gpt -s oi'))[0], /_💵 custo n\/d \(rode \/gpt -prices\)_$/);

    });

    test('respondendo um áudio: transcreve (v1/audio/transcriptions); com outra pergunta, o chat em cima da transcrição', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        network.responder('post', 'api.openai.com/v1/audio/transcriptions', { text: ' olá, tudo bem? ' });
        network.responder('post', 'api.openai.com/v1/chat/completions', { choices: [{ message: { content: 'Um cumprimento.' } }] });

        const voice = bot.createMessage({ de: bot.OTHERAlt.jid, tipo: 'ptt', midia: { mimetype: 'audio/ogg; codecs=opus', data: 'QUJD' } });
        assert.deepEqual(await bot.replyAlt('/gpt agora transcreva isso', { citada: voice }), ['🤖 *Transcrição:*\nolá, tudo bem?']);

        const { cfg } = network.chamadas.at(-1);
        assert.equal(network.chamadas.at(-1).url, 'https://api.openai.com/v1/audio/transcriptions');
        assert.equal(cfg.headers.Authorization, 'Bearer sk-teste');
        assert.equal(cfg.body.get('model'), 'gpt-transcribe');
        assert.equal(cfg.body.get('file').name, 'audio.ogg');
        assert.equal(network.chamadas.filter(c => c.url.endsWith('/chat/completions')).length, 0, 'só transcrever não chama o chat');

        // Without a question it also only transcribes; the model comes from the setting
        await bot.setSetting('gpt.transcribe.model', 'gpt-4o-mini-transcribe');
        assert.deepEqual(await bot.replyAlt('/gpt', { citada: voice }), ['🤖 *Transcrição:*\nolá, tudo bem?']);
        assert.equal(network.chamadas.at(-1).cfg.body.get('model'), 'gpt-4o-mini-transcribe');

        // Another question: the transcription goes along to the chat
        assert.deepEqual(await bot.replyAlt('/gpt resuma esse áudio', { citada: voice }), ['🤖 Um cumprimento.']);
        assert.equal(network.chamadas.at(-1).cfg.body.messages[1].content,
            'resuma esse áudio\n\nTranscrição do áudio:\nolá, tudo bem?');
    });

    test('áudio que não dá: não baixa, formato que a OpenAI não lê, grande demais, sem fala e erro da OpenAI', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
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

    test('-voice: o texto digitado (ou o da mensagem respondida) vira uma nota de voz de robô (v1/audio/speech)', async () => {
        assert.match((await bot.replyAlt('/gpt -voice oi'))[0], /⚠️ API key da OpenAI não encontrada/);

        await bot.setSetting('gpt.api.key', 'sk-teste');
        network.responder('post', 'api.openai.com/v1/audio/speech', Buffer.from('OGGDATA'));

        const r = (await bot.executar('/gpt -voice exterminar todos os humanos')).at(-1);
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

        // Without typed text, speaks the replied message's; -voice can come in the middle
        const quoted = bot.createMessage({ texto: 'bom dia, humano', de: bot.OTHERAlt.jid });
        await bot.executar('/gpt -voice', { citada: quoted });
        assert.equal(network.chamadas.at(-1).cfg.body.input, 'bom dia, humano');
        // With typed text and a replied message: speaks the replied one, in the typed style
        await bot.executar('/gpt -voice fale como um robô meio metálico', { citada: quoted });
        assert.equal(network.chamadas.at(-1).cfg.body.input, 'bom dia, humano');
        assert.equal(network.chamadas.at(-1).cfg.body.instructions, 'fale como um robô meio metálico');
        await bot.executar('/gpt fale -v isso aqui');
        assert.equal(network.chamadas.at(-1).cfg.body.input, 'fale isso aqui');

        // The model, voice and style come from the settings; tts-1 does not take the style
        await bot.setSetting('gpt.tts.voice', 'nova');
        await bot.setSetting('gpt.tts.model', 'tts-1');
        await bot.executar('/gpt -voice oi');
        assert.deepEqual(network.chamadas.at(-1).cfg.body, { model: 'tts-1', voice: 'nova', input: 'oi', response_format: 'opus' });
    });

    test('-voice: sem texto, grande demais e erro da OpenAI (o corpo do erro vem em bytes)', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        const beforeAlt = network.chamadas.length;

        assert.deepEqual(await bot.replyAlt('/gpt -voice'), ['❌ Usage: /gpt -voice <texto> (ou responda uma mensagem de texto)']);
        assert.match((await bot.replyAlt(`/gpt -voice ${'a'.repeat(4097)}`))[0], /❌ O texto tem 4097 caracteres: a voz aceita até 4096\./);
        assert.equal(network.chamadas.length, beforeAlt, 'nada foi para a OpenAI');

        network.responder('post', 'api.openai.com/v1/audio/speech', Object.assign(new Error('Request failed with status code 400'), {
            response: { status: 400, data: Buffer.from(JSON.stringify({ error: { message: 'voz inválida' } })) }
        }));
        assert.deepEqual(await bot.replyAlt('/gpt -voice oi', { erroEsperado: true }), ['❌ Erro no /gpt: voz inválida']);
    });

    // The tests' sharp reads the dimensions from "png:WxH" (see sharpFake in tests/helpers/environment.js)
    const PNG_4X2 = Buffer.from('png:4x2').toString('base64');

    test('-img: gera uma imagem (v1/images/generations) e, respondendo uma foto, a edita (v1/images/edits)', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        assert.deepEqual(await bot.replyAlt('/gpt -img'), ['❌ Usage: /gpt -img <o que criar> (respondendo uma foto, ela é editada)']);

        network.responder('post', 'api.openai.com/v1/images/generations', { data: [{ b64_json: 'UE5H' }] });
        const r = (await bot.executar('/gpt -img um robô nadando em aquarela')).at(-1);
        assert.ok(r.content instanceof MessageMedia);
        assert.equal(r.content.mimetype, 'image/png');
        assert.equal(r.content.data, 'UE5H');
        const generate = network.chamadas.at(-1);
        assert.equal(generate.url, 'https://api.openai.com/v1/images/generations');
        assert.deepEqual(generate.cfg.body, { model: 'gpt-image-2', prompt: 'um robô nadando em aquarela', n: 1 });

        // Replying to a photo: the edit (multipart), with the photo as PNG
        network.responder('post', 'api.openai.com/v1/images/edits', { data: [{ b64_json: 'RURJVA==' }] });
        const photo = bot.createMessage({ de: bot.OTHERAlt.jid, tipo: 'image', midia: { mimetype: 'image/jpeg', data: PNG_4X2 } });
        const edited = (await bot.executar('/gpt -img coloque um chapéu nele', { citada: photo })).at(-1);
        assert.equal(edited.content.data, 'RURJVA==');
        const edit = network.chamadas.at(-1);
        assert.equal(edit.url, 'https://api.openai.com/v1/images/edits');
        assert.equal(edit.cfg.body.get('prompt'), 'coloque um chapéu nele');
        assert.equal(edit.cfg.body.get('model'), 'gpt-image-2');
        assert.equal(edit.cfg.body.get('image').type, 'image/png');

        // OpenAI without the image in the reply: readable error
        network.responder('post', 'api.openai.com/v1/images/generations', { data: [] });
        assert.deepEqual(await bot.replyAlt('/gpt -img x', { erroEsperado: true }), ['❌ Erro no /gpt: a OpenAI não devolveu a imagem']);
    });

    test('modelo que a conta não tem: o erro lista os que a chave vê (GET /v1/models) e diz como trocar', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        const withoutModel = (modelAlt) => errorHttp(400, 'HTTP 400', { data: { error: { message: `The model '${modelAlt}' does not exist.` } } });
        network.responder('get', 'api.openai.com/v1/models', { data: [{ id: 'gpt-4o' }, { id: 'gpt-image-2' }, { id: 'dall-e-3' }, { id: 'sora-2' }, { id: 'whisper-1' }, { id: 'tts-1' }] });

        // Imagem
        network.responder('post', 'api.openai.com/v1/images/generations', withoutModel('gpt-image-2'));
        assert.deepEqual(await bot.replyAlt('/gpt -img um robô', { erroEsperado: true }), [
            '❌ O modelo gpt-image-2 não existe na sua conta da OpenAI (imagem).\n' +
            '💡 _A sua chave vê: dall-e-3, gpt-image-2_\n' +
            '💡 _Troque com /set gpt.image.model <modelo>_'
        ]);

        // The model is free: switch to whichever the account has and works
        await bot.setSetting('gpt.image.model', 'dall-e-3');
        network.responder('post', 'api.openai.com/v1/images/generations', { data: [{ b64_json: 'UE5H' }] });
        const ok = (await bot.executar('/gpt -img um robô')).at(-1);
        assert.equal(ok.content.data, 'UE5H');
        assert.equal(network.chamadas.filter(c => c.url.endsWith('/images/generations')).at(-1).cfg.body.model, 'dall-e-3');

        // Voice, transcription and video follow the same notice
        network.responder('post', 'api.openai.com/v1/audio/speech', withoutModel('gpt-4o-mini-tts'));
        assert.match((await bot.replyAlt('/gpt -voice oi', { erroEsperado: true }))[0], /^❌ O modelo gpt-4o-mini-tts não existe na sua conta da OpenAI \(voz\)\.\n💡 _A sua chave vê: tts-1_\n/);

        network.responder('post', 'api.openai.com/v1/audio/transcriptions', withoutModel('gpt-transcribe'));
        const voice = bot.createMessage({ de: bot.OTHERAlt.jid, tipo: 'ptt', midia: { mimetype: 'audio/ogg; codecs=opus', data: 'QUJD' } });
        assert.match((await bot.replyAlt('/gpt', { citada: voice, erroEsperado: true }))[0], /^❌ O modelo gpt-transcribe não existe .*\(transcrição\)\.\n💡 _A sua chave vê: whisper-1_\n💡 _Troque com \/set gpt\.transcribe\.model/s);

        await bot.setSetting('gpt.image.gifModel', 'gpt-image-1');
        network.responder('post', 'api.openai.com/v1/images/generations', withoutModel('gpt-image-1'));
        assert.match((await bot.replyAlt('/draw -gif um gato', { erroEsperado: true })).at(-1), /^❌ O modelo gpt-image-1 não existe .*\(GIF\)\.\n💡 _A sua chave vê: gpt-image-2_\n💡 _Troque com \/set gpt\.image\.gifModel/s);

        // Without the list (/v1/models fails too): only the warning
        network.responder('get', 'api.openai.com/v1/models', errorHttp(500));
        network.responder('post', 'api.openai.com/v1/images/generations', withoutModel('gpt-image-2'));
        assert.match((await bot.replyAlt('/gpt -img x', { erroEsperado: true }))[0], /💡 _Não achei na lista da sua chave nenhum modelo parecido\._/);
    });

    test('-gif: o GIF animado da API de imagens (output_format gif) vira um MP4 mandado como GIF; respondendo uma foto, ela é a base', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        assert.deepEqual(await bot.replyAlt('/gpt -gif'), ['❌ Usage: /gpt -gif <o que animar> (respondendo uma foto, ela é animada)']);

        network.responder('post', 'api.openai.com/v1/images/generations', { data: [{ b64_json: Buffer.from('GIF89a').toString('base64') }] });
        network.responder('post', 'api.openai.com/v1/images/edits', { data: [{ b64_json: Buffer.from('GIF89a').toString('base64') }] });

        // Without a photo: only the text
        const gif = (await bot.executar('/gpt -gif um gato de óculos escuros')).at(-1);
        assert.ok(gif.content instanceof MessageMedia);
        assert.equal(gif.content.mimetype, 'video/mp4');
        assert.equal(gif.options.sendVideoAsGif, true);
        const generation = network.chamadas.at(-1);
        assert.equal(generation.url, 'https://api.openai.com/v1/images/generations');
        assert.deepEqual(generation.cfg.body, {
            model: 'gpt-image-2.6-flare', prompt: 'um gato de óculos escuros', n: 1, size: '512x512',
            output_format: 'gif', frame_count: 9, frame_duration_ms: 200
        });
        // The GIF went through ffmpeg: .gif input, .mp4 output with no audio
        const ffmpeg = processes.chamadas.at(-1);
        assert.match(ffmpeg.bin, /ffmpeg$/);
        assert.ok(ffmpeg.args.includes('-an') && ffmpeg.args.at(-1).endsWith('saida.mp4'));
        assert.ok(ffmpeg.args[ffmpeg.args.indexOf('-i') + 1].endsWith('entrada.gif'));

        // The frames and the time come from the settings
        await bot.setSetting('gpt.gif.frames', 12);
        await bot.setSetting('gpt.gif.frameMs', 150);
        await bot.executar('/gpt -gif um gato');
        assert.equal(network.chamadas.at(-1).cfg.body.frame_count, 12);
        assert.equal(network.chamadas.at(-1).cfg.body.frame_duration_ms, 150);

        // "gere um gif animado..." replying to a photo, without -gif: the edit (multipart) with the photo as PNG
        const photo = bot.createMessage({ de: bot.OTHERAlt.jid, tipo: 'image', midia: { mimetype: 'image/jpeg', data: PNG_4X2 } });
        const animated = (await bot.executar('/gpt gere um gif animado de como se estivesse nadando', { citada: photo })).at(-1);
        assert.equal(animated.options.sendVideoAsGif, true);
        const edit = network.chamadas.at(-1);
        assert.equal(edit.url, 'https://api.openai.com/v1/images/edits');
        assert.equal(edit.cfg.body.get('output_format'), 'gif');
        assert.equal(edit.cfg.body.get('frame_count'), '12');
        assert.equal(edit.cfg.body.get('frame_duration_ms'), '150');
        assert.equal(edit.cfg.body.get('image').type, 'image/png');
        assert.equal(edit.cfg.body.get('prompt'),
            'Anime esta imagem em um GIF. gere um gif animado de como se estivesse nadando');
    });

    test('-gif: conta sem a prévia do GIF, a OpenAI sem a imagem e o ffmpeg falhando', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');

        network.responder('post', 'api.openai.com/v1/images/generations',
            errorHttp(400, 'HTTP 400', { data: { error: { message: 'output_format gif requires access to the GIF preview' } } }));
        const [withoutPreview] = await bot.replyAlt('/gpt -gif x', { erroEsperado: true });
        assert.match(withoutPreview, /^🔒 A sua conta\/modelo não faz GIF animado: output_format gif requires access to the GIF preview\n/);
        assert.match(withoutPreview, /Só os gpt-image-2\.6-\* fazem GIF/);

        network.responder('post', 'api.openai.com/v1/images/generations', { data: [] });
        assert.deepEqual(await bot.replyAlt('/gpt -gif x', { erroEsperado: true }), ['❌ Erro no /gpt: a OpenAI não devolveu a imagem']);

        network.responder('post', 'api.openai.com/v1/images/generations', { data: [{ b64_json: 'R0lG' }] });
        processes.falhar = 'ffmpeg';
        try {
            // Without the conversion, the .gif still arrives, as a document
            const document = (await bot.executar('/gpt -gif x', { erroEsperado: true })).at(-1);
            assert.equal(document.content.mimetype, 'image/gif');
            assert.equal(document.options.sendMediaAsDocument, true);
        } finally {
            processes.falhar = null;
        }
    });

    test('-img e -gif gastam a conta: só o dono e os admins, também no "gere um gif..." sem o -gif', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        await bot.setSetting('bot.users', [bot.OTHERAlt.user]);
        await bot.setSetting('bot.users.cmds', [`${bot.OTHERAlt.user}=/gpt`]);
        const beforeAlt = network.chamadas.length;

        assert.deepEqual(await bot.replyAlt('/gpt -img um robô', { de: bot.OTHERAlt.jid }),
            ['⛔ Apenas o dono do bot (ou um admin) pode usar o -img do /gpt.']);
        assert.deepEqual(await bot.replyAlt('/gpt -gif um gato', { de: bot.OTHERAlt.jid }),
            ['⛔ Apenas o dono do bot (ou um admin) pode usar o -gif do /gpt.']);

        const photo = bot.createMessage({ de: bot.OTHERAlt.jid, tipo: 'image', midia: { mimetype: 'image/png', data: PNG_4X2 } });
        assert.deepEqual(await bot.replyAlt('/gpt gere um gif animado dele nadando', { de: bot.OTHERAlt.jid, citada: photo }),
            ['⛔ Apenas o dono do bot (ou um admin) pode gerar GIF.']);
        assert.equal(network.chamadas.length, beforeAlt, 'nada foi para a OpenAI');
    });

    test('a resposta em Markdown chega na formatação do WhatsApp (títulos, negrito duplo, tabela)', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        network.responder('post', 'api.openai.com/v1/chat/completions', { choices: [{ message: { content:
            '# 🧺 O que é um conjunto?\n\nUm **conjunto** é uma coleção.\n\n| Símbolo | Significado |\n|---|---|\n| **∈** | Pertence |\n\n---\n\n* **União ∪:** tudo junto' } }] });

        assert.deepEqual(await bot.replyAlt('/gpt o que é um conjunto?'), [
            '🤖 *🧺 O que é um conjunto?*\n\nUm *conjunto* é uma coleção.\n\n```\nSímbolo  Significado\n-------  -----------\n∈        Pertence\n```\n\n- *União ∪:* tudo junto'
        ]);

        // And the model is instructed to write for WhatsApp
        const system = network.chamadas.at(-1).cfg.body.messages[0].content;
        assert.match(system, /Formate para o WhatsApp.*\*negrito\* com um asterisco só.*Não use títulos com #, tabelas/s);
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

    test('modelo: setting gpt.api.model (padrão gpt-4o-mini); o OPENAI_MODEL do .env vence', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        network.responder('post', 'api.openai.com', { choices: [{ message: { content: 'ok' } }] });

        await bot.replyAlt('/gpt oi');
        assert.equal(network.chamadas.at(-1).cfg.body.model, 'gpt-4o-mini');

        await bot.setSetting('gpt.api.model', 'gpt-6-luna');
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

    test('-prices: lê a tabela Standard do site da OpenAI e atualiza o gpt.pricing, sem tocar no que a página não tem', async () => {
        const line = (nameAlt, ...v) => `[1,[[0,&quot;${nameAlt}&quot;]${v.map(x => `,[0,${typeof x === 'string' ? `&quot;${x}&quot;` : x}]`).join('')}]]`;
        const page = '<astro-island props="' + [
            line('gpt-4o-mini', 0.2, 0.075, 0.7),                 // mudou
            line('gpt-9-novo (&lt;272K context length)', 3, 0.3, '-', 12), // new, and the range leaves the name
            line('gpt-9-novo (&gt;272K context length)', 6, '-', '-', 24),  // a primeira linha vale
            line('gpt-9-pro', 30, '-', '-', 180),                 // pro: fora
            line('gpt-4o-mini-2024-07-18', 3, 0.15),              // fine-tuning (data): fora
            line('gpt-4o-mini-tts', 0.6, '-', 12),                // voz: fora
            line('gpt-4o-mini', 0.075, '-', 0.3)                  // Batch: a primeira linha vale
        ].join(',') + '"></astro-island>';
        network.responder('get', 'developers.openai.com/api/docs/pricing', page);
        await bot.setSetting('gpt.pricing', ['gpt-4o-mini=0.15/0.6', 'meu-modelo=1/2']);

        const [r] = await bot.replyAlt('/gpt -prices');
        assert.match(r, /1 alterado, 1 novo, 0 sem mudança/);
        assert.match(r, /🔄 gpt-4o-mini: 0\.15\/0\.6 → \*0\.2\/0\.7\*/);
        assert.match(r, /➕ gpt-9-novo/);
        assert.deepEqual(bot.getSetting('gpt.pricing'), ['gpt-4o-mini=0.2/0.7', 'meu-modelo=1/2', 'gpt-9-novo=3/12']);

        // No change: only warns
        assert.match((await bot.replyAlt('/gpt -prices'))[0], /✅ Os 2 preços já estão em dia/);

        // Page without the table: error and nothing changes
        network.responder('get', 'developers.openai.com/api/docs/pricing', '<html></html>');
        assert.match((await bot.replyAlt('/gpt -prices'))[0], /❌ Não consegui atualizar os preços: não achei a tabela/);
        assert.equal(bot.getSetting('gpt.pricing').length, 3);
    });

    test('atualização automática dos preços: a cada 15 dias, só com a chave e o gpt.pricing.auto; aviso no rodapé com 30+', async () => {
        const { updatePricesSeExpired } = bot.src('openaiChat');
        const page = '<x props="[1,[[0,&quot;gpt-4o-mini&quot;],[0,0.3],[0,0.1],[0,0.9]]]"></x>';
        network.responder('get', 'developers.openai.com/api/docs/pricing', page);
        const day = 86400000;
        const today = Date.now();

        // Without the key: nothing
        assert.equal(await updatePricesSeExpired(today + 40 * day), null);
        await bot.setSetting('gpt.api.key', 'sk-teste');

        // Never updated (prices and date empty, the default): updates now, without waiting for the 15 days
        const first = await updatePricesSeExpired(today);
        assert.deepEqual(first.novos, ['gpt-4o-mini']);
        assert.deepEqual(bot.getSetting('gpt.pricing'), ['gpt-4o-mini=0.3/0.9']);
        await bot.setSetting('gpt.pricing', ['gpt-4o-mini=0.15/0.6']);

        // Just updated: not expired yet
        await bot.setSetting('gpt.pricing.updated', new Date(today).toISOString().slice(0, 10));
        assert.equal(await updatePricesSeExpired(today + 10 * day), null);

        // Turned off by gpt.pricing.auto: nothing, even if expired
        const queries = () => network.chamadas.filter(c => c.url.includes('/pricing')).length;
        const beforeAlt = queries();
        await bot.setSetting('gpt.pricing.auto', false);
        assert.equal(await updatePricesSeExpired(today + 40 * day), null);
        assert.equal(queries(), beforeAlt);

        // Vencido (16 dias) e ligado: atualiza e grava a data
        await bot.setSetting('gpt.pricing.auto', true);
        const r = await updatePricesSeExpired(today + 16 * day);
        assert.equal(r.mudados.length, 1);
        assert.ok(bot.getSetting('gpt.pricing').includes('gpt-4o-mini=0.3/0.9'));
        assert.equal(bot.getSetting('gpt.pricing.updated'), new Date().toISOString().slice(0, 10));

        // Failure (site down): touches nothing and waits before trying again
        await bot.setSetting('gpt.pricing.updated', '2026-01-01');
        network.responder('get', 'developers.openai.com/api/docs/pricing', '<html></html>');
        assert.equal(await updatePricesSeExpired(today), null);
        const n = network.chamadas.length;
        assert.equal(await updatePricesSeExpired(today + 1000), null);
        assert.equal(network.chamadas.length, n, 'não tenta de novo antes do intervalo');

        // Old prices (30+ days): the -status footer warns
        network.responder('post', 'api.openai.com/v1/chat/completions', { choices: [{ message: { content: 'Oi.' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
        assert.match((await bot.replyAlt('/gpt -s oi'))[0], /_⚠️ preços de \d+ dias: \/gpt -prices_$/);
    });

    test('-usage: o consumo (Usage API, chave de admin) por dia e por modelo, e os limites de agora (cabeçalhos)', async () => {
        assert.match((await bot.replyAlt('/gpt -usage'))[0], /⚠️ API key da OpenAI não encontrada/);

        await bot.setSetting('gpt.api.key', 'sk-teste');
        await bot.setSetting('gpt.admin.key', 'sk-admin-teste');
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
        const item = (line_item, value) => ({ line_item, amount: { value, currency: 'usd' } });
        const sincePurchase = Date.parse('2026-11-01T00:00:00Z') / 1000;
        network.responder('get', 'api.openai.com/v1/organization/costs', (url, cfg) => ({
            has_more: false,
            data: cfg.params.start_time === sincePurchase
                ? [{ start_time: sincePurchase, results: [item('gpt-4o-mini, input', 1.51)] }]
                : [
                    { start_time: day, results: [item('gpt-4o-mini, input', 0.0004), item('gpt-4o-mini, output', 0.0003), item('gpt-6-sol, input', 0)] },
                    { start_time: day + 86400, results: [item('gpt-4o-mini, input', 0.0012), item('gpt-image-2.6-flare, image', 0.04)] }
                ]
        }));
        const empty = { has_more: false, data: [{ start_time: day, results: [] }] };
        network.responder('get', 'api.openai.com/v1/organization/usage/images', { has_more: false, data: [{ start_time: day, results: [{ images: 3, num_model_requests: 2 }] }] });
        network.responder('get', 'api.openai.com/v1/organization/usage/audio_speeches', { has_more: false, data: [{ start_time: day, results: [{ characters: 1200, num_model_requests: 1 }] }] });
        network.responder('get', 'api.openai.com/v1/organization/usage/audio_transcriptions', { has_more: false, data: [{ start_time: day, results: [{ seconds: 42, num_model_requests: 1 }] }] });
        network.responder('get', 'api.openai.com/v1/organization/usage/embeddings', empty);
        await bot.setSetting('gpt.credit.total', '10');
        await bot.setSetting('gpt.credit.since', '2026-11-01');
        network.responder('post', 'api.openai.com/v1/chat/completions', network.http({
            data: { choices: [{ message: { content: '' } }] },
            headers: {
                'x-ratelimit-limit-tokens': '200000', 'x-ratelimit-remaining-tokens': '199984', 'x-ratelimit-reset-tokens': '6ms',
                'x-ratelimit-limit-requests': '5000', 'x-ratelimit-remaining-requests': '4999', 'x-ratelimit-reset-requests': '12ms'
            }
        }));

        const [r] = await bot.replyAlt('/gpt -usage 3');
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
        await bot.setSetting('gpt.api.key', 'sk-teste');
        network.responder('post', 'api.openai.com/v1/chat/completions', network.http({
            data: { choices: [] }, headers: { 'x-ratelimit-limit-tokens': '1000', 'x-ratelimit-remaining-tokens': '10' }
        }));

        const [withoutAdmin] = await bot.replyAlt('/gpt -usage');
        assert.match(withoutAdmin, /^💡 _Para ver o consumo, defina a chave de admin/);
        assert.match(withoutAdmin, /• tokens: 10 de 1\.000$/);
        assert.doesNotMatch(withoutAdmin, /requisições/);

        assert.deepEqual(await bot.replyAlt('/gpt -u 99'), ['❌ Usage: /gpt -usage [dias] (de 1 a 31; padrão 7)']);
        assert.deepEqual(await bot.replyAlt('/gpt -usage 0'), ['❌ Usage: /gpt -usage [dias] (de 1 a 31; padrão 7)']);
        assert.deepEqual(await bot.replyAlt('/gpt -usage 99'), ['❌ Usage: /gpt -usage [dias] (de 1 a 31; padrão 7)']);
        assert.deepEqual(await bot.replyAlt('/gpt -usage abc'), ['❌ Usage: /gpt -usage [dias] (de 1 a 31; padrão 7)']);

        await bot.setSetting('gpt.admin.key', 'sk-admin-teste');
        network.responder('get', 'api.openai.com/v1/organization/usage/completions', errorHttp(403));
        const [rejected] = await bot.replyAlt('/gpt -usage', { erroEsperado: true });
        assert.match(rejected, /^🔑 A chave de admin foi recusada\.\n💡 _A Usage API pede uma Admin key/);
        assert.match(rejected, /⏱️ \*Limites agora\*/);
    });

    test('-m sem modelo e sem a lista da chave: os usos, com os padrões e os atuais', async () => {
        const [r] = await bot.replyAlt('/gpt -m');
        assert.match(r, /^🤖 \*Modelos do \/gpt\*\n\n\*Padrão\* \(perguntas\) — \/gpt -m <modelo>\n✅ gpt-4o-mini\n/);
        assert.match(r, /▫️ gpt-6-astra/);
        assert.match(r, /\*-img\* \(imagens\) — \/gpt -m <modelo> -img\n✅ gpt-image-2\n\n/);
        assert.match(r, /\*-gif\* \(GIF\) — \/gpt -m <modelo> -gif\n✅ gpt-image-2\.6-flare\n\n/);
        assert.match(r, /\*-audio\* \(transcrição de áudio\) — \/gpt -m <modelo> -audio\n✅ gpt-transcribe\n\n/);
        assert.match(r, /\*-voice\* \(voz\) — \/gpt -m <modelo> -voice\n✅ gpt-4o-mini-tts\n\n/);
        assert.match(r, /💡 _Sem a lista da sua chave/);
        assert.doesNotMatch(r, /OPENAI_MODEL/);
    });

    test('-m com a chave: os modelos que ela vê, por uso; -m <modelo> [-gif|-audio|-voice] troca o do uso', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        network.responder('get', 'api.openai.com/v1/models', { data: [
            { id: 'gpt-4.1' }, { id: 'gpt-4o-mini' }, { id: 'gpt-5-pro' }, { id: 'text-embedding-3-small' },
            { id: 'gpt-image-2.5-flare' }, { id: 'gpt-image-2.6-flare' }, { id: 'dall-e-3' },
            { id: 'gpt-transcribe' }, { id: 'whisper-1' }, { id: 'gpt-4o-mini-tts' }, { id: 'tts-1' }
        ] });

        const [list] = await bot.replyAlt('/gpt -m');
        assert.equal(list, [
            '🤖 *Modelos do /gpt*',
            '',
            '*Padrão* (perguntas) — /gpt -m <modelo>',
            '✅ gpt-4o-mini',
            '▫️ gpt-4.1',
            '',
            '*-img* (imagens) — /gpt -m <modelo> -img',
            '✅ gpt-image-2 ⚠️ a sua chave não vê',
            '▫️ dall-e-3',
            '▫️ gpt-image-2.5-flare',
            '▫️ gpt-image-2.6-flare',
            '',
            '*-gif* (GIF) — /gpt -m <modelo> -gif',
            '✅ gpt-image-2.6-flare',
            '▫️ gpt-image-2.5-flare',
            '',
            '*-audio* (transcrição de áudio) — /gpt -m <modelo> -audio',
            '✅ gpt-transcribe',
            '▫️ whisper-1',
            '',
            '*-voice* (voz) — /gpt -m <modelo> -voice',
            '✅ gpt-4o-mini-tts',
            '▫️ tts-1',
            '',
            '💡 _A lista é a da sua chave (GET /v1/models)._'
        ].join('\n'));

        // A single use
        const [soImage] = await bot.replyAlt('/gpt -m -gif');
        assert.match(soImage, /^🤖 \*Modelos do \/gpt\*\n\n\*-gif\*/);
        assert.doesNotMatch(soImage, /Padrão|-audio|-voice/);

        // Swap per use
        assert.deepEqual(await bot.replyAlt('/gpt -m gpt-4.1'), ['✅ Modelo do /gpt: *gpt-4.1*']);
        assert.deepEqual(await bot.replyAlt('/gpt -m gpt-image-2.5-flare -img'), ['✅ Modelo de imagens do /gpt: *gpt-image-2.5-flare*']);
        assert.deepEqual(await bot.replyAlt('/gpt -m gpt-image-2.6-flare -gif'), ['✅ Modelo de GIF do /gpt: *gpt-image-2.6-flare*']);
        assert.deepEqual(await bot.replyAlt('/gpt -m whisper-1 -audio'), ['✅ Modelo de transcrição de áudio do /gpt: *whisper-1*']);
        assert.deepEqual(await bot.replyAlt('/gpt -m tts-1 -voice'), ['✅ Modelo de voz do /gpt: *tts-1*']);
        assert.deepEqual([bot.getSetting('gpt.api.model'), bot.getSetting('gpt.image.model'), bot.getSetting('gpt.image.gifModel'),
            bot.getSetting('gpt.transcribe.model'), bot.getSetting('gpt.tts.model')],
        ['gpt-4.1', 'gpt-image-2.5-flare', 'gpt-image-2.6-flare', 'whisper-1', 'tts-1']);

        // A model the key cannot see is not saved, and the error shows the ones of the use; the questions' follows the fixed list
        assert.deepEqual(await bot.replyAlt('/gpt -m gpt-image-1 -img'), [
            '❌ A sua chave não vê o modelo gpt-image-1 (imagens).\n💡 _Os que ela vê: dall-e-3, gpt-image-2.5-flare, gpt-image-2.6-flare_'
        ]);
        assert.equal(bot.getSetting('gpt.image.model'), 'gpt-image-2.5-flare');
        assert.match((await bot.replyAlt('/gpt -m gpt-5-pro'))[0], /❌ Modelo não suportado: gpt-5-pro \(aceitos: gpt-6-astra/);

        // A current one the key cannot see appears with the warning
        await bot.setSetting('gpt.image.model', 'gpt-image-1');
        assert.match((await bot.replyAlt('/gpt -m -img'))[0], /✅ gpt-image-1 ⚠️ a sua chave não vê\n▫️ dall-e-3/);
    });

    test('-m <modelo> troca o setting; modelo fora da lista é recusado', async () => {
        assert.deepEqual(await bot.replyAlt('/gpt -model gpt-6-sol'), ['✅ Modelo do /gpt: *gpt-6-sol*']);
        assert.equal(bot.getSetting('gpt.api.model'), 'gpt-6-sol');

        assert.match((await bot.replyAlt('/gpt -m gpt-5-pro'))[0], /❌ Modelo não suportado: gpt-5-pro \(aceitos: gpt-6-astra/);
        assert.equal(bot.getSetting('gpt.api.model'), 'gpt-6-sol');
        await assert.rejects(bot.setSetting('gpt.api.model', 'o1'), /não suportado: o1/);
    });

    test('-m com OPENAI_MODEL no .env: troca o setting e avisa da prioridade', async () => {
        process.env.OPENAI_MODEL = 'gpt-4.1';
        try {
            assert.match((await bot.replyAlt('/gpt -m'))[0], /\*Padrão\* \(perguntas\) — \/gpt -m <modelo> _\(o atual vem do OPENAI_MODEL no \.env\)_\n✅ gpt-4\.1\n/);
            assert.match((await bot.replyAlt('/gpt -m gpt-6-luna'))[0], /✅ Modelo do \/gpt: \*gpt-6-luna\*\n⚠️ _O OPENAI_MODEL do \.env \(gpt-4\.1\) tem prioridade/);
        } finally {
            delete process.env.OPENAI_MODEL;
        }
    });

    test('sem pergunta mostra a sintaxe', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        assert.match((await bot.replyAlt('/gpt'))[0], /Usage: \/gpt/);
    });

    test('erros: chave inválida (sem vazar no log), limite, timeout e outros', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
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

describe('/draw', () => {
    const PNG_4X2 = Buffer.from('png:4x2').toString('base64');
    const GIF = Buffer.from('GIF89a').toString('base64');
    const imageCalls = () => network.chamadas.filter(c => /\/images\/(generations|edits)$/.test(c.url));

    beforeEach(async () => {
        await bot.setSetting('gpt.status', false);
        await bot.setSetting('gpt.api.key', 'sk-teste');
        network.responder('post', 'api.openai.com/v1/images/generations', { data: [{ b64_json: 'UE5H' }] });
        network.responder('post', 'api.openai.com/v1/images/edits', { data: [{ b64_json: 'RURJVA==' }] });
    });

    test('sem chave e sem pedido', async () => {
        await bot.setSetting('gpt.api.key', '');
        assert.match((await bot.replyAlt('/draw um gato'))[0], /⚠️ API key da OpenAI não encontrada: o \/draw está desativado/);

        await bot.setSetting('gpt.api.key', 'sk-teste');
        assert.match((await bot.replyAlt('/draw'))[0], /Usage: \/draw/);
        assert.equal(imageCalls().length, 0);
    });

    test('desenha a imagem (modelo gpt.image.model) com o pedido na legenda; os aliases valem', async () => {
        const r = (await bot.executar('/draw um gato astronauta')).at(-1);
        assert.ok(r.content instanceof MessageMedia);
        assert.equal(r.content.mimetype, 'image/png');
        assert.equal(r.content.data, 'UE5H');
        assert.equal(r.options.caption, '🎨 um gato astronauta');
        const { cfg, url } = imageCalls().at(-1);
        assert.equal(url, 'https://api.openai.com/v1/images/generations');
        assert.deepEqual(cfg.body, { model: 'gpt-image-2', prompt: 'um gato astronauta', n: 1 });
        assert.equal(cfg.headers.Authorization, 'Bearer sk-teste');
        assert.ok(cfg.timeout >= 180000, 'imagem leva mais que 1 minuto: no mínimo 3');

        for (const alias of ['/draw', '/draw', '/draw']) {
            assert.equal((await bot.executar(`${alias} um cachorro`)).at(-1).content.data, 'UE5H');
        }
        // Replying to a message, its text goes before the request
        const quoted = bot.createMessage({ texto: 'um castelo', de: bot.OTHERAlt.jid });
        await bot.executar('/draw na neve', { citada: quoted });
        assert.equal(imageCalls().at(-1).cfg.body.prompt, 'um castelo\n\nna neve');
    });

    test('numa foto (respondida ou na legenda): edita a foto', async () => {
        const photo = bot.createMessage({ de: bot.OTHERAlt.jid, tipo: 'image', midia: { mimetype: 'image/jpeg', data: PNG_4X2 } });
        const r = (await bot.executar('/draw coloque um chapéu nele', { citada: photo })).at(-1);
        assert.equal(r.content.data, 'RURJVA==');
        const edit = imageCalls().at(-1);
        assert.equal(edit.url, 'https://api.openai.com/v1/images/edits');
        assert.equal(edit.cfg.body.get('prompt'), 'coloque um chapéu nele');
        assert.equal(edit.cfg.body.get('image').type, 'image/png');

        // The photo with the command caption
        const captionAlt = bot.createMessage({ texto: '/draw vire um desenho a lápis', tipo: 'image', midia: { mimetype: 'image/png', data: PNG_4X2 } });
        await bot.deliver(captionAlt);
        assert.equal(imageCalls().at(-1).url, 'https://api.openai.com/v1/images/edits');
        assert.equal(imageCalls().at(-1).cfg.body.get('prompt'), 'vire um desenho a lápis');
    });

    test('-gif: GIF 512x512 de 9 quadros (settings), -frames e -ms sobrepõem e valem como -gif; vira MP4 em loop', async () => {
        network.responder('post', 'api.openai.com/v1/images/generations', { data: [{ b64_json: GIF }] });

        const gif = (await bot.executar('/draw -gif um gato dançando')).at(-1);
        assert.equal(gif.content.mimetype, 'video/mp4');
        assert.equal(gif.options.sendVideoAsGif, true);
        assert.equal(gif.options.caption, '🎞️ um gato dançando');
        const { cfg } = imageCalls().at(-1);
        assert.deepEqual(cfg.body, {
            model: 'gpt-image-2.6-flare', prompt: 'um gato dançando', n: 1, size: '512x512',
            output_format: 'gif', frame_count: 9, frame_duration_ms: 200
        });
        assert.ok(cfg.timeout >= 300000, 'o GIF leva mais: no mínimo 5 minutos');

        // -frames and -ms (and the short -g, -f) count as -gif
        await bot.executar('/draw -f 6 -ms 300 uma bandeira ao vento');
        assert.deepEqual([imageCalls().at(-1).cfg.body.frame_count, imageCalls().at(-1).cfg.body.frame_duration_ms], [6, 300]);
        await bot.executar('/draw -g -f 4 uma bandeira');
        assert.deepEqual([imageCalls().at(-1).cfg.body.frame_count, imageCalls().at(-1).cfg.body.frame_duration_ms], [4, 200]);
        assert.equal(imageCalls().at(-1).cfg.body.prompt, 'uma bandeira');

        // The limits are those of the settings, and nothing goes to OpenAI
        const beforeAlt = imageCalls().length;
        assert.deepEqual(await bot.replyAlt('/draw -gif -f 1 x'), ['❌ -frames precisa ser um inteiro de 2 a 16.']);
        assert.deepEqual(await bot.replyAlt('/draw -ms 5000 x'), ['❌ -ms precisa ser um inteiro de 20 a 2000.']);
        assert.deepEqual(await bot.replyAlt('/draw -gif -f abc x'), ['❌ -frames precisa ser um inteiro de 2 a 16.']);
        assert.equal(imageCalls().length, beforeAlt);
    });

    test('-gif numa foto (respondida ou na legenda): edita e anima; o GIF vem como documento se o ffmpeg falhar', async () => {
        network.responder('post', 'api.openai.com/v1/images/edits', { data: [{ b64_json: GIF }] });
        const photo = bot.createMessage({ de: bot.OTHERAlt.jid, tipo: 'image', midia: { mimetype: 'image/jpeg', data: PNG_4X2 } });

        const animated = (await bot.executar('/draw -gif', { citada: photo })).at(-1);
        assert.equal(animated.options.sendVideoAsGif, true);
        const edit = imageCalls().at(-1);
        assert.equal(edit.url, 'https://api.openai.com/v1/images/edits');
        assert.equal(edit.cfg.body.get('output_format'), 'gif');
        assert.equal(edit.cfg.body.get('size'), '512x512');
        assert.equal(edit.cfg.body.get('prompt'), 'Anime esta imagem em um GIF. Com um movimento sutil e natural.');

        const captionAlt = bot.createMessage({ texto: '/draw -gif nadando', tipo: 'image', midia: { mimetype: 'image/png', data: PNG_4X2 } });
        await bot.deliver(captionAlt);
        assert.equal(imageCalls().at(-1).cfg.body.get('prompt'), 'Anime esta imagem em um GIF. nadando');

        processes.falhar = 'ffmpeg';
        try {
            const document = (await bot.executar('/draw -gif nadando', { citada: photo, erroEsperado: true })).at(-1);
            assert.equal(document.content.mimetype, 'image/gif');
            assert.equal(document.options.sendMediaAsDocument, true);
        } finally {
            processes.falhar = null;
        }
    });

    test('-m: o modelo da imagem e o do GIF (-gif -m); sem a lista da chave, só os atuais', async () => {
        network.responder('get', 'api.openai.com/v1/models', { data: [
            { id: 'gpt-4o' }, { id: 'gpt-image-2' }, { id: 'gpt-image-2.6-flare' }, { id: 'gpt-image-2.6-sunburst' }, { id: 'dall-e-3' }
        ] });

        assert.equal((await bot.replyAlt('/draw -m'))[0], [
            '🎨 *Modelos do /draw*',
            '',
            '*-img* (imagens) — /draw -m <modelo>',
            '✅ gpt-image-2',
            '▫️ dall-e-3',
            '▫️ gpt-image-2.6-flare',
            '▫️ gpt-image-2.6-sunburst',
            '',
            '*-gif* (GIF) — /draw -gif -m <modelo>',
            '✅ gpt-image-2.6-flare',
            '▫️ gpt-image-2',
            '▫️ gpt-image-2.6-sunburst',
            '',
            '💡 _A lista é a da sua chave (GET /v1/models)._'
        ].join('\n'));

        assert.deepEqual(await bot.replyAlt('/draw -m dall-e-3'), ['✅ Modelo do /draw: *dall-e-3*']);
        assert.deepEqual(await bot.replyAlt('/draw -gif -m gpt-image-2.6-sunburst'), ['✅ Modelo de GIF do /draw: *gpt-image-2.6-sunburst*']);
        assert.deepEqual([bot.getSetting('gpt.image.model'), bot.getSetting('gpt.image.gifModel')], ['dall-e-3', 'gpt-image-2.6-sunburst']);

        // What the key cannot see is not saved
        assert.deepEqual(await bot.replyAlt('/draw -m gpt-image-1'), [
            '❌ A sua chave não vê o modelo gpt-image-1 (imagens).\n💡 _Os que ela vê: dall-e-3, gpt-image-2, gpt-image-2.6-flare, gpt-image-2.6-sunburst_'
        ]);
        assert.equal(bot.getSetting('gpt.image.model'), 'dall-e-3');

        // Each command uses the model of its use
        await bot.executar('/draw um gato');
        assert.equal(imageCalls().at(-1).cfg.body.model, 'dall-e-3');
    });

    test('primeira palavra que parece opção e não existe: erro com a dica do -h, sem chamar a OpenAI', async () => {
        assert.deepEqual(await bot.replyAlt('/draw -gifs um gato'), ['❌ Opção desconhecida: -gifs\n💡 _Veja as opções com /draw -h|-help_']);
        assert.equal(imageCalls().length, 0);
    });

    test('só o dono e os admins; delegado a um usuário, ele desenha mas não troca o modelo', async () => {
        await bot.setSetting('bot.users', [bot.OTHERAlt.user]);
        assert.deepEqual(await bot.replyAlt('/draw um gato', { de: bot.OTHERAlt.jid }), []);

        await bot.setSetting('bot.users.cmds', [`${bot.OTHERAlt.user}=/draw`]);
        assert.equal((await bot.executar('/draw um gato', { de: bot.OTHERAlt.jid })).at(-1).content.data, 'UE5H');
        assert.deepEqual(await bot.replyAlt('/draw -m gpt-image-2', { de: bot.OTHERAlt.jid }),
            ['⛔ Apenas o dono do bot (ou um admin) pode usar o -model do /draw.']);
    });

    test('-status: o consumo no rodapé, numa mensagem à parte (a mídia não tem rodapé)', async () => {
        const replies = await bot.executar('/draw -s um gato');
        assert.equal(replies.at(-2).content.data, 'UE5H');
        assert.match(replies.at(-1).content ?? replies.at(-1), /^_📡 ⬆️ \d+ B TX · ⬇️ \d+ B RX/);
    });
});

describe('/tldr', () => {
    const { readPeriod } = bot.src('commands/tldr');
    beforeEach(() => bot.setSetting('gpt.status', false));

    // Messages received in the group, saved `minutos` minutes ago
    async function chat(linesAlt, minutes = 10) {
        for (const [i, [textAlt, de = bot.OTHERAlt.jid]] of linesAlt.entries()) {
            const msg = bot.createMessage({ texto: textAlt, de });
            await bot.deliver(msg);
            await bot.dbRun('UPDATE messages SET timestamp = ? WHERE id = ?', [Date.now() - minutes * 60_000 + i * 1000, msg.id.id]);
        }
    }

    beforeEach(async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        network.responder('post', 'api.openai.com', { choices: [{ message: { content: '• Combinaram o almoço de domingo.' } }] });
    });

    test('lerPeriodo: a duração do /cron (30m, 2h, 1d, 1h30m, 2d4h) ou a quantidade, com ou sem "-"', () => {
        assert.deepEqual(readPeriod('2h'), { ms: 2 * 3600_000 });
        assert.deepEqual(readPeriod('-30m'), { ms: 30 * 60_000 });
        assert.deepEqual(readPeriod('45min'), { ms: 45 * 60_000 });
        assert.deepEqual(readPeriod('1d'), { ms: 24 * 3600_000 });
        assert.deepEqual(readPeriod('-1h30m'), { ms: 90 * 60_000 });
        assert.deepEqual(readPeriod('2d4h'), { ms: (2 * 24 + 4) * 3600_000 });
        assert.deepEqual(readPeriod('1h 30m'), { ms: 90 * 60_000 });
        assert.deepEqual(readPeriod('-300'), { n: 300 });
        assert.deepEqual(readPeriod('30'), { n: 30 });
        assert.equal(readPeriod('0'), null);
        assert.equal(readPeriod('0h'), null);
        assert.equal(readPeriod('ontem'), null);
    });

    test('o aviso de processamento diz o que está sendo resumido (quantidade, janela de tempo ou desde a resposta)', async () => {
        await chat([['a'], ['b'], ['c'], ['d']], 30);
        // The notice becomes the summary (WhatsApp edits the message): its text is read when the OpenAI call goes out
        let visto = null;
        network.responder('post', 'api.openai.com', () => {
            visto = bot.client.enviadas.at(-1).content;
            return { choices: [{ message: { content: '• Resumo.' } }] };
        });
        const notice = async (commandAlt) => {
            await bot.executar(commandAlt);
            return visto;
        };

        assert.equal(await notice('/tldr'), '⏳ Processando o /tldr das últimas 4 mensagens de Família, aguarde.');
        assert.equal(await notice('/tldr 3'), '⏳ Processando o /tldr das últimas 3 mensagens de Família, aguarde.');
        assert.equal(await notice('/tldr 2h'), '⏳ Processando o /tldr das 4 mensagens de Família do período de 2 horas, aguarde.');
        assert.equal(await notice('/tldr 1d'), '⏳ Processando o /tldr das 4 mensagens de Família do período de 1 dia, aguarde.');
        assert.equal(await notice('/tldr 1h30m'), '⏳ Processando o /tldr das 4 mensagens de Família do período de 1 hora e 30 minutos, aguarde.');
        assert.equal(await notice('/tldr 30d'), '⏳ Processando o /tldr das 4 mensagens de Família do período de 2 dias e 20 horas, aguarde.');
    });

    test('opção desconhecida na 1ª palavra (/tldr -price): erro com a dica do -h, sem chamar a OpenAI; -2h continua valendo', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        assert.deepEqual(await bot.replyAlt('/tldr -price'), ['❌ Opção desconhecida: -price\n💡 _Veja as opções com /tldr -h|-help_']);
        assert.equal(network.chamadas.length, 0);
        assert.doesNotMatch((await bot.replyAlt('/tldr -2h'))[0], /Opção desconhecida/);
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

    test('respondendo uma mensagem: resume dela até agora; o período digitado ou o -c ganham', async () => {
        await chat([['velha 1'], ['velha 2'], ['velha 3']], 300);
        await chat([['nova 1'], ['nova 2'], ['nova 3']], 30);
        const quoted = bot.createMessage({ texto: 'onde parei', de: bot.OTHERAlt.jid, timestamp: Math.floor((Date.now() - 60 * 60_000) / 1000) });

        const [r] = await bot.replyAlt('/tldr', { citada: quoted });
        assert.match(r, /\(a partir da mensagem respondida\)/);
        const textAlt = network.chamadas.at(-1).cfg.body.messages[1].content;
        assert.doesNotMatch(textAlt, /velha/);
        assert.match(textAlt, /nova 1[\s\S]*nova 3/);

        // With a typed period, the replied one does not count
        await bot.replyAlt('/tldr 400m', { citada: quoted });
        assert.match(network.chamadas.at(-1).cfg.body.messages[1].content, /velha 1/);
    });

    test('período: 2h pega só as recentes; N limita a quantidade', async () => {
        await chat([['velha 1'], ['velha 2'], ['velha 3']], 300);
        await chat([['nova 1'], ['nova 2'], ['nova 3']], 30);

        await bot.replyAlt('/tldr 2h');
        assert.doesNotMatch(network.chamadas.at(-1).cfg.body.messages[1].content, /velha/);

        await bot.replyAlt('/tldr -4');
        const textAlt = network.chamadas.at(-1).cfg.body.messages[1].content;
        assert.match(textAlt, /\(4 mensagens\)/);
        assert.match(textAlt, /velha 3[\s\S]*nova 3/);
    });

    test('limites: tldr.maxMsgs e a janela de 68 h', async () => {
        await chat([['a'], ['b'], ['c']]);
        await bot.setSetting('tldr.maxMsgs', 10);
        assert.match((await bot.replyAlt('/tldr 50'))[0], /_\(limitado a 10 mensagens \(setting tldr\.maxMsgs\)\)_/);
        assert.match((await bot.replyAlt('/tldr 100h'))[0], /_\(as mensagens comuns ficam só 2 dias e 20 horas \(68 h\) no banco \(setting cache\.messageRetentionHours\)\)_/);
    });

    test('cache.messageRetentionHours maior: o /tldr alcança mais dias, até o novo limite', async () => {
        await chat([['de ontem 1'], ['de ontem 2'], ['de ontem 3']], 30 * 60);
        await chat([['agora 1'], ['agora 2'], ['agora 3']], 10);

        // Default (68 h): 30 h ago fits, but the 30d is cut
        assert.match((await bot.replyAlt('/tldr 30d'))[0], /ficam só 2 dias e 20 horas \(68 h\)/);

        await bot.setSetting('cache.messageRetentionHours', 720);
        const [r] = await bot.replyAlt('/tldr 30d');
        assert.doesNotMatch(r, /ficam só/);
        assert.match(network.chamadas.at(-1).cfg.body.messages[1].content, /de ontem 1[\s\S]*agora 3/);

        // And the new limit cuts what goes over it
        assert.match((await bot.replyAlt('/tldr 40d'))[0], /ficam só 30 dias \(720 h\)/);
        await assert.rejects(bot.setSetting('cache.messageRetentionHours', 12), /68/);
        await assert.rejects(bot.setSetting('cache.messageRetentionHours', 3000), /2160/);
    });

    test('-c pelo nome e -private', async () => {
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

        const r = await bot.executar('/tldr -c "rio trabalho" -private');
        assert.equal(r[0].texto, '🤖 Resumo enviado no seu privado.');
        assert.equal(r[1].chatId, bot.OWNER.jid);
        assert.match(r[1].texto, /🤖 \*Resumo de Trabalho Rio\*/);

        assert.match((await bot.replyAlt('/tldr -c xyz'))[0], /❌ Nenhum chat no cache casa com "xyz"/);

        // Like /show: /regex/ and @mention; more than one chat matches: lists and waits for the no.
        const r2 = await bot.executar('/tldr -c /rio$/ -private');
        assert.match(r2[1].texto, /🤖 \*Resumo de Trabalho Rio\*/);

        const OTHER_GROUP = '120363000000000003@g.us';
        bot.createGroup(OTHER_GROUP, 'Trabalho SP', [bot.OWNER.jid, bot.OTHERAlt.jid]);
        for (const textAlt of ['bom dia', 'oi', 'ok']) {
            await bot.deliver(bot.createMessage({ texto: textAlt, de: bot.OTHERAlt.jid, chat: OTHER_GROUP }));
        }
        const choosing = await bot.replyChoosing('/tldr -c trabalho -private', '2');
        assert.match(choosing[0], /🔎 "trabalho" corresponde a 2 chats/);
        assert.match(choosing.join('\n'), /🤖 \*Resumo de Trabalho (Rio|SP)\*/);
    });

    test('poucas mensagens, período inválido, sem chave e erro da OpenAI', async () => {
        assert.match((await bot.replyAlt('/tldr'))[0], /📝 Poucas mensagens para resumir \(0\) em Família/);
        assert.match((await bot.replyAlt('/tldr ontem'))[0], /Usage: \/tldr/);

        await chat([['a'], ['b'], ['c']]);
        network.responder('post', 'api.openai.com', errorHttp(429));
        assert.deepEqual(await bot.replyAlt('/tldr', { erroEsperado: true }), ['💸 Limite ou créditos da OpenAI esgotados. Tente mais tarde.']);

        await bot.setSetting('gpt.api.key', '');
        assert.match((await bot.replyAlt('/tldr'))[0], /⚠️ API key da OpenAI não encontrada: o \/tldr está desativado/);
    });
});

describe('/translate', () => {
    const translation = (text, iso = 'en') => ({ text, from: { language: { iso, didYouMean: false } } });
    const packageError = (statusText, status, nameAlt = 'Error') => {
        const err = new Error(statusText, { cause: { response: { status } } });
        err.name = nameAlt;
        return err;
    };

    test('traduz para o idioma padrão, sem chave nenhuma', async () => {
        network.responder('post', 'google-translate-api-x', translation('Olá, mundo!\nTudo bem?'));

        assert.deepEqual(await bot.replyAlt('/translate Hello, world!\nHow are you?'), ['🌐 *Tradução* _(en → pt)_\n\nOlá, mundo!\nTudo bem?']);
        const { texto: textAlt, to } = network.chamadas.at(-1).cfg.body;
        assert.deepEqual({ texto: textAlt, to }, { texto: 'Hello, world!\nHow are you?', to: 'pt' });
    });

    test('o pedido tem tempo limite (o fetch do pacote não tem)', async t => {
        network.responder('post', 'google-translate-api-x', translation('olá'));
        await bot.replyAlt('/translate hello');
        const { requestFunction } = network.chamadas.at(-1).cfg.body;

        const fetchFake = t.mock.method(globalThis, 'fetch', async () => ({ ok: true }));
        await requestFunction('https://translate.google.com/x', { method: 'POST' });
        const init = fetchFake.mock.calls[0].arguments[1];
        assert.equal(init.method, 'POST');
        assert.ok(init.signal instanceof AbortSignal);
    });

    test('-to (sem diferenciar maiúsculas), mensagem respondida e o setting translate.lang', async () => {
        network.responder('post', 'google-translate-api-x', translation('Good morning', 'pt'));

        await bot.replyAlt('/translate -to en bom dia');
        assert.equal(network.chamadas.at(-1).cfg.body.to, 'en');
        assert.equal(network.chamadas.at(-1).cfg.body.texto, 'bom dia');

        await bot.replyAlt('/translate -p ZH-cn bom dia');
        assert.equal(network.chamadas.at(-1).cfg.body.to, 'zh-CN');

        const quoted = bot.createMessage({ texto: 'buenos días', de: bot.OTHERAlt.jid });
        await bot.replyAlt('/translate -p fr', { citada: quoted });
        assert.equal(network.chamadas.at(-1).cfg.body.to, 'fr');
        assert.equal(network.chamadas.at(-1).cfg.body.texto, 'buenos días');

        await bot.setSetting('translate.lang', 'es');
        await bot.replyAlt('/translate oi');
        assert.equal(network.chamadas.at(-1).cfg.body.to, 'es');
    });

    test('texto já no idioma de destino ganha uma dica', async () => {
        network.responder('post', 'google-translate-api-x', translation('bom dia', 'pt'));
        assert.match((await bot.replyAlt('/translate bom dia'))[0], /_\(pt → pt\)_\n\nbom dia\n\n💡 _O texto já estava em pt/);
    });

    test('-l lista os idiomas (sem o auto), sem chamar a rede', async () => {
        const beforeAlt = network.chamadas.length;
        const [r] = await bot.replyAlt('/translate -l');
        assert.match(r, /🌐 \*Idiomas do \/translate\* \(5\)\n\n```en English\nes Spanish\nfr French\npt Portuguese\nzh-CN Chinese \(Simplified\)```/);
        assert.equal(network.chamadas.length, beforeAlt);
    });

    test('validações e erros do Google', async () => {
        assert.match((await bot.replyAlt('/translate'))[0], /Usage: \/translate/);
        assert.match((await bot.replyAlt('/translate -to português oi'))[0], /❌ Idioma inválido: português/);
        assert.match((await bot.replyAlt(`/translate ${'a'.repeat(5001)}`))[0], /❌ Texto grande demais: 5001 caracteres/);

        const cases = [
            [packageError('Too Many Requests', 429), /💸 O Google Translate limitou os pedidos deste servidor/],
            [packageError('Too Many Requests', undefined), /💸 O Google Translate limitou/],
            [packageError('Forbidden', 403), /⛔ O Google recusou o pedido deste servidor/],
            [packageError('The operation was aborted due to timeout', undefined, 'TimeoutError'), /⏱️ O Google Translate não respondeu/],
            [packageError('Bad Gateway', 502), /❌ Erro no \/translate: Bad Gateway/]
        ];
        for (const [errorAlt, expected] of cases) {
            network.responder('post', 'google-translate-api-x', errorAlt);
            assert.match((await bot.replyAlt('/translate hi', { erroEsperado: true }))[0], expected);
        }
    });

    test('qualquer pessoa usa (com o bot.users true)', async () => {
        network.responder('post', 'google-translate-api-x', translation('olá'));
        assert.match((await bot.replyAlt('/translate hello', { de: bot.OTHERAlt.jid }))[0], /olá/);
    });
});

describe('/giphy', () => {
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

        await bot.executar('/giphy gatos');
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
            const [r] = await bot.executar(`/giphy ${inputAlt}`);
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
        assert.deepEqual(await bot.replyAlt('/giphy'), ['❌ Nenhum GIF encontrado.']);
        network.responder('get', 'api.giphy.com', errorHttp(500));
        assert.deepEqual(await bot.replyAlt('/giphy', { erroEsperado: true }),
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

describe('/pixelart', () => {
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

        const [r] = await bot.executar('/pixelart');
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

describe('/joke', () => {
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
        for (let i = 0; i < JOKES.length * 10; i++) counted.push((await bot.replyAlt(i % 2 ? '/joke' : '/joke'))[0]);

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
