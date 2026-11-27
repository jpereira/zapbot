/*
 * WhatsApp connection: initialization, QR Code, connection events, restart and watchdog.
 */

const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');

const { state: stateAlt } = require('./state');
const { client, messageToSelf, sendWaitingToSelf } = require('./client');
const { dbReady } = require('./db');
const { fillMentionsOld } = require('./mentions');
const { t } = require('./i18n');
const { alertPerEmail, transporter, escapeHtml } = require('./email');
const { printDebug, printError, printInfo, printSuccess } = require('./log');
const { getSetting, isDebugMode } = require('./settings');
const { versionWithCommit } = require('./version');
const { withContextDebug, bootCompleteLogs } = require('./debugContext');

// Reasons where restarting does not help: they need manual action.
// Another instance opened the session: restarting would take it back and forth. A logout (on the phone, or from the
// web) is different: the session is gone, and a restart brings a new QR Code to pair again
const NOT_RESTART = new Set(['CONFLICT']);
const LOGGED_OUT = new Set(['LOGOUT', 'UNPAIRED', 'UNPAIRED_IDLE']);

/*
 * Reconnection: if initialize fails (internet down: ERR_NAME_NOT_RESOLVED,
 * ERR_INTERNET_DISCONNECTED...), tries again by itself, with growing waits,
 * until it works. Before, a failure left the bot stopped forever: without
 * 'ready', the heartbeat thought it was just the boot and the watchdog did not look.
 * And if initialize goes through but 'ready' does not come within CONNECTION_MAX_MS (the page
 * opened and the network dropped in the middle), it restarts too, unless waiting for the QR Code.
 */
const WAITS_MS = [15, 30, 60, 120, 300].map(s => s * 1000);   // then, every 5 min
const CONNECTION_MAX_MS = 3 * 60 * 1000;

let newAttempt = null;     // the setTimeout of the next attempt
let reasonOriginal = null;    // what led to the 1st restart that failed (that of the following attempts)
let readyWatchdog = null;      // the setTimeout that waits for 'ready' after initialize

// Both timers do not hold the process (unref) and leave together (ready, tests)
function stopReconnection() {
    reasonOriginal = null;
    clearTimeout(newAttempt);
    clearTimeout(readyWatchdog);
    newAttempt = null;
    readyWatchdog = null;
}

function scheduleNewAttempt(reasonAlt, errorAlt) {
    const wait = WAITS_MS[Math.min(stateAlt.attempts, WAITS_MS.length - 1)];
    stateAlt.attempts++;
    stateAlt.outSince ??= Date.now();

    // A single email, on the 1st failure (with the internet down, it does not even go out: the "Reconectado" counts the rest)
    if (stateAlt.attempts === 1) {
        reasonOriginal = reasonAlt;
        alertPerEmail(t('conexao.falhaReiniciarTitulo'), t('conexao.falhaReiniciarCorpo', { reason: reasonAlt, error: errorAlt }));
    }

    printInfo(`♻️ Retrying to connect in ${wait / 1000}s (consecutive failures: ${stateAlt.attempts}).`);
    clearTimeout(newAttempt);
    newAttempt = setTimeout(() => {
        newAttempt = null;
        restartClient(t('conexao.motivoNovaTentativa', { n: stateAlt.attempts + 1, reason: reasonOriginal }));
    }, wait);
    newAttempt.unref?.();
}

// After an initialize that went through: if 'ready' does not come, restarts (except while waiting for the QR Code)
function watchReady() {
    clearTimeout(readyWatchdog);
    readyWatchdog = setTimeout(() => {
        readyWatchdog = null;
        if (stateAlt.ready || stateAlt.restarting || stateAlt.waitingQr) return;
        printError(`No connection ${CONNECTION_MAX_MS / 60000} min after starting: restarting the client.`);
        restartClient(t('conexao.motivoSemReady', { min: CONNECTION_MAX_MS / 60000 }));
    }, CONNECTION_MAX_MS);
    readyWatchdog.unref?.();
}

/*
 * whatsapp-web.js' destroy() only closes a connected browser. A Chromium that
 * lost the connection (the watchdog case) but stays alive holds the userDataDir, and
 * every following initialize fails with "The browser is already running for...".
 */
function killBrowserOrphan() {
    const proc = client.pupBrowser?.process?.();
    if (!proc || proc.exitCode !== null || proc.signalCode !== null) return;
    printInfo(`Killing the orphan Chromium (PID ${proc.pid}).`);
    proc.kill('SIGKILL');
}

