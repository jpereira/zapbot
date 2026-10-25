/*
 * WhatsApp connection: initialization, QR Code, connection events, restart and watchdog.
 */

const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');

const { estado: stateAlt } = require('./state');
const { client, messageToSelf } = require('./client');
const { dbReady } = require('./db');
const { alertPerEmail, transporter } = require('./email');
const { printDebug, printError, printInfo, printSuccess } = require('./log');
const { getSetting, isDebugMode } = require('./settings');
const { versionWithCommit } = require('./version');
const { withContextDebug, bootCompleteLogs } = require('./debugContext');

// Reasons where restarting does not help: they need manual action.
const NOT_RESTART = new Set(['LOGOUT', 'CONFLICT', 'UNPAIRED', 'UNPAIRED_IDLE']);

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
let vigiaDoReady = null;      // the setTimeout that waits for 'ready' after initialize

// Both timers do not hold the process (unref) and leave together (ready, tests)
function stopReconnection() {
    reasonOriginal = null;
    clearTimeout(newAttempt);
    clearTimeout(vigiaDoReady);
    newAttempt = null;
    vigiaDoReady = null;
}

function scheduleNewAttempt(reasonAlt, errorAlt) {
    const wait = WAITS_MS[Math.min(stateAlt.tentativas, WAITS_MS.length - 1)];
    stateAlt.tentativas++;
    stateAlt.foraDesde ??= Date.now();

    // A single email, on the 1st failure (with the internet down, it does not even go out: the "Reconectado" counts the rest)
    if (stateAlt.tentativas === 1) {
        reasonOriginal = reasonAlt;
        alertPerEmail('❌ Falha ao reiniciar', `Motivo do reinício: ${reasonAlt}
initialize falhou: ${errorAlt}
` +
            'O bot vai tentar de novo sozinho, com espera crescente, até conectar.');
    }

    printInfo(`♻️ Nova tentativa de conectar em ${wait / 1000}s (falhas seguidas: ${stateAlt.tentativas}).`);
    clearTimeout(newAttempt);
    newAttempt = setTimeout(() => {
        newAttempt = null;
        restartClient(`nova tentativa nº ${stateAlt.tentativas + 1} (${reasonOriginal})`);
    }, wait);
    newAttempt.unref?.();
}

// After an initialize that went through: if 'ready' does not come, restarts (except while waiting for the QR Code)
function watchReady() {
    clearTimeout(vigiaDoReady);
    vigiaDoReady = setTimeout(() => {
        vigiaDoReady = null;
        if (stateAlt.pronto || stateAlt.reiniciando || stateAlt.aguardandoQr) return;
        printError(`Sem conexão ${CONNECTION_MAX_MS / 60000} min depois de iniciar: reiniciando o cliente.`);
        restartClient(`sem 'ready' em ${CONNECTION_MAX_MS / 60000} min`);
    }, CONNECTION_MAX_MS);
    vigiaDoReady.unref?.();
}

async function restartClient(reasonAlt) {
    if (stateAlt.reiniciando) {
        printInfo(`Restart ignorado (já em andamento). Motivo: ${reasonAlt}`);
        return;
    }

    stateAlt.reiniciando = true;
    stateAlt.pronto = false;
    printInfo(`♻️ Reiniciando cliente. Motivo: ${reasonAlt}`);

    try {
        await client.destroy();
    } catch (e) {
        printError('destroy falhou:', e.message);
    }

    await new Promise(r => setTimeout(r, 5000));

    let errorAlt = null;
    try {
        await client.initialize();
    } catch (e) {
        errorAlt = e;
        printError('initialize falhou:', e.message);
    } finally {
        stateAlt.reiniciando = false;
    }

    if (errorAlt) scheduleNewAttempt(reasonAlt, errorAlt.message);
    else watchReady();
}

// Watchdog (the check that WhatsApp responds lives in heartbeat.js): only watches a client that was already ready and is not restarting
async function watchBrowser() {
    if (!stateAlt.pronto || stateAlt.reiniciando) return;

    if (!client.pupBrowser?.isConnected()) {
        alertPerEmail('♻️ Browser caiu', 'O Chromium desconectou; o watchdog está reiniciando o cliente.');
        await restartClient('browser desconectado (watchdog)');
    }
}

