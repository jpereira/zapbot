/*
 * Comandos que consultam serviços externos (todos simulados):
 * /cve, /tempo, /news, /gpt, /tldr, /traduzir, /giphy, /meme, /joke, /kernel e /pixelart.
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
        const [frio] = await bot.responder('/t Curitiba');
        assert.match(frio, /🥶 Tá congelando!/);
        assert.match(frio, /📈 \*Máx:\* -  📉 \*Mín:\* -/);
    });

    // Previsão de N dias: daily com um item por dia
    const previsaoDias = (n) => ({
        ...previsao(24),
        daily: {
            time: Array.from({ length: n }, (_, i) => `2026-10-0${i + 1}`),
            weather_code: Array.from({ length: n }, (_, i) => [0, 63, 95][i % 3]),
            temperature_2m_max: Array.from({ length: n }, (_, i) => 30 + i),
            temperature_2m_min: Array.from({ length: n }, (_, i) => 20 + i),
            precipitation_probability_max: Array.from({ length: n }, (_, i) => i * 10)
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
        assert.match((await bot.responder('/tempo 8d Recife'))[0], /❌ Quantidade de dias inválida: 8\. Use de 1 a 7\./);
        assert.match((await bot.responder('/tempo 0'))[0], /Quantidade de dias inválida: 0/);
        assert.deepEqual(rede.chamadas, [], 'nem consulta a API');

        await bot.setSetting('tempo.maxDays', 16);
        rede.responder('get', 'geocoding-api.open-meteo.com', { results: [local] });
        rede.responder('get', 'api.open-meteo.com/v1/forecast', (url, cfg) => previsaoDias(cfg.params.forecast_days));
        assert.match((await bot.responder('/tempo 16'))[0], /Próximos 16 dias/);
        await assert.rejects(bot.setSetting('tempo.maxDays', 17), /entre 1 e 16/);
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
        assert.match(r, /^📝 \*Resumo de Família\*\n_3 mensagens · \d\d\/\d\d, \d\d:\d\d a \d\d\/\d\d, \d\d:\d\d_\n\n• Combinaram o almoço de domingo\.$/);

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
        assert.equal(r[0].texto, '📝 Resumo enviado no seu privado.');
        assert.equal(r[1].chatId, bot.DONO.jid);
        assert.match(r[1].texto, /📝 \*Resumo de Trabalho Rio\*/);

        assert.match((await bot.responder('/tldr -c xyz'))[0], /❌ Nenhum chat com mensagens guardadas tem "xyz" no nome/);
    });

    test('poucas mensagens, período inválido, sem chave e erro da OpenAI', async () => {
        assert.match((await bot.responder('/tldr'))[0], /📝 Poucas mensagens para resumir \(0\) em Família/);
        assert.match((await bot.responder('/tldr ontem'))[0], /Usage: \/tldr/);

        await conversa([['a'], ['b'], ['c']]);
        rede.responder('post', 'api.openai.com', erroHttp(429));
        assert.deepEqual(await bot.responder('/tldr', { erroEsperado: true }), ['💸 Limite ou créditos da OpenAI esgotados. Tente mais tarde.']);

        await bot.setSetting('openai.api.key', '');
        assert.match((await bot.responder('/tldr'))[0], /⚠️ API key da OpenAI não encontrada: o \/tldr está desativado/);
    });
});