async function restartClient(reasonAlt) {
    if (stateAlt.restarting) {
        printInfo(`Restart ignored (already in progress). Reason: ${reasonAlt}`);
        return;
    }

    stateAlt.restarting = true;
    stateAlt.ready = false;
    printInfo(`♻️ Restarting client. Reason: ${reasonAlt}`);

    try {
        await client.destroy();
    } catch (e) {
        printError('destroy failed:', e.message);
    }
    killBrowserOrphan();

    await new Promise(r => setTimeout(r, 5000));

    let errorAlt = null;
    try {
        await client.initialize();
    } catch (e) {
        errorAlt = e;
        printError('initialize failed:', e.message, initializeWhere(e));
    } finally {
        stateAlt.restarting = false;
    }

    if (errorAlt) scheduleNewAttempt(reasonAlt, errorAlt.message);
    else watchReady();
}

// Watchdog (the check that WhatsApp responds lives in heartbeat.js): only watches a client that was already ready and is not restarting
async function watchBrowser() {
    if (!stateAlt.ready || stateAlt.restarting) return;

    if (!client.pupBrowser?.isConnected()) {
        alertPerEmail(t('conexao.browserCaiuTitulo'), t('conexao.browserCaiuCorpo'));
        await restartClient(t('conexao.motivoBrowser'));
    }
}

// Called in app.js
function startWatchdog() {
    setInterval(watchBrowser, 30000);
}

// Where an initialize stopped: the page it was on and the lines of whatsapp-web.js in the stack (a timeout alone
// does not say which wait it was)
function initializeWhere(err) {
    let page = '?';
    try { page = client.pupPage?.url?.() ?? '?'; } catch { /* the browser is gone */ }
    const stack = String(err?.stack ?? '').split('\n').filter(l => /whatsapp-web\.js[\\/]src/.test(l)).slice(0, 3).map(l => l.trim()).join(' | ');
    return `(page: ${page}${stack ? `; at: ${stack}` : ''})`;
}

/*
 * QR Code: where it shows up
 *   web:      always while the web interface is on, in Health (behind its login); the terminal and the email say
 *             so, with the direct address (<web>/qr)
 *   terminal: when the email is off (the default), or when the email fails (QRCODE_EMAIL_FALLBACK_TERMINAL)
 *   email:    QRCODE_EMAIL_ENABLE="true"
 *   QRCODE_WEB_ONLY="true": only the web; the terminal only says where it is. With the web off, it is ignored (the QR
 *   goes where it would without it): a QR that reaches nowhere would leave the bot waiting for a pairing nobody can do
 */
const envTrue = (name) => String(process.env[name] ?? '').trim().toLowerCase() === 'true';
// (loaded here: the web server loads a lot, and the QR only comes when there is no session)
const webShowsQr = () => require('./web/server').isWebRunning();
const webQrUrl = () => `${require('./web/server').webUrl()}/qr`;

let lastQrSent = null;
let qrEmailSending = false;
let qrEmailCounter = 0;

