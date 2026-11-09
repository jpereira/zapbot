/*
 * Comando /gpt.
 */

const { getCommandSyntax } = require('./base');
const { OPENAI_MODELS } = require('../openai');
const { WITHOUT_KEY, keyOpenAi, errorOpenAi, askOnChat } = require('../openaiChat');
const { envOuSetting, getSetting, setSetting } = require('../settings');

/*
 * /gpt: asks ChatGPT (the call and the errors live in openaiChat.js).
 */
const GPT_INSTRUCTIONS = 'Você é um assistente no WhatsApp. Responda de forma direta, em português, salvo se pedirem outro idioma.';

// /gpt -m: without a model lists the current one and the accepted ones; with a model, saves the setting
async function swapModel(msg, modelAlt) {
    const doEnv = process.env.OPENAI_MODEL?.trim();

    if (!modelAlt) {
        const current = envOuSetting('OPENAI_MODEL', 'openai.api.model');
        await msg.reply(`🤖 *Modelo do /gpt:* ${current}${doEnv ? ' _(do OPENAI_MODEL no .env)_' : ''}\n\n` +
            '*Aceitos:*\n' + OPENAI_MODELS.map(m => `${m === current ? '✅' : '▫️'} ${m}`).join('\n') +
            '\n\n💡 _/gpt -m <modelo> troca (setting openai.api.model)._');
        return;
    }

    try {
        await setSetting('openai.api.model', modelAlt);
    } catch (e) {
        await msg.reply(`❌ Modelo ${e.message}`);
        return;
    }
    await msg.reply(`✅ Modelo do /gpt: *${getSetting('openai.api.model')}*` +
        (doEnv ? `\n⚠️ _O OPENAI_MODEL do .env (${doEnv}) tem prioridade enquanto estiver definido._` : ''));
}

async function cmdGpt({ msg, args, opts, quotedMsg }) {
    if (opts?.given.has('model')) {
        await swapModel(msg, opts.opt.model);
        return;
    }

    if (!keyOpenAi()) {
        await msg.reply(WITHOUT_KEY('/gpt'));
        return;
    }

    // Replying to a message, its text goes before the question
    const question = [quotedMsg?.body, args].filter(Boolean).join('\n\n').trim();

    if (!question) {
        await msg.reply('```' + getCommandSyntax('/gpt') + '```');
        return;
    }

    try {
        const reply = await askOnChat({ cmd: '/gpt', sistema: GPT_INSTRUCTIONS, texto: question });

        // The 🤖 in front also guarantees the reply never starts with "/" (see markSentByBot)
        await msg.reply(`🤖 ${reply}`);
    } catch (err) {
        await msg.reply(errorOpenAi(err, '/gpt'));
    }
}

module.exports = {
    cmdGpt
};
