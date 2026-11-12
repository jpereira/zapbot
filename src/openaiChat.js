/*
 * Chamada ao chat da OpenAI, compartilhada pelo /gpt e pelo /tldr.
 */

const { AsyncLocalStorage } = require('node:async_hooks');

const axios = require('axios');

const { t } = require('./i18n');
const { printError, printInfo } = require('./log');
const { envOuSetting, getSetting, setSetting } = require('./settings');
const { paraWhatsapp } = require('./util/whatsapp');

/*
 * Chave, modelo e timeout vêm do config/.env (OPENAI_API_KEY, OPENAI_MODEL,
 * OPENAI_TIMEOUT_MS) ou, na falta deles, dos settings 'openai.api.key',
 * 'openai.api.model' e 'openai.timeout.ms'. A chave nunca é logada nem
 * ecoada: o erro devolvido é só a mensagem da API.
 */
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_TRANSCRICAO_URL = 'https://api.openai.com/v1/audio/transcriptions';
const OPENAI_VOZ_URL = 'https://api.openai.com/v1/audio/speech';
const OPENAI_BASE = 'https://api.openai.com/v1';
const OPENAI_PRECOS_URL = 'https://developers.openai.com/api/docs/pricing';
const OPENAI_IMAGEM_URL = `${OPENAI_BASE}/images/generations`;
const OPENAI_IMAGEM_EDICAO_URL = `${OPENAI_BASE}/images/edits`;

const chaveOpenAi = () => envOuSetting('OPENAI_API_KEY', 'openai.api.key');

// A chave de admin (sk-admin-...), só do /gpt -usage: a Usage API não aceita a chave normal
const chaveAdminOpenAi = () => envOuSetting('OPENAI_ADMIN_KEY', 'openai.admin.key');

const SEM_CHAVE = (cmd) => t('openai.noKey', { cmd });

// Erro da OpenAI → mensagem para o chat (nunca contém a chave)
function erroOpenAi(err, cmd) {
    const timeout = envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms');

    if (err.code === 'ECONNABORTED') return t('openai.timeout', { s: timeout / 1000 });
    if (err.response?.status === 401) return t('openai.badKey');
    if (err.response?.status === 429) return t('openai.quota');
    return t('openai.error', { cmd, erro: err.response?.data?.error?.message || err.message });
}

/*
 * Consumo da execução de um comando (/gpt, /tldr): bytes enviados (TX) e recebidos (RX) nas chamadas à
 * OpenAI e os tokens que ela contou. Os bytes são os do corpo (o JSON, o áudio...), sem cabeçalhos nem TLS.
 * Cada comando roda dentro de medirConsumo(); fora dele, nada é contado.
 */
const consumoAtual = new AsyncLocalStorage();

/**
 * Roda fn medindo o consumo das chamadas à OpenAI feitas dentro dela.
 * @param {boolean} ligado  mostra o status no rodapé (-status ou o setting openai.status)
 */
function medirConsumo(ligado, fn) {
    const consumo = { ligado: ligado || getSetting('openai.status'), custo: 0, semPreco: false, chamadas: 0, tx: 0, rx: 0, entrada: 0, saida: 0, total: 0 };
    return consumoAtual.run(consumo, fn);
}

const bytesDe = (corpo) => {
    if (corpo == null) return 0;
    if (Buffer.isBuffer(corpo) || corpo instanceof ArrayBuffer || ArrayBuffer.isView(corpo)) return corpo.byteLength;
    if (typeof corpo === 'string') return Buffer.byteLength(corpo);
    if (typeof FormData !== 'undefined' && corpo instanceof FormData) {
        let soma = 0;
        for (const [campo, valor] of corpo.entries()) soma += Buffer.byteLength(campo) + (typeof valor === 'string' ? Buffer.byteLength(valor) : valor.size);
        return soma;
    }
    return Buffer.byteLength(JSON.stringify(corpo));
};

/** Soma uma chamada ao consumo do comando: o corpo enviado, o recebido e o "usage" da resposta, se houver. */
function contar(enviado, recebido, usage = null, modelo = null) {
    const c = consumoAtual.getStore();
    if (!c) return;
    c.chamadas++;
    c.tx += bytesDe(enviado);
    c.rx += bytesDe(recebido);
    const entrada = usage?.prompt_tokens ?? usage?.input_tokens ?? 0;
    const saida = usage?.completion_tokens ?? usage?.output_tokens ?? 0;
    c.entrada += entrada;
    c.saida += saida;
    c.total += usage?.total_tokens ?? entrada + saida;

    // O custo é uma estimativa (tokens × preço do openai.pricing); sem preço, o da chamada é desconhecido
    const preco = entrada || saida ? precoDoModelo(modelo) : null;
    if (preco) {
        const custo = (entrada * preco.entrada + saida * preco.saida) / 1e6;
        c.custo += custo;
        gastoDesdeALeitura += custo;
    } else {
        c.semPreco = true;
    }
}

