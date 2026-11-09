/*
 * /gpt: Pergunta ao ChatGPT
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/gpt',
    usage: '/gpt [pergunta]  ou  /gpt -model [modelo]  ou  /gpt -usage|-u [dias]  ou  /gpt -voz [texto]',
    aliases: ['/ai'],
    summary: 'Pergunta ao ChatGPT',
    help: 'Pergunta ao ChatGPT (OpenAI). Respondendo uma mensagem, o texto dela entra na pergunta; respondendo uma foto, ela vai junto (o ChatGPT vê a imagem); respondendo um áudio, ele é transcrito; com -voz, o texto vira uma nota de voz de robô. Precisa de OPENAI_API_KEY no config/.env ou do setting openai.api.key.',
    cmd_opts: [
        {
            opts: ['model', 'm'],
            values: ['[modelo]'],
            desc: 'Troca o modelo (setting openai.api.model). Sem modelo, lista o atual e os aceitos.',
            role: ADMIN
        },
        {
            opts: ['voz', 'v'],
            values: [],
            desc: 'Gera uma nota de voz com o texto e responde com o áudio (v1/audio/speech): voz de robô, por padrão. Sem texto digitado, fala o da mensagem respondida. Até 4096 caracteres. O modelo, a voz e o estilo são os settings openai.tts.model, openai.tts.voice e openai.tts.instructions.',
            ex: ['/gpt -voz exterminar todos os humanos', '/gpt -voz (respondendo uma mensagem de texto)'],
            cron: false
        },
        {
            opts: ['usage', 'u'],
            values: ['[dias]'],
            desc: 'O consumo da OpenAI dos últimos dias (padrão 7, até 31): tokens de entrada, saída e cache, requisições, por dia e por modelo, pela Usage API (v1/organization/usage/completions), que pede a chave de admin (OPENAI_ADMIN_KEY ou o setting openai.admin.key). E os limites de agora, lidos dos cabeçalhos x-ratelimit-* de uma chamada mínima ao chat (gasta uns poucos tokens). Só o dono e os admins, mesmo que o /gpt tenha sido liberado a um usuário.',
            ex: ['/gpt -usage [dias]', '/gpt -u 30'],
            role: ADMIN,
            cron: false
        },
        {
            argv: ['<pergunta>'],
            desc: 'O que perguntar. Respondendo uma foto (ou figurinha), ela vai junto da pergunta; sem pergunta, o ChatGPT descreve a foto. Respondendo um áudio ou nota de voz, o /gpt transcreve (sem pergunta, ou com "transcreva") ou, com outra pergunta, responde em cima da transcrição.',
            ex: ['/gpt explique SSRF em 3 linhas', '/gpt qual a raça desse cachorro? (respondendo a foto)', '/gpt agora transcreva isso (respondendo um áudio)', '/gpt resuma esse áudio']
        }
    ],
    delegavel: true,
    role: ADMIN // delegável: gasta a API do dono (o -model e o -usage são só do dono e dos admins)
};
