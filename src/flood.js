/*
 * Flood protection: a non-admin repeats the same command (the aliases
 * count as it) at most bot.flood.maxCommandRepeated times in
 * bot.flood.intervalCommand seconds. Over it: the bot warns once and ignores everything
 * of that person until the interval ends. It stays in memory: a restart resets it.
 */

const { getSetting } = require('./settings');

const MAX_TRACKED = 4096;
const uses = new Map();         // who → { commands, last }
const blockedAlt = new Map();   // who → until when the bot ignores them

/**
 * @param {string} who     the phone (or id) of who sent it
 * @param {string} command  o name principal (/crypto)
 * @returns {{ allowed: boolean, notify?: boolean, seconds?: number }}
 * notify: just went over the limit (the notice goes out only once)
 */
function checkFlood(who, commandAlt, nowAlt = Date.now()) {
    const max = getSetting('bot.flood.maxCommandRepeated');
    if (!max || !who) return { allowed: true };

    const seconds = getSetting('bot.flood.intervalCommand');
    const window = seconds * 1000;

    const until = blockedAlt.get(who);
    if (until && nowAlt < until) return { allowed: false };
    blockedAlt.delete(who);

    if (!uses.has(who) && uses.size + blockedAlt.size >= MAX_TRACKED) {
        for (const [id, entry] of uses) {
            if (nowAlt - entry.last >= window) uses.delete(id);
        }
        for (const [id, expiry] of blockedAlt) {
            if (expiry <= nowAlt) blockedAlt.delete(id);
        }
        if (uses.size + blockedAlt.size >= MAX_TRACKED) return { allowed: false };
    }
    const entry = uses.get(who) ?? { commands: new Map(), last: nowAlt };
    entry.last = nowAlt;
    uses.set(who, entry);
    const whoAlt = entry.commands;
    const recent = (whoAlt.get(commandAlt) ?? []).filter(t => nowAlt - t < window);

    if (recent.length >= max) {
        blockedAlt.set(who, nowAlt + window);
        uses.delete(who);
        return { allowed: false, notify: true, seconds };
    }

    recent.push(nowAlt);
    whoAlt.set(commandAlt, recent);
    return { allowed: true };
}

// Forgets everything (the tests start from zero)
function cleanFlood() {
    uses.clear();
    blockedAlt.clear();
}

module.exports = {
    cleanFlood,
    checkFlood
};
