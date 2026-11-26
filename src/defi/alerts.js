/*
 * /defi -alert: notifies when a position leaves the range, when it comes back and (with -fees)
 * when the fees to collect go over a value.
 */

const { loopGuard } = require('../util/loopGuard');
const { state: stateAlt } = require('../state');
const { describe, alertDescribeDestination, alertDestinations, addressAlt2, fmtUsd, readRegistration } = require('../commands/defi');
const { dbAll, dbReady, dbRun } = require('../db');
const { sendToDestinations } = require('../destinations');
const { t } = require('../i18n');
const { printError, printInfo } = require('../log');
const { getSetting } = require('../settings');

/*
 * Each position with the alert on is read every 'defi.alert.intervalMin'
 * minutes. The in_range column stores the state of the last read: notifies when
 * goes from inside (or unknown) to outside, and from outside to inside. The
 * fees_notified holds the fee notice: once per "filled up", until collected.
 * Read failed (RPC with a limit)? Nothing changes; tries again on the next one.
 * In a Project X wallet, "in range" means all the open positions in range.
 */
async function notify(p, n, emoji, title, texts) {
    const textAlt = `${emoji} *${title}*\n\n${texts.join('\n\n')}\n\n${t('defi.alertTip', { n })}`;
    await sendToDestinations(alertDestinations(p), textAlt, { subject: title })
        .then(() => printInfo(`/defi -alert: ${title} → ${alertDescribeDestination(p)}`))
        .catch(err => printError(`/defi -alert: failed to notify (${addressAlt2(p)}):`, err.message));
}

// Saves BEFORE notifying: if the send fails, it does not repeat on every check
async function checkRange(p, n, wasRead) {
    if (wasRead.inRange === null) return;   // wallet without an open position: nothing to watch
    const inRange = wasRead.inRange ? 1 : 0;
    if (inRange === p.in_range) return;

    await dbRun('UPDATE defi_positions SET in_range = ? WHERE id = ?', [inRange, p.id]);
    if (inRange && p.in_range === null) return;   // first read, already in range: only records

    if (inRange) await notify(p, n, '✅', t('defi.backInRange', { desc: describe(p) }), wasRead.texts);
    else await notify(p, n, '🚨', t('defi.leftRange', { desc: describe(p) }), wasRead.outOfRange);
}

async function checkRates(p, n, wasRead) {
    if (!p.alert_fees || wasRead.ratesUsd === null) return;
    const passed = wasRead.ratesUsd >= p.alert_fees ? 1 : 0;
    if (passed === p.fees_notified) return;

    await dbRun('UPDATE defi_positions SET fees_notified = ? WHERE id = ?', [passed, p.id]);
    if (passed) {
        await notify(p, n, '💸', t('defi.feesOver', { desc: describe(p), fees: fmtUsd(wasRead.ratesUsd), limit: fmtUsd(p.alert_fees) }), wasRead.texts);
    }
}

let lastCheck = 0;
const guard = loopGuard('/defi alerts');

async function checkAlertsDefi({ force = false } = {}) {
    if (guard.busy() || !stateAlt.ready) return;
    if (!force && Date.now() - lastCheck < getSetting('defi.alert.intervalMin') * 60 * 1000) return;

    guard.start();
    lastCheck = Date.now();

    try {
        await dbReady;
        // Each position's no. is the one from the /defi list (all of them, by id)
        const positions = await dbAll('SELECT * FROM defi_positions ORDER BY id');

        for (const [i, p] of positions.entries()) {
            if (!p.alert) continue;

            let wasRead;
            try {
                wasRead = await readRegistration(p);
            } catch (err) {
                printError(`/defi -alert: could not read ${addressAlt2(p)}:`, err.message);
                continue;
            }

            await checkRange(p, i + 1, wasRead);
            await checkRates(p, i + 1, wasRead);
        }
    } catch (err) {
        printError('Error checking the /defi alerts:', err.message);
    } finally {
        guard.end();
    }
}

// Called in app.js: one tick per minute, which only reads the positions at the setting's interval
function startAlertsDefi() {
    setInterval(checkAlertsDefi, 60 * 1000);
}

module.exports = {
    startAlertsDefi,
    checkAlertsDefi
};
