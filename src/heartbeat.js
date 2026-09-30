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
 * the process being alive is enough. Restarting would not help read the QR;
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
const { estado: stateAlt } = require('./state');
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
 * @returns {Promise<{saudavel: boolean, estado: string}>}
 */
async function evaluateHealth() {
    if (stateAlt.reiniciando) {
        restartingSince ??= Date.now();
        const locked = Date.now() - restartingSince > RESTART_MAX_MS;
        return { saudavel: !locked, estado: locked ? 'reinício travado' : 'reiniciando' };
    }

    restartingSince = null;

    if (!stateAlt.pronto) return { saudavel: true, estado: 'aguardando conexão' };

    try {
        const state = await getStateWithTimeout(GETSTATE_TIMEOUT_MS);
        return { saudavel: state === 'CONNECTED', estado: String(state ?? 'desconhecido') };
    } catch (err) {
        return { saudavel: false, estado: err.message };
    }
}

// Atomic write: the healthcheck never reads a half-written file
function recordHeartbeat(statusAlt) {
    const temporary = `${HEARTBEAT_FILE}.tmp`;

    fs.writeFileSync(temporary, JSON.stringify({
        epoch: Date.now(),
        em: new Date().toISOString(),
        estado: statusAlt,
        pid: process.pid,
        versao: packageJson.version
    }));
    fs.renameSync(temporary, HEARTBEAT_FILE);
}

async function matchHeart() {
    const statusAlt = await evaluateHealth();

    if (statusAlt.saudavel) {
        failuresConsecutive = 0;

        try {
            recordHeartbeat(statusAlt.estado);
        } catch (err) {
            printError(`Heartbeat: não consegui gravar ${HEARTBEAT_FILE}:`, err.message);
        }
        return statusAlt;
    }

    printError(`Heartbeat: sem batimento (${statusAlt.estado}).`);

    // Only the connection that does not respond is restarted here; a stuck restart is left to Docker
    if (stateAlt.pronto && !stateAlt.reiniciando && ++failuresConsecutive >= FAILURES_FOR_RESTART) {
        failuresConsecutive = 0;
        printInfo('Heartbeat: WhatsApp sem resposta em 3 verificações seguidas, reiniciando o cliente.');
        alertPerEmail('🩺 WhatsApp sem resposta',
            `O WhatsApp Web não respondeu CONNECTED em ${FAILURES_FOR_RESTART} verificações seguidas (último estado: ${statusAlt.estado}).\n` +
            'O cliente será reiniciado automaticamente.');
        await restartClient(`heartbeat: ${statusAlt.estado}`);
    }

    return statusAlt;
}

// Called in app.js: a beat right at boot and then every 30 s
function startHeartbeat() {
    printInfo(`Heartbeat em ${HEARTBEAT_FILE} (a cada ${HEARTBEAT_INTERVAL_MS / 1000}s)`);
    matchHeart();
    setInterval(matchHeart, HEARTBEAT_INTERVAL_MS);
}

module.exports = {
    HEARTBEAT_FILE,
    matchHeart,
    startHeartbeat
};
