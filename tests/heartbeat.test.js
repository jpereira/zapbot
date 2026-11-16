/*
 * Heartbeat (src/heartbeat.js) and the Docker HEALTHCHECK (docker/app/healthcheck.js).
 */
const bot = require('./helpers/bot');

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { emails } = bot;
const { HEARTBEAT_FILE, matchHeart } = bot.src('heartbeat');

const HEALTHCHECK = path.join(bot.ROOT, 'docker/app/healthcheck.js');

const readHeartbeat = () => JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf8'));

beforeEach(async () => {
    await bot.restart();
    fs.rmSync(HEARTBEAT_FILE, { force: true });
    bot.client.getState = async () => 'CONNECTED';
    bot.estado.reiniciando = false;
    Object.assign(process.env, { QRCODE_EMAIL_SMTP_HOST: 'smtp', QRCODE_EMAIL_SMTP_USER: 'u', QRCODE_EMAIL_SMTP_TO: 'to' });
});

describe('heartbeat', () => {
    test('conectado e respondendo: grava o arquivo com hora, estado e versão', async () => {
        const statusAlt = await matchHeart();
        assert.deepEqual(statusAlt, { saudavel: true, estado: 'CONNECTED' });

        const hb = readHeartbeat();
        assert.ok(Date.now() - hb.epoch < 1000);
        assert.equal(hb.estado, 'CONNECTED');
        assert.equal(hb.pid, process.pid);
        assert.equal(hb.versao, require('../package.json').version);
        assert.ok(!fs.existsSync(`${HEARTBEAT_FILE}.tmp`), 'gravação atômica (tmp + rename)');
    });

    test('ainda não conectado (boot, QR Code): o processo vivo basta', async () => {
        bot.estado.pronto = false;
        bot.client.getState = async () => { throw new Error('não deveria perguntar'); };
        assert.deepEqual(await matchHeart(), { saudavel: true, estado: 'aguardando conexão' });
        assert.equal(readHeartbeat().estado, 'aguardando conexão');

        // Between one connect attempt and another (internet down): stays alive, and says how many have failed
        bot.estado.tentativas = 2;
        assert.deepEqual(await matchHeart(), { saudavel: true, estado: 'reconectando (2 falhas seguidas)' });
    });

    test('conectado sem CONNECTED: não bate; na 3ª seguida avisa e reinicia', async (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        bot.client.getState = async () => 'OPENING';
        const initializations = bot.client.inicializado;

        assert.equal((await matchHeart()).saudavel, false);
        assert.equal((await matchHeart()).saudavel, false);
        assert.ok(!fs.existsSync(HEARTBEAT_FILE));
        assert.deepEqual(emails, []);

        await bot.waitWithClock(t, matchHeart()); // goes through restartClient's 5 s pause

        assert.equal(emails.length, 1);
        assert.equal(emails[0].subject, '[ZapBot] 🩺 WhatsApp sem resposta');
        assert.match(emails[0].text, /último estado: OPENING/);
        assert.equal(bot.client.inicializado, initializations + 1);
    });

    test('uma resposta boa zera a contagem de falhas', async () => {
        bot.client.getState = async () => 'OPENING';
        await matchHeart();
        await matchHeart();
        bot.client.getState = async () => 'CONNECTED';
        await matchHeart();
        bot.client.getState = async () => 'OPENING';
        await matchHeart();
        await matchHeart();
        assert.deepEqual(emails, [], 'ainda não houve 3 falhas seguidas');
    });

    test('getState travado: desiste em 10 s', async (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        bot.client.getState = () => new Promise(() => {}); // never replies

        assert.deepEqual(await bot.waitWithClock(t, matchHeart()), { saudavel: false, estado: 'sem resposta em 10s' });
    });

    test('reiniciando: bate por até 5 min; depois para', async (t) => {
        t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
        bot.estado.reiniciando = true;

        assert.deepEqual(await matchHeart(), { saudavel: true, estado: 'reiniciando' });
        t.mock.timers.tick(5 * 60 * 1000 + 1);
        assert.deepEqual(await matchHeart(), { saudavel: false, estado: 'reinício travado' });
        assert.deepEqual(emails, [], 'reinício travado fica para o Docker');

        bot.estado.reiniciando = false;
    });
});

describe('docker/app/healthcheck.js', () => {
    // Runs the real script, as Docker does
    function healthcheck(env = {}) {
        try {
            const outputAlt = execFileSync(process.execPath, [HEALTHCHECK], {
                env: { ...process.env, ZAPBOT_HEARTBEAT_FILE: HEARTBEAT_FILE, ...env }, encoding: 'utf8'
            });
            return { codigo: 0, saida: outputAlt };
        } catch (err) {
            return { codigo: err.status, saida: err.stdout };
        }
    }

    const record = (ageSeconds, stateAlt = 'CONNECTED') =>
        fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify({ epoch: Date.now() - ageSeconds * 1000, estado: stateAlt }));

    test('heartbeat recente: healthy (exit 0)', () => {
        record(5);
        const r = healthcheck();
        assert.equal(r.codigo, 0);
        assert.match(r.saida, /healthy: CONNECTED, heartbeat 5s ago/);
    });

    test('heartbeat velho ou ausente: unhealthy (exit 1)', () => {
        record(120, 'aguardando conexão');
        const oldAlt = healthcheck();
        assert.equal(oldAlt.codigo, 1);
        assert.match(oldAlt.saida, /unhealthy: last heartbeat 120s ago \(aguardando conexão\); limit 90s/);

        fs.rmSync(HEARTBEAT_FILE);
        const absent = healthcheck();
        assert.equal(absent.codigo, 1);
        assert.match(absent.saida, /unhealthy: no heartbeat at .* \(ENOENT\)/);
    });

    test('arquivo corrompido: unhealthy; limite configurável', () => {
        fs.writeFileSync(HEARTBEAT_FILE, '{meio arquivo');
        assert.equal(healthcheck().codigo, 1);

        record(120);
        assert.equal(healthcheck({ ZAPBOT_HEARTBEAT_MAX_AGE_S: '300' }).codigo, 0);
    });

    test('o arquivo gravado pelo bot é aceito pelo healthcheck', async () => {
        await matchHeart();
        assert.equal(healthcheck().codigo, 0);
    });
});
