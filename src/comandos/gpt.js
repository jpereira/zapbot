/*
 * Comando /gpt.
 */

const { getCommandSyntax } = require('./base');
const { OPENAI_MODELOS } = require('../openai');
const { SEM_CHAVE, chaveOpenAi, erroOpenAi, perguntarAoChat } = require('../openaiChat');
const { envOuSetting, getSetting, setSetting } = require('../settings');

/*
 * /gpt: pergunta ao ChatGPT (a chamada e os erros ficam no openaiChat.js).
 */
const GPT_INSTRUCOES = 'Você é um assistente no WhatsApp. Responda de forma direta, em português, salvo se pedirem outro idioma.';

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

    if (!chaveOpenAi()) {
        await msg.reply(SEM_CHAVE('/gpt'));
        return;
    }

    // Respondendo uma mensagem, o texto dela entra antes da pergunta
    const pergunta = [quotedMsg?.body, args].filter(Boolean).join('\n\n').trim();

    if (!pergunta) {
        await msg.reply('```' + getCommandSyntax('/gpt') + '```');
        return;
    }

    try {
        // "digitando..." enquanto a OpenAI responde (pode levar alguns segundos)
        msg.getChat().then(chat => chat.sendStateTyping()).catch(() => {});

        let resposta = await perguntarAoChat({ cmd: '/gpt', sistema: GPT_INSTRUCOES, texto: pergunta });

        // A resposta nunca começa com "/": não pode ser lida como comando (ver marcarEnviadaPeloBot)
        if (resposta.startsWith('/')) resposta = `🤖 ${resposta}`;

        await msg.reply(resposta);
    } catch (err) {
        await msg.reply(erroOpenAi(err, '/gpt'));
    }
}

module.exports = {
    cmdGpt
};
