/*
 * Call to OpenAI chat, shared by /gpt and /tldr.
 */

const { AsyncLocalStorage } = require('node:async_hooks');

const axios = require('axios');

const { t } = require('./i18n');
const { printError, printInfo } = require('./log');
const { envOuSetting, getSetting, setSetting } = require('./settings');
const { paraWhatsapp } = require('./util/whatsapp');

/*
 * Key, model and timeout come from config/.env (OPENAI_API_KEY, OPENAI_MODEL,
 * OPENAI_TIMEOUT_MS) or, if they are missing, from the settings 'gpt.api.key',
 * 'gpt.api.model' and 'gpt.timeout.ms'. The key is never logged nor
 * echoed: the returned error is only the API message.
 */
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions';
const OPENAI_VOICE_URL = 'https://api.openai.com/v1/audio/speech';
const OPENAI_BASE = 'https://api.openai.com/v1';
const OPENAI_PRICES_URL = 'https://developers.openai.com/api/docs/pricing';
const OPENAI_IMAGE_URL = `${OPENAI_BASE}/images/generations`;
const OPENAI_IMAGE_EDIT_URL = `${OPENAI_BASE}/images/edits`;

const keyOpenAi = () => envOuSetting('OPENAI_API_KEY', 'gpt.api.key');

// The admin key (sk-admin-...), only for /gpt -usage: the Usage API does not accept the normal key
const keyAdminOpenAi = () => envOuSetting('OPENAI_ADMIN_KEY', 'gpt.admin.key');

const WITHOUT_KEY = (cmd) => t('openai.noKey', { cmd });

// OpenAI error → message for the chat (never contains the key)
function errorOpenAi(err, cmd) {
    const timeout = envOuSetting('OPENAI_TIMEOUT_MS', 'gpt.timeout.ms');

    if (err.code === 'ECONNABORTED') return t('openai.timeout', { s: timeout / 1000 });
    if (err.response?.status === 401) return t('openai.badKey');
    if (err.response?.status === 429) return t('openai.quota');
    return t('openai.error', { cmd, erro: err.response?.data?.error?.message || err.message });
}

/*
 * Consumption of a command run (/gpt, /tldr): bytes sent (TX) and received (RX) in the calls to
 * OpenAI and the tokens it counted. The bytes are the body's (the JSON, the audio...), without headers or TLS.
 * Each command runs inside measureConsumption(); outside it, nothing is counted.
 */
const consumptionCurrent = new AsyncLocalStorage();

/**
 * Runs fn measuring the usage of the OpenAI calls made inside it.
 * @param {boolean} ligado  shows the status in the footer (-status or the gpt.status setting)
 */
function measureConsumption(on, fn) {
    const consumption = { ligado: on || getSetting('gpt.status'), custo: 0, semPreco: false, chamadas: 0, tx: 0, rx: 0, entrada: 0, saida: 0, total: 0 };
    return consumptionCurrent.run(consumption, fn);
}

const bytesDe = (body) => {
    if (body == null) return 0;
    if (Buffer.isBuffer(body) || body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return body.byteLength;
    if (typeof body === 'string') return Buffer.byteLength(body);
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
        let sum = 0;
        for (const [campo, valueAlt] of body.entries()) sum += Buffer.byteLength(campo) + (typeof valueAlt === 'string' ? Buffer.byteLength(valueAlt) : valueAlt.size);
        return sum;
    }
    return Buffer.byteLength(JSON.stringify(body));
};

/** Adds a call to the command's usage: the body sent, the received one and the response's "usage", if any. */
function countAlt(sentAlt, received, usage = null, modelAlt = null) {
    const c = consumptionCurrent.getStore();
    if (!c) return;
    c.chamadas++;
    c.tx += bytesDe(sentAlt);
    c.rx += bytesDe(received);
    const inputAlt = usage?.prompt_tokens ?? usage?.input_tokens ?? 0;
    const outputAlt = usage?.completion_tokens ?? usage?.output_tokens ?? 0;
    c.entrada += inputAlt;
    c.saida += outputAlt;
    c.total += usage?.total_tokens ?? inputAlt + outputAlt;

    // The cost is an estimate (tokens × gpt.pricing price); without a price, the call's is unknown
    const price = inputAlt || outputAlt ? modelPrice(modelAlt) : null;
    if (price) {
        const cost = (inputAlt * price.entrada + outputAlt * price.saida) / 1e6;
        c.custo += cost;
        spentSinceAReading += cost;
    } else {
        c.semPreco = true;
    }
}

