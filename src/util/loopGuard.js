/*
 * The periodic checks (the /cron schedule, the price alerts, the /notes alerts, /defi and /monitor) skip a tick while
 * the previous one runs, so a check never overlaps itself. A previous one that never ends (a send stuck in the
 * WhatsApp page) used to stop that loop for good without a trace: now the log says so, once, after STUCK_MS.
 * It is not restarted: the stuck one could come back and send the same thing twice.
 */
const { printError } = require('../log');

const STUCK_MS = 10 * 60 * 1000;

// Every loop, for the health page of the web: name → { running since, stuck, runs, last end, last duration }
const loops = new Map();

function loopGuard(name, { stuckMs = STUCK_MS, now = () => Date.now() } = {}) {
    let since = null;
    let warned = false;
    const stats = { runs: 0, lastEnd: null, lastMs: null };
    loops.set(name, () => ({ name, since, stuck: since !== null && now() - since >= stuckMs, ...stats }));
    return {
        // The previous check still runs: this tick is skipped (and, stuck for too long, the log says it once)
        busy() {
            if (since === null) return false;
            if (!warned && now() - since >= stuckMs) {
                warned = true;
                printError(`${name}: the previous check has been running for ${Math.round((now() - since) / 60000)} min (stuck?); the next ones wait for it`);
            }
            return true;
        },
        start() {
            since = now();
            warned = false;
        },
        end() {
            if (since !== null) Object.assign(stats, { runs: stats.runs + 1, lastEnd: now(), lastMs: now() - since });
            since = null;
        }
    };
}

const loopStates = () => [...loops.values()].map(state => state());

module.exports = { loopGuard, loopStates };
