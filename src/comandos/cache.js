/*
 * Comando /cache.
 */

const { apagarTodosBackups, listarBackups } = require('../backup');
const { formatarErroComando } = require('./base');
const { BACKUP_DIR, CACHE_DIR, MEDIA_DIR } = require('../constantes');
const { dbGet } = require('../db');
const { limparArquivosAntigos, limparCacheAntigo, limparEditadasAntigas, limparEnquetesAntigas, limparMidias, limparStatsAntigas, limparTudo, limparWatchAntigo } = require('../limpeza');
const { printError } = require('../log');
const { humanSize, listCacheLevelOnly } = require('../util/arquivos');

async function cmdCache({ msg, opts }) {
    try {
        let textMsg;

        if (opts.opt.all) {
            // Tudo: mensagens, apagadas, editadas, mídias, temporários e backups
            const r = await limparTudo();

            textMsg =
                `🧹 *Limpeza geral concluída* _(${CACHE_DIR})_\n\n` +
                `🗄️ Mensagens removidas: *${r.total}* _(${r.apagadas} apagada${r.apagadas === 1 ? '' : 's'})_\n` +
                `✏️ Edições removidas: *${r.editadas}*\n` +
                `📦 Backups removidos: *${r.backups}*\n` +
                `💾 Espaço liberado: *${humanSize(r.liberado)}*`;
        } else if (opts.opt.clean || opts.opt.media || opts.opt.backup) {
            const partes = [];

            // Limpeza normal: só o que passou das janelas de retenção
            if (opts.opt.clean) {
                await limparCacheAntigo();
                await limparArquivosAntigos();
                await limparWatchAntigo();
                await limparEditadasAntigas();
                await limparStatsAntigas();
                await limparEnquetesAntigas();
                partes.push('🧹 Cache limpo (itens fora da janela de retenção).');
            }

            if (opts.opt.media) {
                const r = await limparMidias();
                partes.push(`🖼️ Mídias apagadas de ${MEDIA_DIR}: *${r.arquivos}* _(${humanSize(r.bytes)})_`);
            }

            if (opts.opt.backup) {
                const r = await apagarTodosBackups();
                partes.push(`📦 Backups apagados de ${BACKUP_DIR}: *${r.backups}* _(${humanSize(r.bytes)})_`);
            }

            textMsg = partes.join('\n');
        } else {
            const { total, apagadas } = await dbGet(
                'SELECT COUNT(*) AS total, COALESCE(SUM(revoked), 0) AS apagadas FROM messages'
            );
            const { editadas } = await dbGet('SELECT COUNT(*) AS editadas FROM message_edits');

            textMsg = `🗂️ Exibindo conteúdo de ${CACHE_DIR}/*`;
            textMsg += '\n\n```' + listCacheLevelOnly(CACHE_DIR) + '```\n\n';
            textMsg += `🗄️ Existem ${total} mensagens no cache (${apagadas} apagadas) e ${editadas} edições.\n`;
            textMsg += `📦 Backups: ${(await listarBackups()).length} _(veja /backup)_`;
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
