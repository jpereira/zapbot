/*
 * Voice and video calls: with call.reject on, the bot rejects the call (except from whoever is in
 * call.allow or in bot.admins) and sends call.message, at most once every 10 minutes per person.
 * For whoever calls a lot, the message does not turn into spam.
 */

const { client } = require('./client');
const { removeDeviceSuffix, resolveLidToPhone } = require('./contacts');
const { printError, printInfo } = require('./log');
const { getSetting } = require('./settings');

const NOTICE_A_EACH_MS = 10 * 60 * 1000;
const notified = new Map(); // phone → when the message was received

// The phone (digits only) of whoever called; the @lid becomes the number when possible
async function phoneAlt3(jid) {
    const cleanAlt = removeDeviceSuffix(jid);
    const base = cleanAlt.endsWith('@lid') ? (await resolveLidToPhone(cleanAlt).catch(() => null)) ?? cleanAlt : cleanAlt;
    return base.split('@')[0];
}

/**
 * Handles a call that arrived.
 * @returns {Promise<'ignorada'|'recusada'>}
 */
async function handleCall(call, nowAlt = Date.now()) {
    if (!getSetting('call.reject') || call.fromMe) return 'ignorada';

    const phoneAlt = await phoneAlt3(call.from);
    const releasedAlt = [...getSetting('call.allow'), ...getSetting('bot.admins')];
    if (releasedAlt.includes(phoneAlt)) return 'ignorada';

    try {
        await call.reject();
    } catch (err) {
        printError('[Call] could not reject:', err.message);
        return 'ignorada';
    }
    printInfo(`[Call] call from ${phoneAlt} rejected`);

    const messageAlt = getSetting('call.message').trim();
    if (messageAlt && nowAlt - (notified.get(phoneAlt) ?? 0) >= NOTICE_A_EACH_MS) {
        notified.set(phoneAlt, nowAlt);
        await client.sendMessage(call.from, messageAlt).catch((err) => printError('[Call] could not notify:', err.message));
    }
    return 'recusada';
}

client.on('incoming_call', (call) => {
    handleCall(call).catch((err) => printError('[Call] erro:', err.message));
});

module.exports = { notified, handleCall };
