/*
 * /me: Envia a mensagem digitada
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/me',
    usage: '/me [-repeat|-r <n>] <mensagem>',
    aliases: [],
    summary: 'Envia a mensagem digitada',
    help: 'Envia a mensagem digitada. {/comando args} roda na hora e a resposta entra no lugar (só comandos de consulta, como no /cron). O \\n digitado vira quebra de linha.',
    ex: ['/me O Bitcoin está em {/crypto BTC}', '/me Linha 1\\nLinha 2', '/me -r 3 Haha!'],
    cmd_opts: [
        {
            opts: ['repeat', 'r'],
            values: ['<n>'],
            desc: 'Repete o texto n vezes (de 1 a me.maxRepeat, padrão 500), emendado, numa mensagem só; os {/comando} rodam uma vez só.',
            ex: ['/me -r 3 Haha! envia Haha!Haha!Haha!']
        }
    ],
    role: USER
};
