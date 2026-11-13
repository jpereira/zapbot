/*
 * /cache: Exibe o espaço ocupado pelo cache e limpa
 */

const { CACHE_DIR } = require('../../constantes');
const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/cache',
    usage: '/cache [OPTION]',
    aliases: [],
    summary: 'Shows the space used by the cache and cleans it',
    help: `Shows the space used in ${CACHE_DIR} and cleans the cache.`,
    cmd_opts: [
        {
            opts: ['all', 'a'],
            values: [],
            desc: 'Deletes everything in the cache (messages, media, backups).'
        },
        { opts: ['backup', 'b'], values: [], desc: 'Deletes the /backup backups.' },
        { opts: ['clean', 'c'], values: [], desc: 'Cleans only what is past the retention windows.' },
        {
            opts: ['media', 'm'],
            values: [],
            desc: 'Deletes the downloaded media (the messages stay).'
        }
    ],
    role: ADMIN // apaga dados
};
