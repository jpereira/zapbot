/*
 * /group -send admins -for <time>: the group closes (only admins talk) and reopens by itself. The time of
 * the reopening stays in the database (group_reopen table), so it holds even if the bot restarts in the middle.
 */

const { client } = require('./client');
const { dbAll, dbReady, dbRun } = require('./db');
const { t } = require('./i18n');
const { printError, printInfo } = require('./log');

const CHECK_A_EACH_MS = 30 * 1000;

async function scheduleReopening(chatId, ms, nowAlt = Date.now()) {
    await dbReady;
    await dbRun(
        'INSERT INTO group_reopen (chat_id, reopen_at) VALUES (?, ?) ON CONFLICT(chat_id) DO UPDATE SET reopen_at = excluded.reopen_at',
        [chatId, nowAlt + ms]
    );
}

async function cancelReopening(chatId) {
    await dbReady;
    await dbRun('DELETE FROM group_reopen WHERE chat_id = ?', [chatId]);
}

/**
 * Reopens the groups whose deadline has passed. Without a WhatsApp connection it does nothing (tries again on the next cycle).
 * @returns {Promise<number>} quantos reabriu
 */
async function reopenExpired(nowAlt = Date.now()) {
    if (!client.info?.wid) return 0;
    await dbReady;

    const expiredAlt3 = await dbAll('SELECT chat_id FROM group_reopen WHERE reopen_at <= ?', [nowAlt]);
    let reopened = 0;

    for (const { chat_id: chatId } of expiredAlt3) {
        // The line goes out first: if it fails (the bot is no longer admin, left the group), it does not keep trying forever
        await cancelReopening(chatId);
        try {
            const group = await client.getChatById(chatId);
            if (!group?.isGroup || !(await group.setMessagesAdminsOnly(false))) throw new Error('WhatsApp refused');
            await client.sendMessage(chatId, t('grp.group.reopened'));
            printInfo(`[Group] ${chatId} reopened`);
            reopened++;
        } catch (err) {
            printError(`[Group] could not reopen ${chatId}:`, err.message);
        }
    }
    return reopened;
}

// Called in app.js
function startReopenings() {
    setInterval(() => reopenExpired().catch((err) => printError('[Group] error reopening:', err.message)), CHECK_A_EACH_MS);
}

module.exports = { scheduleReopening, cancelReopening, startReopenings, reopenExpired };
