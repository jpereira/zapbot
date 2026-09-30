/*
 * WhatsApp connection state, shared among the modules.
 *
 * An object (and not loose variables) because several modules change these
 * values: whoever imports receives the same reference and sees the changes.
 *
 * The restart has a lock (reiniciando): before, watchdog, 'disconnected' and
 * startBot() could restart the client at the same time, corrupting the session
 * and generating QR Codes after authentication.
 */
const stateAlt = {
    autenticadoEm: 0,       // when it authenticated (0 = not authenticated); used by /uptime
    pronto: false,          // 'ready' event received and no drop since
    reiniciando: false,     // restartClient() in progress
    ultimaQueda: null       // reason of the last 'disconnected' (null after 'ready')
};

module.exports = {
    estado: stateAlt
};
