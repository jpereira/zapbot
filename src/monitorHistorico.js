const { dbRun } = require('./db');

// Uma única exclusão mantém os horários mais recentes de cada contato.
async function limitarHistoricoMonitor(limite, contatoId = null) {
    return dbRun(`DELETE FROM monitor_history WHERE id IN (
        SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (
                PARTITION BY contact_id ORDER BY last_seen DESC, id DESC
            ) AS posicao FROM monitor_history
            WHERE (? IS NULL OR contact_id = ?)
        ) WHERE posicao > ?
    )`, [contatoId, contatoId, limite]);
}

module.exports = { limitarHistoricoMonitor };
