/*
 * /whois: Mostra quem é e o que pode no bot, neste chat
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/whois',
    usage: '/whois [pessoa...]',
    aliases: ['/who', '/id'],
    summary: 'Mostra quem é e o que pode no bot, neste chat',
    help: 'Mostra quem é e o que pode no bot, neste chat: 🤖 dono, 👑 admin (+a), 🗣️ usuário (+u) ou 🚫 sem permissão; quem tem os comandos limitados (/bot +cmd), com a lista deles. Sozinho, mostra você. Com pessoas (ou respondendo uma mensagem), mostra elas, mas só para o dono e os admins.',
    ex: ['/whois', '/whois /Rafael Silva/'],
    cmd_opts: [
        {
            argv: ['[pessoa...]'],
            desc: 'Só o dono e os admins: /nome/, @menção ou +número (vários de uma vez). Respondendo uma mensagem, sem pessoa: quem a escreveu.',
            ex: ['/whois @Fulano', '/whois +5521999999999']
        }
    ],
    role: USER
};