/*
 * O preço por 1M de tokens do modelo (setting openai.pricing, "modelo=entrada/saida" em dólares). Vale o
 * modelo exato ou, na falta, o de nome mais longo que é prefixo (gpt-4o-mini-2024-07-18 → gpt-4o-mini).
 */
function precoDoModelo(modelo) {
    if (!modelo) return null;
    let melhor = null;
    for (const item of getSetting('openai.pricing')) {
        const [nome, preco] = item.split('=');
        if (!modelo.startsWith(nome) || (melhor && melhor.nome.length >= nome.length)) continue;
        const [entrada, saida] = preco.split('/').map(Number);
        melhor = { nome, entrada, saida };
    }
    return melhor;
}

/**
 * Lê a tabela de preços do site da OpenAI (a Standard, a primeira da página: o resto é Batch, Flex e
 * Priority) e devolve o preço por 1M de tokens (entrada/saída) de cada modelo gpt-*. A página embute a
 * tabela em JSON, uma linha por modelo: [nome, entrada, cache, ..., saída]. Ficam de fora os modelos
 * que não são de texto (áudio, imagem, voz, busca), os "pro" e os com data (fine-tuning).
 * @returns {Promise<Map<string, string>>}  modelo → "entrada/saida"
 */
async function buscarPrecos({ cmd }) {
    let html;
    try {
        ({ data: html } = await axios.get(OPENAI_PRECOS_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0 (zapbot)' },
            timeout: envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms'),
            responseType: 'text'
        }));
    } catch (err) {
        logarErro(cmd, err);
        throw err;
    }

    const texto = String(html).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const precos = new Map();
    for (const [, bruto, colunas] of texto.matchAll(/\[0,"(gpt-[^"]+)"\]((?:,\[0,(?:[\d.]+|"-")\])+)\]/g)) {
        const modelo = bruto.replace(/\s*\(.*\)$/, '');
        if (precos.has(modelo) || /realtime|audio|transcribe|image|tts|search|codex|pro$|-\d{4}-\d{2}-\d{2}$/.test(modelo)) continue;

        const valores = [...colunas.matchAll(/\[0,([\d.]+|"-")\]/g)].map(m => m[1]);
        const entrada = Number(valores[0]);
        const saida = Number(valores.at(-1));
        if (valores.length < 2 || !Number.isFinite(entrada) || !Number.isFinite(saida)) continue;
        precos.set(modelo, `${entrada}/${saida}`);
    }
    return precos;
}

/**
 * Busca os preços no site e atualiza o setting openai.pricing: os modelos da página entram ou são
 * corrigidos; os que a página não tem (os que você adicionou) ficam como estão.
 * @returns {Promise<{ novos: string[], mudados: { modelo: string, antes: string, depois: string }[], iguais: number }>}
 */
async function atualizarPrecos({ cmd }) {
    const encontrados = await buscarPrecos({ cmd });
    if (!encontrados.size) throw new Error(t('openai.pricesNotFound'));

    const atuais = new Map(getSetting('openai.pricing').map(item => item.split('=')));
    const novos = [];
    const mudados = [];
    let iguais = 0;
    for (const [modelo, preco] of encontrados) {
        if (!atuais.has(modelo)) novos.push(modelo);
        else if (atuais.get(modelo) !== preco) mudados.push({ modelo, antes: atuais.get(modelo), depois: preco });
        else iguais++;
        atuais.set(modelo, preco);
    }

    if (novos.length || mudados.length) {
        await setSetting('openai.pricing', [...atuais].map(([modelo, preco]) => `${modelo}=${preco}`).join(' '));
    }
    await setSetting('openai.pricing.updated', new Date().toISOString().slice(0, 10));
    return { novos, mudados, iguais };
}

/*
 * Atualização automática dos preços: com a chave da OpenAI configurada e o openai.pricing.auto ligado,
 * lê a tabela do site a cada PRECOS_INTERVALO_DIAS. Falhou (site fora, formato novo): tenta de novo
 * depois de PRECOS_RETRY_MS, sem mexer no que já está gravado.
 */