/*
 * The price per 1M tokens of the model (setting gpt.pricing, "model=input/output" in dollars). The
 * exact model or, failing that, the longest-named one that is a prefix (gpt-4o-mini-2024-07-18 → gpt-4o-mini).
 */
function modelPrice(modelAlt) {
    if (!modelAlt) return null;
    let best = null;
    for (const item of getSetting('gpt.pricing')) {
        const [nameAlt, price] = item.split('=');
        if (!modelAlt.startsWith(nameAlt) || (best && best.nome.length >= nameAlt.length)) continue;
        const [inputAlt, outputAlt] = price.split('/').map(Number);
        best = { nome: nameAlt, entrada: inputAlt, saida: outputAlt };
    }
    return best;
}

/**
 * Reads the price table from the OpenAI site (the Standard one, the first on the page: the rest is Batch, Flex and
 * Priority) and returns the price per 1M tokens (input/output) of each gpt-* model. The page embeds the
 * JSON table, one row per model: [name, input, cache, ..., output]. The models are left out
 * that are not text ones (audio, image, voice, search), the "pro" ones and those with a date (fine-tuning).
 * @returns {Promise<Map<string, string>>}  modelo → "entrada/saida"
 */
async function searchPrices({ cmd }) {
    let html;
    try {
        ({ data: html } = await axios.get(OPENAI_PRICES_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0 (zapbot)' },
            timeout: envOuSetting('OPENAI_TIMEOUT_MS', 'gpt.timeout.ms'),
            responseType: 'text'
        }));
    } catch (err) {
        logError(cmd, err);
        throw err;
    }

    const textAlt = String(html).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const prices = new Map();
    for (const [, raw, columns] of textAlt.matchAll(/\[0,"(gpt-[^"]+)"\]((?:,\[0,(?:[\d.]+|"-")\])+)\]/g)) {
        const modelAlt = raw.replace(/\s*\(.*\)$/, '');
        if (prices.has(modelAlt) || /realtime|audio|transcribe|image|tts|search|codex|pro$|-\d{4}-\d{2}-\d{2}$/.test(modelAlt)) continue;

        const values = [...columns.matchAll(/\[0,([\d.]+|"-")\]/g)].map(m => m[1]);
        const inputAlt = Number(values[0]);
        const outputAlt = Number(values.at(-1));
        if (values.length < 2 || !Number.isFinite(inputAlt) || !Number.isFinite(outputAlt)) continue;
        prices.set(modelAlt, `${inputAlt}/${outputAlt}`);
    }
    return prices;
}

/**
 * Fetches the prices from the site and updates the gpt.pricing setting: the page's models come in or are
 * fixed; those the page does not have (the ones you added) stay as they are.
 * @returns {Promise<{ novos: string[], mudados: { modelo: string, antes: string, depois: string }[], iguais: number }>}
 */
async function updatePrices({ cmd }) {
    const foundAlt6 = await searchPrices({ cmd });
    if (!foundAlt6.size) throw new Error(t('openai.pricesNotFound'));

    const current = new Map(getSetting('gpt.pricing').map(item => item.split('=')));
    const freshAlt3 = [];
    const changed = [];
    let equal = 0;
    for (const [modelAlt, price] of foundAlt6) {
        if (!current.has(modelAlt)) freshAlt3.push(modelAlt);
        else if (current.get(modelAlt) !== price) changed.push({ modelo: modelAlt, antes: current.get(modelAlt), depois: price });
        else equal++;
        current.set(modelAlt, price);
    }

    if (freshAlt3.length || changed.length) {
        await setSetting('gpt.pricing', [...current].map(([modelAlt, price]) => `${modelAlt}=${price}`).join(' '));
    }
    await setSetting('gpt.pricing.updated', new Date().toISOString().slice(0, 10));
    return { novos: freshAlt3, mudados: changed, iguais: equal };
}

/*
 * Automatic price update: with the OpenAI key configured and gpt.pricing.auto on,
 * reads the site table every PRICES_INTERVAL_DAYS. If it failed (site down, new format): tries again
 * after PRICES_RETRY_MS, without touching what is already stored.
 */
