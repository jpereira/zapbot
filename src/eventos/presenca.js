/*
 * Evento 'presence_update': avisa quando um número monitorado (/monitor) fica online.
 */

const { client } = require('../cliente');
const { findCommand } = require('../comandos/base');
const { normalizeWid } = require('../contatos');
const { dbGet, dbRun } = require('../db');
const { printDebug, printError, printSuccess } = require('../log');
const { isDebugMode } = require('../settings');
const { telefoneBotJid } = require('../telefoneBot');

client.on('presence_update', async (presence) => {
    // Sem o /monitor carregado, números já cadastrados não geram avisos
    if (!findCommand('/monitor')) return;
    if (!presence?.id) return;

    const myid = telefoneBotJid();

    try {
        const rawId = presence.id._serialized || presence.id;
        const number = rawId.split('@')[0].split(':')[0];
        const currentStatus = presence.status || (presence.type === 'available' ? 'available' : 'unavailable');

        // Antes isto mandava uma mensagem no WhatsApp para CADA evento de presença.
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
