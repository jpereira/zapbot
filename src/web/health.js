/*
 * The health of the bot for the web: WhatsApp (connected, since when, the last drop), the process (uptime, memory, the
 * event loop delay), the periodic loops (running, stuck, how long the last round took), the regex worker queue and
 * the last errors of the log. Everything is read from what the bot already keeps; nothing here changes anything.
 */

const os = require('os');
const { monitorEventLoopDelay } = require('perf_hooks');

const { BOT_START_TIME } = require('../constants');
const { recentErrors } = require('../log');
const { getSetting } = require('../settings');
const { state } = require('../state');
const { loopStates } = require('../util/loopGuard');
const { regexStats } = require('../util/regexRunner');
const { versionWithCommit } = require('../version');

// The event loop delay: a histogram that runs all the time (cheap), read and reset on each look
const delay = monitorEventLoopDelay({ resolution: 20 });
delay.enable();
const ms = (ns) => Math.round(ns / 1e6);

function whatsapp() {
    const status = state.restarting ? 'restarting' : state.ready ? 'ready' : state.waitingQr && state.qr ? 'pairing' : state.outSince ? 'down' : 'connecting';
    return {
        // waiting for the QR Code to be read: its number and when it came (the image is /api/whatsapp/qr)
        qr: status === 'pairing' ? { count: state.qr.count, at: state.qr.at } : null,
        status, paused: Boolean(getSetting('bot.paused')),
        since: state.ready ? state.authenticatedAt || null : state.outSince ?? null,
        lastOutage: state.lastOutage ?? null, attempts: state.attempts ?? 0
    };
}

function health() {
    const memory = process.memoryUsage();
    const loop = { mean: ms(delay.mean || 0), p99: ms(delay.percentile(99) || 0), max: ms(delay.max || 0) };
    delay.reset();
    const loops = loopStates();
    const errors = recentErrors();
    const whats = whatsapp();
    // The one-word verdict at the top: what needs a look first
    const problems = [
        whats.status !== 'ready' && 'whatsapp',
        loops.some(l => l.stuck) && 'loops',
        loop.p99 > 500 && 'eventLoop',
        errors.some(e => Date.now() - e.at < 15 * 60_000) && 'errors'
    ].filter(Boolean);
    return {
        verdict: problems.length ? (problems.includes('whatsapp') || problems.includes('loops') ? 'bad' : 'warn') : 'ok',
        problems,
        version: versionWithCommit(),
        startedAt: BOT_START_TIME,
        whatsapp: whats,
        process: {
            rss: memory.rss, heapUsed: memory.heapUsed, heapTotal: memory.heapTotal, external: memory.external,
            node: process.version, pid: process.pid, cpus: os.cpus().length, load: os.loadavg().map(n => Math.round(n * 100) / 100),
            freeMemory: os.freemem(), totalMemory: os.totalmem()
        },
        eventLoop: loop,
        loops,
        regex: regexStats(),
        models: require('../models').modelsStatus(),
        errors
    };
}

module.exports = { health };
