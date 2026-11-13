/*
 * Comando /tts: o texto em voz (nota de voz), pela API de voz da OpenAI, como o /gpt -voz.
 *   /tts <texto>          → fala o texto
 *   /tts, respondendo     → fala a mensagem respondida (um áudio é transcrito antes); o que foi
 *                           digitado vira o estilo da fala ("fale como um robô")
 */

const { falarTexto } = require('./gpt');
const { SEM_CHAVE, chaveOpenAi, medirConsumo } = require('../openaiChat');
const { semOpcao } = require('./openaiComum');

async function cmdTts({ msg, args, opts, quotedMsg }) {
    if (!chaveOpenAi()) {
        await msg.reply(SEM_CHAVE('/tts'));
        return;
    }
    await medirConsumo(opts?.given.has('status'), () => falarTexto(msg, semOpcao(args, 'status|s'), quotedMsg, '/tts'));
}

module.exports = { cmdTts };
