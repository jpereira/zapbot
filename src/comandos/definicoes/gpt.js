/*
 * /gpt: Pergunta ao ChatGPT
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/gpt',
    usage: '/gpt [pergunta]  ou  /gpt -model [modelo]',
    aliases: ['/ai'],
    summary: 'Pergunta ao ChatGPT',
    help: 'Pergunta ao ChatGPT (OpenAI). Respondendo uma mensagem, o texto dela entra na pergunta. Precisa de OPENAI_API_KEY no config/.env ou do setting openai.api.key.',
    cmd_opts: [
        {
            opts: ['model', 'm'],
            values: ['[modelo]'],
            desc: 'Troca o modelo (setting openai.api.model). Sem modelo, lista o atual e os aceitos.',
            role: ADMIN
        },
        { argv: ['<pergunta>'], desc: 'O que perguntar.', ex: ['/gpt explique SSRF em 3 linhas'] }
    ],
    delegavel: true,
    role: ADMIN // delegável: gasta a API do dono (o -model é só do dono)
};
