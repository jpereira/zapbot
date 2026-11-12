/*
 * /batch: Executa vários comandos seguidos, de uma mensagem só
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/batch',
    usage: '/batch [-stop|-s] [-dry|-d] [-quiet|-q] (the commands go on the lines below)',
    aliases: ['/lote'],
    summary: 'Runs several commands in a row, from a single message',
    help: 'Runs several commands in a row, from a single message (or the replied message), and replies with a summary. A line that starts with a command (or alias) opens a block; what comes after, blank lines included, belongs to the same block. With -stop (-s), stops at the first error. With -dry (-d), only shows how the blocks were split, without running. With -quiet (-q), does not reply with the run summary (errors stay only in the log). A block is a command and everything up to the next one (an /ideia with the URL below it, for example). Owner only.',
    ex: ['/batch', '/batch -dry', '/batch -d', '/batch -stop'],
    cmd_opts: [
        {
            opts: ['stop', 's'],
            values: [],
            desc: 'Stops at the first block that fails (the default is to continue).',
            cron: false
        },
        {
            opts: ['dry', 'd'],
            values: [],
            desc: 'Only shows how the blocks were split, without running.',
            cron: false
        },
        {
            opts: ['quiet', 'q'],
            values: [],
            desc: 'Does not reply with the run summary (the ✅/❌ of each block). Does not apply with -dry, which exists only to show the split.',
            cron: false
        }
    ],
    argumentosLivres: true,
    role: ADMIN, // roda vários comandos de uma vez
    cron: false
};