const PRECOS_INTERVALO_DIAS = 15;
const PRECOS_AVISO_DIAS = 30;
const PRECOS_RETRY_MS = 6 * 60 * 60 * 1000;
let proximaTentativaDePrecos = 0;

// Há quantos dias foi a última atualização do openai.pricing (Infinity: nunca)
function idadeDosPrecos(agora = Date.now()) {
    const data = getSetting('openai.pricing.updated');
    return data ? Math.floor((agora - Date.parse(data)) / 86400000) : Infinity;
}

async function atualizarPrecosSeVencidos(agora = Date.now()) {
    if (!getSetting('openai.pricing.auto') || !chaveOpenAi()) return null;
    if (agora < proximaTentativaDePrecos || idadeDosPrecos(agora) < PRECOS_INTERVALO_DIAS) return null;

    try {
        const r = await atualizarPrecos({ cmd: '/gpt' });
        printInfo(`openai.pricing atualizado: ${r.mudados.length} alterados, ${r.novos.length} novos`);
        return r;
    } catch (err) {
        proximaTentativaDePrecos = agora + PRECOS_RETRY_MS;
        printError('Atualização automática dos preços da OpenAI falhou:', err.message);
        return null;
    }
}

// Chamada no app.js: uma verificação logo depois de subir e outra a cada 6 horas
function iniciarPrecosAutomaticos() {
    setTimeout(() => atualizarPrecosSeVencidos(), 60 * 1000).unref();
    setInterval(() => atualizarPrecosSeVencidos(), PRECOS_RETRY_MS).unref();
}

/*
 * O saldo estimado: openai.credit.total menos o gasto da Costs API (chave de admin, lida de tempos em
 * tempos, pois ela atrasa) menos a estimativa das chamadas feitas depois da leitura.
 */
const LEITURA_VALIDADE_MS = 5 * 60 * 1000;
let leituraDoGasto = null;      // { usado, quando } ou { falhou: true, quando }
let gastoDesdeALeitura = 0;     // a estimativa das chamadas desde a leitura

async function saldoEstimado(c) {
    const total = getSetting('openai.credit.total');
    if (!total || !chaveAdminOpenAi()) return null;

    if (!leituraDoGasto || Date.now() - leituraDoGasto.quando > LEITURA_VALIDADE_MS) {
        const desdeData = getSetting('openai.credit.since');
        const desde = desdeData ? Math.floor(Date.parse(desdeData) / 1000) : Math.floor(Date.now() / 1000) - 180 * 86400;
        try {
            const lidos = await consultarCustos({ cmd: '/gpt', desde });
            const usado = lidos.reduce((t, b) => t + (b.results ?? []).reduce((s, r) => s + Number(r.amount?.value ?? 0), 0), 0);
            leituraDoGasto = { usado, quando: Date.now() };
            gastoDesdeALeitura = c.custo; // a Costs API atrasa: esta chamada ainda não está no gasto lido
        } catch {
            leituraDoGasto = { falhou: true, quando: Date.now() };
        }
    }
    return leituraDoGasto.falhou ? null : { restante: total - leituraDoGasto.usado - gastoDesdeALeitura, total };
}

const tamanho = (n) => n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;

const dolar = (n) => {
    const v = Math.abs(n);
    return (n < 0 ? '-' : '') + `$${v.toFixed(v < 0.01 ? 6 : 2)}`;
};

/** O rodapé da resposta ("\n\n_📡 ..._"); vazio com o status desligado ou sem chamada à OpenAI */
async function rodapeDeConsumo() {
    const c = consumoAtual.getStore();
    if (!c?.ligado || !c.chamadas) return '';
    const tokens = c.total ? ` · 🪙 ${c.total} tokens (📥 ${c.entrada} · 📤 ${c.saida})` : '';
    const linhas = [`📡 ⬆️ ${tamanho(c.tx)} TX · ⬇️ ${tamanho(c.rx)} RX${tokens}` +
        `${c.chamadas > 1 ? t('openai.calls', { n: c.chamadas }) : ''}`];

    // O ~ marca que o valor é estimado
    const saldo = await saldoEstimado(c);
    linhas.push(`💵 ${c.semPreco ? t('openai.noPrice') : `~${dolar(c.custo)}`}` +
        (saldo ? t('openai.balance', { restante: dolar(saldo.restante), total: dolar(saldo.total) }) : ''));
    const idade = idadeDosPrecos();
    if (Number.isFinite(idade) && idade > PRECOS_AVISO_DIAS) linhas.push(t('openai.oldPrices', { dias: idade }));
    return `\n\n${linhas.map(l => `_${l}_`).join('\n')}`;
}

