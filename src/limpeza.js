/*
 * Limpeza do banco e do disco: janelas de retenção e a limpeza periódica.
 */

const path = require('path');
const fs = require('fs-extra');

const { apagarTodosBackups } = require('./backup');
const { CACHE_DIR, DAY_MS, MAX_DELETE_WINDOW, MEDIA_DIR, TMP_DIR } = require('./constantes');
const { dbAll, dbGet, dbPronto, dbRun } = require('./db');
const { printError, printInfo } = require('./log');
const { getSetting } = require('./settings');
const { diaEHora } = require('./stats');
const { getDirSize, isCaminhoDeMidia, limparConteudoDiretorio } = require('./util/arquivos');

/*
 * Limpeza do banco + mídias:
 *  - mensagens normais: removidas após a janela de "apagar para todos" (68h),
 *    porque depois disso não podem mais ser apagadas;
 *  - mensagens APAGADAS (revoked=1): guardadas por 'cache.revokedRetentionDays' (padrão 30),
 *    para o /show continuar funcionando.
 */
async function limparCacheAntigo(maxDeleteWin = MAX_DELETE_WINDOW, retencaoApagadas = getSetting('cache.revokedRetentionDays') * DAY_MS) {
    await dbPronto;

    const agora = Date.now();
    const filtro = `
        (revoked = 0 AND timestamp < ?)
        OR (revoked = 1 AND COALESCE(revoked_at, timestamp) < ?)
    `;
    const params = [agora - maxDeleteWin, agora - retencaoApagadas];

    try {
        const rows = await dbAll(`SELECT media_path FROM messages WHERE media_path IS NOT NULL AND (${filtro})`, params);

        for (const row of rows) {
            if (isCaminhoDeMidia(row.media_path) && fs.existsSync(row.media_path)) {
                printInfo(`Removendo ${row.media_path}`);
                fs.unlinkSync(row.media_path);
            }
        }

        const res = await dbRun(`DELETE FROM messages WHERE ${filtro}`, params);
        if (res.changes > 0) {
            printInfo(`Limpeza: ${res.changes} registros antigos limpos.`);
        }
    } catch (err) {
        printError('Erro na limpeza do cache:', err.message);
    }
}

/*
 * Limpeza geral (/cache -all): TODAS as mensagens (inclusive as apagadas e as
 * editadas guardadas para o /show), todas as mídias, todos os temporários e
 * todos os backups do /backup.
 * No fim, VACUUM devolve o espaço ao disco: DELETE sozinho não encolhe o .db.
 * Não mexe em monitored_numbers, presence_logs, watch_hits, stats, polls, price_alerts
 * nem settings (configuração e histórico).
 */
async function limparTudo() {
    await dbPronto;

    const bytesAntes = getDirSize(CACHE_DIR);
    const { total, apagadas } = await dbGet(
        'SELECT COUNT(*) AS total, COALESCE(SUM(revoked), 0) AS apagadas FROM messages'
    );

    const { editadas } = await dbGet('SELECT COUNT(*) AS editadas FROM message_edits');

    await dbRun('DELETE FROM messages');
    await dbRun('DELETE FROM message_edits');
    limparConteudoDiretorio(MEDIA_DIR);
    limparConteudoDiretorio(TMP_DIR);
    const { backups } = await apagarTodosBackups();
    await dbRun('VACUUM');

    return { total, apagadas, editadas, backups, liberado: Math.max(0, bytesAntes - getDirSize(CACHE_DIR)) };
}

/*
 * /cache -media: apaga as mídias baixadas (MEDIA_DIR). As mensagens ficam no
 * banco sem o arquivo: uma apagada recuperada depois avisa "arquivo não
 * disponível no cache".
 */
async function limparMidias() {
    await dbPronto;

    // As mídias ficam em subpastas por data (media/AAAA/MM/DD): conta todas antes de apagar
    let arquivos = 0;
    let bytes = 0;

    const contar = (dir) => {
        for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
            const caminho = path.join(dir, entrada.name);
            if (entrada.isDirectory()) contar(caminho);
            else if (entrada.isFile()) {
                arquivos++;
                bytes += fs.statSync(caminho).size;
            }
        }
    };

    if (fs.existsSync(MEDIA_DIR)) {
        contar(MEDIA_DIR);
        limparConteudoDiretorio(MEDIA_DIR);
    }

    const { changes } = await dbRun('UPDATE messages SET media_path = NULL WHERE media_path IS NOT NULL');
    printInfo(`/cache -media: ${arquivos} arquivos (${bytes} bytes) apagados de ${MEDIA_DIR}; ${changes} mensagens sem mídia`);

    return { arquivos, bytes };
}