const PRICES_INTERVAL_DAYS = 15;
const PRICES_NOTICE_DAYS = 30;
const PRICES_RETRY_MS = 6 * 60 * 60 * 1000;
let pricesNextAttempt = 0;

// How many days ago gpt.pricing was last updated (Infinity: never)
function pricesAge(nowAlt = Date.now()) {
    const data = getSetting('gpt.pricing.updated');
    return data ? Math.floor((nowAlt - Date.parse(data)) / 86400000) : Infinity;
}

async function updatePricesSeExpired(nowAlt = Date.now()) {
    if (!getSetting('gpt.pricing.auto') || !keyOpenAi()) return null;
    if (nowAlt < pricesNextAttempt || pricesAge(nowAlt) < PRICES_INTERVAL_DAYS) return null;

    try {
        const r = await updatePrices({ cmd: '/gpt' });
        printInfo(`gpt.pricing atualizado: ${r.mudados.length} alterados, ${r.novos.length} novos`);
        return r;
    } catch (err) {
        pricesNextAttempt = nowAlt + PRICES_RETRY_MS;
        printError('Atualização automática dos preços da OpenAI falhou:', err.message);
        return null;
    }
}

// Called in app.js: a check right after starting and another every 6 hours
function startPricesAutomatic() {
    setTimeout(() => updatePricesSeExpired(), 60 * 1000).unref();
    setInterval(() => updatePricesSeExpired(), PRICES_RETRY_MS).unref();
}

/*
 * The estimated balance: gpt.credit.total minus the Costs API spend (admin key, read from time to
 * times, since it lags) minus the estimate of the calls made after the read.
 */
const READING_VALIDITY_MS = 5 * 60 * 1000;
let spentReading = null;      // { used, when } or { failed: true, when }
let spentSinceAReading = 0;     // the estimate of the calls since the read

async function balanceEstimated(c) {
    const total = getSetting('gpt.credit.total');
    if (!total || !keyAdminOpenAi()) return null;

    if (!spentReading || Date.now() - spentReading.quando > READING_VALIDITY_MS) {
        const sinceData = getSetting('gpt.credit.since');
        const since = sinceData ? Math.floor(Date.parse(sinceData) / 1000) : Math.floor(Date.now() / 1000) - 180 * 86400;
        try {
            const read = await queryCosts({ cmd: '/gpt', desde: since });
            const used = read.reduce((t, b) => t + (b.results ?? []).reduce((s, r) => s + Number(r.amount?.value ?? 0), 0), 0);
            spentReading = { usado: used, quando: Date.now() };
            spentSinceAReading = c.custo; // the Costs API lags: this call is not yet in the spend read
        } catch {
            spentReading = { falhou: true, quando: Date.now() };
        }
    }
    return spentReading.falhou ? null : { restante: total - spentReading.usado - spentSinceAReading, total };
}

const size = (n) => n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;

const dollar = (n) => {
    const v = Math.abs(n);
    return (n < 0 ? '-' : '') + `$${v.toFixed(v < 0.01 ? 6 : 2)}`;
};

/** The reply footer ("\n\n_📡 ..._"); empty with the status off or without an OpenAI call */
async function consumptionFooter() {
    const c = consumptionCurrent.getStore();
    if (!c?.ligado || !c.chamadas) return '';
    const tokens = c.total ? ` · 🪙 ${c.total} tokens (📥 ${c.entrada} · 📤 ${c.saida})` : '';
    const linesAlt = [`📡 ⬆️ ${size(c.tx)} TX · ⬇️ ${size(c.rx)} RX${tokens}` +
        `${c.chamadas > 1 ? t('openai.calls', { n: c.chamadas }) : ''}`];

    // The ~ marks that the value is estimated
    const balance = await balanceEstimated(c);
    linesAlt.push(`💵 ${c.semPreco ? t('openai.noPrice') : `~${dollar(c.custo)}`}` +
        (balance ? t('openai.balance', { restante: dollar(balance.restante), total: dollar(balance.total) }) : ''));
    const age = pricesAge();
    if (Number.isFinite(age) && age > PRICES_NOTICE_DAYS) linesAlt.push(t('openai.oldPrices', { dias: age }));
    return `\n\n${linesAlt.map(l => `_${l}_`).join('\n')}`;
}

