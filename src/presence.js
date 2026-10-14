/*
 * One presence query at a time for the monitoring.
 */
const { client } = require('./client');
const { diagnosePresence } = require('./debugPresence');

let busy = false;

async function queryPresence(chatId, options = {}) {
    if (busy) return null;
    busy = true;
    try {
        return await client.pupPage.evaluate(diagnosePresence, chatId, options);
    } finally {
        busy = false;
    }
}

module.exports = { queryPresence };