describe('/traduzir (/tr, /translate)', () => {
    const traducao = (translatedText, detectedSourceLanguage = 'en') =>
        ({ data: { translations: [{ translatedText, detectedSourceLanguage }] } });

    test('sem chave: desativado, com o link do passo a passo', async () => {
        assert.match((await bot.responder('/traduzir hello'))[0], /⚠️ Chave do Google Translate não encontrada[\s\S]*comandos\/traduzir/);
    });

    test('traduz para o idioma padrão; a chave vai no header, nunca na URL', async () => {
        await bot.setSetting('traduzir.api.key', 'AIza-teste');
        rede.responder('post', 'translation.googleapis.com/language/translate/v2', traducao('Olá, mundo!\nTudo bem?'));

        assert.deepEqual(await bot.responder('/traduzir Hello, world!\nHow are you?'), ['🌐 *Tradução* _(en → pt)_\n\nOlá, mundo!\nTudo bem?']);

        const { url, cfg } = rede.chamadas.at(-1);
        assert.doesNotMatch(url, /AIza/);
        assert.equal(cfg.headers['X-Goog-Api-Key'], 'AIza-teste');
        assert.deepEqual(cfg.body, { q: 'Hello, world!\nHow are you?', target: 'pt', format: 'text' });
    });

    test('-para, mensagem respondida, setting traduzir.lang e o .env vencendo o setting', async () => {
        await bot.setSetting('traduzir.api.key', 'do-setting');
        rede.responder('post', 'translation.googleapis.com', traducao('Good morning', 'pt'));

        await bot.responder('/tr -para en bom dia');
        assert.deepEqual(rede.chamadas.at(-1).cfg.body, { q: 'bom dia', target: 'en', format: 'text' });

        const citada = bot.criarMensagem({ texto: 'buenos días', de: bot.OUTRO.jid });
        await bot.responder('/translate -p fr', { citada });
        assert.deepEqual(rede.chamadas.at(-1).cfg.body, { q: 'buenos días', target: 'fr', format: 'text' });

        await bot.setSetting('traduzir.lang', 'es');
        process.env.GOOGLE_TRANSLATE_API_KEY = 'do-env';
        try {
            await bot.responder('/traduzir oi');
            assert.equal(rede.chamadas.at(-1).cfg.body.target, 'es');
            assert.equal(rede.chamadas.at(-1).cfg.headers['X-Goog-Api-Key'], 'do-env');
        } finally {
            delete process.env.GOOGLE_TRANSLATE_API_KEY;
        }
    });

    test('texto já no idioma de destino ganha uma dica', async () => {
        await bot.setSetting('traduzir.api.key', 'k');
        rede.responder('post', 'translation.googleapis.com', traducao('bom dia', 'pt'));
        assert.match((await bot.responder('/traduzir bom dia'))[0], /_\(pt → pt\)_\n\nbom dia\n\n💡 _O texto já estava em pt/);
    });

    test('-l lista os idiomas', async () => {
        await bot.setSetting('traduzir.api.key', 'k');
        rede.responder('get', 'translation.googleapis.com/language/translate/v2/languages',
            { data: { languages: [{ language: 'en', name: 'Inglês' }, { language: 'es', name: 'Espanhol' }] } });

        const [r] = await bot.responder('/traduzir -l');
        assert.match(r, /🌐 \*Idiomas do \/traduzir\* \(2\)\n\n```en Inglês\nes Espanhol```/);
        assert.deepEqual(rede.chamadas.at(-1).cfg.params, { target: 'pt' });
    });

    test('validações e erros do Google', async () => {
        await bot.setSetting('traduzir.api.key', 'k');
        assert.match((await bot.responder('/traduzir'))[0], /Usage: \/traduzir/);
        assert.match((await bot.responder('/traduzir -para português oi'))[0], /❌ Idioma inválido: português/);
        assert.match((await bot.responder(`/traduzir ${'a'.repeat(5001)}`))[0], /❌ Texto grande demais: 5001 caracteres/);

        const erroGoogle = (status, reason, message = 'x') =>
            erroHttp(status, 'falhou', { data: { error: { message, details: [{ reason }] } } });
        const casos = [
            [erroGoogle(400, 'API_KEY_INVALID'), /🔑 Chave do Google Translate inválida/],
            [erroGoogle(403, 'SERVICE_DISABLED'), /A Cloud Translation API não está ativada/],
            [erroGoogle(403, 'BILLING_DISABLED'), /💳 O projeto da chave está sem faturamento/],
            [erroGoogle(429, 'RATE_LIMIT_EXCEEDED'), /💸 Cota do Google Translate esgotada/],
            [erroGoogle(400, 'badRequest', 'Invalid Value'), /❌ Idioma inválido: pt\. Veja os aceitos/]
        ];
        for (const [erro, esperado] of casos) {
            rede.responder('post', 'translation.googleapis.com', erro);
            assert.match((await bot.responder('/traduzir hi', { erroEsperado: true }))[0], esperado);
        }
    });

    test('qualquer pessoa usa (com o modo admin desligado)', async () => {
        await bot.setSetting('traduzir.api.key', 'k');
        rede.responder('post', 'translation.googleapis.com', traducao('olá'));
        assert.match((await bot.responder('/tr hello', { de: bot.OUTRO.jid }))[0], /olá/);
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

    test('nenhum GIF; GIPHY fora do ar', async () => {
        await bot.setSetting('giphy.api.key', 'giphy');
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
