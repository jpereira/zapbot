/*
 * Heartbeat (src/heartbeat.js) e o HEALTHCHECK do Docker (docker/app/healthcheck.js).
 */
const bot = require('./helpers/bot');

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { emails } = bot;
const { HEARTBEAT_FILE, baterCoracao } = bot.src('heartbeat');

const HEALTHCHECK = path.join(bot.RAIZ, 'docker/app/healthcheck.js');

const lerHeartbeat = () => JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf8'));

beforeEach(async () => {
    await bot.reiniciar();
    fs.rmSync(HEARTBEAT_FILE, { force: true });
    bot.client.getState = async () => 'CONNECTED';
    bot.estado.reiniciando = false;
    Object.assign(process.env, { QRCODE_EMAIL_SMTP_HOST: 'smtp', QRCODE_EMAIL_SMTP_USER: 'u', QRCODE_EMAIL_SMTP_TO: 'to' });
});

describe('heartbeat', () => {
    test('conectado e respondendo: grava o arquivo com hora, estado e versão', async () => {
        const situacao = await baterCoracao();
        assert.deepEqual(situacao, { saudavel: true, estado: 'CONNECTED' });

        const hb = lerHeartbeat();
        assert.ok(Date.now() - hb.epoch < 1000);
        assert.equal(hb.estado, 'CONNECTED');
        assert.equal(hb.pid, process.pid);
        assert.equal(hb.versao, require('../package.json').version);
        assert.ok(!fs.existsSync(`${HEARTBEAT_FILE}.tmp`), 'gravação atômica (tmp + rename)');
    });

    test('ainda não conectado (boot, QR Code): o processo vivo basta', async () => {
        bot.estado.pronto = false;
        bot.client.getState = async () => { throw new Error('não deveria perguntar'); };
        assert.deepEqual(await baterCoracao(), { saudavel: true, estado: 'aguardando conexão' });
        assert.equal(lerHeartbeat().estado, 'aguardando conexão');
    });

    test('conectado sem CONNECTED: não bate; na 3ª seguida avisa e reinicia', async (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        bot.client.getState = async () => 'OPENING';
        const inicializacoes = bot.client.inicializado;

        assert.equal((await baterCoracao()).saudavel, false);
        assert.equal((await baterCoracao()).saudavel, false);
        assert.ok(!fs.existsSync(HEARTBEAT_FILE));
        assert.deepEqual(emails, []);

        await bot.esperarComRelogio(t, baterCoracao()); // passa pela pausa de 5 s do restartClient

        assert.equal(emails.length, 1);
        assert.equal(emails[0].subject, '[ZapBot] 🩺 WhatsApp sem resposta');
        assert.match(emails[0].text, /último estado: OPENING/);
        assert.equal(bot.client.inicializado, inicializacoes + 1);
    });

    test('uma resposta boa zera a contagem de falhas', async () => {
        bot.client.getState = async () => 'OPENING';
        await baterCoracao();
        await baterCoracao();
        bot.client.getState = async () => 'CONNECTED';
        await baterCoracao();
        bot.client.getState = async () => 'OPENING';
        await baterCoracao();
        await baterCoracao();
        assert.deepEqual(emails, [], 'ainda não houve 3 falhas seguidas');
    });

    test('getState travado: desiste em 10 s', async (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        bot.client.getState = () => new Promise(() => {}); // nunca responde

        assert.deepEqual(await bot.esperarComRelogio(t, baterCoracao()), { saudavel: false, estado: 'sem resposta em 10s' });
    });

    test('reiniciando: bate por até 5 min; depois para', async (t) => {
        t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
        bot.estado.reiniciando = true;

        assert.deepEqual(await baterCoracao(), { saudavel: true, estado: 'reiniciando' });
        t.mock.timers.tick(5 * 60 * 1000 + 1);
        assert.deepEqual(await baterCoracao(), { saudavel: false, estado: 'reinício travado' });
        assert.deepEqual(emails, [], 'reinício travado fica para o Docker');

        bot.estado.reiniciando = false;
    });
});

describe('docker/app/healthcheck.js', () => {
    // Roda o script de verdade, como o Docker faz
    function healthcheck(env = {}) {
        try {
            const saida = execFileSync(process.execPath, [HEALTHCHECK], {
                env: { ...process.env, ZAPBOT_HEARTBEAT_FILE: HEARTBEAT_FILE, ...env }, encoding: 'utf8'
            });
            return { codigo: 0, saida };
        } catch (err) {
            return { codigo: err.status, saida: err.stdout };
        }
    }

    const gravar = (idadeSegundos, estado = 'CONNECTED') =>
        fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify({ epoch: Date.now() - idadeSegundos * 1000, estado }));

    test('heartbeat recente: healthy (exit 0)', () => {
        gravar(5);
        const r = healthcheck();
        assert.equal(r.codigo, 0);
        assert.match(r.saida, /healthy: CONNECTED, heartbeat há 5s/);
    });

    test('heartbeat velho ou ausente: unhealthy (exit 1)', () => {
        gravar(120, 'aguardando conexão');
        const velho = healthcheck();
        assert.equal(velho.codigo, 1);
        assert.match(velho.saida, /unhealthy: último heartbeat há 120s \(aguardando conexão\); limite 90s/);

        fs.rmSync(HEARTBEAT_FILE);
        const ausente = healthcheck();
        assert.equal(ausente.codigo, 1);
        assert.match(ausente.saida, /unhealthy: sem heartbeat em .* \(ENOENT\)/);
    });

    test('arquivo corrompido: unhealthy; limite configurável', () => {
        fs.writeFileSync(HEARTBEAT_FILE, '{meio arquivo');
        assert.equal(healthcheck().codigo, 1);

        gravar(120);
        assert.equal(healthcheck({ ZAPBOT_HEARTBEAT_MAX_AGE_S: '300' }).codigo, 0);
    });

    test('o arquivo gravado pelo bot é aceito pelo healthcheck', async () => {
        await baterCoracao();
        assert.equal(healthcheck().codigo, 0);
    });
});
