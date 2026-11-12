/*
 * Email: the SMTP transport (QR Code and alerts) and the crash, outage, reconnection alerts...
 */

const os = require('os');
const nodemailer = require('nodemailer');

const { BOT_START_TIME } = require('./constants');
const { getBotUptime, printError, printInfo } = require('./log');
const { getSetting } = require('./settings');
const { versionWithCommit } = require('./version');
const { language, t } = require('./i18n');

// SMTP transport: used by the QR Code email and by the alerts below
const transporter = nodemailer.createTransport({
    host: process.env.QRCODE_EMAIL_SMTP_HOST,
    port: process.env.QRCODE_EMAIL_SMTP_PORT,
    secure: true, // SSL (465)
    auth: {
        user: process.env.QRCODE_EMAIL_SMTP_USER,
        pass: process.env.QRCODE_EMAIL_SMTP_PASS
    }
    // No "tls.rejectUnauthorized: false": the SMTP certificate must be valid,
    // otherwise a MITM captures the password and the QR Code (= the WhatsApp session).
});

/*
 * Login failure (EAUTH): stops trying for a while. Each wrong attempt counts toward the
 * "Too many bad auth attempts" from Gmail, so insisting (new QR, alerts, reconnections)
 * only prolongs the block.
 */
const EAUTH_PAUSE_MS = 30 * 60 * 1000;
let eauthUntil = 0; // until when SMTP stays paused
const sendMailOriginal = transporter.sendMail.bind(transporter);

// Paused by a previous EAUTH? Throws the error without opening an SMTP connection
function requireSmtpWithoutPause() {
    if (Date.now() >= eauthUntil) return;

    const minutes = Math.ceil((eauthUntil - Date.now()) / 60000);
    const err = new Error(t('email.pausa', { min: minutes }));
    err.code = 'EAUTH_PAUSA';
    throw err;
}

const pauseSeEauth = (err) => {
    if (err.code === 'EAUTH') eauthUntil = Date.now() + EAUTH_PAUSE_MS;
};

transporter.sendMail = async (...args) => {
    requireSmtpWithoutPause();

    try {
        return await sendMailOriginal(...args);
    } catch (err) {
        pauseSeEauth(err);
        throw err;
    }
};

// Connects and authenticates on SMTP without sending anything (/bot -test). Respects the EAUTH pause
async function checkSmtp() {
    requireSmtpWithoutPause();

    try {
        await transporter.verify();
    } catch (err) {
        pauseSeEauth(err);
        throw err;
    }
}

/*
 * Email alerts (setting 'email.alerts', default on)
 * Crash, disconnection, reconnection, authentication failure, lost session,
 * shutdown... go by email through the same SMTP as the QR Code (QRCODE_EMAIL_SMTP_*),
 * for when WhatsApp itself is not working. The same event does not
 * repeats before 5 minutes (avoids a flood in a reconnection loop).
 */
const ALERT_EMAIL_INTERVAL_MS = 5 * 60 * 1000;
const lastAlertEmail = new Map(); // event -> when it was sent

// Forgets the alerts already sent (the tests start from zero)
const cleanAlertsSent = () => lastAlertEmail.clear();

const smtpConfigured = () => ['QRCODE_EMAIL_SMTP_HOST', 'QRCODE_EMAIL_SMTP_USER', 'QRCODE_EMAIL_SMTP_TO']
    .every(v => process.env[v]?.trim());

const escapeHtml = (t) => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * @param {string} evento    title (goes in the subject), e.g.: '🔴 Desconectado'
 * @param {string} detalhes  texto livre (motivo, stack...)
 * @param {object} [o]
 * @param {boolean} [o.forcar] ignores the minimum interval (crash, shutdown)
 */