client.on('qr', async (qr) => {
    // Waiting for someone to read the QR: the 'ready' watcher does not restart (the QR would change on every restart)
    const firstOfTheWait = !stateAlt.waitingQr;
    stateAlt.waitingQr = true;
    // The web shows the current one (Health): WhatsApp renews it about every 20 s, each one with its number
    const previous = stateAlt.qr;
    stateAlt.qr = { code: qr, at: Date.now(), count: previous?.code === qr ? previous.count : (previous?.count ?? 0) + 1 };
    const web = webShowsQr();
    const renewed = previous?.code !== qr;
    if (web && firstOfTheWait) {
        // The phones with the notices of the connection on: a click opens Health, where the QR is
        require('./webPush').pushNotice('connection', { title: t('conexao.qrPushTitulo'), body: t('conexao.qrPushCorpo'), url: '/?view=health', tag: 'qr', urgent: true });
    }

    // Only the web: the terminal says where it is (one line per code), and nothing else is drawn nor sent
    if (envTrue('QRCODE_WEB_ONLY')) {
        if (web) {
            if (renewed) printInfo(`QR Code #${stateAlt.qr.count}: sent only to the web (QRCODE_WEB_ONLY): ${webQrUrl()}`);
            return;
        }
        if (firstOfTheWait) printError('QR Code: QRCODE_WEB_ONLY is true, but the web interface is off: it goes to the terminal (or the email) instead');
    }

    const currentdatetimeday =
        new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo', hour12: false }) + ' BRT';

    const emailEnabled = String(process.env.QRCODE_EMAIL_ENABLE).trim().toLowerCase() === 'true';

    printInfo(`[QR] PID=${process.pid} emailEnabled=${emailEnabled}`);

    // Diagnostic: a QR after already authenticating indicates a lost session.
    if (stateAlt.authenticatedAt > 0 || stateAlt.lastOutage) {
        printError(
            '⚠️ QR received AFTER authentication.',
            `lastDisconnect=${stateAlt.lastOutage} restarting=${stateAlt.restarting} ready=${stateAlt.ready}`
        );
        alertPerEmail(t('conexao.sessaoPerdidaTitulo'), t('conexao.sessaoPerdidaCorpo', { reason: stateAlt.lastOutage ?? '-' }));
    }

    if (!emailEnabled) {
        printInfo(`QR Code received at (${currentdatetimeday}), scan it please`);
        qrcodeTerminal.generate(qr, { small: true });
        if (web) printInfo(`QR Code #${stateAlt.qr.count}: also on the web: ${webQrUrl()}`);
        return;
    }

    // Ignores the same QR already sent and simultaneous sends
    if (qr === lastQrSent || qrEmailSending) return;

    qrEmailSending = true;

    try {
        const myantiphishing = process.env.QRCODE_EMAIL_SMTP_ANTIPHISHING;
        const pngBuffer = await qrcode.toBuffer(qr, { type: 'png', width: 300 });
        const phoneNumber = process.env.PHONE_NUMBER.split('@')[0];
        const maskPhone = phoneNumber.replace(/(\d{4})\d+(\d{4})$/, '$1XXXX$2');

        // The real counter is only updated after SMTP succeeds
        const nextQrEmailCounter = qrEmailCounter + 1;

        const info = await transporter.sendMail({
            from: process.env.QRCODE_EMAIL_SMTP_FROM,
            to: process.env.QRCODE_EMAIL_SMTP_TO,
            subject: `[ZapBot] ${t('conexao.qrAssunto')}`,
            html: `
                <table width="50%" style="background:#f8f8f8;border:1px solid #dddddd;border-radius:5px;">
                    <tr>
                        <td style="padding:12px;">
                            <strong>${t('conexao.qrCodigo')}</strong>
                            <span style="color:#d9534f;font-weight:bold;">#${nextQrEmailCounter}</span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:12px;">
                            <strong>${t('conexao.qrTelefone')}</strong>
                            <span style="color:#d9534f;font-weight:bold;">${maskPhone}</span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:12px;">
                            <strong>${t('email.antiPhishing')}:</strong>
                            <span style="color:#d9534f;font-weight:bold;">${myantiphishing}</span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:12px;">
                            <strong>${t('conexao.qrGeradoEm')}</strong>
                            <span style="color:#000000;font-weight:bold;">${currentdatetimeday}</span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:12px;background:#fff3cd;border:1px solid #ffeeba;">
                            <strong>${t('conexao.qrAtencao')}</strong>
                            ${t('conexao.qrSubstitui')}
                        </td>
                    </tr>
                    ${web ? `<tr>
                        <td style="padding:12px;">
                            <strong>${t('conexao.qrTambemWeb')}</strong>
                            <a href="${escapeHtml(webQrUrl())}">${escapeHtml(webQrUrl())}</a>
                        </td>
                    </tr>` : ''}
                    <tr>
                        <td style="padding:12px;">
                            <strong>${t('conexao.qrEscaneie')}</strong>
                            <br><br>
                            <img src="cid:qrcode">
                        </td>
                    </tr>
                </table>
            `,
            attachments: [
                {
                    filename: `qrcode-${nextQrEmailCounter}.png`,
                    content: pngBuffer,
                    cid: 'qrcode'
                }
            ]
        });

        lastQrSent = qr;
        qrEmailCounter = nextQrEmailCounter;

        printInfo(
            `QR Code #${qrEmailCounter} received at (${currentdatetimeday}) and sent to '${process.env.QRCODE_EMAIL_SMTP_TO}' (messageId=${info.messageId})`
        );
        if (web) printInfo(`QR Code #${stateAlt.qr.count}: also on the web: ${webQrUrl()}`);
    } catch (err) {
        printError('Error sending QR by e-mail:', err);

        // Without the email the QR would reach nowhere: shows it in the terminal (default on)
        if (String(process.env.QRCODE_EMAIL_FALLBACK_TERMINAL ?? 'true').trim().toLowerCase() !== 'false') {
            printInfo(`QR Code received at (${currentdatetimeday}), e-mail failed, scan it please`);
            qrcodeTerminal.generate(qr, { small: true });
        }
    } finally {
        qrEmailSending = false;
    }
});

