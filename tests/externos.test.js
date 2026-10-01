/*
 * Comandos que consultam serviços externos (todos simulados):
 * /cve, /tempo, /news, /gpt, /gif, /meme, /joke e /kernel.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { MessageMedia, erroHttp, rede } = bot;

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
        rede.responder('get', 'services.nvd.nist.gov', (url, cfg) => cfg.params.startIndex === undefined
            ? { totalResults: lista.length }
            : { vulnerabilities: lista.slice(cfg.params.startIndex, cfg.params.startIndex + cfg.params.resultsPerPage) });
    }

    test('as mais recentes primeiro, com nota e link', async () => {
        simularNvd([cve('CVE-1', 5.0), cve('CVE-2', null), cve('CVE-3', 9.8, 'CRITICAL')]);
        const [r] = await bot.responder('/cve 2');
        assert.match(r, /🛡️ \*Últimas 2 CVEs publicadas\* _\(últimos 2 dias\)_/);
        assert.match(r, /\*CVE-3\* — 9\.8 CRITICAL[\s\S]*https:\/\/nvd\.nist\.gov\/vuln\/detail\/CVE-3[\s\S]*\*CVE-2\*\n/);
        assert.doesNotMatch(r, /CVE-1/);
    });

    test('sem N usa o cve.max; N fora do limite é recusado', async () => {
        simularNvd(Array.from({ length: 15 }, (_, i) => cve(`CVE-${i}`, 7)));
        await bot.setSetting('cve.max', 3);
        assert.match((await bot.responder('/cve'))[0], /Últimas 3 CVEs/);
        assert.match((await bot.responder('/cve 21'))[0], /❌ Quantidade inválida: 21\. Use de 1 a 20/);
        assert.match((await bot.responder('/cve abc'))[0], /❌ Quantidade inválida: abc/);
    });

    test('-highscore / -high: só críticas, na janela do cve.maxDays', async () => {
        simularNvd([cve('CVE-9', 9.9, 'CRITICAL')]);
        const [r] = await bot.responder('/cve -high 1');
        assert.match(r, /🔥 \*1 CVEs críticas mais recentes\* _\(CVSS ≥ 9, últimos 7 dias\)_/);
        const params = rede.chamadas.at(-1).cfg.params;
        assert.equal(params.cvssV3Severity, 'CRITICAL');
        assert.equal(params.resultsPerPage, 1);
    });

    test('nenhuma publicada; NVD fora do ar', async () => {
        simularNvd([]);
        assert.deepEqual(await bot.responder('/cve'), ['🛡️ Nenhuma CVE publicada no últimos 2 dias.']);
        rede.responder('get', 'services.nvd.nist.gov', erroHttp(503));
        assert.match((await bot.responder('/cve', { erroEsperado: true }))[0], /❌ Não consegui consultar o NVD agora/);
    });
});

describe('/tempo (/weather)', () => {
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
        assert.match((await bot.responder('/news'))[0], /Usage: \/news/);
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
        assert.deepEqual(await bot.responder('/ai resuma', { citada }), ['Resposta!']);

        const { cfg } = rede.chamadas.at(-1);
        assert.equal(cfg.headers.Authorization, 'Bearer sk-teste');
        assert.equal(cfg.body.messages[1].content, 'texto citado\n\nresuma');
        assert.equal(cfg.timeout, 60000);
        assert.equal(bot.client.chats.get(bot.GRUPO).digitando, 1);
    });

    test('.env vence o setting; resposta começando com "/" ganha um 🤖', async () => {
        process.env.OPENAI_API_KEY = 'sk-env';
        try {
            rede.responder('post', 'api.openai.com', { choices: [{ message: { content: '/cache -c -f' } }] });
            assert.deepEqual(await bot.responder('/gpt diga um comando'), ['🤖 /cache -c -f']);
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

    test('-m sem modelo: o atual e a lista dos aceitos', async () => {
        const [r] = await bot.responder('/gpt -m');
        assert.match(r, /🤖 \*Modelo do \/gpt:\* gpt-4o-mini\n/);
        assert.match(r, /✅ gpt-4o-mini/);
        assert.match(r, /▫️ gpt-6-astra/);
        assert.doesNotMatch(r, /do OPENAI_MODEL/);
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
            assert.match((await bot.responder('/gpt -m'))[0], /Modelo do \/gpt:\* gpt-4\.1 _\(do OPENAI_MODEL no \.env\)_/);
            assert.match((await bot.responder('/gpt -m gpt-6-luna'))[0], /✅ Modelo do \/gpt: \*gpt-6-luna\*\n⚠️ _O OPENAI_MODEL do \.env \(gpt-4\.1\) tem prioridade/);
        } finally {
            delete process.env.OPENAI_MODEL;
        }
    });

    test('sem pergunta mostra a sintaxe', async () => {
        await bot.setSetting('openai.api.key', 'sk-teste');
        assert.match((await bot.responder('/gpt'))[0], /Usage: \/gpt/);
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

describe('/gif', () => {
    test('sem chave', async () => {
        assert.match((await bot.responder('/gif'))[0], /⚠️ Chave do GIPHY não configurada/);
    });

    test('tag padrão (gif.tag) ou informada; envia como GIF', async () => {
        await bot.setSetting('gif.giphy.api.key', 'giphy');
        rede.responder('get', 'api.giphy.com', { data: { images: { original: { mp4: 'https://media.giphy.com/x.mp4' } } } });
        rede.responder('get', 'https://media.giphy.com/', Buffer.from('mp4'));

        const [r] = await bot.executar('/gif');
        assert.equal(rede.chamadas[0].cfg.params.tag, 'fail');
        assert.ok(r.content instanceof MessageMedia);
        assert.equal(r.content.mimetype, 'video/mp4');
        assert.equal(r.options.sendVideoAsGif, true);

        await bot.executar('/gif gatos');
        assert.equal(rede.chamadas.at(-2).cfg.params.tag, 'gatos');
    });

    test('nenhum GIF; GIPHY fora do ar', async () => {
        await bot.setSetting('gif.giphy.api.key', 'giphy');
        rede.responder('get', 'api.giphy.com', { data: {} });
        assert.deepEqual(await bot.responder('/gif'), ['❌ Nenhum GIF encontrado.']);
        rede.responder('get', 'api.giphy.com', erroHttp(500));
        assert.deepEqual(await bot.responder('/gif', { erroEsperado: true }), ['❌ Não consegui buscar um GIF agora.']);
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

describe('/joke (/piada, /humor)', () => {
    test('piada de uma parte e de duas partes', async () => {
        rede.responder('get', 'jokeapi.dev', { type: 'single', joke: 'Uma piada.' });
        assert.deepEqual(await bot.responder('/joke'), ['Uma piada.']);
        assert.equal(rede.chamadas[0].cfg.params.lang, 'pt');

        rede.responder('get', 'jokeapi.dev', { type: 'twopart', setup: 'Pergunta?', delivery: 'Resposta' });
        assert.deepEqual(await bot.responder('/piada'), ['Pergunta?\n\n... Resposta 🥁']);
    });

    test('erro da API', async () => {
        rede.responder('get', 'jokeapi.dev', { error: true, message: 'sem piadas' });
        assert.deepEqual(await bot.responder('/humor', { erroEsperado: true }), ['❌ Não consegui buscar uma piada agora.']);
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
