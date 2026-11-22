/*
 * Heartbeat: the proof of life read by the Docker HEALTHCHECK.
 *
 * Every 30 s the bot checks that it is working and, if so, writes the file
 * HEARTBEAT_FILE (default: /tmp/zapbot-heartbeat.json) with the time and the state.
 * docker/app/healthcheck.js only looks at the age of that file: stopped for more than
 * 90 s, o container fica "unhealthy".
 *
 * "Working" depends on the connection state:
 * - connected (state.ready): WhatsApp Web answers CONNECTED to
 * getState() within 10 s;
 * - not connected yet (boot, waiting for the QR Code, reconnecting): the
 * the process being alive is enough. Restarting would not help read the QR, nor
 * bring the internet back: between one connect attempt and another
 * (connection.js), the state says how many have already failed;
 * - restarting: valid for up to 5 min; a stuck restart stops hitting.
 *
 * Without a beat the file ages: stuck Node, unresponsive Chromium or the
 * session stuck in a bad state. Connected but without CONNECTED 3 times in a row
 * (~90 s), the bot also warns by email and restarts the client by itself.
 */
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const packageJson = require('../package.json');

const { client } = require('./client');
const { restartClient } = require('./connection');
const { alertPerEmail } = require('./email');
const { state: stateAlt } = require('./state');
const { t } = require('./i18n');
const { printError, printInfo } = require('./log');

const HEARTBEAT_FILE = process.env.ZAPBOT_HEARTBEAT_FILE || path.join(os.tmpdir(), 'zapbot-heartbeat.json');
const HEARTBEAT_INTERVAL_MS = 30 * 1000;
const GETSTATE_TIMEOUT_MS = 10 * 1000;
const FAILURES_FOR_RESTART = 3;
const RESTART_MAX_MS = 5 * 60 * 1000;

let failuresConsecutive = 0;
let restartingSince = null;

// getState() of a stuck Chromium never resolves: gives up after `ms`
async function getStateWithTimeout(ms) {
    let limitAlt;

    try {
        return await Promise.race([
            client.getState(),
            new Promise((_, reject) => { limitAlt = setTimeout(() => reject(new Error(`sem resposta em ${ms / 1000}s`)), ms); })
        ]);
    } finally {
        clearTimeout(limitAlt);
    }
}

/**
 * The bot's current situation.
 * @returns {Promise<{healthy: boolean, state: string}>}
 */
async function evaluateHealth() {
    if (stateAlt.restarting) {
        restartingSince ??= Date.now();
        const locked = Date.now() - restartingSince > RESTART_MAX_MS;
        return { healthy: !locked, state: locked ? 'reinício travado' : 'reiniciando' };
    }

    restartingSince = null;

    if (!stateAlt.ready) {
        const statusAlt = stateAlt.attempts
            ? `reconectando (${stateAlt.attempts} falhas seguidas)`
            : 'aguardando conexão';
        return { healthy: true, state: statusAlt };
    }

    try {
        const state = await getStateWithTimeout(GETSTATE_TIMEOUT_MS);
        return { healthy: state === 'CONNECTED', state: String(state ?? 'desconhecido') };
    } catch (err) {
        return { healthy: false, state: err.message };
    }
}

// Atomic write: the healthcheck never reads a half-written file
function recordHeartbeat(statusAlt) {
    const temporary = `${HEARTBEAT_FILE}.tmp`;

    fs.writeFileSync(temporary, JSON.stringify({
        epoch: Date.now(),
        em: new Date().toISOString(),
        state: statusAlt,
        pid: process.pid,
        version: packageJson.version
    }));
    fs.renameSync(temporary, HEARTBEAT_FILE);
}

async function matchHeart() {
    const statusAlt = await evaluateHealth();

    if (statusAlt.healthy) {
        failuresConsecutive = 0;

        try {
            recordHeartbeat(statusAlt.state);
        } catch (err) {
            printError(`Heartbeat: could not write ${HEARTBEAT_FILE}:`, err.message);
        }
        return statusAlt;
    }

    printError(`Heartbeat: no beat (${statusAlt.state}).`);

    // Only the connection that does not respond is restarted here; a stuck restart is left to Docker
    if (stateAlt.ready && !stateAlt.restarting && ++failuresConsecutive >= FAILURES_FOR_RESTART) {
        failuresConsecutive = 0;
        printInfo('Heartbeat: WhatsApp did not respond in 3 checks in a row, restarting the client.');
        alertPerEmail(t('heartbeat.semRespostaTitulo'),
            t('heartbeat.semRespostaCorpo', { n: FAILURES_FOR_RESTART, state: statusAlt.state }));
        await restartClient(`heartbeat: ${statusAlt.state}`);
    }

    return statusAlt;
}

// Called in app.js: a beat right at boot and then every 30 s
function startHeartbeat() {
    printInfo(`Heartbeat at ${HEARTBEAT_FILE} (every ${HEARTBEAT_INTERVAL_MS / 1000}s)`);
    matchHeart();
    setInterval(matchHeart, HEARTBEAT_INTERVAL_MS);
}

module.exports = {
    HEARTBEAT_FILE,
    matchHeart,
    startHeartbeat
};