/**
 * Manda as instruções e o texto para o chat da OpenAI e devolve a resposta.
 * Em erro, registra no log (sem a chave) e lança o erro do axios.
 * @param {object} o
 * @param {string} o.cmd        comando que chamou (para o log)
 * @param {string} o.sistema    instruções (role "system")
 * @param {string} o.texto      pergunta ou conteúdo (role "user")
 * @param {{ mimetype: string, data: string }} [o.imagem]  uma imagem (base64) que vai junto da pergunta
 * @returns {Promise<string>}
 */
async function perguntarAoChat({ cmd, sistema, texto, imagem = null }) {
    // Com imagem, o conteúdo vira a lista de partes (texto + imagem em data URL)
    const conteudo = imagem
        ? [
            { type: 'text', text: texto },
            { type: 'image_url', image_url: { url: `data:${imagem.mimetype};base64,${imagem.data}` } }
        ]
        : texto;

    try {
        const corpo = {
            model: envOuSetting('OPENAI_MODEL', 'openai.api.model'),
            messages: [
                { role: 'system', content: sistema },
                { role: 'user', content: conteudo }
            ]
        };
        const { data } = await axios.post(OPENAI_URL, corpo, {
            headers: { Authorization: `Bearer ${chaveOpenAi()}` },
            timeout: envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms')
        });

        contar(corpo, data, data?.usage, corpo.model);

        // O ChatGPT escreve em Markdown; o WhatsApp tem outra formatação (veja util/whatsapp.js)
        return paraWhatsapp(data.choices?.[0]?.message?.content) || '(resposta vazia)';
    } catch (err) {
        // No 401 a mensagem da OpenAI traz um pedaço da chave: não vai para o log
        const status = err.response?.status;
        printError(`${cmd}:`, status ?? '', status === 401 ? 'API key inválida' : err.response?.data?.error?.message || err.message);
        throw err;
    }
}

/**
 * Transcreve um áudio (POST /v1/audio/transcriptions, multipart), no idioma que a OpenAI detectar.
 * Em erro, registra no log (sem a chave) e lança o erro do axios.
 * @param {object} o
 * @param {string} o.cmd  comando que chamou (para o log)
 * @param {{ arquivo: string, mimetype: string, data: string }} o.audio  o áudio em base64; o nome
 *   do arquivo (com a extensão certa) é o que a OpenAI usa para saber o formato
 * @returns {Promise<string>}  o texto (vazio se não houver fala)
 */
async function transcreverAudio({ cmd, audio }) {
    const form = new FormData();
    form.append('file', new Blob([Buffer.from(audio.data, 'base64')], { type: audio.mimetype }), audio.arquivo);
    form.append('model', getSetting('openai.transcribe.model'));

    try {
        const { data } = await axios.post(OPENAI_TRANSCRICAO_URL, form, {
            headers: { Authorization: `Bearer ${chaveOpenAi()}` },
            timeout: envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms'),
            maxBodyLength: Infinity
        });
        contar(form, data, data?.usage, form.get('model'));
        return String(data?.text ?? '').trim();
    } catch (err) {
        logarErro(cmd, err);
        throw err;
    }
}

// O teto do texto da API de voz
const VOZ_MAX_CARACTERES = 4096;

/**
 * Gera a voz de um texto (POST /v1/audio/speech) em Ogg/Opus, o formato da nota de voz do WhatsApp.
 * Em erro, registra no log (sem a chave) e lança o erro do axios.
 * @param {object} o
 * @param {string} o.cmd    comando que chamou (para o log)
 * @param {string} o.texto  até VOZ_MAX_CARACTERES
 * @param {string} [o.estilo]  como falar (sobrepõe o setting openai.tts.instructions)
 * @returns {Promise<Buffer>}
 */
