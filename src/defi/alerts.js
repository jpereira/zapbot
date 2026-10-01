/*
 * /defi -alerta: notifies whenever a position leaves the range.
 */

const { estado: stateAlt } = require('../state');
const { alertDescribeDestination, alertDestination, positionText } = require('../commands/defi');
const { dbAll, dbReady, dbRun } = require('../db');
const { sendOnDestination } = require('../destinations');
const { printError, printInfo } = require('../log');
const { getSetting } = require('../settings');
const { positionDetails } = require('./orca');

/*
 * Each position with the alert on is read every 'defi.alerta.intervalMin'
 * minutes. The in_range column stores the state of the last read: the notice goes out
 * when it goes from inside (or unknown) to outside the range. Outside
 * its, does not notify again; when it returns to the range and leaves again, it notifies.
 * If the read fails (RPC with a limit), nothing changes and it tries on the next one.
 */
const short = (address) => `${address.slice(0, 4)}…${address.slice(-4)}`;

async function notify(p, n, d) {
    const title = `🚨 *DeFi: a posição ${short(p.position)} saiu da faixa*`;
    const textAlt = `${title}\n\n${positionText(d)}\n\n💡 _Desligue com /defi -alerta -rm ${n}._`;

    await sendOnDestination(alertDestination(p), textAlt, { assunto: `DeFi: a posição ${short(p.position)} saiu da faixa` });
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

            let d;
            try {
                d = await positionDetails(p.position, p.pool);
            } catch (err) {
                printError(`/defi -alerta: não consegui ler a posição ${p.position}:`, err.message);
                continue;
            }

            const inRange = d.calculo.naFaixa ? 1 : 0;
            if (inRange === p.in_range) continue;

            await dbRun('UPDATE defi_positions SET in_range = ? WHERE id = ?', [inRange, p.id]);
            if (inRange) {
                printInfo(`/defi -alerta: a posição ${p.position} está na faixa`);
                continue;
            }

            // Saves BEFORE notifying: if the send fails, it does not repeat on every check
            await notify(p, i + 1, d)
                .then(() => printInfo(`/defi -alerta: a posição ${p.position} saiu da faixa → ${alertDescribeDestination(p)}`))
                .catch(err => printError(`/defi -alerta: falha ao avisar (${p.position}):`, err.message));
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