/**
 * Sends the instructions and the text to the OpenAI chat and returns the reply.
 * On error, logs (without the key) and throws the axios error.
 * @param {object} o
 * @param {string} o.cmd        command that called (for the log)
 * @param {string} o.sistema    instructions (role "system")
 * @param {string} o.texto      question or content (role "user")
 * @param {{ mimetype: string, data: string }} [o.imagem]  an image (base64) that goes along with the question
 * @returns {Promise<string>}
 */
async function askOnChat({ cmd, sistema: system, texto: textAlt, imagem: image = null }) {
    // With an image, the content becomes the list of parts (text + image as data URL)
    const content = image
        ? [
            { type: 'text', text: textAlt },
            { type: 'image_url', image_url: { url: `data:${image.mimetype};base64,${image.data}` } }
        ]
        : textAlt;

    try {
        const body = {
            model: envOuSetting('OPENAI_MODEL', 'gpt.api.model'),
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: content }
            ]
        };
        const { data } = await axios.post(OPENAI_URL, body, {
            headers: { Authorization: `Bearer ${keyOpenAi()}` },
            timeout: envOuSetting('OPENAI_TIMEOUT_MS', 'gpt.timeout.ms')
        });

        countAlt(body, data, data?.usage, body.model);

        // ChatGPT writes in Markdown; WhatsApp has another formatting (see util/whatsapp.js)
        return paraWhatsapp(data.choices?.[0]?.message?.content) || '(resposta vazia)';
    } catch (err) {
        // On a 401 OpenAI's message carries a piece of the key: it does not go to the log
        const status = err.response?.status;
        printError(`${cmd}:`, status ?? '', status === 401 ? 'API key inválida' : err.response?.data?.error?.message || err.message);
        throw err;
    }
}

/**
 * Transcribes an audio (POST /v1/audio/transcriptions, multipart), in the language OpenAI detects.
 * On error, logs (without the key) and throws the axios error.
 * @param {object} o
 * @param {string} o.cmd  command that called (for the log)
 * @param {{ arquivo: string, mimetype: string, data: string }} o.audio  the audio in base64; the name
 * of the file (with the right extension) is what OpenAI uses to know the format
 * @returns {Promise<string>}  the text (empty if there is no speech)
 */
async function transcribeAudio({ cmd, audio }) {
    const form = new FormData();
    form.append('file', new Blob([Buffer.from(audio.data, 'base64')], { type: audio.mimetype }), audio.arquivo);
    form.append('model', getSetting('gpt.transcribe.model'));

    try {
        const { data } = await axios.post(OPENAI_TRANSCRIPTION_URL, form, {
            headers: { Authorization: `Bearer ${keyOpenAi()}` },
            timeout: envOuSetting('OPENAI_TIMEOUT_MS', 'gpt.timeout.ms'),
            maxBodyLength: Infinity
        });
        countAlt(form, data, data?.usage, form.get('model'));
        return String(data?.text ?? '').trim();
    } catch (err) {
        logError(cmd, err);
        throw err;
    }
}

// The voice API text ceiling
const VOICE_MAX_CHARACTERS = 4096;

/**
 * Generates the voice of a text (POST /v1/audio/speech) in Ogg/Opus, the WhatsApp voice note format.
 * On error, logs (without the key) and throws the axios error.
 * @param {object} o
 * @param {string} o.cmd    command that called (for the log)
 * @param {string} o.texto  up to VOICE_MAX_CHARACTERS
 * @param {string} [o.estilo]  how to speak (overrides the gpt.tts.instructions setting)
 * @returns {Promise<Buffer>}
 */
async function synthesizeVoice({ cmd, texto: textAlt, estilo: style = null }) {
    const modelAlt = getSetting('gpt.tts.model');

    try {
        const body = {
            model: modelAlt,
            voice: getSetting('gpt.tts.voice'),
            input: textAlt,
            response_format: 'opus',
            // Only gpt-4o-mini-tts follows the style; tts-1 and tts-1-hd refuse the field
            ...(modelAlt.startsWith('gpt-4o') ? { instructions: style || getSetting('gpt.tts.instructions') } : {})
        };
        const { data } = await axios.post(OPENAI_VOICE_URL, body, {
            headers: { Authorization: `Bearer ${keyOpenAi()}` },
            timeout: envOuSetting('OPENAI_TIMEOUT_MS', 'gpt.timeout.ms'),
            responseType: 'arraybuffer'
        });
        countAlt(body, data, null, modelAlt);
        return Buffer.from(data);
    } catch (err) {
        // With responseType arraybuffer, the error body (JSON) also comes as bytes
        if (Buffer.isBuffer(err.response?.data)) {
            try {
                err.response.data = JSON.parse(err.response.data.toString('utf8'));
            } catch { /* body that is not JSON: the axios message stays */ }
        }
        logError(cmd, err);
        throw err;
    }
}

