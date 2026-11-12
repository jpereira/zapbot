/*
 * /join: Entra em um grupo pelo link de convite
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/join',
    usage: '/join <link do convite>  ou  /join -info|-i <link>  ou  /join -l',
    aliases: ['/entrar'],
    summary: 'Entra em um grupo pelo link de convite',
    help: 'Entra em um grupo do WhatsApp pelo link de convite (chat.whatsapp.com/<código>, com ou sem https://, ou só o código). Com -info, mostra o nome, os participantes e a descrição do grupo sem entrar. Com -list, lista os grupos em que você está (o mesmo que /leave -l). Para sair, use /leave.',
    ex: [
        '/join https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv',
        '/join -info chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv',
        '/join -l'
    ],
    cmd_opts: [
        {
            argv: ['<link do convite>'],
            desc: 'O link do grupo (https://chat.whatsapp.com/<código>) ou só o código.',
            ex: ['/join https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv']
        },
        {
            opts: ['info', 'i'],
            values: [],
            desc: 'Mostra o grupo do convite (nome, participantes e descrição) sem entrar.',
            ex: ['/join -info chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv']
        },
        {
            opts: ['list', 'l'],
            values: [],
            desc: 'Lista os grupos em que você está, numerados para o /leave <nº>.'
        }
    ],
    role: ADMIN // entra em grupos
};
