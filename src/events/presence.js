/*
 * 'presence_update' event: notifies when a monitored number (/monitor) comes online.
 */

const { client } = require('../client');
const { findCommand } = require('../commands/base');
const { normalizeWid } = require('../contacts');
const { dbGet, dbRun } = require('../db');
const { printDebug, printError, printSuccess } = require('../log');
const { isDebugMode } = require('../settings');
const { phoneBotJid } = require('../botPhone');

client.on('presence_update', async (presence) => {
    // Without /monitor loaded, already registered numbers generate no notices
    if (!findCommand('/monitor')) return;
    if (!presence?.id) return;

    const myid = phoneBotJid();

    try {
        const rawId = presence.id._serialized || presence.id;
        const number = rawId.split('@')[0].split(':')[0];
        const currentStatus = presence.status || (presence.type === 'available' ? 'available' : 'unavailable');

        // This used to send a WhatsApp message for EVERY presence event.
        if (isDebugMode()) {
            printDebug(`[Presence] ${number} -> ${currentStatus}`, presence);
        }

        if (currentStatus !== 'available') return;

        const row = await dbGet('SELECT phone_number FROM monitored_numbers WHERE phone_number = ?', [number]);
        if (!row) return;

        const contact = await client.getContactById(normalizeWid(rawId)).catch(() => null);
        const displayName = contact?.pushname || contact?.name || number;

        await dbRun(
            'INSERT INTO presence_logs (phone_number, display_name, status) VALUES (?, ?, ?)',
            [number, displayName, currentStatus]
        );

        if (myid) {
            await client.sendMessage(myid, `🔔 *${displayName}* (${number}) acabou de ficar online.`);
            printSuccess(`Notificação enviada e salva no banco para: ${number}`);
        }
    } catch (error) {
        printError('Erro controlado no evento de presença:', error.message);
    }
});
