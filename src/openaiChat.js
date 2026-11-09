/*
 * Call to OpenAI chat, shared by /gpt and /tldr.
 */

const axios = require('axios');

const { printError } = require('./log');
const { envOuSetting, getSetting } = require('./settings');

/*
 * Key, model and timeout come from config/.env (OPENAI_API_KEY, OPENAI_MODEL,
 * OPENAI_TIMEOUT_MS) or, if they are missing, from the settings 'openai.api.key',
 * 'openai.api.model' and 'openai.timeout.ms'. The key is never logged nor
 * echoed: the returned error is only the API message.
 */
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions';
const OPENAI_VOICE_URL = 'https://api.openai.com/v1/audio/speech';
const OPENAI_USAGE_URL = 'https://api.openai.com/v1/organization/usage/completions';

const keyOpenAi = () => envOuSetting('OPENAI_API_KEY', 'openai.api.key');

// The admin key (sk-admin-...), only for /gpt -usage: the Usage API does not accept the normal key
const keyAdminOpenAi = () => envOuSetting('OPENAI_ADMIN_KEY', 'openai.admin.key');

const WITHOUT_KEY = (cmd) => `⚠️ API key da OpenAI não encontrada: o ${cmd} está desativado.\n` +
    '💡 _Defina OPENAI_API_KEY no config/.env ou use /set openai.api.key <chave>_';

// OpenAI error → message for the chat (never contains the key)
function errorOpenAi(err, cmd) {
    const timeout = envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms');

    if (err.code === 'ECONNABORTED') return `⏱️ A OpenAI não respondeu em ${timeout / 1000}s. Tente de novo ou aumente o openai.timeout.ms.`;
    if (err.response?.status === 401) return '🔑 API key da OpenAI inválida. Confira o OPENAI_API_KEY ou o openai.api.key.';
    if (err.response?.status === 429) return '💸 Limite ou créditos da OpenAI esgotados. Tente mais tarde.';
    return `❌ Erro no ${cmd}: ${err.response?.data?.error?.message || err.message}`;
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
        const { data } = await axios.post(OPENAI_URL, {
            model: envOuSetting('OPENAI_MODEL', 'openai.api.model'),
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: content }
            ]
        }, {
            headers: { Authorization: `Bearer ${keyOpenAi()}` },
            timeout: envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms')
        });

        return data.choices?.[0]?.message?.content?.trim() || '(resposta vazia)';
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
    form.append('model', getSetting('openai.transcribe.model'));

    try {
        const { data } = await axios.post(OPENAI_TRANSCRIPTION_URL, form, {
            headers: { Authorization: `Bearer ${keyOpenAi()}` },
            timeout: envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms'),
            maxBodyLength: Infinity
        });
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
 * @returns {Promise<Buffer>}
 */
async function synthesizeVoice({ cmd, texto: textAlt }) {
    const modelAlt = getSetting('openai.tts.model');

    try {
        const { data } = await axios.post(OPENAI_VOICE_URL, {
            model: modelAlt,
            voice: getSetting('openai.tts.voice'),
            input: textAlt,
            response_format: 'opus',
            // Only gpt-4o-mini-tts follows the style; tts-1 and tts-1-hd refuse the field
            ...(modelAlt.startsWith('gpt-4o') ? { instructions: getSetting('openai.tts.instructions') } : {})
        }, {
            headers: { Authorization: `Bearer ${keyOpenAi()}` },
            timeout: envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms'),
            responseType: 'arraybuffer'
        });
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

// OpenAI error in the log, without the key (on a 401 the message carries a piece of it)
function logError(cmd, err) {
    const status = err.response?.status;
    printError(`${cmd}:`, status ?? '', status === 401 ? 'API key inválida' : err.response?.data?.error?.message || err.message);
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
    const buckets = [];
    const end = Math.floor(Date.now() / 1000);
    let page = null;

    try {
        for (let n = 0; n < 5; n++) {
            const { data } = await axios.get(OPENAI_USAGE_URL, {
                headers: { Authorization: `Bearer ${keyAdminOpenAi()}` },
                timeout: envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms'),
                params: {
                    start_time: end - daysAlt * 86400,
                    bucket_width: '1d',
                    limit: daysAlt,
                    group_by: ['model'],
                    ...(page ? { page: page } : {})
                }
            });
            buckets.push(...(data?.data ?? []));
            if (!data?.has_more || !data.next_page) break;
            page = data.next_page;
        }
        return { buckets };
    } catch (err) {
        logError(cmd, err);
        throw err;
    }
}

/**
 * The limits and what is left in the current window, read from the x-ratelimit-* headers of a call
 * minimal to the chat (spends a few tokens). The normal key works.
 * @returns {Promise<{ modelo: string, tokens: object, requisicoes: object }>}
 */
async function queryLimits({ cmd }) {
    const modelAlt = envOuSetting('OPENAI_MODEL', 'openai.api.model');

    try {
        const { headers } = await axios.post(OPENAI_URL, {
            model: modelAlt,
            messages: [{ role: 'user', content: '.' }],
            max_completion_tokens: 16
        }, {
            headers: { Authorization: `Bearer ${keyOpenAi()}` },
            timeout: envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms')
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
    keyAdminOpenAi,
    keyOpenAi,
    queryConsumption,
    queryLimits,
    errorOpenAi,
    askOnChat,
    synthesizeVoice,
    transcribeAudio,
    VOICE_MAX_CHARACTERS
};
