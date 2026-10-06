/*
 * Comando /cache.
 */

const { deleteAllBackups, listBackups } = require('../backup');
const { formatErrorCommand } = require('./base');
const { BACKUP_DIR, CACHE_DIR, MEDIA_DIR } = require('../constants');
const { dbGet } = require('../db');
const { cleanFilesOld, cleanCacheOld, cleanEditedOld, cleanPollsOld, cleanIgnoredOld, cleanMedia, cleanStatsOld, cleanAll, cleanWatchOld } = require('../cleanup');
const { printError } = require('../log');
const { humanSize, listCacheLevelOnly } = require('../util/files');
const { plural } = require('../util/format');

async function cmdCache({ msg, opts }) {
    try {
        let textMsg;

        if (opts.opt.all) {
            // Everything: messages, deleted, edited, media, temporaries and backups
            const r = await cleanAll();

            textMsg =
                `🧹 *Limpeza geral concluída* _(${CACHE_DIR})_\n\n` +
                `🗄️ Mensagens removidas: *${r.total}* _(${r.apagadas} apagada${r.apagadas === 1 ? '' : 's'})_\n` +
                `✏️ Edições removidas: *${r.editadas}*\n` +
                `📦 Backups removidos: *${r.backups}*\n` +
                `💾 Espaço liberado: *${humanSize(r.liberado)}*`;
        } else if (opts.opt.clean || opts.opt.media || opts.opt.backup) {
            const partsAlt = [];

            // Normal cleanup: only what is past the retention windows
            if (opts.opt.clean) {
                await cleanCacheOld();
                await cleanFilesOld();
                await cleanWatchOld();
                await cleanEditedOld();
                await cleanStatsOld();
                await cleanPollsOld();
                await cleanIgnoredOld();
                partsAlt.push('🧹 Cache limpo (itens fora da janela de retenção).');
            }

            if (opts.opt.media) {
                const r = await cleanMedia();
                partsAlt.push(`🖼️ Mídias apagadas de ${MEDIA_DIR}: *${r.arquivos}* _(${humanSize(r.bytes)})_`);
            }

            if (opts.opt.backup) {
                const r = await deleteAllBackups();
                partsAlt.push(`📦 Backups apagados de ${BACKUP_DIR}: *${r.backups}* _(${humanSize(r.bytes)})_`);
            }

            textMsg = partsAlt.join('\n');
        } else {
            const { total, apagadas: deletedAlt } = await dbGet(
                'SELECT COUNT(*) AS total, COALESCE(SUM(revoked), 0) AS apagadas FROM messages'
            );
            const { editadas: edited } = await dbGet('SELECT COUNT(*) AS editadas FROM message_edits');

            textMsg = `🗂️ Exibindo conteúdo de ${CACHE_DIR}/*`;
            textMsg += '\n\n```' + listCacheLevelOnly(CACHE_DIR) + '```\n\n';
            textMsg += `🗄️ ${plural(total, 'mensagem', 'mensagens')} no cache.\n`;
            textMsg += `🗑️ ${plural(deletedAlt, 'apagada', 'apagadas')}.\n`;
            textMsg += `✏️ ${plural(edited, 'edição', 'edições')}.\n`;
            textMsg += `📦 Backups: ${(await listBackups()).length} (veja /backup).`;
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