async function sintetizarVoz({ cmd, texto, estilo = null }) {
    const modelo = getSetting('openai.tts.model');

    try {
        const corpo = {
            model: modelo,
            voice: getSetting('openai.tts.voice'),
            input: texto,
            response_format: 'opus',
            // Só o gpt-4o-mini-tts segue o estilo; o tts-1 e o tts-1-hd recusam o campo
            ...(modelo.startsWith('gpt-4o') ? { instructions: estilo || getSetting('openai.tts.instructions') } : {})
        };
        const { data } = await axios.post(OPENAI_VOZ_URL, corpo, {
            headers: { Authorization: `Bearer ${chaveOpenAi()}` },
            timeout: envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms'),
            responseType: 'arraybuffer'
        });
        contar(corpo, data, null, modelo);
        return Buffer.from(data);
    } catch (err) {
        // Com responseType arraybuffer, o corpo do erro (JSON) também vem em bytes
        if (Buffer.isBuffer(err.response?.data)) {
            try {
                err.response.data = JSON.parse(err.response.data.toString('utf8'));
            } catch { /* corpo que não é JSON: fica a mensagem do axios */ }
        }
        logarErro(cmd, err);
        throw err;
    }
}

const GIF_TAMANHO = '512x512';
const TIMEOUT_IMAGEM_MS = 3 * 60 * 1000;
const TIMEOUT_GIF_MS = 5 * 60 * 1000;

/**
 * Gera uma imagem (v1/images/generations) ou, com `imagem`, edita a que veio (v1/images/edits). Com
 * `gif`, o resultado é um GIF animado (output_format gif, só nos modelos gpt-image-2.6-*).
 * @param {object} o
 * @param {string} o.cmd     comando que chamou (para o log)
 * @param {string} o.prompt  o que gerar ou mudar
 * @param {Buffer} [o.imagem]  a imagem a editar, em PNG
 * @param {{ frames: number, frameMs: number }} [o.gif]  pede o GIF, com os quadros e a duração de cada um
 * @returns {Promise<string>}  a imagem (PNG) ou o GIF, em base64
 */