/*
 * Connection events
 */
client.on('authenticated', () => {
    printSuccess('🔐 Whatsapp authentication success!');
    stateAlt.authenticatedAt = Date.now();
    stateAlt.waitingQr = false;
    stateAlt.qr = null;

    if (!isDebugMode()) return;

    const page = client.pupPage;

    if (!page) {
        printDebug('[WA] pupPage not available yet');
        return;
    }

    page.on('console', msg => printDebug('[BROWSER]', msg.type(), msg.text()));
    page.on('pageerror', err => printDebug('[BROWSER PAGE ERROR]', err));
    page.on('error', err => printDebug('[BROWSER ERROR]', err));
    page.on('requestfailed', request => {
        printDebug('[BROWSER REQUEST FAILED]', request.url(), request.failure()?.errorText);
    });

    setTimeout(async () => {
        try {
            const debug = await client.pupPage.evaluate(() => ({
                href: location.href,
                title: document.title,
                readyState: document.readyState,
                WWebJS: typeof window.WWebJS,
                Store: typeof window.Store,
                AuthStore: typeof window.AuthStore,
                requireExists: typeof window.require,
                webpackChunk: typeof window.webpackChunkwhatsapp_web_client
            }));

            printDebug('[WA DEBUG]', debug);
        } catch (err) {
            printDebug('[WA DEBUG ERROR]', err);
        }
    }, 5000);
});

client.on('disconnected', async (reason) => {
    stateAlt.ready = false;
    stateAlt.authenticatedAt = 0;
    stateAlt.lastOutage = reason;
    printInfo(`💥 WhatsApp disconnected: ${reason}`);

    if (NOT_RESTART.has(String(reason))) {
        printError(`Reason '${reason}' needs manual action (another instance or revoked session). Not restarting in a loop.`);
        alertPerEmail(t('conexao.desconectadoManualTitulo'), t('conexao.desconectadoManualCorpo', { reason }));
        return;
    }

    if (LOGGED_OUT.has(String(reason))) {
        printInfo(`WhatsApp logged out (${reason}): restarting for a new QR Code`);
        alertPerEmail(t('conexao.logoutTitulo'), t('conexao.logoutCorpo', { reason }));
    } else {
        alertPerEmail(t('conexao.desconectadoTitulo'), t('conexao.desconectadoCorpo', { reason }));
    }

    await restartClient(`disconnected: ${reason}`);
});

/**
 * Logs WhatsApp out (the bot leaves the linked devices of the account) and restarts, for a new QR Code: the
 * "Disconnect" of the web (Health). The session is gone for good: pairing again needs the phone.
 */
async function logoutWhatsApp(who = 'web') {
    printInfo(`WhatsApp: logout asked by ${who}`);
    alertPerEmail(t('conexao.logoutTitulo'), t('conexao.logoutCorpo', { reason: `logout (${who})` }));
    stateAlt.ready = false;
    stateAlt.authenticatedAt = 0;
    stateAlt.lastOutage = 'LOGOUT';
    try {
        await client.logout();
    } catch (err) {
        printError('WhatsApp: logout failed (the restart clears the session anyway):', err.message);
    }
    await restartClient(`logout (${who})`);
}

/*
 * After a logout, whatsapp-web.js reloads the page by itself and waits 30 s for it; when it does not come, that wait
 * rejects in nobody's hands and used to end the process ("💥 Crash"). The bot is restarting the client already: it is
 * only logged (src/process.js asks here first).
 */
function isWhatsAppReloadTimeout(err) {
    return !stateAlt.ready && err?.name === 'TimeoutError' && /whatsapp-web\.js[\\/]src[\\/]Client\.js/.test(String(err?.stack ?? ''));
}

client.on('loading_screen', (percent, message) => {
    printInfo(`[WA] loading_screen: ${percent}% - ${message}`);
});

