/*
 * /pixelart: Arte ANSI/ASCII aleatória do 16colo.rs
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/pixelart',
    usage: '/pixelart [OPÇÃO] [pack]',
    aliases: ['/ansi', '/px'],
    summary: 'Arte ANSI/ASCII aleatória do 16colo.rs',
    help: 'Arte ANSI/ASCII aleatória do 16colo.rs, com título e artista. Packs padrão no setting pixelart.packs.',
    cmd_opts: [
        { opts: ['random', 'r'], values: [], desc: 'Sorteia de qualquer pack do arquivo.' },
        { opts: ['year', 'y'], values: ['<ano>'], desc: 'Sorteia de um pack do ano (ex.: 1996).' },
        {
            argv: ['<pack>'],
            desc: 'Nome do pack (ex.: chuck-norris-lvl). Sem ele: setting pixelart.packs.'
        }
    ],
    role: USER,
    cron: true
};
