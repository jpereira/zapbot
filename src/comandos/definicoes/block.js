/*
 * /block: Bloqueia pessoas na sua conta do WhatsApp
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/block',
    usage: '/block [/contato/|@menção|+número]...  ou  /block -l',
    aliases: ['/bloquear'],
    summary: 'Bloqueia pessoas na sua conta do WhatsApp',
    help: 'Bloqueia uma ou várias pessoas na sua conta do WhatsApp, como o Bloquear do celular. Respondendo uma mensagem, bloqueia quem a escreveu. Sem nada, lista os bloqueados (inclusive os que você bloqueou no celular), numerados para o /unblock <nº>. Grupos não se bloqueiam.',
    cmd_opts: [
        {
            opts: ['list', 'l'],
            values: [],
            desc: 'Lista os bloqueados (o mesmo que /block sem nada).'
        },
        {
            argv: ['[/contato/|@menção|+número]...'],
            desc: 'As pessoas, separadas por espaço: contato da agenda pelo nome ou parte dele (nome com espaço entre /.../ ou aspas; vários que servem: você escolhe na lista), alguém mencionado com @ ou um número. Palavras soltas, sem número, menção, barras nem aspas, são um nome só.',
            ex: [
                '/block /Fulano/',
                '/block +5521999999999',
                '/block +5521999999999 +5521988888888 @Fulano'
            ]
        },
        {
            opts: ['mask', 'm'],
            values: [],
            desc: 'Ofusca telefones com 10 a 15 dígitos contínuos na saída desta execução, mantendo os cinco primeiros e os dois últimos (como +55219****44).',
            ex: ['/block -mask']
        }
    ],
    mask: true,
    role: ADMIN // mexe na conta do WhatsApp
};
