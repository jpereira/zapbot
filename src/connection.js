/*
 * WhatsApp connection: initialization, QR Code, connection events, restart and watchdog.
 */

const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const packageJson = require('../package.json');

const { estado: stateAlt } = require('./state');
const { client, messageToSelf } = require('./client');
const { dbReady } = require('./db');
const { alertPerEmail, transporter } = require('./email');
const { printDebug, printError, printInfo, printSuccess } = require('./log');
const { getSetting, isDebugMode } = require('./settings');

// Reasons where restarting does not help: they need manual action.
const NOT_RESTART = new Set(['LOGOUT', 'CONFLICT', 'UNPAIRED', 'UNPAIRED_IDLE']);

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

    try {
        await client.initialize();
    } catch (e) {
        printError('initialize falhou:', e.message);
        alertPerEmail('❌ Falha ao reiniciar', `Motivo do reinício: ${reasonAlt}\ninitialize falhou: ${e.message}`);
    } finally {
        stateAlt.reiniciando = false;
    }
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

    if (!isDebugMode()) return;

    const page = client.pupPage;

    if (!page) {
        printDebug('[WA] pupPage ainda não disponível');
        return;
    }

    page.on('console', msg => console.log('[BROWSER]', msg.type(), msg.text()));
    page.on('pageerror', err => console.error('[BROWSER PAGE ERROR]', err));
    page.on('error', err => console.error('[BROWSER ERROR]', err));
    page.on('requestfailed', request => {
        console.error('[BROWSER REQUEST FAILED]', request.url(), request.failure()?.errorText);
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

            console.log('[WA DEBUG]', debug);
        } catch (err) {
            console.error('[WA DEBUG ERROR]', err);
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

client.on('ready', async () => {
    stateAlt.pronto = true;
    const dropReason = stateAlt.ultimaQueda;
    stateAlt.ultimaQueda = null;

    // The settings come from the database: warns right at boot if the bot is off or in admin mode
    await dbReady;
    const listNotices = [
        getSetting('bot.paused') && 'Bot desligado: use /bot -on para ativar os comandos.',
        getSetting('bot.adminMode') && 'Modo admin ligado: só você usa comandos (/bot -admin desliga).'
    ].filter(Boolean);
    const notices = listNotices.map(a => ` ${a}`).join('');

    printSuccess(`🤖 ZapBot ${packageJson.version} inicializado! Informando ${process.env.PHONE_NUMBER}`);
    messageToSelf(`🤖 ZapBot ${packageJson.version} inicializado.${notices}`);

    alertPerEmail(jaStayedReady ? '🔄 Reconectado' : '🟢 Bot iniciado',
        [jaStayedReady ? `Conectado de novo${dropReason ? ` (a queda foi: ${dropReason})` : ''}.` : 'Conectado ao WhatsApp.',
         ...listNotices].join('\n'));
    jaStayedReady = true;
});

/*
 * Initialization
 */
async function startBot() {
    try {
        printInfo('Starting WhatsApp authentication...');
        await client.initialize();
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
        }
    }
}

module.exports = {
    startBot,
    startWatchdog,
    restartClient
};
