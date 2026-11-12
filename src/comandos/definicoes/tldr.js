/*
 * /tldr: Resume a conversa do chat pelo ChatGPT
 */

const { ADMIN } = require('../../roles').ROLES;
const { opcaoStatus } = require('./_opcoes');

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
        opcaoStatus('/tldr -s 2h'),
        {
            argv: ['[período]'],
            desc: '2h ou 30m: as mensagens desse tempo para cá; 300: as últimas 300 (máx. tldr.maxMsgs). Padrão: as últimas 100. Respondendo uma mensagem (sem período nem -c): da mensagem respondida até agora.'
        }
    ],
    estrito: 'primeira',
    delegavel: true,
    role: ADMIN // delegável: gasta a API do dono, só o chat atual
};