client.on('auth_failure', msg => {
    printError('[WA] auth_failure:', msg);
    alertPerEmail(t('conexao.authFalhaTitulo'), `auth_failure: ${msg}`);
});

// States in which WhatsApp Web stopped working for this session
const STATES_PROBLEM = new Set(['CONFLICT', 'UNPAIRED', 'UNPAIRED_IDLE', 'DEPRECATED_VERSION', 'PROXYBLOCK', 'SMB_TOS_BLOCK', 'TOS_BLOCK', 'UNLAUNCHED']);

client.on('change_state', state => {
    printInfo(`[WA STATE]=${state}`);
    if (STATES_PROBLEM.has(state)) alertPerEmail(t('conexao.estadoTitulo', { state }), t('conexao.estadoCorpo', { state }));
});

let jaStayedReady = false;

client.on('ready', () => withContextDebug({ noFilter: true }, async () => {
    stateAlt.ready = true;
    stateAlt.waitingQr = false;
    stateAlt.qr = null;
    const dropReason = stateAlt.lastOutage;
    stateAlt.lastOutage = null;

    // Connected: the attempts stop, and the email says how long it was out
    const { attempts, outSince: outsideSince } = stateAlt;
    stateAlt.attempts = 0;
    stateAlt.outSince = null;
    stopReconnection();
    const minutesOutside = outsideSince ? Math.max(1, Math.round((Date.now() - outsideSince) / 60000)) : 0;
    const outsidePer = outsideSince
        ? t('conexao.foraPor', { min: minutesOutside, n: attempts })
        : null;

    // The settings come from the database: warns right at boot if the bot is off or only you use it
    await dbReady;
    const listNotices = [
        getSetting('bot.paused') && t('conexao.avisoDesligado'),
        !getSetting('bot.users').length &&
            t('conexao.avisoSoVoce')
    ].filter(Boolean);
    const notices = listNotices.map(a => ` ${a}`).join('');

    printSuccess(`🤖 ZapBot ${versionWithCommit()} ready! Reporting to ${process.env.PHONE_NUMBER}`);
    const { isWebRunning, webUrl } = require('./web/server'); // here: it loads the client and the database, like this file
    const web = isWebRunning() ? `\n${t('conexao.web', { url: webUrl() })}` : '';
    messageToSelf(`${t('conexao.inicializado', { version: versionWithCommit(), notices })}${web}`)
        // then the notices that came while it was not ready (an access to the web page during the boot)
        .then(() => sendWaitingToSelf());

    alertPerEmail(t(jaStayedReady ? 'conexao.reconectadoTitulo' : 'conexao.iniciadoTitulo'),
        [jaStayedReady ? (dropReason ? t('conexao.conectadoDeNovoQueda', { reason: dropReason }) : t('conexao.conectadoDeNovo')) : t('conexao.conectado'),
         outsidePer, ...listNotices].filter(Boolean).join('\n'));
    if (!jaStayedReady) {
        // In the background: the mention ids of messages stored before they existed
        fillMentionsOld().catch(err => printError('[Mentions] Error filling in the old ones:', err.message));
    }
    jaStayedReady = true;
    // SMTP may finish later: the context keeps this notice visible without delaying the filter.
    bootCompleteLogs();
}));

/*
 * Initialization
 */
async function startBot() {
    try {
        printInfo('Starting WhatsApp authentication...');
        await client.initialize();
        watchReady();
    } catch (error) {
        printError('Error caught during initialization:', error.message, initializeWhere(error));

        // Closes the old browser if it was partially opened
        try {
            printInfo('Closing pending browser instances...');
            await client.destroy();
        } catch {
            printInfo('No active browser to destroy.');
        }
        killBrowserOrphan();

        if (error.message.includes('Execution context was destroyed') || error.message.includes('browser is already running')) {
            printInfo('Restarting the initialization process in 5 seconds...');
            setTimeout(startBot, 5000);
            return;
        }

        // Any other error (e.g.: no internet at boot): tries again, with growing waits
        scheduleNewAttempt(t('conexao.motivoInicializacao'), error.message);
    }
}

module.exports = {
    CONNECTION_MAX_MS,
    WAITS_MS,
    startBot,
    startWatchdog,
    stopReconnection,
    restartClient,
    logoutWhatsApp,
    isWhatsAppReloadTimeout
};
