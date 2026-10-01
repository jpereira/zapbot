/*
 * E-mail: o transporte SMTP (QR Code e alertas) e os alertas de crash, queda, reconexão...
 */

const os = require('os');
const nodemailer = require('nodemailer');
const packageJson = require('../package.json');

const { BOT_START_TIME } = require('./constantes');
const { getBotUptime, printError, printInfo } = require('./log');
const { getSetting } = require('./settings');

// Transporte SMTP: usado pelo e-mail do QR Code e pelos alertas abaixo
const transporter = nodemailer.createTransport({
    host: process.env.QRCODE_EMAIL_SMTP_HOST,
    port: process.env.QRCODE_EMAIL_SMTP_PORT,
    secure: true, // SSL (465)
    auth: {
        user: process.env.QRCODE_EMAIL_SMTP_USER,
        pass: process.env.QRCODE_EMAIL_SMTP_PASS
    }
    // Sem "tls.rejectUnauthorized: false": o certificado do SMTP precisa ser válido,
    // senão um MITM captura a senha e o QR Code (= sessão do WhatsApp).
});

/*
 * Alertas por e-mail (setting 'email.alerts', padrão on)
 * Crash, desconexão, reconexão, falha de autenticação, sessão perdida,
 * encerramento... vão por e-mail pelo mesmo SMTP do QR Code (QRCODE_EMAIL_SMTP_*),
 * para quando o próprio WhatsApp não está funcionando. O mesmo evento não se
 * repete antes de 5 minutos (evita uma enxurrada num loop de reconexão).
 */
const ALERTA_EMAIL_INTERVALO_MS = 5 * 60 * 1000;
const ultimoAlertaEmail = new Map(); // evento -> quando foi enviado

const smtpConfigurado = () => ['QRCODE_EMAIL_SMTP_HOST', 'QRCODE_EMAIL_SMTP_USER', 'QRCODE_EMAIL_SMTP_TO']
    .every(v => process.env[v]?.trim());

const escaparHtml = (t) => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * @param {string} evento    título (vai no assunto), ex.: '🔴 Desconectado'
 * @param {string} detalhes  texto livre (motivo, stack...)
 * @param {object} [o]
 * @param {boolean} [o.forcar] ignora o intervalo mínimo (crash, encerramento)
 */
async function alertarPorEmail(evento, detalhes = '', { forcar = false } = {}) {
    try {
        // Antes do banco carregar, getSetting devolve o padrão (on)
        if (!getSetting('email.alerts') || !smtpConfigurado()) return;

        const agora = Date.now();
        if (!forcar && agora - (ultimoAlertaEmail.get(evento) ?? 0) < ALERTA_EMAIL_INTERVALO_MS) {
            printInfo(`Alerta por e-mail '${evento}' não enviado: repetido em menos de 5 minutos.`);
            return;
        }
        ultimoAlertaEmail.set(evento, agora);

        const quando = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const telefone = String(process.env.PHONE_NUMBER ?? '').split('@')[0].replace(/(\d{4})\d+(\d{4})$/, '$1XXXX$2');
        const linhas = [
            ['📅 Quando', quando],
            ['📱 Número', telefone || '-'],
            ['🤖 Versão', packageJson.version],
            ['🖥️ Host', os.hostname()],
            ['⏱️ Processo no ar há', getBotUptime(BOT_START_TIME)],
            ['🛡️ Anti-Phishing Code', process.env.QRCODE_EMAIL_SMTP_ANTIPHISHING || '-']
        ];

        await transporter.sendMail({
            from: process.env.QRCODE_EMAIL_SMTP_FROM,
            to: process.env.QRCODE_EMAIL_SMTP_TO,
            subject: `[ZapBot] ${evento}`,
            text: `${evento}\n\n${detalhes}\n\n${linhas.map(([k, v]) => `${k}: ${v}`).join('\n')}`,
            html: `
                <h3>${escaparHtml(evento)}</h3>
                ${detalhes ? `<pre style="background:#f8f8f8;border:1px solid #ddd;padding:12px;white-space:pre-wrap;">${escaparHtml(detalhes)}</pre>` : ''}
                <table style="border-collapse:collapse;">
                    ${linhas.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;"><strong>${escaparHtml(k)}</strong></td><td>${escaparHtml(v)}</td></tr>`).join('')}
                </table>
            `
        });

        printInfo(`Alerta por e-mail enviado: ${evento}`);
    } catch (err) {
        printError(`Alerta por e-mail '${evento}' falhou:`, err.message);
    }
}

// Dá para enviar um e-mail qualquer (o destino vem de quem chama)?
const smtpParaEnviar = () => ['QRCODE_EMAIL_SMTP_HOST', 'QRCODE_EMAIL_SMTP_USER'].every(v => process.env[v]?.trim());

/**
 * Envia um e-mail pelo SMTP do bot (ex.: o alerta do /defi), opcionalmente com
 * anexos. Lança o erro do SMTP para quem chamou responder no chat.
 * @param {object} o
 * @param {string[]} o.para
 * @param {Array<{filename: string, path: string}>} [o.anexos]
 */
async function enviarEmail({ para, assunto, texto, anexos = [] }) {
    if (!smtpParaEnviar()) throw new Error('SMTP não configurado (QRCODE_EMAIL_SMTP_HOST e QRCODE_EMAIL_SMTP_USER no config/.env)');

    const antiPhishing = process.env.QRCODE_EMAIL_SMTP_ANTIPHISHING || '-';
    await transporter.sendMail({
        from: process.env.QRCODE_EMAIL_SMTP_FROM || process.env.QRCODE_EMAIL_SMTP_USER,
        to: para.join(', '),
        subject: `[ZapBot] ${assunto}`,
        text: `${texto}\n\n🛡️ Anti-Phishing Code: ${antiPhishing}`,
        ...(anexos.length ? { attachments: anexos } : {})
    });

    printInfo(`E-mail '${assunto}' enviado para ${para.join(', ')}`);
}

// Um arquivo em anexo (ex.: o /backup -send)
const enviarArquivoPorEmail = ({ para, assunto, texto, arquivo, nomeArquivo }) =>
    enviarEmail({ para, assunto, texto, anexos: [{ filename: nomeArquivo, path: arquivo }] });

// Espera o e-mail sair, mas não trava o encerramento se o SMTP não responder
async function alertarAntesDeSair(evento, detalhes, ms) {
    let limite;

    try {
        await Promise.race([
            alertarPorEmail(evento, detalhes, { forcar: true }),
            new Promise(r => { limite = setTimeout(r, ms); })
        ]);
    } finally {
        clearTimeout(limite);
    }
}

module.exports = {
    alertarAntesDeSair,
    alertarPorEmail,
    enviarArquivoPorEmail,
    enviarEmail,
    smtpParaEnviar,
    transporter
};
