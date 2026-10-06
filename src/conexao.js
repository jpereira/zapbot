/*
 * Conexão com o WhatsApp: inicialização, QR Code, eventos de conexão, reinício e watchdog.
 */

const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');

const { estado } = require('./estado');
const { client, messageToSelf } = require('./cliente');
const { dbPronto } = require('./db');
const { alertarPorEmail, transporter } = require('./email');
const { printDebug, printError, printInfo, printSuccess } = require('./log');
const { getSetting, isDebugMode } = require('./settings');
const { versaoComCommit } = require('./versao');

// Motivos em que reiniciar não resolve: exigem ação manual.
const NAO_REINICIAR = new Set(['LOGOUT', 'CONFLICT', 'UNPAIRED', 'UNPAIRED_IDLE']);

/*
 * Reconexão: se o initialize falhar (internet fora: ERR_NAME_NOT_RESOLVED,
 * ERR_INTERNET_DISCONNECTED...), tenta de novo sozinho, com espera crescente,
 * até conseguir. Antes, uma falha deixava o bot parado para sempre: sem
 * 'ready', o heartbeat achava que era só o boot e o watchdog não olhava.
 * E se o initialize passar mas o 'ready' não vier em CONEXAO_MAX_MS (a página
 * abriu e a rede caiu no meio), reinicia também, a não ser esperando o QR Code.
 */
const ESPERAS_MS = [15, 30, 60, 120, 300].map(s => s * 1000);   // depois, a cada 5 min
const CONEXAO_MAX_MS = 3 * 60 * 1000;

let novaTentativa = null;     // o setTimeout da próxima tentativa
let motivoOriginal = null;    // o que levou ao 1º reinício que falhou (o das tentativas seguintes)
let vigiaDoReady = null;      // o setTimeout que espera o 'ready' depois do initialize

// Os dois temporizadores não seguram o processo (unref) e saem juntos (ready, testes)
function pararReconexao() {
    motivoOriginal = null;
    clearTimeout(novaTentativa);
    clearTimeout(vigiaDoReady);
    novaTentativa = null;
    vigiaDoReady = null;
}

function agendarNovaTentativa(motivo, erro) {
    const espera = ESPERAS_MS[Math.min(estado.tentativas, ESPERAS_MS.length - 1)];
    estado.tentativas++;
    estado.foraDesde ??= Date.now();

    // Um e-mail só, na 1ª falha (com a internet fora, ele nem sai: o "Reconectado" conta o resto)
    if (estado.tentativas === 1) {
        motivoOriginal = motivo;
        alertarPorEmail('❌ Falha ao reiniciar', `Motivo do reinício: ${motivo}
initialize falhou: ${erro}
` +
            'O bot vai tentar de novo sozinho, com espera crescente, até conectar.');
    }

    printInfo(`♻️ Nova tentativa de conectar em ${espera / 1000}s (falhas seguidas: ${estado.tentativas}).`);
    clearTimeout(novaTentativa);
    novaTentativa = setTimeout(() => {
        novaTentativa = null;
        restartClient(`nova tentativa nº ${estado.tentativas + 1} (${motivoOriginal})`);
    }, espera);
    novaTentativa.unref?.();
}

// Depois de um initialize que passou: se o 'ready' não vier, reinicia (exceto esperando o QR Code)
function vigiarReady() {
    clearTimeout(vigiaDoReady);
    vigiaDoReady = setTimeout(() => {
        vigiaDoReady = null;
        if (estado.pronto || estado.reiniciando || estado.aguardandoQr) return;
        printError(`Sem conexão ${CONEXAO_MAX_MS / 60000} min depois de iniciar: reiniciando o cliente.`);
        restartClient(`sem 'ready' em ${CONEXAO_MAX_MS / 60000} min`);
    }, CONEXAO_MAX_MS);
    vigiaDoReady.unref?.();
}

