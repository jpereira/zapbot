/*
 * /profile: A foto de perfil de um contato
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/profile',
    usage: '/profile [/contato/|@menção|+número]...',
    aliases: ['/perfil'],
    summary: 'A foto de perfil de um contato',
    help: 'A foto de perfil de um contato, com a legenda Contato: nome na sua agenda <telefone>. Sem ninguém, mostra o da pessoa do privado (no seu próprio privado, o seu) ou, no grupo, a foto do grupo; respondendo uma mensagem, o de quem a escreveu. Sem foto, ou com a foto escondida pela privacidade do contato, sai só o texto.',
    ex: ['/profile', '/profile /Jorge Pereira/', '/profile @Fulano', '/profile +5521999999999'],
    cmd_opts: [
        {
            argv: ['[/contato/|@menção|+número]...'],
            desc: 'As pessoas: contato da agenda pelo nome ou parte dele (nome com espaço entre /.../ ou aspas; vários que servem: você escolhe na lista), alguém mencionado com @ ou um número. Sem ninguém, o da pessoa do privado (no seu próprio, o seu), a foto do grupo no grupo, ou o de quem escreveu a mensagem respondida.',
            outrosChats: true
        },
        {
            opts: ['mask', 'm'],
            values: [],
            desc: 'Ofusca telefones com 10 a 15 dígitos contínuos na saída desta execução, mantendo os cinco primeiros e os dois últimos (como +55219****44).',
            ex: ['/profile -mask /Fulano/']
        }
    ],
    mask: true,
    delegavel: true,
    role: ADMIN // delegável: só o chat atual
};