const GIF_SIZE = '512x512';
const TIMEOUT_IMAGE_MS = 3 * 60 * 1000;
const TIMEOUT_GIF_MS = 5 * 60 * 1000;

/**
 * Generates an image (v1/images/generations) or, with `imagem`, edits the one that came (v1/images/edits). With
 * `gif`, the result is an animated GIF (output_format gif, only on the gpt-image-2.6-* models).
 * @param {object} o
 * @param {string} o.cmd     command that called (for the log)
 * @param {string} o.prompt  what to generate or change
 * @param {Buffer} [o.imagem]  the image to edit, as PNG
 * @param {{ frames: number, frameMs: number }} [o.gif]  asks for the GIF, with the frames and the duration of each
 * @returns {Promise<string>}  the image (PNG) or the GIF, in base64
 */
async function generateImage({ cmd, prompt, imagem: image = null, gif = null }) {
    // The GIF has its own model (only the gpt-image-2.6-* ones do it) and the frames come out at 512x512: OpenAI charges the
    // pixels of all of them
    const modelAlt = getSetting(gif ? 'gpt.image.gifModel' : 'gpt.image.model');
    const extras = gif
        ? { size: GIF_SIZE, output_format: 'gif', frame_count: gif.frames, frame_duration_ms: gif.frameMs }
        : {};
    const config = {
        headers: { Authorization: `Bearer ${keyOpenAi()}` },
        // An image takes much longer than a text reply: at least 3 minutes (the GIF, 5)
        timeout: Math.max(envOuSetting('OPENAI_TIMEOUT_MS', 'gpt.timeout.ms'), gif ? TIMEOUT_GIF_MS : TIMEOUT_IMAGE_MS)
    };

    try {
        let reply;
        let sentAlt;
        if (image) {
            const form = new FormData();
            form.append('model', modelAlt);
            form.append('prompt', prompt);
            for (const [campo, valueAlt] of Object.entries(extras)) form.append(campo, String(valueAlt));
            form.append('image', new Blob([image], { type: 'image/png' }), 'imagem.png');
            sentAlt = form;
            reply = await axios.post(OPENAI_IMAGE_EDIT_URL, form, { ...config, maxBodyLength: Infinity });
        } else {
            sentAlt = { model: modelAlt, prompt, n: 1, ...extras };
            reply = await axios.post(OPENAI_IMAGE_URL, sentAlt, config);
        }
        countAlt(sentAlt, reply.data, reply.data?.usage, modelAlt);

        const b64 = reply.data?.data?.[0]?.b64_json;
        if (!b64) throw new Error(t('openai.noImage'));
        return b64;
    } catch (err) {
        logError(cmd, err);
        throw err;
    }
}

/**
 * The models the key sees (GET /v1/models), in alphabetical order: to say which one to use when the
 * configured does not exist on the account.
 * @returns {Promise<string[]>}
 */
async function listModels({ cmd }) {
    try {
        const { data } = await axios.get(`${OPENAI_BASE}/models`, {
            headers: { Authorization: `Bearer ${keyOpenAi()}` },
            timeout: envOuSetting('OPENAI_TIMEOUT_MS', 'gpt.timeout.ms')
        });
        return (data?.data ?? []).map(m => m.id).filter(Boolean).sort();
    } catch (err) {
        logError(cmd, err);
        throw err;
    }
}

// OpenAI error in the log, without the key (on a 401 the message carries a piece of it)
function logError(cmd, err) {
    const status = err.response?.status;
    printError(`${cmd}:`, status ?? '', status === 401 ? 'API key inválida' : err.response?.data?.error?.message || err.message);
}

/*
 * Reads the pages of a /v1/organization endpoint (usage and costs: both need the admin key) and joins
 * the buckets. On error, logs (without the key) and throws the axios error.
 */
