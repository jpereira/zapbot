/*
 * /traduzir: Traduz o texto pelo Google Translate
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/traduzir',
    usage: '/traduzir [-para <idioma>] [texto]',
    aliases: ['/translate'],
    summary: 'Traduz o texto pelo Google Translate',
    help: 'Traduz o texto (ou a mensagem respondida) pelo Google Translate, sem chave e sem custo. O idioma de origem é detectado.',
    ex: ['/traduzir Where is the pharmacy?', '/traduzir -para en bom dia', '/translate -p es'],
    cmd_opts: [
        {
            opts: ['list', 'l'],
            values: [],
            desc: 'Lista os idiomas aceitos, com o código.',
            ex: ['/traduzir -l']
        },
        {
            opts: ['para', 'p'],
            values: ['<idioma>'],
            desc: 'Idioma de destino, pelo código: en, es, fr, zh-CN... Padrão: setting traduzir.lang (pt).',
            ex: ['/traduzir -para en bom dia']
        },
        {
            argv: ['[texto]'],
            desc: 'Texto a traduzir (até 5000 caracteres). Sem ele, a mensagem respondida.'
        }
    ],
    role: USER
};
