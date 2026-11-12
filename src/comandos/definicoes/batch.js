/*
 * /batch: Executa vários comandos seguidos, de uma mensagem só
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/batch',
    usage: '/batch [-stop|-s] [-dry|-d] [-quiet|-q] (os comandos vêm nas linhas de baixo)',
    aliases: ['/lote'],
    summary: 'Executa vários comandos seguidos, de uma mensagem só',
    help: 'Executa vários comandos seguidos, de uma mensagem só (ou da mensagem respondida), e responde um resumo. Uma linha que começa com um comando (ou alias) abre um bloco; o que vem depois, linhas em branco inclusas, é do mesmo bloco. Com -stop (-s), para no primeiro erro. Com -dry (-d), só mostra como separou os blocos, sem executar. Com -quiet (-q), não responde o resumo da execução (os erros ficam só no log). Um bloco é um comando e tudo até o próximo (um /ideia com a URL embaixo, por exemplo). Só o dono usa.',
    ex: ['/batch', '/batch -dry', '/batch -d', '/batch -stop'],
    cmd_opts: [
        {
            opts: ['stop', 's'],
            values: [],
            desc: 'Para no primeiro bloco que falhar (o padrão é continuar).',
            cron: false
        },
        {
            opts: ['dry', 'd'],
            values: [],
            desc: 'Só mostra como os blocos foram separados, sem executar.',
            cron: false
        },
        {
            opts: ['quiet', 'q'],
            values: [],
            desc: 'Não responde o resumo da execução (o ✅/❌ de cada bloco). Não vale com -dry, que só existe para mostrar a separação.',
            cron: false
        }
    ],
    argumentosLivres: true,
    role: ADMIN, // roda vários comandos de uma vez
    cron: false
};
