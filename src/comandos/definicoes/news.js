/*
 * /news: Manchetes mais recentes dos feeds RSS
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/news',
    usage: '/news <-hack|-g1|-gazeta|-brasil> [quantidade]',
    aliases: ['/noticias'],
    summary: 'Manchetes mais recentes dos feeds RSS',
    help: 'Manchetes mais recentes dos feeds RSS, com fonte, data e link. Categorias combinam: /news -g1 -gazeta. Feeds de cada uma no setting news.<categoria>.',
    cmd_opts: [
        {
            opts: ['hack', 'hacknews'],
            values: [],
            desc: 'Hacking/segurança: The Hacker News, BleepingComputer, Krebs.'
        },
        { opts: ['g1'], values: [], desc: 'g1 (últimas notícias).' },
        { opts: ['gazeta', 'gaz'], values: [], desc: 'Gazeta do Povo (Brasil).' },
        {
            opts: ['brasil', 'br'],
            values: [],
            desc: 'Blogs sobre o Brasil listados no feedspot (em inglês, na maioria).'
        },
        {
            argv: ['quantidade'],
            desc: 'Manchetes, de 1 a 10 (padrão: setting news.max, 5).',
            ex: ['/news -hack 3']
        }
    ],
    role: USER,
    cron: true
};
