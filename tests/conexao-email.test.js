/*
 * Conexão com o WhatsApp (eventos, reinício), alertas por e-mail e encerramento.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { emails, nodemailer } = bot;
const { alertarPorEmail } = bot.src('email');
const { CONEXAO_MAX_MS, iniciarBot, iniciarWatchdog, restartClient } = bot.src('conexao');

const SMTP = {
    QRCODE_EMAIL_SMTP_HOST: 'smtp.teste',
    QRCODE_EMAIL_SMTP_USER: 'bot@teste',
    QRCODE_EMAIL_SMTP_FROM: 'ZapBot <bot@teste>',
    QRCODE_EMAIL_SMTP_TO: 'dono@teste',
    QRCODE_EMAIL_SMTP_ANTIPHISHING: 'frase-secreta'
};

const emitir = async (evento, ...args) => {
    for (const h of bot.client.listeners(evento)) await h(...args);
};
const assuntos = () => emails.map(e => e.subject);

beforeEach(async () => {
    await bot.reiniciar();
    Object.assign(process.env, SMTP);
    nodemailer.falhar = false;
});

afterEach(() => {
    for (const v of Object.keys(SMTP)) delete process.env[v];
});

describe('alertas por e-mail', () => {
    test('assunto, detalhes, dados do bot e HTML escapado', async () => {
        await alertarPorEmail('🧪 Teste formato', 'motivo <b>');
        const [e] = emails;
        assert.equal(e.subject, '[ZapBot] 🧪 Teste formato');
        assert.equal(e.to, 'dono@teste');
        assert.match(e.text, /motivo <b>[\s\S]*📱 Número: 5521XXXX0000[\s\S]*🛡️ Anti-Phishing Code: frase-secreta/);
        assert.match(e.text, /🤖 Versão: [\d.]+(?: \(devel\))? \(git\+[0-9a-f]{7}\/[\w.-]+\)\n/);
        assert.match(e.html, /🤖 Versão<\/strong><\/td><td>[\d.]+(?: \(devel\))? \(git\+[0-9a-f]{7}\/[\w.-]+\)</);
        assert.match(e.html, /motivo &lt;b&gt;/);
    });

    test('o mesmo evento não se repete em 5 minutos (exceto forçado)', async () => {
        await alertarPorEmail('🧪 Teste repetição');
        await alertarPorEmail('🧪 Teste repetição');
        await alertarPorEmail('🧪 Teste repetição', '', { forcar: true });
        await alertarPorEmail('🧪 Outro evento');
        assert.deepEqual(assuntos(), ['[ZapBot] 🧪 Teste repetição', '[ZapBot] 🧪 Teste repetição', '[ZapBot] 🧪 Outro evento']);
    });

    test('não envia com email.alerts off ou sem SMTP configurado', async () => {
        await bot.setSetting('email.alerts', false);
        await alertarPorEmail('🧪 Desligado');
        await bot.setSetting('email.alerts', true);
        delete process.env.QRCODE_EMAIL_SMTP_TO;
        await alertarPorEmail('🧪 Sem SMTP');
        assert.deepEqual(emails, []);
    });

    test('falha do SMTP só vai para o log', async () => {
        nodemailer.falhar = true;
        const logAntes = bot.logs.length;
        await alertarPorEmail('🧪 SMTP fora');
        assert.ok(bot.errosNoLog(logAntes).some(l => l.includes("Alerta por e-mail '🧪 SMTP fora' falhou: SMTP fora do ar")));
    });
});

describe('eventos de conexão', () => {
    test('ready: avisa no seu privado; e-mail "Bot iniciado" e, depois, "Reconectado" com o motivo', async () => {
        await bot.setSetting('bot.users', []);
        bot.estado.pronto = false;
        await emitir('ready');

        assert.equal(bot.estado.pronto, true);
        const [aviso] = bot.client.enviadas;
        assert.equal(aviso.chatId, process.env.PHONE_NUMBER);
        assert.match(aviso.content, /🤖 ZapBot [\d.]+(?: \(devel\))? \(git\+[0-9a-f]{7}\/[\w.-]+\) inicializado\. Só você \(e os admins\) usa comandos: \/bot \+v <pessoa\|grupo> libera para alguns\./);
        assert.match(emails[0].subject, /🟢 Bot iniciado/);
        assert.match(emails[0].text, /Conectado ao WhatsApp\.\nSó você \(e os admins\) usa comandos/);

        bot.estado.ultimaQueda = 'NAVIGATION';
        await emitir('ready');
        assert.match(emails[1].subject, /🔄 Reconectado/);
        assert.match(emails[1].text, /a queda foi: NAVIGATION/);
        assert.equal(bot.estado.ultimaQueda, null);
    });

    test('authenticated marca o horário (usado pelo /uptime)', async () => {
        bot.estado.autenticadoEm = 0;
        await emitir('authenticated');
        assert.ok(Date.now() - bot.estado.autenticadoEm < 1000);
    });

    test('disconnected por LOGOUT: não reinicia e avisa que precisa de ação manual', async () => {
        const inicializacoes = bot.client.inicializado;
        await emitir('disconnected', 'LOGOUT');

        assert.equal(bot.estado.pronto, false);
        assert.equal(bot.estado.autenticadoEm, 0);
        assert.equal(bot.estado.ultimaQueda, 'LOGOUT');
        assert.equal(bot.client.inicializado, inicializacoes);
        assert.match(emails[0].subject, /🔴 Desconectado \(ação manual\)/);
    });

    test('disconnected por outro motivo: avisa e reinicia o cliente', async (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        const inicializacoes = bot.client.inicializado;

        await bot.esperarComRelogio(t, emitir('disconnected', 'NAVIGATION')); // pausa de 5 s do restartClient

        assert.match(emails[0].subject, /\] 🔴 Desconectado$/);
        assert.equal(bot.client.inicializado, inicializacoes + 1);
        assert.equal(bot.estado.reiniciando, false);
    });

    test('restartClient tem trava: um segundo pedido durante o reinício é ignorado', async (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        const destruidos = bot.client.destruido;

        await bot.esperarComRelogio(t, Promise.all([restartClient('teste 1'), restartClient('teste 2')]));

        assert.equal(bot.client.destruido, destruidos + 1);
        assert.ok(bot.logs.some(l => l.includes('Restart ignorado (já em andamento). Motivo: teste 2')));
    });

    test('auth_failure e estados de problema avisam por e-mail; os normais não', async () => {
        await emitir('auth_failure', 'sessão inválida');
        await emitir('change_state', 'CONNECTED');
        await emitir('change_state', 'CONFLICT');
        assert.deepEqual(assuntos(), ['[ZapBot] ⛔ Falha de autenticação', '[ZapBot] ⚠️ Estado do WhatsApp: CONFLICT']);
    });

    test('qr: no terminal por padrão; depois de autenticado avisa "Sessão perdida"', async () => {
        bot.estado.autenticadoEm = 0;
        bot.estado.ultimaQueda = null;
        await emitir('qr', 'codigo-qr');
        assert.deepEqual(emails, []);
        assert.ok(bot.logs.some(l => /QR Code received at .*scan it please/.test(l)));

        bot.estado.autenticadoEm = Date.now();
        await emitir('qr', 'codigo-qr-2');
        assert.match(emails[0].subject, /🔑 Sessão perdida: novo QR Code/);
    });

    test('qr por e-mail (QRCODE_EMAIL_ENABLE=true): imagem anexada, sem repetir o mesmo QR', async () => {
        process.env.QRCODE_EMAIL_ENABLE = 'true';
        try {
            bot.estado.autenticadoEm = 0;
            bot.estado.ultimaQueda = null;
            await emitir('qr', 'qr-A');
            await emitir('qr', 'qr-A');
            await emitir('qr', 'qr-B');

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
        const inicializacoes = bot.client.inicializado;

        iniciarWatchdog();
        t.mock.timers.tick(30000);           // o watchdog roda
        await bot.esperarComRelogio(t, (async () => {
            while (bot.client.inicializado === inicializacoes) await new Promise(setImmediate);
        })());                               // até passar a pausa de 5 s do restartClient

        assert.deepEqual(assuntos(), ['[ZapBot] ♻️ Browser caiu']);
        assert.equal(bot.client.inicializado, inicializacoes + 1);
    });

    test('watchdog não mexe num cliente que ainda não ficou pronto', async (t) => {
        t.mock.timers.enable({ apis: ['setInterval'] });
        bot.estado.pronto = false;
        bot.client.pupBrowser = { isConnected: () => false };
        t.after(() => { delete bot.client.pupBrowser; });

        iniciarWatchdog();
        t.mock.timers.tick(30000);
        await new Promise(setImmediate);
        assert.deepEqual(emails, []);
    });

    test('iniciarBot: "browser is already running" fecha o browser e tenta de novo em 5 s', async (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        const original = bot.client.initialize;
        let tentativas = 0;
        bot.client.initialize = async function () {
            tentativas++;
            if (tentativas === 1) throw new Error('The browser is already running for /app/.wwebjs_auth');
            return original.call(this);
        };
        t.after(() => { bot.client.initialize = original; });
        const destruidos = bot.client.destruido;

        await iniciarBot();
        assert.equal(tentativas, 1);
        assert.equal(bot.client.destruido, destruidos + 1);

        t.mock.timers.tick(5000);
        await new Promise(setImmediate);
        assert.equal(tentativas, 2);
    });

    test('iniciarBot sem internet: não fica parado, tenta de novo com espera crescente', async (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        const original = bot.client.initialize;
        let tentativas = 0;
        bot.client.initialize = async () => {
            tentativas++;
            if (tentativas === 1) throw new Error('net::ERR_INTERNET_DISCONNECTED at https://web.whatsapp.com/');
        };
        t.after(() => { bot.client.initialize = original; });

        await iniciarBot();
        assert.equal(tentativas, 1);
        assert.ok(bot.logs.some(l => l.includes('Nova tentativa de conectar em 15s (falhas seguidas: 1)')));

        // 15 s de espera e os 5 s do restartClient: conecta
        await bot.esperarComRelogio(t, (async () => {
            while (tentativas < 2) await new Promise(setImmediate);
        })());
        assert.equal(tentativas, 2);
        assert.ok(bot.logs.some(l => l.includes('Motivo: nova tentativa nº 2 (inicialização)')));
    });

    test('initialize falhando (internet fora): tenta de novo até conectar; um e-mail só; o "Reconectado" conta quanto tempo', async (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        const original = bot.client.initialize;
        let tentativas = 0;
        bot.client.initialize = async () => {
            tentativas++;
            if (tentativas <= 3) throw new Error('net::ERR_NAME_NOT_RESOLVED at https://web.whatsapp.com/');
        };
        t.after(() => { bot.client.initialize = original; });
        const ate = (n) => bot.esperarComRelogio(t, (async () => {
            while (tentativas < n) await new Promise(setImmediate);
        })(), 1000, 200);

        await bot.esperarComRelogio(t, restartClient('heartbeat: OPENING'));
        assert.equal(tentativas, 1);
        assert.equal(bot.estado.tentativas, 1);
        assert.equal(bot.estado.reiniciando, false, 'a trava sai entre as tentativas');

        // 15 s, 30 s, 60 s: a 4ª conecta
        await ate(4);
        const esperas = bot.logs.filter(l => l.includes('Nova tentativa de conectar em'))
            .map(l => l.match(/em (\d+)s/)[1]);
        assert.deepEqual(esperas, ['15', '30', '60']);
        assert.ok(bot.logs.some(l => l.includes('Motivo: nova tentativa nº 4 (heartbeat: OPENING)')));
        assert.deepEqual(assuntos(), ['[ZapBot] ❌ Falha ao reiniciar'], 'um e-mail só, na 1ª falha');
        assert.match(emails[0].text, /initialize falhou: net::ERR_NAME_NOT_RESOLVED[\s\S]*vai tentar de novo sozinho/);

        // Conectou: zera, e o e-mail diz quanto tempo ficou fora
        await emitir('ready');
        assert.equal(bot.estado.tentativas, 0);
        assert.equal(bot.estado.foraDesde, null);
        assert.match(emails.at(-1).text, /Ficou \d+ min sem conseguir conectar \(3 tentativas falharam\)\./);
    });

    test('initialize passou mas o ready não veio em 3 min: reinicia; esperando o QR Code ou já pronto, não', async (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        bot.estado.autenticadoEm = 0;
        bot.estado.ultimaQueda = null;
        const inicializacoes = bot.client.inicializado;

        // Pronto (o 'ready' chegou): nada
        await iniciarBot();
        await emitir('ready');
        t.mock.timers.tick(CONEXAO_MAX_MS);
        await new Promise(setImmediate);
        assert.equal(bot.client.inicializado, inicializacoes + 1);

        // Esperando alguém ler o QR Code: nada (reiniciar trocaria o QR)
        bot.estado.pronto = false;
        await iniciarBot();
        await emitir('qr', 'codigo-qr');
        t.mock.timers.tick(CONEXAO_MAX_MS);
        await new Promise(setImmediate);
        assert.equal(bot.client.inicializado, inicializacoes + 2);

        // Sem 'ready' e sem QR: reinicia o cliente
        bot.estado.aguardandoQr = false;
        await iniciarBot();
        t.mock.timers.tick(CONEXAO_MAX_MS);
        await bot.esperarComRelogio(t, (async () => {
            while (bot.client.inicializado < inicializacoes + 4) await new Promise(setImmediate);
        })());
        assert.ok(bot.logs.some(l => l.includes('Sem conexão 3 min depois de iniciar: reiniciando o cliente.')));
        assert.ok(bot.logs.some(l => l.includes("Motivo: sem 'ready' em 3 min")));
    });

    test('authenticated com debug ligado liga o log do browser', async (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] }); // o diagnóstico de 5 s não segura o teste
        await bot.setSetting('debug.enabled', true);
        const ouvidos = [];
        bot.client.pupPage = { on: (ev) => ouvidos.push(ev), evaluate: async () => ({}) };
        try {
            await emitir('authenticated');
            assert.deepEqual(ouvidos, ['console', 'pageerror', 'error', 'requestfailed']);
        } finally {
            delete bot.client.pupPage;
        }
    });

    test('presence_update não faz nada com o /monitor desativado', async () => {
        await emitir('presence_update', { id: { _serialized: '5521911111111@c.us' }, isOnline: true });
        assert.deepEqual(bot.client.enviadas, []);
    });
});

describe('encerramento', () => {
    const EVENTOS = ['uncaughtException', 'unhandledRejection', 'SIGTERM', 'SIGINT'];

    /*
     * Carrega um processo.js novo (a trava "encerrando" é do módulo) e instala
     * os tratadores com o process.exit simulado. Os ouvintes do próprio
     * node:test (que tratariam o erro como falha do teste) saem durante o caso
     * e voltam no fim.
     */
    function instalar(t) {
        const originais = Object.fromEntries(EVENTOS.map(ev => [ev, process.listeners(ev)]));
        for (const ev of EVENTOS) process.removeAllListeners(ev);

        const saidas = [];
        t.mock.method(process, 'exit', (codigo) => { saidas.push(codigo); });

        delete require.cache[require.resolve('../src/processo')];
        require('../src/processo').instalarEncerramento();

        t.after(() => {
            for (const ev of EVENTOS) {
                process.removeAllListeners(ev);
                for (const l of originais[ev]) process.on(ev, l);
            }
        });
        return saidas;
    }

    const esperarSaida = async (saidas) => {
        for (let i = 0; i < 50 && !saidas.length; i++) await new Promise(setImmediate);
    };

    test('crash: e-mail com o stack e saída com código 1 (uma vez só)', async (t) => {
        const saidas = instalar(t);
        process.emit('unhandledRejection', new Error('deu ruim'));
        process.emit('uncaughtException', new Error('de novo'));
        await esperarSaida(saidas);

        assert.deepEqual(saidas, [1]);
        assert.equal(emails.length, 1);
        assert.equal(emails[0].subject, '[ZapBot] 💥 Crash');
        assert.match(emails[0].text, /unhandledRejection\n\nError: deu ruim\n\s+at /);
    });

    test('SIGTERM: e-mail "Bot encerrado" e saída com código 0', async (t) => {
        const saidas = instalar(t);
        process.emit('SIGTERM');
        await esperarSaida(saidas);

        assert.deepEqual(saidas, [0]);
        assert.equal(emails[0].subject, '[ZapBot] 🛑 Bot encerrado');
        assert.match(emails[0].text, /Sinal SIGTERM/);
    });
});
