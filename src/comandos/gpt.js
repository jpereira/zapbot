/*
 * Comando /gpt.
 */

const axios = require('axios');

const { getCommandSyntax } = require('./base');
const { printError } = require('../log');
const { OPENAI_MODELOS } = require('../openai');
const { envOuSetting, getSetting, setSetting } = require('../settings');

/*
 * /gpt: pergunta ao ChatGPT. Chave, modelo e timeout vêm do config/.env
 * (OPENAI_API_KEY, OPENAI_MODEL, OPENAI_TIMEOUT_MS) ou, na falta deles, dos
 * settings 'openai.api.key', 'openai.api.model' e 'openai.timeout.ms'. A chave nunca é logada nem ecoada: o erro devolvido é só
 * a mensagem da API.
 */
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const GPT_INSTRUCOES = 'Você é um assistente no WhatsApp. Responda de forma direta, em português, salvo se pedirem outro idioma.';

// Erro da OpenAI → mensagem para o chat (nunca contém a chave)
function erroOpenAi(err, timeout) {
    if (err.code === 'ECONNABORTED') return `⏱️ A OpenAI não respondeu em ${timeout / 1000}s. Tente de novo ou aumente o openai.timeout.ms.`;
    if (err.response?.status === 401) return '🔑 API key da OpenAI inválida. Confira o OPENAI_API_KEY ou o openai.api.key.';
    if (err.response?.status === 429) return '💸 Limite ou créditos da OpenAI esgotados. Tente mais tarde.';
    return `❌ Erro no /gpt: ${err.response?.data?.error?.message || err.message}`;
}

// /gpt -m: sem modelo lista o atual e os aceitos; com modelo, grava o setting
async function trocarModelo(msg, modelo) {
    const doEnv = process.env.OPENAI_MODEL?.trim();

    if (!modelo) {
        const atual = envOuSetting('OPENAI_MODEL', 'openai.api.model');
        await msg.reply(`🤖 *Modelo do /gpt:* ${atual}${doEnv ? ' _(do OPENAI_MODEL no .env)_' : ''}\n\n` +
            '*Aceitos:*\n' + OPENAI_MODELOS.map(m => `${m === atual ? '✅' : '▫️'} ${m}`).join('\n') +
            '\n\n💡 _/gpt -m <modelo> troca (setting openai.api.model)._');
        return;
    }

    try {
        await setSetting('openai.api.model', modelo);
    } catch (e) {
        await msg.reply(`❌ Modelo ${e.message}`);
        return;
    }
    await msg.reply(`✅ Modelo do /gpt: *${getSetting('openai.api.model')}*` +
        (doEnv ? `\n⚠️ _O OPENAI_MODEL do .env (${doEnv}) tem prioridade enquanto estiver definido._` : ''));
}

async function cmdGpt({ msg, args, opts, quotedMsg }) {
    if (opts?.given.has('model')) {
        await trocarModelo(msg, opts.opt.model);
        return;
    }

    const apiKey = envOuSetting('OPENAI_API_KEY', 'openai.api.key');

    if (!apiKey) {
        await msg.reply('⚠️ API key da OpenAI não encontrada: o /gpt está desativado.\n💡 _Defina OPENAI_API_KEY no config/.env ou use /set openai.api.key <chave>_');
        return;
    }

    // Respondendo uma mensagem, o texto dela entra antes da pergunta
    const pergunta = [quotedMsg?.body, args].filter(Boolean).join('\n\n').trim();

    if (!pergunta) {
        await msg.reply('```' + getCommandSyntax('/gpt') + '```');
        return;
    }

    const timeout = envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms');

    try {
        // "digitando..." enquanto a OpenAI responde (pode levar alguns segundos)
        msg.getChat().then(chat => chat.sendStateTyping()).catch(() => {});

        const { data } = await axios.post(OPENAI_URL, {
            model: envOuSetting('OPENAI_MODEL', 'openai.api.model'),
            messages: [
                { role: 'system', content: GPT_INSTRUCOES },
                { role: 'user', content: pergunta }
            ]
        }, {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout
        });

        let resposta = data.choices?.[0]?.message?.content?.trim() || '(resposta vazia)';

        // A resposta nunca começa com "/": não pode ser lida como comando (ver marcarEnviadaPeloBot)
        if (resposta.startsWith('/')) resposta = `🤖 ${resposta}`;

        await msg.reply(resposta);
    } catch (err) {
        // No 401 a mensagem da OpenAI traz um pedaço da chave: não vai para o log
        const status = err.response?.status;
        printError('/gpt:', status ?? '', status === 401 ? 'API key inválida' : err.response?.data?.error?.message || err.message);
        await msg.reply(erroOpenAi(err, timeout));
    }
}

module.exports = {
    cmdGpt
};