async function restartClient(motivo) {
    if (estado.reiniciando) {
        printInfo(`Restart ignorado (já em andamento). Motivo: ${motivo}`);
        return;
    }

    estado.reiniciando = true;
    estado.pronto = false;
    printInfo(`♻️ Reiniciando cliente. Motivo: ${motivo}`);

    try {
        await client.destroy();
    } catch (e) {
        printError('destroy falhou:', e.message);
    }

    await new Promise(r => setTimeout(r, 5000));

    let erro = null;
    try {
        await client.initialize();
    } catch (e) {
        erro = e;
        printError('initialize falhou:', e.message);
    } finally {
        estado.reiniciando = false;
    }

    if (erro) agendarNovaTentativa(motivo, erro.message);
    else vigiarReady();
}

// Watchdog (a verificação de que o WhatsApp responde fica no heartbeat.js): só vigia um cliente que já esteve pronto e não está reiniciando
async function vigiarBrowser() {
    if (!estado.pronto || estado.reiniciando) return;

    if (!client.pupBrowser?.isConnected()) {
        alertarPorEmail('♻️ Browser caiu', 'O Chromium desconectou; o watchdog está reiniciando o cliente.');
        await restartClient('browser desconectado (watchdog)');
    }
}

// Chamada no app.js
function iniciarWatchdog() {
    setInterval(vigiarBrowser, 30000);
}

/*
 * QR Code
 */
let lastQrSent = null;
let qrEmailSending = false;
let qrEmailCounter = 0;

