const { dbRun } = require('./db');

// A single deletion keeps each contact's most recent times.
async function limitHistoryMonitor(limitAlt, contactId = null) {
    return dbRun(`DELETE FROM monitor_history WHERE id IN (
        SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (
                PARTITION BY contact_id ORDER BY last_seen DESC, id DESC
            ) AS posicao FROM monitor_history
            WHERE (? IS NULL OR contact_id = ?)
        ) WHERE posicao > ?
    )`, [contactId, contactId, limitAlt]);
}

module.exports = { limitHistoryMonitor };
