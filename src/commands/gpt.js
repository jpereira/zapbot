/*
 * Comando /gpt.
 */

const axios = require('axios');

const { getCommandSyntax } = require('./base');
const { printError } = require('../log');
const { envOuSetting } = require('../settings');

/*
 * /gpt: asks ChatGPT. Key and timeout come from config/.env (OPENAI_API_KEY,
 * OPENAI_TIMEOUT_MS) or, if they are missing, from the settings 'openai.api.key' and
 * 'openai.timeout.ms'. The key is never logged nor echoed: the returned error is only
 * the API message.
 */
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL_DEFAULT = 'gpt-4o-mini';
const GPT_INSTRUCTIONS = 'Você é um assistente no WhatsApp. Responda de forma direta, em português, salvo se pedirem outro idioma.';

// OpenAI error → message for the chat (never contains the key)
function errorOpenAi(err, timeout) {
    if (err.code === 'ECONNABORTED') return `⏱️ A OpenAI não respondeu em ${timeout / 1000}s. Tente de novo ou aumente o openai.timeout.ms.`;
    if (err.response?.status === 401) return '🔑 API key da OpenAI inválida. Confira o OPENAI_API_KEY ou o openai.api.key.';
    if (err.response?.status === 429) return '💸 Limite ou créditos da OpenAI esgotados. Tente mais tarde.';
    return `❌ Erro no /gpt: ${err.response?.data?.error?.message || err.message}`;
}

async function cmdGpt({ msg, args, quotedMsg }) {
    const apiKey = envOuSetting('OPENAI_API_KEY', 'openai.api.key');

    if (!apiKey) {
        await msg.reply('⚠️ API key da OpenAI não encontrada: o /gpt está desativado.\n💡 _Defina OPENAI_API_KEY no config/.env ou use /set openai.api.key <chave>_');
        return;
    }

    // Replying to a message, its text goes before the question
    const question = [quotedMsg?.body, args].filter(Boolean).join('\n\n').trim();

    if (!question) {
        await msg.reply('```' + getCommandSyntax('/gpt') + '```');
        return;
    }

    const timeout = envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms');

    try {
        // "digitando..." enquanto a OpenAI responde (pode levar alguns segundos)
        msg.getChat().then(chat => chat.sendStateTyping()).catch(() => {});

        const { data } = await axios.post(OPENAI_URL, {
            model: process.env.OPENAI_MODEL?.trim() || OPENAI_MODEL_DEFAULT,
            messages: [
                { role: 'system', content: GPT_INSTRUCTIONS },
                { role: 'user', content: question }
            ]
        }, {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout
        });

        let reply = data.choices?.[0]?.message?.content?.trim() || '(resposta vazia)';

        // The reply never starts with "/": it must not be read as a command (see markSentByBot)
        if (reply.startsWith('/')) reply = `🤖 ${reply}`;

        await msg.reply(reply);
    } catch (err) {
        // On a 401 OpenAI's message carries a piece of the key: it does not go to the log
        const status = err.response?.status;
        printError('/gpt:', status ?? '', status === 401 ? 'API key inválida' : err.response?.data?.error?.message || err.message);
        await msg.reply(errorOpenAi(err, timeout));
    }
}

module.exports = {
    cmdGpt
};
