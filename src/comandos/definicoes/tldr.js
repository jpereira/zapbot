/*
 * /tldr: Resume a conversa do chat pelo ChatGPT
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/tldr',
    usage: '/tldr [OPÇÃO] [período]',
    aliases: ['/resumo'],
    summary: 'Resume a conversa do chat pelo ChatGPT',
    help: 'Resume a conversa do chat pelo ChatGPT: assuntos, decisões e pendências.',
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
            argv: ['[período]'],
            desc: '2h ou 30m: as mensagens desse tempo para cá; 300: as últimas 300 (máx. tldr.maxMsgs). Padrão: as últimas 100.'
        }
    ],
    delegavel: true,
    role: ADMIN // delegável: gasta a API do dono, só o chat atual
};