client.on('qr', async (qr) => {
    // Esperando alguém ler o QR: o vigia do 'ready' não reinicia (o QR mudaria a cada reinício)
    estado.aguardandoQr = true;

    const currentdatetimeday =
        new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo', hour12: false }) + ' BRT';

    const emailEnabled = String(process.env.QRCODE_EMAIL_ENABLE).trim().toLowerCase() === 'true';

    printInfo(`[QR] PID=${process.pid} emailEnabled=${emailEnabled}`);

    // Diagnóstico: QR depois de já ter autenticado indica sessão perdida.
    if (estado.autenticadoEm > 0 || estado.ultimaQueda) {
        printError(
            '⚠️ QR recebido APÓS autenticação.',
            `lastDisconnect=${estado.ultimaQueda} restarting=${estado.reiniciando} ready=${estado.pronto}`
        );
        alertarPorEmail('🔑 Sessão perdida: novo QR Code',
            `O WhatsApp pediu um novo QR Code depois de já ter autenticado (último motivo: ${estado.ultimaQueda ?? '-'}).\n` +
            'Leia o QR Code no terminal (docker logs) ou no e-mail do QR Code, se QRCODE_EMAIL_ENABLE=true.');
    }

    if (!emailEnabled) {
        printInfo(`QR Code received at (${currentdatetimeday}), scan it please`);
        qrcodeTerminal.generate(qr, { small: true });
        return;
    }

    // Ignora o mesmo QR já enviado e envios simultâneos
    if (qr === lastQrSent || qrEmailSending) return;

    qrEmailSending = true;

    try {
        const myantiphishing = process.env.QRCODE_EMAIL_SMTP_ANTIPHISHING;
        const pngBuffer = await qrcode.toBuffer(qr, { type: 'png', width: 300 });
        const phoneNumber = process.env.PHONE_NUMBER.split('@')[0];
        const maskPhone = phoneNumber.replace(/(\d{4})\d+(\d{4})$/, '$1XXXX$2');

        // O contador real só é atualizado após sucesso no SMTP
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
 * Eventos de conexão
 */
client.on('authenticated', () => {
    printSuccess('🔐 Whatsapp authentication success!');
    estado.autenticadoEm = Date.now();
    estado.aguardandoQr = false;

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
    estado.pronto = false;
    estado.autenticadoEm = 0;
    estado.ultimaQueda = reason;
    printInfo(`💥 WhatsApp desconectou: ${reason}`);

    if (NAO_REINICIAR.has(String(reason))) {
        printError(`Motivo '${reason}' exige ação manual (outra instância ou sessão revogada). Não vou reiniciar em loop.`);
        alertarPorEmail('🔴 Desconectado (ação manual)',
            `Motivo: ${reason}\nO bot NÃO vai reiniciar sozinho: outra instância abriu a sessão ou ela foi revogada no celular.`);
        return;
    }

    alertarPorEmail('🔴 Desconectado', `Motivo: ${reason}\nO cliente será reiniciado automaticamente.`);

    await restartClient(`disconnected: ${reason}`);
});

client.on('loading_screen', (percent, message) => {
    printInfo(`[WA] loading_screen: ${percent}% - ${message}`);
});

client.on('auth_failure', msg => {
    printError('[WA] auth_failure:', msg);
    alertarPorEmail('⛔ Falha de autenticação', `auth_failure: ${msg}`);
});

// Estados em que o WhatsApp Web parou de funcionar para esta sessão
const ESTADOS_PROBLEMA = new Set(['CONFLICT', 'UNPAIRED', 'UNPAIRED_IDLE', 'DEPRECATED_VERSION', 'PROXYBLOCK', 'SMB_TOS_BLOCK', 'TOS_BLOCK', 'UNLAUNCHED']);

client.on('change_state', state => {
    printInfo(`[WA STATE]=${state}`);
    if (ESTADOS_PROBLEMA.has(state)) alertarPorEmail(`⚠️ Estado do WhatsApp: ${state}`, `O WhatsApp Web mudou para o estado ${state}.`);
});

let jaFicouPronto = false;

client.on('ready', async () => {
    estado.pronto = true;
    estado.aguardandoQr = false;
    const motivoDaQueda = estado.ultimaQueda;
    estado.ultimaQueda = null;

    // Conectou: as tentativas param, e o e-mail conta quanto tempo ficou fora
    const { tentativas, foraDesde } = estado;
    estado.tentativas = 0;
    estado.foraDesde = null;
    pararReconexao();
    const minutosFora = foraDesde ? Math.max(1, Math.round((Date.now() - foraDesde) / 60000)) : 0;
    const foraPor = foraDesde
        ? `Ficou ${minutosFora} min sem conseguir conectar (${tentativas} tentativa${tentativas === 1 ? '' : 's'} falharam).`
        : null;

    // Os settings vêm do banco: avisa já no boot se o bot está desligado ou só com você usando
    await dbPronto;
    const listaAvisos = [
        getSetting('bot.paused') && 'Bot desligado: use /bot -on para ativar os comandos.',
        !getSetting('bot.users').length &&
            'Só você (e os admins) usa comandos: /bot +v <pessoa|grupo> libera para alguns.'
    ].filter(Boolean);
    const avisos = listaAvisos.map(a => ` ${a}`).join('');

    printSuccess(`🤖 ZapBot ${versaoComCommit()} inicializado! Informando ${process.env.PHONE_NUMBER}`);
    messageToSelf(`🤖 ZapBot ${versaoComCommit()} inicializado.${avisos}`);

    alertarPorEmail(jaFicouPronto ? '🔄 Reconectado' : '🟢 Bot iniciado',
        [jaFicouPronto ? `Conectado de novo${motivoDaQueda ? ` (a queda foi: ${motivoDaQueda})` : ''}.` : 'Conectado ao WhatsApp.',
         foraPor, ...listaAvisos].filter(Boolean).join('\n'));
    jaFicouPronto = true;
});

/*
 * Inicialização
 */
async function iniciarBot() {
    try {
        printInfo('Starting WhatsApp authentication...');
        await client.initialize();
        vigiarReady();
    } catch (error) {
        printError('Erro capturado na inicialização:', error.message);

        // Fecha o navegador antigo se ele tiver sido aberto parcialmente
        try {
            printInfo('Fechando instâncias pendentes do navegador...');
            await client.destroy();
        } catch {
            printInfo('Nenhum navegador ativo para destruir.');
        }

        if (error.message.includes('Execution context was destroyed') || error.message.includes('browser is already running')) {
            printInfo('Reiniciando o processo de inicialização em 5 segundos...');
            setTimeout(iniciarBot, 5000);
            return;
        }

        // Qualquer outro erro (ex.: sem internet no boot): tenta de novo, com espera crescente
        agendarNovaTentativa('inicialização', error.message);
    }
}

module.exports = {
    CONEXAO_MAX_MS,
    ESPERAS_MS,
    iniciarBot,
    iniciarWatchdog,
    pararReconexao,
    restartClient
};
