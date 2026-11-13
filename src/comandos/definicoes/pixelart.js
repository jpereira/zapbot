/*
 * /pixelart: Arte ANSI/ASCII aleatória do 16colo.rs
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/pixelart',
    usage: '/pixelart [OPTION] [pack]',
    aliases: [],
    summary: 'Random ANSI/ASCII art from 16colo.rs',
    help: 'Random ANSI/ASCII art from 16colo.rs, with title and artist. Default packs in the pixelart.packs setting.',
    cmd_opts: [
        { opts: ['random', 'r'], values: [], desc: 'Picks from any pack in the archive.' },
        { opts: ['year', 'y'], values: ['<year>'], desc: 'Picks from a pack of the year (e.g.: 1996).' },
        {
            argv: ['<pack>'],
            desc: 'Pack name (e.g.: chuck-norris-lvl). Without it: pixelart.packs setting.'
        }
    ],
    role: USER,
    cron: true
};