async function gerarImagem({ cmd, prompt, imagem = null, gif = null }) {
    // O GIF tem o seu modelo (só os gpt-image-2.6-* fazem) e os quadros saem em 512x512: a OpenAI cobra os
    // pixels de todos eles
    const modelo = getSetting(gif ? 'openai.image.gifModel' : 'openai.image.model');
    const extras = gif
        ? { size: GIF_TAMANHO, output_format: 'gif', frame_count: gif.frames, frame_duration_ms: gif.frameMs }
        : {};
    const config = {
        headers: { Authorization: `Bearer ${chaveOpenAi()}` },
        // Uma imagem leva bem mais que uma resposta de texto: no mínimo 3 minutos (o GIF, 5)
        timeout: Math.max(envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms'), gif ? TIMEOUT_GIF_MS : TIMEOUT_IMAGEM_MS)
    };

    try {
        let resposta;
        let enviado;
        if (imagem) {
            const form = new FormData();
            form.append('model', modelo);
            form.append('prompt', prompt);
            for (const [campo, valor] of Object.entries(extras)) form.append(campo, String(valor));
            form.append('image', new Blob([imagem], { type: 'image/png' }), 'imagem.png');
            enviado = form;
            resposta = await axios.post(OPENAI_IMAGEM_EDICAO_URL, form, { ...config, maxBodyLength: Infinity });
        } else {
            enviado = { model: modelo, prompt, n: 1, ...extras };
            resposta = await axios.post(OPENAI_IMAGEM_URL, enviado, config);
        }
        contar(enviado, resposta.data, resposta.data?.usage, modelo);

        const b64 = resposta.data?.data?.[0]?.b64_json;
        if (!b64) throw new Error(t('openai.noImage'));
        return b64;
    } catch (err) {
        logarErro(cmd, err);
        throw err;
    }
}

/**
 * Os modelos que a chave enxerga (GET /v1/models), em ordem alfabética: para dizer qual usar quando o
 * configurado não existe na conta.
 * @returns {Promise<string[]>}
 */
async function listarModelos({ cmd }) {
    try {
        const { data } = await axios.get(`${OPENAI_BASE}/models`, {
            headers: { Authorization: `Bearer ${chaveOpenAi()}` },
            timeout: envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms')
        });
        return (data?.data ?? []).map(m => m.id).filter(Boolean).sort();
    } catch (err) {
        logarErro(cmd, err);
        throw err;
    }
}

// Erro da OpenAI no log, sem a chave (no 401 a mensagem traz um pedaço dela)
function logarErro(cmd, err) {
    const status = err.response?.status;
    printError(`${cmd}:`, status ?? '', status === 401 ? 'API key inválida' : err.response?.data?.error?.message || err.message);
}

/*
 * Lê as páginas de um endpoint de /v1/organization (usage e costs: todos pedem a chave de admin) e junta
 * os buckets. Em erro, registra no log (sem a chave) e lança o erro do axios.
 */
async function buckets({ cmd, caminho, params }) {
    const todos = [];
    let pagina = null;

    try {
        for (let n = 0; n < 6; n++) {
            const { data } = await axios.get(`${OPENAI_BASE}/organization/${caminho}`, {
                headers: { Authorization: `Bearer ${chaveAdminOpenAi()}` },
                timeout: envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms'),
                params: { ...params, ...(pagina ? { page: pagina } : {}) }
            });
            todos.push(...(data?.data ?? []));
            if (!data?.has_more || !data.next_page) break;
            pagina = data.next_page;
        }
        return todos;
    } catch (err) {
        logarErro(cmd, err);
        throw err;
    }
}

/**
 * O consumo dos últimos dias (GET /v1/organization/usage/completions), por dia e por modelo. Precisa de
 * uma chave de admin (sk-admin-...); a chave normal não vale.
 * @param {object} o
 * @param {string} o.cmd   comando que chamou (para o log)
 * @param {number} o.dias  quantos dias, contando hoje (buckets de 1 dia, em UTC)
 * @returns {Promise<{ buckets: object[] }>}  os buckets da OpenAI, de todas as páginas
 */
async function consultarConsumo({ cmd, dias }) {
    const fim = Math.floor(Date.now() / 1000);
    return {
        buckets: await buckets({
            cmd,
            caminho: 'usage/completions',
            params: { start_time: fim - dias * 86400, bucket_width: '1d', limit: dias, group_by: ['model'] }
        })
    };
}

/**
 * O custo em dólares (GET /v1/organization/costs), por dia e por item (ex.: "gpt-4o-mini, input").
 * @param {number} o.desde  início, em segundos (UTC)
 * @returns {Promise<object[]>}  os buckets da OpenAI
 */
const consultarCustos = ({ cmd, desde }) => buckets({
    cmd, caminho: 'costs', params: { start_time: desde, bucket_width: '1d', limit: 180, group_by: ['line_item'] }
});

// Os usos além do chat, com o que cada um mede
const SERVICOS_DE_USO = ['images', 'audio_speeches', 'audio_transcriptions', 'embeddings'];

/**
 * O uso de imagens, voz, transcrição e embeddings dos últimos dias (o que falhar vem null: é um extra).
 * @returns {Promise<Record<string, object[] | null>>}
 */
async function consultarServicos({ cmd, dias }) {
    const fim = Math.floor(Date.now() / 1000);
    const params = { start_time: fim - dias * 86400, bucket_width: '1d', limit: dias };
    const lidos = await Promise.allSettled(SERVICOS_DE_USO.map(nome => buckets({ cmd, caminho: `usage/${nome}`, params })));
    return Object.fromEntries(SERVICOS_DE_USO.map((nome, i) => [nome, lidos[i].status === 'fulfilled' ? lidos[i].value : null]));
}

/**
 * Os limites e o que sobrou na janela atual, lidos dos cabeçalhos x-ratelimit-* de uma chamada
 * mínima ao chat (gasta uns poucos tokens). Vale a chave normal.
 * @returns {Promise<{ modelo: string, tokens: object, requisicoes: object }>}
 */
async function consultarLimites({ cmd }) {
    const modelo = envOuSetting('OPENAI_MODEL', 'openai.api.model');

    try {
        const { headers } = await axios.post(OPENAI_URL, {
            model: modelo,
            messages: [{ role: 'user', content: '.' }],
            max_completion_tokens: 16
        }, {
            headers: { Authorization: `Bearer ${chaveOpenAi()}` },
            timeout: envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms')
        });

        const h = (nome) => headers?.[`x-ratelimit-${nome}`] ?? null;
        return {
            modelo,
            tokens: { limite: h('limit-tokens'), restante: h('remaining-tokens'), reseta: h('reset-tokens') },
            requisicoes: { limite: h('limit-requests'), restante: h('remaining-requests'), reseta: h('reset-requests') }
        };
    } catch (err) {
        logarErro(cmd, err);
        throw err;
    }
}

module.exports = {
    SEM_CHAVE,
    atualizarPrecos,
    atualizarPrecosSeVencidos,
    iniciarPrecosAutomaticos,
    medirConsumo,
    rodapeDeConsumo,
    chaveAdminOpenAi,
    chaveOpenAi,
    consultarConsumo,
    consultarCustos,
    consultarServicos,
    consultarLimites,
    erroOpenAi,
    gerarImagem,
    listarModelos,
    perguntarAoChat,
    sintetizarVoz,
    transcreverAudio,
    VOZ_MAX_CARACTERES
};
