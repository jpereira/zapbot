/*
 * Comando /cache.
 */

const { apagarTodosBackups, listarBackups } = require('../backup');
const { formatarErroComando } = require('./base');
const { BACKUP_DIR, CACHE_DIR, MEDIA_DIR } = require('../constantes');
const { dbGet } = require('../db');
const { limparArquivosAntigos, limparCacheAntigo, limparEditadasAntigas, limparEnquetesAntigas, limparIgnoradasAntigas, limparMidias, limparReacoesAntigas, limparStatsAntigas, limparTudo, limparWatchAntigo } = require('../limpeza');
const { t } = require('../i18n');
const { printError } = require('../log');
const { humanSize, listCacheLevelOnly } = require('../util/arquivos');
const { contar } = require('../util/contar');

async function cmdCache({ msg, opts }) {
    try {
        let textMsg;

        if (opts.opt.all) {
            // Tudo: mensagens, apagadas, editadas, reações, mídias, temporários e backups
            const r = await limparTudo();

            textMsg = t('cache.allDone', {
                dir: CACHE_DIR,
                total: r.total,
                deleted: contar('cache.deletedCount', r.apagadas),
                edited: r.editadas,
                reactions: r.reacoes,
                backups: r.backups,
                freed: humanSize(r.liberado)
            });
        } else if (opts.opt.clean || opts.opt.media || opts.opt.backup) {
            const partes = [];

            // Limpeza normal: só o que passou das janelas de retenção
            if (opts.opt.clean) {
                await limparCacheAntigo();
                await limparArquivosAntigos();
                await limparWatchAntigo();
                await limparEditadasAntigas();
                await limparReacoesAntigas();
                await limparStatsAntigas();
                await limparEnquetesAntigas();
                await limparIgnoradasAntigas();
                partes.push(t('cache.cleaned'));
            }

            if (opts.opt.media) {
                const r = await limparMidias();
                partes.push(t('cache.mediaDeleted', { dir: MEDIA_DIR, count: r.arquivos, size: humanSize(r.bytes) }));
            }

            if (opts.opt.backup) {
                const r = await apagarTodosBackups();
                partes.push(t('cache.backupsDeleted', { dir: BACKUP_DIR, count: r.backups, size: humanSize(r.bytes) }));
            }

            textMsg = partes.join('\n');
        } else {
            const { total, apagadas } = await dbGet(
                'SELECT COUNT(*) AS total, COALESCE(SUM(revoked), 0) AS apagadas FROM messages'
            );
            const { editadas } = await dbGet('SELECT COUNT(*) AS editadas FROM message_edits');
            const { reacoes } = await dbGet('SELECT COUNT(*) AS reacoes FROM reaction_changes');

            textMsg = t('cache.showing', { dir: CACHE_DIR });
            textMsg += '\n\n```' + listCacheLevelOnly(CACHE_DIR) + '```\n\n';
            textMsg += t('cache.messages', { messages: contar('cache.messagesCount', total) });
            textMsg += t('cache.deletedLine', { deleted: contar('cache.deletedCount', apagadas) });
            textMsg += t('cache.editedLine', { edited: contar('cache.editsCount', editadas) });
            textMsg += t('cache.reactionsLine', { reactions: contar('cache.reactionsCount', reacoes) });
            textMsg += t('cache.backupsLine', { count: (await listarBackups()).length });
        }

        await msg.reply(textMsg, null, { linkPreview: false });
    } catch (e) {
        printError(e.message);
        await msg.reply(formatarErroComando(e), null, { linkPreview: false });
    }
}

module.exports = {
    cmdCache
};
