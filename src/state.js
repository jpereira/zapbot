/*
 * WhatsApp connection state, shared among the modules.
 *
 * An object (and not loose variables) because several modules change these
 * values: whoever imports receives the same reference and sees the changes.
 *
 * The restart has a lock (restarting): before, watchdog, 'disconnected' and
 * startBot() could restart the client at the same time, corrupting the session
 * and generating QR Codes after authentication.
 */
const stateAlt = {
    authenticatedAt: 0,       // when it authenticated (0 = not authenticated); used by /uptime
    ready: false,          // 'ready' event received and no drop since
    restarting: false,     // restartClient() in progress
    lastOutage: null,      // reason of the last 'disconnected' (null after 'ready')
    attempts: 0,          // consecutive failures when connecting (initialize); 0 after 'ready'
    outSince: null,        // since when it cannot connect (null after 'ready')
    waitingQr: false     // WhatsApp showed the QR Code and nobody has read it yet
};

module.exports = {
    state: stateAlt
};
