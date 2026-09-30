/*
 * Comando /cache.
 */

const { formatErrorCommand } = require('./base');
const { CACHE_DIR } = require('../constants');
const { dbGet } = require('../db');
const { cleanFilesOld, cleanCacheOld, cleanEditedOld, cleanStatsOld, cleanAll, cleanWatchOld } = require('../cleanup');
const { printError } = require('../log');
const { humanSize, listCacheLevelOnly } = require('../util/files');

async function cmdCache({ msg, opts }) {
    try {
        let textMsg;

        if (opts.opt.clean && opts.opt.force) {
            // General cleanup: messages, deleted ones, media, temporaries
            const r = await cleanAll();

            textMsg =
                '🧹 *Limpeza geral concluída* (force)\n\n' +
                `🗄️ Mensagens removidas: *${r.total}* _(${r.apagadas} apagada${r.apagadas === 1 ? '' : 's'})_\n` +
                `✏️ Edições removidas: *${r.editadas}*\n` +
                `💾 Espaço liberado: *${humanSize(r.liberado)}*`;
        } else if (opts.opt.clean) {
            // Normal cleanup: only what is past the retention windows
            await cleanCacheOld();
            await cleanFilesOld();
            await cleanWatchOld();
            await cleanEditedOld();
            await cleanStatsOld();

            textMsg = '🧹 Cache limpo (itens fora da janela de retenção).\n';
        } else {
            const { total, apagadas: deletedAlt } = await dbGet(
                'SELECT COUNT(*) AS total, COALESCE(SUM(revoked), 0) AS apagadas FROM messages'
            );
            const { editadas: edited } = await dbGet('SELECT COUNT(*) AS editadas FROM message_edits');

            textMsg = `🗂️ Exibindo conteúdo de ${CACHE_DIR}/*`;
            textMsg += '\n\n```' + listCacheLevelOnly(CACHE_DIR) + '```\n\n';
            textMsg += `🗄️ Existem ${total} mensagens no cache (${deletedAlt} apagadas) e ${edited} edições.`;
        }

        await msg.reply(textMsg, null, { linkPreview: false });
    } catch (e) {
        printError(e.message);
        await msg.reply(formatErrorCommand(e), null, { linkPreview: false });
    }
}

module.exports = {
    cmdCache
};