async function alertPerEmail(event, details = '', { forcar: force = false } = {}) {
    try {
        // Before the database loads, getSetting returns the default (on)
        if (!getSetting('email.alerts') || !smtpConfigured()) return;

        const nowAlt = Date.now();
        if (!force && nowAlt - (lastAlertEmail.get(event) ?? 0) < ALERT_EMAIL_INTERVAL_MS) {
            printInfo(t('email.logAlertaRepetido', { evento: event }));
            return;
        }
        lastAlertEmail.set(event, nowAlt);

        const when = new Date().toLocaleString(language() === 'pt_BR' ? 'pt-BR' : 'en-US', { timeZone: 'America/Sao_Paulo' });
        const phoneAlt = String(process.env.PHONE_NUMBER ?? '').split('@')[0].replace(/(\d{4})\d+(\d{4})$/, '$1XXXX$2');
        const linesAlt = [
            [t('email.quando'), when],
            [t('email.numero'), phoneAlt || '-'],
            [t('email.versao'), versionWithCommit()],
            ['🖥️ Host', os.hostname()],
            [t('email.noAr'), getBotUptime(BOT_START_TIME)],
            [`🛡️ ${t('email.antiPhishing')}`, process.env.QRCODE_EMAIL_SMTP_ANTIPHISHING || '-']
        ];

        await transporter.sendMail({
            from: process.env.QRCODE_EMAIL_SMTP_FROM,
            to: process.env.QRCODE_EMAIL_SMTP_TO,
            subject: `[ZapBot] ${event}`,
            text: `${event}\n\n${details}\n\n${linesAlt.map(([k, v]) => `${k}: ${v}`).join('\n')}`,
            html: `
                <h3>${escapeHtml(event)}</h3>
                ${details ? `<pre style="background:#f8f8f8;border:1px solid #ddd;padding:12px;white-space:pre-wrap;">${escapeHtml(details)}</pre>` : ''}
                <table style="border-collapse:collapse;">
                    ${linesAlt.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;"><strong>${escapeHtml(k)}</strong></td><td>${escapeHtml(v)}</td></tr>`).join('')}
                </table>
            `
        });

        printInfo(t('email.logAlertaEnviado', { evento: event }));
    } catch (err) {
        printError(t('email.logAlertaFalhou', { evento: event }), err.message);
    }
}

// Can any email be sent (the destination comes from whoever calls)?
const smtpForSend = () => ['QRCODE_EMAIL_SMTP_HOST', 'QRCODE_EMAIL_SMTP_USER'].every(v => process.env[v]?.trim());

/**
 * Sends an email through the bot's SMTP (e.g.: the /defi alert), optionally with
 * attachments. Throws the SMTP error for whoever called to reply in the chat.
 * @param {object} o
 * @param {string[]} o.para
 * @param {Array<{filename: string, path: string}>} [o.anexos]
 */
async function sendEmail({ para, assunto: subject, texto: textAlt, anexos: attachments = [] }) {
    if (!smtpForSend()) throw new Error(t('email.naoConfigurado'));

    const antiPhishing = process.env.QRCODE_EMAIL_SMTP_ANTIPHISHING || '-';
    await transporter.sendMail({
        from: process.env.QRCODE_EMAIL_SMTP_FROM || process.env.QRCODE_EMAIL_SMTP_USER,
        to: para.join(', '),
        subject: `[ZapBot] ${subject}`,
        text: `${textAlt}\n\n🛡️ ${t('email.antiPhishing')}: ${antiPhishing}`,
        ...(attachments.length ? { attachments: attachments } : {})
    });

    printInfo(t('email.logEnviado', { assunto: subject, para: para.join(', ') }));
}

// A file as an attachment (e.g.: /backup -send)
const sendFilePerEmail = ({ para, assunto: subject, texto: textAlt, arquivo: fileAlt, nomeArquivo: nameFile }) =>
    sendEmail({ para, assunto: subject, texto: textAlt, anexos: [{ filename: nameFile, path: fileAlt }] });

// Waits for the email to go out, but does not block shutdown if SMTP does not respond
async function leaveAlertBefore(event, details, ms) {
    let limitAlt;

    try {
        await Promise.race([
            alertPerEmail(event, details, { forcar: true }),
            new Promise(r => { limitAlt = setTimeout(r, ms); })
        ]);
    } finally {
        clearTimeout(limitAlt);
    }
}

module.exports = {
    leaveAlertBefore,
    alertPerEmail,
    sendFilePerEmail,
    sendEmail,
    cleanAlertsSent,
    smtpForSend,
    transporter,
    checkSmtp
};
