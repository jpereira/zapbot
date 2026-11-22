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
    bot.state.restarting = false;
    Object.assign(process.env, { QRCODE_EMAIL_SMTP_HOST: 'smtp', QRCODE_EMAIL_SMTP_USER: 'u', QRCODE_EMAIL_SMTP_TO: 'to' });
});

describe('heartbeat', () => {
    test('conectado e respondendo: grava o arquivo com hora, estado e versão', async () => {
        const statusAlt = await matchHeart();
        assert.deepEqual(statusAlt, { healthy: true, state: 'CONNECTED' });

        const hb = readHeartbeat();
        assert.ok(Date.now() - hb.epoch < 1000);
        assert.equal(hb.state, 'CONNECTED');
        assert.equal(hb.pid, process.pid);
        assert.equal(hb.version, require('../package.json').version);
        assert.ok(!fs.existsSync(`${HEARTBEAT_FILE}.tmp`), 'gravação atômica (tmp + rename)');
    });

    test('ainda não conectado (boot, QR Code): o processo vivo basta', async () => {
        bot.state.ready = false;
        bot.client.getState = async () => { throw new Error('não deveria perguntar'); };
        assert.deepEqual(await matchHeart(), { healthy: true, state: 'aguardando conexão' });
        assert.equal(readHeartbeat().state, 'aguardando conexão');

        // Between one connect attempt and another (internet down): stays alive, and says how many have failed
        bot.state.attempts = 2;
        assert.deepEqual(await matchHeart(), { healthy: true, state: 'reconectando (2 falhas seguidas)' });
    });

    test('conectado sem CONNECTED: não bate; na 3ª seguida avisa e reinicia', async (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        bot.client.getState = async () => 'OPENING';
        const initializations = bot.client.initialized;

        assert.equal((await matchHeart()).healthy, false);
        assert.equal((await matchHeart()).healthy, false);
        assert.ok(!fs.existsSync(HEARTBEAT_FILE));
        assert.deepEqual(emails, []);

        await bot.waitWithClock(t, matchHeart()); // goes through restartClient's 5 s pause

        assert.equal(emails.length, 1);
        assert.equal(emails[0].subject, '[ZapBot] 🩺 WhatsApp sem resposta');
        assert.match(emails[0].text, /último estado: OPENING/);
        assert.equal(bot.client.initialized, initializations + 1);
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

        assert.deepEqual(await bot.waitWithClock(t, matchHeart()), { healthy: false, state: 'sem resposta em 10s' });
    });

    test('reiniciando: bate por até 5 min; depois para', async (t) => {
        t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
        bot.state.restarting = true;

        assert.deepEqual(await matchHeart(), { healthy: true, state: 'reiniciando' });
        t.mock.timers.tick(5 * 60 * 1000 + 1);
        assert.deepEqual(await matchHeart(), { healthy: false, state: 'reinício travado' });
        assert.deepEqual(emails, [], 'reinício travado fica para o Docker');

        bot.state.restarting = false;
    });
});

describe('docker/app/healthcheck.js', () => {
    // Runs the real script, as Docker does
    function healthcheck(env = {}) {
        try {
            const outputAlt = execFileSync(process.execPath, [HEALTHCHECK], {
                env: { ...process.env, ZAPBOT_HEARTBEAT_FILE: HEARTBEAT_FILE, ...env }, encoding: 'utf8'
            });
            return { code: 0, output: outputAlt };
        } catch (err) {
            return { code: err.status, output: err.stdout };
        }
    }

    const record = (ageSeconds, stateAlt = 'CONNECTED') =>
        fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify({ epoch: Date.now() - ageSeconds * 1000, state: stateAlt }));

    test('heartbeat recente: healthy (exit 0)', () => {
        record(5);
        const r = healthcheck();
        assert.equal(r.code, 0);
        assert.match(r.output, /healthy: CONNECTED, heartbeat 5s ago/);
    });

    test('heartbeat velho ou ausente: unhealthy (exit 1)', () => {
        record(120, 'aguardando conexão');
        const oldAlt = healthcheck();
        assert.equal(oldAlt.code, 1);
        assert.match(oldAlt.output, /unhealthy: last heartbeat 120s ago \(aguardando conexão\); limit 90s/);

        fs.rmSync(HEARTBEAT_FILE);
        const absent = healthcheck();
        assert.equal(absent.code, 1);
        assert.match(absent.output, /unhealthy: no heartbeat at .* \(ENOENT\)/);
    });

    test('arquivo corrompido: unhealthy; limite configurável', () => {
        fs.writeFileSync(HEARTBEAT_FILE, '{meio arquivo');
        assert.equal(healthcheck().code, 1);

        record(120);
        assert.equal(healthcheck({ ZAPBOT_HEARTBEAT_MAX_AGE_S: '300' }).code, 0);
    });

    test('o arquivo gravado pelo bot é aceito pelo healthcheck', async () => {
        await matchHeart();
        assert.equal(healthcheck().code, 0);
    });
});
