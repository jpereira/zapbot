/*
 * /tldr: Resume a conversa do chat pelo ChatGPT
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/tldr',
    usage: '/tldr [-status|-s] [OPÇÃO] [período]',
    aliases: ['/resumo'],
    summary: 'Resume a conversa do chat pelo ChatGPT',
    help: 'Resume a conversa do chat pelo ChatGPT: assuntos, decisões e pendências. Os áudios (os mais recentes) são transcritos e entram no resumo com quem enviou e quando.',
    cmd_opts: [
        {
            opts: ['chat', 'c'],
            values: ['<nome>'],
            desc: 'Resume outro chat, buscado pelo nome (todas as palavras, sem diferenciar acentos).',
            outrosChats: true
        },
        {
            opts: ['pv'],
            values: [],
            desc: 'Envia no seu privado em vez de expor no chat atual.',
            outrosChats: true
        },
        {
            opts: ['status', 's'],
            values: [],
            desc: 'Acrescenta no rodapé da resposta o consumo da chamada: bytes enviados (TX) e recebidos (RX) e tokens gastos. Para deixar sempre ligado: /set openai.status true.',
            ex: ['/tldr -s 2h'],
            cron: false
        },
        {
            argv: ['[período]'],
            desc: '2h ou 30m: as mensagens desse tempo para cá; 300: as últimas 300 (máx. tldr.maxMsgs). Padrão: as últimas 100.'
        }
    ],
    estrito: 'primeira',
    delegavel: true,
    role: ADMIN // delegável: gasta a API do dono, só o chat atual
};
