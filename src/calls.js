/*
 * Voice and video calls: with call.reject on, the bot rejects the call (except from whoever is in
 * call.allow or in bot.admins) and sends call.message, at most once every 10 minutes per person.
 * For whoever calls a lot, the message does not turn into spam.
 * Whoever is on the /call -deny list always has the call rejected (even with call.reject off), with the message
 * its (or the default of whoever was denied).
 */

const { client } = require('./client');
const { dbAll, dbGet, dbRun } = require('./db');
const { removeDeviceSuffix, resolveLidToPhone } = require('./contacts');
const { printDebug, printError, printInfo } = require('./log');
const { t } = require('./i18n');
const { getSetting } = require('./settings');

const NOTICE_A_EACH_MS = 10 * 60 * 1000;
const notified = new Map(); // phone → when the message was received

// The phone (digits only) of whoever called; the @lid becomes the number when possible
async function phoneAlt3(jid) {
    const cleanAlt = removeDeviceSuffix(jid);
    const base = cleanAlt.endsWith('@lid') ? (await resolveLidToPhone(cleanAlt).catch(() => null)) ?? cleanAlt : cleanAlt;
    return base.split('@')[0];
}

// The text sent to whoever had the call rejected: call.message; empty, the language default; off, nothing
function rejectMessage() {
    const textAlt = getSetting('call.message').trim();
    if (textAlt.toLowerCase() === 'off') return '';
    return textAlt || t('adm.call.default');
}

// The message of whoever was denied (/call -deny): theirs; empty, the default; off, nothing
const deniedMessage = (textAlt) => {
    const m = String(textAlt ?? '').trim();
    return m.toLowerCase() === 'off' ? '' : m || t('adm.call.denyDefault');
};

// The denied ones and the messages: [{ phone, message }]
const listDenied = () => dbAll('SELECT phone, message FROM call_deny ORDER BY rowid');
const deny = (phones, messageAlt) => Promise.all(phones.map((phone) => dbRun(
    'INSERT INTO call_deny (phone, message) VALUES (?, ?) ON CONFLICT(phone) DO UPDATE SET message = excluded.message',
    [phone, messageAlt ?? ''])));
const releaseDenied = async (phones) => {
    const beforeAlt = new Set((await listDenied()).map((n) => n.phone));
    await Promise.all(phones.map((phone) => dbRun('DELETE FROM call_deny WHERE phone = ?', [phone])));
    return phones.filter((p) => beforeAlt.has(p));
};

/*
 * The denied person's registration that matches whoever called: by phone or, if the call came with the @lid (the internal id,
 * which cannot always be swapped for the number), through each denied person's @lid.
 */
async function deniedAlt(de, phoneAlt) {
    const byPhone = await dbGet('SELECT phone, message FROM call_deny WHERE phone = ?', [phoneAlt]);
    if (byPhone || !removeDeviceSuffix(de).endsWith('@lid')) return byPhone ?? null;

    const lid = removeDeviceSuffix(de);
    for (const n of await listDenied()) {
        const [r] = await client.getContactLidAndPhone([`${n.phone}@c.us`]).catch(() => []);
        if (r?.lid && removeDeviceSuffix(r.lid) === lid) return n;
    }
    return null;
}

/**
 * Handles a call that arrived.
 * @returns {Promise<'ignorada'|'recusada'>}
 */
async function handleCall(call, nowAlt = Date.now()) {
    if (call.fromMe) return 'ignorada';

    const phoneAlt = await phoneAlt3(call.from);
    // Whoever was denied by /call -deny: always rejected, with their own message
    const denied = await deniedAlt(call.from, phoneAlt);
    printInfo(`[Call] ligação de ${phoneAlt} (${call.from})${denied ? ', negado pelo /call -deny' : ''}; call.reject ${getSetting('call.reject') ? 'ligado' : 'desligado'}`);
    if (!denied && !getSetting('call.reject')) return 'ignorada';

    const releasedAlt = [...getSetting('call.allow'), ...getSetting('bot.admins')];
    if (!denied && releasedAlt.includes(phoneAlt)) {
        printDebug(`[Call] ${phoneAlt} está em call.allow ou no bot.admins: toca`);
        return 'ignorada';
    }

    try {
        await call.reject();
    } catch (err) {
        printError('[Call] não consegui recusar:', err.message);
        return 'ignorada';
    }
    printInfo(`[Call] ligação de ${phoneAlt} recusada`);

    const messageAlt = denied ? deniedMessage(denied.message) : rejectMessage();
    if (messageAlt && nowAlt - (notified.get(phoneAlt) ?? 0) >= NOTICE_A_EACH_MS) {
        notified.set(phoneAlt, nowAlt);
        await client.sendMessage(call.from, messageAlt).catch((err) => printError('[Call] não avisei:', err.message));
    }
    return 'recusada';
}

// The event name is the library's (whatsapp-web.js' Events.INCOMING_CALL, which is "call"): a made-up name
// never fires (a test checks the library's constant)
const EVENT_CALL = 'call';

client.on(EVENT_CALL, (call) => {
    // Every call the library reports goes in the log, even those the bot lets ring
    printInfo(`[Call] evento '${EVENT_CALL}': de ${call?.from}, ${call?.isVideo ? 'vídeo' : 'voz'}${call?.isGroup ? ', grupo' : ''}`);
    handleCall(call).catch((err) => printError('[Call] erro:', err.message));
});

module.exports = { EVENT_CALL, notified, releaseDenied, listDenied, rejectMessage, deniedMessage, deny, handleCall };
