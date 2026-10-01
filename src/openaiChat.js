/*
 * Call to OpenAI chat, shared by /gpt and /resumo.
 */

const axios = require('axios');

const { printError } = require('./log');
const { envOuSetting } = require('./settings');

/*
 * Key, model and timeout come from config/.env (OPENAI_API_KEY, OPENAI_MODEL,
 * OPENAI_TIMEOUT_MS) or, if they are missing, from the settings 'openai.api.key',
 * 'openai.api.model' and 'openai.timeout.ms'. The key is never logged nor
 * echoed: the returned error is only the API message.
 */
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const keyOpenAi = () => envOuSetting('OPENAI_API_KEY', 'openai.api.key');

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
 * @returns {Promise<string>}
 */
async function askOnChat({ cmd, sistema: system, texto: textAlt }) {
    try {
        const { data } = await axios.post(OPENAI_URL, {
            model: envOuSetting('OPENAI_MODEL', 'openai.api.model'),
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: textAlt }
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

module.exports = {
    WITHOUT_KEY,
    keyOpenAi,
    errorOpenAi,
    askOnChat
};
