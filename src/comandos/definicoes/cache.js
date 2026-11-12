/*
 * /cache: Exibe o espaço ocupado pelo cache e limpa
 */

const { BACKUP_DIR, CACHE_DIR, MEDIA_DIR } = require('../../constantes');
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
            desc: `Deletes EVERYTHING in ${CACHE_DIR}: the messages (including the ones kept for /show), temporary files, the media downloaded to ${MEDIA_DIR} and the backups in ${BACKUP_DIR}.`
        },
        { opts: ['backup', 'b'], values: [], desc: `Deletes the /backup backups in ${BACKUP_DIR}.` },
        { opts: ['clean', 'c'], values: [], desc: 'Cleans only what is past the retention windows.' },
        {
            opts: ['media', 'm'],
            values: [],
            desc: `Deletes the media downloaded to ${MEDIA_DIR} (the messages stay, without the file).`
        }
    ],
    role: ADMIN // apaga dados
};
