/*
 * WhatsApp connection (events, restart), email alerts and shutdown.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { emails, nodemailer } = bot;
const { alertPerEmail } = bot.src('email');
const { startBot, startWatchdog, restartClient } = bot.src('connection');

const SMTP = {
    QRCODE_EMAIL_SMTP_HOST: 'smtp.teste',
    QRCODE_EMAIL_SMTP_USER: 'bot@teste',
    QRCODE_EMAIL_SMTP_FROM: 'ZapBot <bot@teste>',
    QRCODE_EMAIL_SMTP_TO: 'dono@teste',
    QRCODE_EMAIL_SMTP_ANTIPHISHING: 'frase-secreta'
};

const emit = async (event, ...args) => {
    for (const h of bot.client.listeners(event)) await h(...args);
};
const subjects = () => emails.map(e => e.subject);

beforeEach(async () => {
    await bot.restart();
    Object.assign(process.env, SMTP);
    nodemailer.falhar = false;
});

afterEach(() => {
    for (const v of Object.keys(SMTP)) delete process.env[v];
});

describe('alertas por e-mail', () => {
    test('assunto, detalhes, dados do bot e HTML escapado', async () => {
        await alertPerEmail('🧪 Teste formato', 'motivo <b>');
        const [e] = emails;
        assert.equal(e.subject, '[ZapBot] 🧪 Teste formato');
        assert.equal(e.to, 'dono@teste');
        assert.match(e.text, /motivo <b>[\s\S]*📱 Número: 5521XXXX0000[\s\S]*🛡️ Anti-Phishing Code: frase-secreta/);
        assert.match(e.text, /🤖 Versão: [\d.]+(?: \(devel\))? \(git\+[0-9a-f]{7}\/[\w.-]+\)\n/);
        assert.match(e.html, /🤖 Versão<\/strong><\/td><td>[\d.]+(?: \(devel\))? \(git\+[0-9a-f]{7}\/[\w.-]+\)</);
        assert.match(e.html, /motivo &lt;b&gt;/);
    });

    test('o mesmo evento não se repete em 5 minutos (exceto forçado)', async () => {
        await alertPerEmail('🧪 Teste repetição');
        await alertPerEmail('🧪 Teste repetição');
        await alertPerEmail('🧪 Teste repetição', '', { forcar: true });
        await alertPerEmail('🧪 Outro evento');
        assert.deepEqual(subjects(), ['[ZapBot] 🧪 Teste repetição', '[ZapBot] 🧪 Teste repetição', '[ZapBot] 🧪 Outro evento']);
    });

    test('não envia com email.alerts off ou sem SMTP configurado', async () => {
        await bot.setSetting('email.alerts', false);
        await alertPerEmail('🧪 Desligado');
        await bot.setSetting('email.alerts', true);
        delete process.env.QRCODE_EMAIL_SMTP_TO;
        await alertPerEmail('🧪 Sem SMTP');
        assert.deepEqual(emails, []);
    });

    test('falha do SMTP só vai para o log', async () => {
        nodemailer.falhar = true;
        const logBefore = bot.logs.length;
        await alertPerEmail('🧪 SMTP fora');
        assert.ok(bot.errorsInLog(logBefore).some(l => l.includes("Alerta por e-mail '🧪 SMTP fora' falhou: SMTP fora do ar")));
    });
});

describe('eventos de conexão', () => {
    test('ready: avisa no seu privado; e-mail "Bot iniciado" e, depois, "Reconectado" com o motivo', async () => {
        await bot.setSetting('bot.users', []);
        bot.estado.pronto = false;
        await emit('ready');

        assert.equal(bot.estado.pronto, true);
        const [notice] = bot.client.enviadas;
        assert.equal(notice.chatId, process.env.PHONE_NUMBER);
        assert.match(notice.content, /🤖 ZapBot [\d.]+(?: \(devel\))? \(git\+[0-9a-f]{7}\/[\w.-]+\) inicializado\. Só você \(e o bot\.admins\) usa comandos: \/bot -admin libera/);
        assert.match(emails[0].subject, /🟢 Bot iniciado/);
        assert.match(emails[0].text, /Conectado ao WhatsApp\.\nSó você \(e o bot\.admins\) usa comandos/);

        bot.estado.ultimaQueda = 'NAVIGATION';
        await emit('ready');
        assert.match(emails[1].subject, /🔄 Reconectado/);
        assert.match(emails[1].text, /a queda foi: NAVIGATION/);
        assert.equal(bot.estado.ultimaQueda, null);
    });

    test('authenticated marca o horário (usado pelo /uptime)', async () => {
        bot.estado.autenticadoEm = 0;
        await emit('authenticated');
        assert.ok(Date.now() - bot.estado.autenticadoEm < 1000);
    });

    test('disconnected por LOGOUT: não reinicia e avisa que precisa de ação manual', async () => {
        const initializations = bot.client.inicializado;
        await emit('disconnected', 'LOGOUT');

        assert.equal(bot.estado.pronto, false);
        assert.equal(bot.estado.autenticadoEm, 0);
        assert.equal(bot.estado.ultimaQueda, 'LOGOUT');
        assert.equal(bot.client.inicializado, initializations);
        assert.match(emails[0].subject, /🔴 Desconectado \(ação manual\)/);
    });

    test('disconnected por outro motivo: avisa e reinicia o cliente', async (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        const initializations = bot.client.inicializado;

        await bot.waitWithClock(t, emit('disconnected', 'NAVIGATION')); // restartClient's 5 s pause

        assert.match(emails[0].subject, /\] 🔴 Desconectado$/);
        assert.equal(bot.client.inicializado, initializations + 1);
        assert.equal(bot.estado.reiniciando, false);
    });

    test('restartClient tem trava: um segundo pedido durante o reinício é ignorado', async (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        const destroyed = bot.client.destruido;

        await bot.waitWithClock(t, Promise.all([restartClient('teste 1'), restartClient('teste 2')]));

        assert.equal(bot.client.destruido, destroyed + 1);
        assert.ok(bot.logs.some(l => l.includes('Restart ignorado (já em andamento). Motivo: teste 2')));
    });

    test('auth_failure e estados de problema avisam por e-mail; os normais não', async () => {
        await emit('auth_failure', 'sessão inválida');
        await emit('change_state', 'CONNECTED');
        await emit('change_state', 'CONFLICT');
        assert.deepEqual(subjects(), ['[ZapBot] ⛔ Falha de autenticação', '[ZapBot] ⚠️ Estado do WhatsApp: CONFLICT']);
    });

    test('qr: no terminal por padrão; depois de autenticado avisa "Sessão perdida"', async () => {
        bot.estado.autenticadoEm = 0;
        bot.estado.ultimaQueda = null;
        await emit('qr', 'codigo-qr');
        assert.deepEqual(emails, []);
        assert.ok(bot.logs.some(l => /QR Code received at .*scan it please/.test(l)));

        bot.estado.autenticadoEm = Date.now();
        await emit('qr', 'codigo-qr-2');
        assert.match(emails[0].subject, /🔑 Sessão perdida: novo QR Code/);
    });

    test('qr por e-mail (QRCODE_EMAIL_ENABLE=true): imagem anexada, sem repetir o mesmo QR', async () => {
        process.env.QRCODE_EMAIL_ENABLE = 'true';
        try {
            bot.estado.autenticadoEm = 0;
            bot.estado.ultimaQueda = null;
            await emit('qr', 'qr-A');
            await emit('qr', 'qr-A');
            await emit('qr', 'qr-B');

            const qrs = emails.filter(e => /QR Code Authentication/.test(e.subject));
            assert.equal(qrs.length, 2);
            assert.match(qrs[0].html, /#1[\s\S]*5521XXXX0000[\s\S]*frase-secreta/);
            assert.equal(qrs[1].attachments[0].filename, 'qrcode-2.png');
            assert.ok(Buffer.isBuffer(qrs[1].attachments[0].content));
        } finally {
            delete process.env.QRCODE_EMAIL_ENABLE;
        }
    });

    test('watchdog: browser caído avisa por e-mail e reinicia o cliente', async (t) => {
        t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
        bot.client.pupBrowser = { isConnected: () => false };
        t.after(() => { delete bot.client.pupBrowser; });
        const initializations = bot.client.inicializado;

        startWatchdog();
        t.mock.timers.tick(30000);           // o watchdog roda
        await bot.waitWithClock(t, (async () => {
            while (bot.client.inicializado === initializations) await new Promise(setImmediate);
        })());                               // until restartClient's 5 s pause passes

        assert.deepEqual(subjects(), ['[ZapBot] ♻️ Browser caiu']);
        assert.equal(bot.client.inicializado, initializations + 1);
    });

    test('watchdog não mexe num cliente que ainda não ficou pronto', async (t) => {
        t.mock.timers.enable({ apis: ['setInterval'] });
        bot.estado.pronto = false;
        bot.client.pupBrowser = { isConnected: () => false };
        t.after(() => { delete bot.client.pupBrowser; });

        startWatchdog();
        t.mock.timers.tick(30000);
        await new Promise(setImmediate);
        assert.deepEqual(emails, []);
    });

    test('iniciarBot: "browser is already running" fecha o browser e tenta de novo em 5 s', async (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        const original = bot.client.initialize;
        let attempts = 0;
        bot.client.initialize = async function () {
            attempts++;
            if (attempts === 1) throw new Error('The browser is already running for /app/.wwebjs_auth');
            return original.call(this);
        };
        t.after(() => { bot.client.initialize = original; });
        const destroyed = bot.client.destruido;

        await startBot();
        assert.equal(attempts, 1);
        assert.equal(bot.client.destruido, destroyed + 1);

        t.mock.timers.tick(5000);
        await new Promise(setImmediate);
        assert.equal(attempts, 2);
    });

    test('iniciarBot: outro erro não tenta de novo', async (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        const original = bot.client.initialize;
        let attempts = 0;
        bot.client.initialize = async () => { attempts++; throw new Error('outro erro'); };
        t.after(() => { bot.client.initialize = original; });

        await startBot();
        t.mock.timers.tick(10000);
        await new Promise(setImmediate);
        assert.equal(attempts, 1);
    });

    test('authenticated com debug ligado liga o log do browser', async (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] }); // the 5 s diagnostic does not hold up the test
        await bot.setSetting('debug.enabled', true);
        const heard = [];
        bot.client.pupPage = { on: (ev) => heard.push(ev), evaluate: async () => ({}) };
        try {
            await emit('authenticated');
            assert.deepEqual(heard, ['console', 'pageerror', 'error', 'requestfailed']);
        } finally {
            delete bot.client.pupPage;
        }
    });

    test('presence_update não faz nada com o /monitor desativado', async () => {
        await emit('presence_update', { id: { _serialized: '5521911111111@c.us' }, isOnline: true });
        assert.deepEqual(bot.client.enviadas, []);
    });
});

describe('encerramento', () => {
    const EVENTS = ['uncaughtException', 'unhandledRejection', 'SIGTERM', 'SIGINT'];

    /*
     * Loads a fresh process.js (the "shutting down" lock belongs to the module) and installs
     * the handlers with process.exit simulated. The listeners of the
     * node:test (which would treat the error as a test failure) go out during the case
     * and come back at the end.
     */
    function install(t) {
        const originalAlt = Object.fromEntries(EVENTS.map(ev => [ev, process.listeners(ev)]));
        for (const ev of EVENTS) process.removeAllListeners(ev);

        const outputs = [];
        t.mock.method(process, 'exit', (codeAlt) => { outputs.push(codeAlt); });

        delete require.cache[require.resolve('../src/process')];
        require('../src/process').installClosing();

        t.after(() => {
            for (const ev of EVENTS) {
                process.removeAllListeners(ev);
                for (const l of originalAlt[ev]) process.on(ev, l);
            }
        });
        return outputs;
    }

    const waitOutput = async (outputs) => {
        for (let i = 0; i < 50 && !outputs.length; i++) await new Promise(setImmediate);
    };

    test('crash: e-mail com o stack e saída com código 1 (uma vez só)', async (t) => {
        const outputs = install(t);
        process.emit('unhandledRejection', new Error('deu ruim'));
        process.emit('uncaughtException', new Error('de novo'));
        await waitOutput(outputs);

        assert.deepEqual(outputs, [1]);
        assert.equal(emails.length, 1);
        assert.equal(emails[0].subject, '[ZapBot] 💥 Crash');
        assert.match(emails[0].text, /unhandledRejection\n\nError: deu ruim\n\s+at /);
    });

    test('SIGTERM: e-mail "Bot encerrado" e saída com código 0', async (t) => {
        const outputs = install(t);
        process.emit('SIGTERM');
        await waitOutput(outputs);

        assert.deepEqual(outputs, [0]);
        assert.equal(emails[0].subject, '[ZapBot] 🛑 Bot encerrado');
        assert.match(emails[0].text, /Sinal SIGTERM/);
    });
});
