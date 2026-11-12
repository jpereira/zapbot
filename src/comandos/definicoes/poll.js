/*
 * /poll: Cria uma enquete no chat ou mostra o resultado
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/poll',
    usage: '/poll [-m] <pergunta> | <opção 1> | <opção 2> [| ...]  ou  /poll -r',
    aliases: ['/enquete', '/quiz'],
    summary: 'Cria uma enquete no chat ou mostra o resultado',
    help: 'Cria uma enquete no chat (separe pergunta e opções, de 2 a 12, com | ou uma por linha) ou mostra o resultado com -r.',
    cmd_opts: [
        {
            opts: ['multi', 'm'],
            values: [],
            desc: 'Permite marcar mais de uma opção (só no começo do texto).'
        },
        {
            opts: ['result', 'r'],
            values: [],
            desc: 'Resultado da enquete mais recente do chat (ou da enquete respondida): votos por opção e quem votou.'
        }
    ],
    delegavel: true,
    role: ADMIN // delegável: cria no chat atual
};
