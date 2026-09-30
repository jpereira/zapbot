/*
 * Process shutdown: crash (unhandled exception/promise) and signals (docker stop, Ctrl+C), with an email alert.
 */

const { leaveAlertBefore } = require('./email');
const { printError, printInfo } = require('./log');

/*
 * Crash: Node would already end the process on an exception or rejected promise without
 * handling; here we only warn beforehand. Docker (restart: unless-stopped) brings it up again.
 */
let closing = false;

async function closePerCrash(type, err) {
    printError(`💥 ${type}:`, err);
    if (closing) return;
    closing = true;

    await leaveAlertBefore('💥 Crash', `${type}\n\n${err?.stack || err}`, 10000);
    process.exit(1);
}

// Called in app.js, before anything
function installClosing() {
    process.on('uncaughtException', err => closePerCrash('uncaughtException', err));
    process.on('unhandledRejection', err => closePerCrash('unhandledRejection', err));

    // docker stop / restart / Ctrl+C
    for (const signalAlt of ['SIGTERM', 'SIGINT']) {
        process.on(signalAlt, async () => {
            if (closing) return;
            closing = true;

            printInfo(`🛑 ${signalAlt} recebido, encerrando.`);
            await leaveAlertBefore('🛑 Bot encerrado', `Sinal ${signalAlt} (docker stop/restart ou Ctrl+C).`, 5000);
            process.exit(0);
        });
    }
}

module.exports = {
    installClosing
};
