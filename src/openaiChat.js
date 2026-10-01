/*
 * Chamada ao chat da OpenAI, compartilhada pelo /gpt e pelo /resumo.
 */

const axios = require('axios');

const { printError } = require('./log');
const { envOuSetting } = require('./settings');

/*
 * Chave, modelo e timeout vêm do config/.env (OPENAI_API_KEY, OPENAI_MODEL,
 * OPENAI_TIMEOUT_MS) ou, na falta deles, dos settings 'openai.api.key',
 * 'openai.api.model' e 'openai.timeout.ms'. A chave nunca é logada nem
 * ecoada: o erro devolvido é só a mensagem da API.
 */
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const chaveOpenAi = () => envOuSetting('OPENAI_API_KEY', 'openai.api.key');

const SEM_CHAVE = (cmd) => `⚠️ API key da OpenAI não encontrada: o ${cmd} está desativado.\n` +
    '💡 _Defina OPENAI_API_KEY no config/.env ou use /set openai.api.key <chave>_';

// Erro da OpenAI → mensagem para o chat (nunca contém a chave)
function erroOpenAi(err, cmd) {
    const timeout = envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms');

    if (err.code === 'ECONNABORTED') return `⏱️ A OpenAI não respondeu em ${timeout / 1000}s. Tente de novo ou aumente o openai.timeout.ms.`;
    if (err.response?.status === 401) return '🔑 API key da OpenAI inválida. Confira o OPENAI_API_KEY ou o openai.api.key.';
    if (err.response?.status === 429) return '💸 Limite ou créditos da OpenAI esgotados. Tente mais tarde.';
    return `❌ Erro no ${cmd}: ${err.response?.data?.error?.message || err.message}`;
}

/**
 * Manda as instruções e o texto para o chat da OpenAI e devolve a resposta.
 * Em erro, registra no log (sem a chave) e lança o erro do axios.
 * @param {object} o
 * @param {string} o.cmd        comando que chamou (para o log)
 * @param {string} o.sistema    instruções (role "system")
 * @param {string} o.texto      pergunta ou conteúdo (role "user")
 * @returns {Promise<string>}
 */
async function perguntarAoChat({ cmd, sistema, texto }) {
    try {
        const { data } = await axios.post(OPENAI_URL, {
            model: envOuSetting('OPENAI_MODEL', 'openai.api.model'),
            messages: [
                { role: 'system', content: sistema },
                { role: 'user', content: texto }
            ]
        }, {
            headers: { Authorization: `Bearer ${chaveOpenAi()}` },
            timeout: envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms')
        });

        return data.choices?.[0]?.message?.content?.trim() || '(resposta vazia)';
    } catch (err) {
        // No 401 a mensagem da OpenAI traz um pedaço da chave: não vai para o log
        const status = err.response?.status;
        printError(`${cmd}:`, status ?? '', status === 401 ? 'API key inválida' : err.response?.data?.error?.message || err.message);
        throw err;
    }
}

module.exports = {
    SEM_CHAVE,
    chaveOpenAi,
    erroOpenAi,
    perguntarAoChat
};
