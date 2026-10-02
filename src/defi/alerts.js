/*
 * /defi -alerta: notifies when a position leaves the range, when it comes back and (with -taxas)
 * when the fees to collect go over a value.
 */

const { estado: stateAlt } = require('../state');
const { describe, alertDescribeDestination, alertDestinations, fmtUsd, readRegistration } = require('../commands/defi');
const { dbAll, dbReady, dbRun } = require('../db');
const { sendToDestinations } = require('../destinations');
const { printError, printInfo } = require('../log');
const { getSetting } = require('../settings');

/*
 * Each position with the alert on is read every 'defi.alerta.intervalMin'
 * minutes. The in_range column stores the state of the last read: notifies when
 * goes from inside (or unknown) to outside, and from outside to inside. The
 * fees_notified holds the fee notice: once per "filled up", until collected.
 * Read failed (RPC with a limit)? Nothing changes; tries again on the next one.
 * In a Project X wallet, "in range" means all the open positions in range.
 */
async function notify(p, n, emoji, title, texts) {
    const textAlt = `${emoji} *${title}*\n\n${texts.join('\n\n')}\n\n💡 _Desligue com /defi -alerta -rm ${n}._`;
    await sendToDestinations(alertDestinations(p), textAlt, { assunto: title })
        .then(() => printInfo(`/defi -alerta: ${title} → ${alertDescribeDestination(p)}`))
        .catch(err => printError(`/defi -alerta: falha ao avisar (${p.position}):`, err.message));
}

// Saves BEFORE notifying: if the send fails, it does not repeat on every check
async function checkRange(p, n, lido) {
    if (lido.naFaixa === null) return;   // wallet without an open position: nothing to watch
    const inRange = lido.naFaixa ? 1 : 0;
    if (inRange === p.in_range) return;

    await dbRun('UPDATE defi_positions SET in_range = ? WHERE id = ?', [inRange, p.id]);
    if (inRange && p.in_range === null) return;   // first read, already in range: only records

    if (inRange) await notify(p, n, '✅', `DeFi: ${describe(p)} voltou para a faixa`, lido.textos);
    else await notify(p, n, '🚨', `DeFi: ${describe(p)} saiu da faixa`, lido.foraDaFaixa);
}

async function checkRates(p, n, lido) {
    if (!p.alert_fees || lido.taxasUsd === null) return;
    const passed = lido.taxasUsd >= p.alert_fees ? 1 : 0;
    if (passed === p.fees_notified) return;

    await dbRun('UPDATE defi_positions SET fees_notified = ? WHERE id = ?', [passed, p.id]);
    if (passed) {
        await notify(p, n, '💸', `DeFi: ${describe(p)} tem ${fmtUsd(lido.taxasUsd)} em taxas a coletar (passou de ${fmtUsd(p.alert_fees)})`, lido.textos);
    }
}

let lastCheck = 0;
let checking = false;

async function checkAlertsDefi({ forcar: force = false } = {}) {
    if (checking || !stateAlt.pronto) return;
    if (!force && Date.now() - lastCheck < getSetting('defi.alerta.intervalMin') * 60 * 1000) return;

    checking = true;
    lastCheck = Date.now();

    try {
        await dbReady;
        // Each position's no. is the one from the /defi list (all of them, by id)
        const positions = await dbAll('SELECT * FROM defi_positions ORDER BY id');

        for (const [i, p] of positions.entries()) {
            if (!p.alert) continue;

            let lido;
            try {
                lido = await readRegistration(p);
            } catch (err) {
                printError(`/defi -alerta: não consegui ler ${p.position}:`, err.message);
                continue;
            }

            await checkRange(p, i + 1, lido);
            await checkRates(p, i + 1, lido);
        }
    } catch (err) {
        printError('Erro ao verificar os alertas do /defi:', err.message);
    } finally {
        checking = false;
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
