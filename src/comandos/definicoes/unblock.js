/*
 * /unblock: Desbloqueia pessoas bloqueadas
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/unblock',
    usage: '/unblock [/contato/|@menção|+número|nº]  ou  /unblock -all',
    summary: 'Desbloqueia pessoas bloqueadas',
    help: 'Desbloqueia uma pessoa bloqueada (pelo /block ou no celular), ou todas com -all. Respondendo uma mensagem, desbloqueia quem a escreveu. Sem nada, lista os bloqueados.',
    cmd_opts: [
        {
            opts: ['all', 'a'],
            values: [],
            desc: 'Desbloqueia todos os bloqueados (inclusive os que você bloqueou no celular).',
            ex: ['/unblock -all']
        },
        {
            argv: ['[/contato/|@menção|+número|nº]'],
            desc: 'A pessoa, como no /block, ou o nº da lista do /block.',
            ex: ['/unblock /Fulano/', '/unblock 2']
        }
    ],
    role: ADMIN // mexe na conta do WhatsApp
};