// Called in app.js
function startWatchdog() {
    setInterval(watchBrowser, 30000);
}

/*
 * QR Code
 */
let lastQrSent = null;
let qrEmailSending = false;
let qrEmailCounter = 0;

client.on('qr', async (qr) => {
    // Waiting for someone to read the QR: the 'ready' watcher does not restart (the QR would change on every restart)
    stateAlt.aguardandoQr = true;

    const currentdatetimeday =
        new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo', hour12: false }) + ' BRT';

    const emailEnabled = String(process.env.QRCODE_EMAIL_ENABLE).trim().toLowerCase() === 'true';

    printInfo(`[QR] PID=${process.pid} emailEnabled=${emailEnabled}`);

    // Diagnostic: a QR after already authenticating indicates a lost session.
    if (stateAlt.autenticadoEm > 0 || stateAlt.ultimaQueda) {
        printError(
            '⚠️ QR recebido APÓS autenticação.',
            `lastDisconnect=${stateAlt.ultimaQueda} restarting=${stateAlt.reiniciando} ready=${stateAlt.pronto}`
        );
        alertPerEmail('🔑 Sessão perdida: novo QR Code',
            `O WhatsApp pediu um novo QR Code depois de já ter autenticado (último motivo: ${stateAlt.ultimaQueda ?? '-'}).\n` +
            'Leia o QR Code no terminal (docker logs) ou no e-mail do QR Code, se QRCODE_EMAIL_ENABLE=true.');
    }

    if (!emailEnabled) {
        printInfo(`QR Code received at (${currentdatetimeday}), scan it please`);
        qrcodeTerminal.generate(qr, { small: true });
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
            subject: '[ZapBot] WhatsApp QR Code Authentication',
            html: `
                <table width="50%" style="background:#f8f8f8;border:1px solid #dddddd;border-radius:5px;">
                    <tr>
                        <td style="padding:12px;">
                            <strong>🔢 QR Code:</strong>
                            <span style="color:#d9534f;font-weight:bold;">#${nextQrEmailCounter}</span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:12px;">
                            <strong>📱 Phone Number:</strong>
                            <span style="color:#d9534f;font-weight:bold;">${maskPhone}</span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:12px;">
                            <strong>🛡️ Anti-Phishing Code:</strong>
                            <span style="color:#d9534f;font-weight:bold;">${myantiphishing}</span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:12px;">
                            <strong>📅 Generated At:</strong>
                            <span style="color:#000000;font-weight:bold;">${currentdatetimeday}</span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:12px;background:#fff3cd;border:1px solid #ffeeba;">
                            <strong>⚠️ Atenção:</strong>
                            Este QR Code substitui qualquer QR Code enviado anteriormente.
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:12px;">
                            <strong>📱 Escaneie o QR:</strong>
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
            `QR Code #${qrEmailCounter} received at (${currentdatetimeday}) ` +
            `and sent to '${process.env.QRCODE_EMAIL_SMTP_TO}' (messageId=${info.messageId})`
        );
    } catch (err) {
        printError('Erro ao enviar QR por email:', err);

        // Without the email the QR would reach nowhere: shows it in the terminal (default on)
        if (String(process.env.QRCODE_EMAIL_FALLBACK_TERMINAL ?? 'true').trim().toLowerCase() !== 'false') {
            printInfo(`QR Code received at (${currentdatetimeday}), e-mail falhou, scan it please`);
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
    stateAlt.autenticadoEm = Date.now();
    stateAlt.aguardandoQr = false;

    if (!isDebugMode()) return;

    const page = client.pupPage;

    if (!page) {
        printDebug('[WA] pupPage ainda não disponível');
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
    stateAlt.pronto = false;
    stateAlt.autenticadoEm = 0;
    stateAlt.ultimaQueda = reason;
    printInfo(`💥 WhatsApp desconectou: ${reason}`);

    if (NOT_RESTART.has(String(reason))) {
        printError(`Motivo '${reason}' exige ação manual (outra instância ou sessão revogada). Não vou reiniciar em loop.`);
        alertPerEmail('🔴 Desconectado (ação manual)',
            `Motivo: ${reason}\nO bot NÃO vai reiniciar sozinho: outra instância abriu a sessão ou ela foi revogada no celular.`);
        return;
    }

    alertPerEmail('🔴 Desconectado', `Motivo: ${reason}\nO cliente será reiniciado automaticamente.`);

    await restartClient(`disconnected: ${reason}`);
});

client.on('loading_screen', (percent, message) => {
    printInfo(`[WA] loading_screen: ${percent}% - ${message}`);
});

client.on('auth_failure', msg => {
    printError('[WA] auth_failure:', msg);
    alertPerEmail('⛔ Falha de autenticação', `auth_failure: ${msg}`);
});

// States in which WhatsApp Web stopped working for this session
const STATES_PROBLEM = new Set(['CONFLICT', 'UNPAIRED', 'UNPAIRED_IDLE', 'DEPRECATED_VERSION', 'PROXYBLOCK', 'SMB_TOS_BLOCK', 'TOS_BLOCK', 'UNLAUNCHED']);

client.on('change_state', state => {
    printInfo(`[WA STATE]=${state}`);
    if (STATES_PROBLEM.has(state)) alertPerEmail(`⚠️ Estado do WhatsApp: ${state}`, `O WhatsApp Web mudou para o estado ${state}.`);
});

let jaStayedReady = false;

client.on('ready', () => withContextDebug({ semFiltro: true }, async () => {
    stateAlt.pronto = true;
    stateAlt.aguardandoQr = false;
    const dropReason = stateAlt.ultimaQueda;
    stateAlt.ultimaQueda = null;

    // Connected: the attempts stop, and the email says how long it was out
    const { tentativas: attempts, foraDesde: outsideSince } = stateAlt;
    stateAlt.tentativas = 0;
    stateAlt.foraDesde = null;
    stopReconnection();
    const minutesOutside = outsideSince ? Math.max(1, Math.round((Date.now() - outsideSince) / 60000)) : 0;
    const outsidePer = outsideSince
        ? `Ficou ${minutesOutside} min sem conseguir conectar (${attempts} tentativa${attempts === 1 ? '' : 's'} falharam).`
        : null;

    // The settings come from the database: warns right at boot if the bot is off or only you use it
    await dbReady;
    const listNotices = [
        getSetting('bot.paused') && 'Bot desligado: use /bot -on para ativar os comandos.',
        !getSetting('bot.users').length &&
            'Só você (e os admins) usa comandos: /bot +v <pessoa|grupo> libera para alguns.'
    ].filter(Boolean);
    const notices = listNotices.map(a => ` ${a}`).join('');

    printSuccess(`🤖 ZapBot ${versionWithCommit()} inicializado! Informando ${process.env.PHONE_NUMBER}`);
    messageToSelf(`🤖 ZapBot ${versionWithCommit()} inicializado.${notices}`);

    alertPerEmail(jaStayedReady ? '🔄 Reconectado' : '🟢 Bot iniciado',
        [jaStayedReady ? `Conectado de novo${dropReason ? ` (a queda foi: ${dropReason})` : ''}.` : 'Conectado ao WhatsApp.',
         outsidePer, ...listNotices].filter(Boolean).join('\n'));
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
        printError('Erro capturado na inicialização:', error.message);

        // Closes the old browser if it was partially opened
        try {
            printInfo('Fechando instâncias pendentes do navegador...');
            await client.destroy();
        } catch {
            printInfo('Nenhum navegador ativo para destruir.');
        }

        if (error.message.includes('Execution context was destroyed') || error.message.includes('browser is already running')) {
            printInfo('Reiniciando o processo de inicialização em 5 segundos...');
            setTimeout(startBot, 5000);
            return;
        }

        // Any other error (e.g.: no internet at boot): tries again, with growing waits
        scheduleNewAttempt('inicialização', error.message);
    }
}

module.exports = {
    CONNECTION_MAX_MS,
    WAITS_MS,
    startBot,
    startWatchdog,
    stopReconnection,
    restartClient
};