// Edições mais antigas que 'cache.editedRetentionDays'
async function limparEditadasAntigas() {
    await dbPronto;

    try {
        const res = await dbRun('DELETE FROM message_edits WHERE edited_at < ?',
            [Date.now() - getSetting('cache.editedRetentionDays') * DAY_MS]);

        if (res.changes > 0) {
            printInfo(`Limpeza: ${res.changes} edições antigas removidas.`);
        }
    } catch (err) {
        printError('Erro na limpeza das editadas:', err.message);
    }
}

// Contadores do /stats mais antigos que 'stats.retentionDays'
async function limparStatsAntigas() {
    await dbPronto;

    try {
        const { day } = diaEHora(Date.now() - getSetting('stats.retentionDays') * DAY_MS);
        const res = await dbRun('DELETE FROM stats WHERE day < ?', [day]);

        if (res.changes > 0) {
            printInfo(`Limpeza: ${res.changes} contadores antigos do /stats removidos.`);
        }
    } catch (err) {
        printError('Erro na limpeza do /stats:', err.message);
    }
}

// Enquetes (e os votos delas) mais antigas que 'enquete.retentionDays'
async function limparEnquetesAntigas() {
    await dbPronto;

    try {
        const limite = Date.now() - getSetting('enquete.retentionDays') * DAY_MS;
        await dbRun('DELETE FROM poll_votes WHERE poll_id IN (SELECT id FROM polls WHERE created_at < ?)', [limite]);
        const res = await dbRun('DELETE FROM polls WHERE created_at < ?', [limite]);

        if (res.changes > 0) {
            printInfo(`Limpeza: ${res.changes} enquetes antigas removidas.`);
        }
    } catch (err) {
        printError('Erro na limpeza das enquetes:', err.message);
    }
}

// Avisos cortados pelo /mudo (mute_hits): 30 dias bastam para o /status
const MUTE_HITS_DIAS = 30;

async function limparIgnoradasAntigas() {
    await dbPronto;

    try {
        const res = await dbRun('DELETE FROM mute_hits WHERE at < ?', [Date.now() - MUTE_HITS_DIAS * DAY_MS]);
        if (res.changes > 0) printInfo(`Limpeza: ${res.changes} registros antigos do /mudo removidos.`);
    } catch (err) {
        printError('Erro na limpeza do /mudo:', err.message);
    }
}

// Ocorrências do /watch mais antigas que 'watch.hitsRetentionDays'
async function limparWatchAntigo() {
    await dbPronto;

    try {
        const res = await dbRun('DELETE FROM watch_hits WHERE timestamp < ?',
            [Date.now() - getSetting('watch.hitsRetentionDays') * DAY_MS]);

        if (res.changes > 0) {
            printInfo(`Limpeza: ${res.changes} ocorrências antigas do /watch removidas.`);
        }
    } catch (err) {
        printError('Erro na limpeza do /watch:', err.message);
    }
}

async function limparArquivosAntigos(dir = TMP_DIR, maxAgeHours = 2) {
    const now = Date.now();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

    try {
        for (const file of await fs.readdir(dir)) {
            const fullPath = path.join(dir, file);

            try {
                const stat = await fs.stat(fullPath);
                if (!stat.isFile()) continue;

                if (now - stat.mtimeMs > maxAgeMs) {
                    await fs.unlink(fullPath);
                    printInfo(`[cleanup] Deleted: ${fullPath}`);
                }
            } catch (err) {
                printError(`[cleanup] Error processing ${fullPath}:`, err.message);
            }
        }
    } catch (err) {
        printError(`[cleanup] Error reading directory ${dir}:`, err.message);
    }
}

/*
 * Limpeza periódica. Antes rodava a CADA mensagem recebida
 * (um DELETE no SQLite + varredura de pasta por mensagem).
 */
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

function rodarLimpeza() {
    limparCacheAntigo();
    limparArquivosAntigos();
    limparWatchAntigo();
    limparEditadasAntigas();
    limparStatsAntigas();
    limparEnquetesAntigas();
    limparIgnoradasAntigas();
}

// Chamada no app.js. Primeira execução adiada: no primeiro boot as tabelas ainda estão sendo criadas.
function iniciarLimpezaPeriodica() {
    setTimeout(rodarLimpeza, 60 * 1000);
    setInterval(rodarLimpeza, CLEANUP_INTERVAL_MS);
}

module.exports = {
    iniciarLimpezaPeriodica,
    limparArquivosAntigos,
    limparCacheAntigo,
    limparEditadasAntigas,
    limparEnquetesAntigas,
    limparIgnoradasAntigas,
    limparMidias,
    limparStatsAntigas,
    limparTudo,
    limparWatchAntigo
};
