/*
 * Comando /cache.
 */

const { deleteAllBackups, listBackups } = require('../backup');
const { formatErrorCommand } = require('./base');
const { BACKUP_DIR, CACHE_DIR, MEDIA_DIR } = require('../constants');
const { dbGet } = require('../db');
const { cleanFilesOld, cleanCacheOld, cleanEditedOld, cleanPollsOld, cleanIgnoredOld, cleanMedia, cleanReactionsOld, cleanStatsOld, cleanAll, cleanWatchOld } = require('../cleanup');
const { t } = require('../i18n');
const { printError } = require('../log');
const { humanSize, listCacheLevelOnly } = require('../util/files');
const { countAlt } = require('../util/count');

async function cmdCache({ msg, opts }) {
    try {
        let textMsg;

        if (opts.opt.all) {
            // Everything: messages, deleted, edited, reactions, media, temporaries and backups
            const r = await cleanAll();

            textMsg = t('cache.allDone', {
                dir: CACHE_DIR,
                total: r.total,
                deleted: countAlt('cache.deletedCount', r.deleted),
                edited: r.edited,
                reactions: r.reactions,
                backups: r.backups,
                freed: humanSize(r.allowed)
            });
        } else if (opts.opt.clean || opts.opt.media || opts.opt.backup) {
            const partsAlt = [];

            // Normal cleanup: only what is past the retention windows
            if (opts.opt.clean) {
                await cleanCacheOld();
                await cleanFilesOld();
                await cleanWatchOld();
                await cleanEditedOld();
                await cleanReactionsOld();
                await cleanStatsOld();
                await cleanPollsOld();
                await cleanIgnoredOld();
                partsAlt.push(t('cache.cleaned'));
            }

            if (opts.opt.media) {
                const r = await cleanMedia();
                partsAlt.push(t('cache.mediaDeleted', { dir: MEDIA_DIR, count: r.files, size: humanSize(r.bytes) }));
            }

            if (opts.opt.backup) {
                const r = await deleteAllBackups();
                partsAlt.push(t('cache.backupsDeleted', { dir: BACKUP_DIR, count: r.backups, size: humanSize(r.bytes) }));
            }

            textMsg = partsAlt.join('\n');
        } else {
            const { total, deleted: deletedAlt } = await dbGet(
                'SELECT COUNT(*) AS total, COALESCE(SUM(revoked), 0) AS deleted FROM messages'
            );
            const { edited } = await dbGet('SELECT COUNT(*) AS edited FROM message_edits');
            const { reactions } = await dbGet('SELECT COUNT(*) AS reactions FROM reaction_changes');

            textMsg = t('cache.showing', { dir: CACHE_DIR });
            textMsg += '\n\n```' + listCacheLevelOnly(CACHE_DIR) + '```\n\n';
            textMsg += t('cache.messages', { messages: countAlt('cache.messagesCount', total) });
            textMsg += t('cache.deletedLine', { deleted: countAlt('cache.deletedCount', deletedAlt) });
            textMsg += t('cache.editedLine', { edited: countAlt('cache.editsCount', edited) });
            textMsg += t('cache.reactionsLine', { reactions: countAlt('cache.reactionsCount', reactions) });
            textMsg += t('cache.backupsLine', { count: (await listBackups()).length });
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
