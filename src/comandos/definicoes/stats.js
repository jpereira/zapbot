/*
 * /stats: Ranking do chat: quem mais fala, apaga e edita
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/stats',
    usage: '/stats [-N] [/chat/] [-me]  ou  /stats -l  ou  /stats -flush </chat/>  ou  /stats -flush-all',
    aliases: ['/estatisticas'],
    summary: 'Ranking do chat: quem mais fala, apaga e edita',
    help: 'Ranking do chat atual ou de outro (/Grupo/): quem mais fala, apaga e edita, horários e dia de pico. Com -me, as suas estatísticas. O -l lista os chats com estatísticas; o -flush apaga as de um chat e o -flush-all, todas.',
    cmd_opts: [
        {
            opts: ['flush', 'f'],
            values: ['</chat/>'],
            desc: 'Apaga as estatísticas de um chat: um grupo, ou o privado com uma pessoa, buscado pelo nome entre os que têm estatísticas.',
            ex: ['/stats -flush /Grupo Família/'],
            cron: false,
            role: ADMIN
        },
        {
            opts: ['flush-all'],
            values: [],
            desc: 'Apaga as estatísticas de todos os chats.',
            cron: false,
            role: ADMIN
        },
        {
            opts: ['list', 'l'],
            values: [],
            desc: 'Lista os chats com estatísticas, do que mais fala para o que menos, com o total e o dia da última mensagem.',
            outrosChats: true
        },
        {
            opts: ['me'],
            values: [],
            desc: 'As suas mensagens, somadas em todos os chats (ou só no /chat/): onde você mais fala, horários e pico.',
            outrosChats: true
        },
        {
            argv: ['-N'],
            desc: 'Período em dias (padrão 7, máx. stats.retentionDays). Vem antes ou depois do /chat/.',
            ex: ['/stats -30', '/stats /Grupo Família/ -10'],
            numero: true
        },
        {
            argv: ['</chat/>'],
            desc: 'Outro chat em vez do atual: um grupo, ou o privado com uma pessoa, buscado pelo nome (sem diferenciar maiúsculas e acentos) entre os que têm estatísticas; vários com o nome: você escolhe na lista.',
            ex: ['/stats /Grupo Família/', '/stats -10 /Família/', '/stats -me /Família/'],
            outrosChats: true
        }
    ],
    estrito: true,
    delegavel: true,
    role: ADMIN, // delegável: só o chat atual (o -flush é só do dono)
    cron: true
};
