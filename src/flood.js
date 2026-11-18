/*
 * Flood protection: a non-admin repeats the same command (the aliases
 * count as it) at most bot.flood.maxCommandRepeated times in
 * bot.flood.intervalCommand seconds. Over it: the bot warns once and ignores everything
 * of that person until the interval ends. It stays in memory: a restart resets it.
 */

const { getSetting } = require('./settings');

const uses = new Map();         // who → Map(command → recent instants)
const blockedAlt = new Map();   // who → until when the bot ignores them

/**
 * @param {string} quem     the phone (or id) of who sent it
 * @param {string} comando  o nome principal (/crypto)
 * @returns {{ liberado: boolean, avisar?: boolean, segundos?: number }}
 * notify: just went over the limit (the notice goes out only once)
 */
function checkFlood(who, commandAlt, nowAlt = Date.now()) {
    const max = getSetting('bot.flood.maxCommandRepeated');
    if (!max || !who) return { liberado: true };

    const seconds = getSetting('bot.flood.intervalCommand');
    const window = seconds * 1000;

    const ate = blockedAlt.get(who);
    if (ate && nowAlt < ate) return { liberado: false };
    blockedAlt.delete(who);

    const whoAlt = uses.get(who) ?? new Map();
    uses.set(who, whoAlt);
    const recent = (whoAlt.get(commandAlt) ?? []).filter(t => nowAlt - t < window);

    if (recent.length >= max) {
        blockedAlt.set(who, nowAlt + window);
        uses.delete(who);
        return { liberado: false, avisar: true, segundos: seconds };
    }

    recent.push(nowAlt);
    whoAlt.set(commandAlt, recent);
    return { liberado: true };
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
