/*
 * Login/brute-force tracking shared by /bot -login, the web login, the web TOTP and the protected notes tag
 * (unlockTag): bounded in memory (MAX_ENTRIES), without ever resetting an attacker's error count just because
 * they paced their guesses slower than the lockout window (that used to let someone brute-force forever, a few
 * guesses every `window`, without ever being blocked or triggering the owner's alert).
 *
 * An entry is only forgotten when the map is near MAX_ENTRIES AND it has been idle for a long time (IDLE_MS):
 * that bounds memory the same way, but losing the error count that way is rare, not routine.
 */

const MAX_ENTRIES = 4096;
const IDLE_MS = 24 * 60 * 60 * 1000;

function attemptFor(entries, id, window, now = Date.now()) {
    let entry = entries.get(id);
    if (!entry) {
        if (entries.size >= MAX_ENTRIES) {
            const idle = Math.max(window, IDLE_MS);
            for (const [key, value] of entries) {
                if (!value.active && value.until <= now && now - value.last >= idle) entries.delete(key);
            }
            if (entries.size >= MAX_ENTRIES) return null;
        }
        entry = { errors: 0, until: 0, active: false, last: now };
        entries.set(id, entry);
    } else {
        entry.last = now;
    }
    return entry;
}

module.exports = { attemptFor };