async function buckets({ cmd, caminho: pathAlt, params }) {
    const allAlt2 = [];
    let page = null;

    try {
        for (let n = 0; n < 6; n++) {
            const { data } = await axios.get(`${OPENAI_BASE}/organization/${pathAlt}`, {
                headers: { Authorization: `Bearer ${keyAdminOpenAi()}` },
                timeout: envOuSetting('OPENAI_TIMEOUT_MS', 'gpt.timeout.ms'),
                params: { ...params, ...(page ? { page: page } : {}) }
            });
            allAlt2.push(...(data?.data ?? []));
            if (!data?.has_more || !data.next_page) break;
            page = data.next_page;
        }
        return allAlt2;
    } catch (err) {
        logError(cmd, err);
        throw err;
    }
}

/**
 * The usage of the last days (GET /v1/organization/usage/completions), per day and per model. Needs
 * an admin key (sk-admin-...); the normal key does not work.
 * @param {object} o
 * @param {string} o.cmd   command that called (for the log)
 * @param {number} o.dias  how many days, counting today (1-day buckets, in UTC)
 * @returns {Promise<{ buckets: object[] }>}  the OpenAI buckets, from all pages
 */
async function queryConsumption({ cmd, dias: daysAlt }) {
    const end = Math.floor(Date.now() / 1000);
    return {
        buckets: await buckets({
            cmd,
            caminho: 'usage/completions',
            params: { start_time: end - daysAlt * 86400, bucket_width: '1d', limit: daysAlt, group_by: ['model'] }
        })
    };
}

/**
 * The cost in dollars (GET /v1/organization/costs), per day and per item (e.g.: "gpt-4o-mini, input").
 * @param {number} o.desde  start, in seconds (UTC)
 * @returns {Promise<object[]>}  the OpenAI buckets
 */
const queryCosts = ({ cmd, desde: since }) => buckets({
    cmd, caminho: 'costs', params: { start_time: since, bucket_width: '1d', limit: 180, group_by: ['line_item'] }
});

// The uses beyond the chat, with what each one measures
const USAGE_SERVICES = ['images', 'audio_speeches', 'audio_transcriptions', 'embeddings'];

/**
 * The usage of images, voice, transcription and embeddings over the last days (whatever fails comes null: it is an extra).
 * @returns {Promise<Record<string, object[] | null>>}
 */
async function queryServices({ cmd, dias: daysAlt }) {
    const end = Math.floor(Date.now() / 1000);
    const params = { start_time: end - daysAlt * 86400, bucket_width: '1d', limit: daysAlt };
    const read = await Promise.allSettled(USAGE_SERVICES.map(nameAlt => buckets({ cmd, caminho: `usage/${nameAlt}`, params })));
    return Object.fromEntries(USAGE_SERVICES.map((nameAlt, i) => [nameAlt, read[i].status === 'fulfilled' ? read[i].value : null]));
}

/**
 * The limits and what is left in the current window, read from the x-ratelimit-* headers of a call
 * minimal to the chat (spends a few tokens). The normal key works.
 * @returns {Promise<{ modelo: string, tokens: object, requisicoes: object }>}
 */
async function queryLimits({ cmd }) {
    const modelAlt = envOuSetting('OPENAI_MODEL', 'gpt.api.model');

    try {
        const { headers } = await axios.post(OPENAI_URL, {
            model: modelAlt,
            messages: [{ role: 'user', content: '.' }],
            max_completion_tokens: 16
        }, {
            headers: { Authorization: `Bearer ${keyOpenAi()}` },
            timeout: envOuSetting('OPENAI_TIMEOUT_MS', 'gpt.timeout.ms')
        });

        const h = (nameAlt) => headers?.[`x-ratelimit-${nameAlt}`] ?? null;
        return {
            modelo: modelAlt,
            tokens: { limite: h('limit-tokens'), restante: h('remaining-tokens'), reseta: h('reset-tokens') },
            requisicoes: { limite: h('limit-requests'), restante: h('remaining-requests'), reseta: h('reset-requests') }
        };
    } catch (err) {
        logError(cmd, err);
        throw err;
    }
}

module.exports = {
    WITHOUT_KEY,
    updatePrices,
    updatePricesSeExpired,
    startPricesAutomatic,
    measureConsumption,
    consumptionFooter,
    keyAdminOpenAi,
    keyOpenAi,
    queryConsumption,
    queryCosts,
    queryServices,
    queryLimits,
    errorOpenAi,
    generateImage,
    listModels,
    askOnChat,
    synthesizeVoice,
    transcribeAudio,
    VOICE_MAX_CHARACTERS
};
