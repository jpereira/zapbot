const path = require('path');
const { Worker } = require('worker_threads');
const { MAX_TEXT_TESTED } = require('./safeRegex');

const { printError } = require('../log');

const queue = [];
let worker;
let current;

/*
 * A full queue or a batch past the deadline answers "no match": the bot never hangs on a regex. That used to be silent:
 * a burst of messages (the backlog after a reconnection) or a page of /show -q could fill the queue and the /watch
 * missed its notices without a trace. Now the /watch of an arriving message goes first (urgent, with a larger room)
 * and every miss is counted in the log (once a minute at most).
 */
const MAX_QUEUE = 64;
const MAX_QUEUE_URGENT = 1024;
const missed = { full: 0, slow: 0, since: 0 };
// Since the start (the health page of the web): batches run, refused and past the deadline
const totals = { run: 0, full: 0, slow: 0 };
function noteMiss(kind) {
    missed[kind]++;
    totals[kind]++;
    if (Date.now() - missed.since < 60_000) return;
    printError(`Regex: ${missed.full} batch(es) refused (queue full) and ${missed.slow} past the deadline answered "no match"`);
    Object.assign(missed, { full: 0, slow: 0, since: Date.now() });
}

function next() {
    if (current || !queue.length) return;
    current = queue.shift();
    totals.run++;
    if (!worker) {
        const instance = new Worker(path.join(__dirname, 'regexWorker.js'));
        worker = instance;
        instance.on('message', matches => {
            if (worker === instance) finish(matches);
        });
        instance.on('error', () => stop(instance));
        instance.on('exit', () => stop(instance));
    }
    worker.ref();
    current.timer = setTimeout((instance) => { noteMiss('slow'); stop(instance); }, 500, worker);
    worker.postMessage(current.data);
}

function finish(matches) {
    const task = current;
    current = null;
    clearTimeout(task.timer);
    task.resolve(matches);
    worker?.unref();
    next();
}

function stop(instance) {
    if (worker !== instance) return;
    worker = null;
    // Keep the slot occupied until the old worker has stopped.
    clearTimeout(current?.timer);
    instance.terminate().catch(() => {}).finally(() => {
        if (current) finish([]);
    });
}

function matchBatch(regex, texts, { urgent = false } = {}) {
    if (queue.length >= (urgent ? MAX_QUEUE_URGENT : MAX_QUEUE)) {
        noteMiss('full');
        return Promise.resolve([]);
    }
    const data = {
        source: regex.source,
        flags: regex.flags.replace(/[gy]/g, ''),
        texts: texts.map(text => String(text ?? '').slice(0, MAX_TEXT_TESTED))
    };
    return new Promise(resolve => {
        // urgent: ahead of the searches already waiting, after the other urgent ones (in arrival order)
        if (urgent) {
            const firstSearch = queue.findIndex(task => !task.urgent);
            queue.splice(firstSearch < 0 ? queue.length : firstSearch, 0, { data, resolve, urgent });
        } else {
            queue.push({ data, resolve });
        }
        next();
    });
}

async function matchingRows(test, rows, texts) {
    if (!test.regex) return rows.filter(row => texts(row).some(test));
    const matched = new Set();
    let batch = [];
    async function flush() {
        const matches = await matchBatch(test.regex, batch.map(entry => entry.text));
        matches.forEach((match, i) => { if (match) matched.add(batch[i].index); });
        batch = [];
    }
    for (const [index, row] of rows.entries()) {
        for (const text of texts(row)) {
            batch.push({ index, text });
            if (batch.length === 64) await flush();
        }
    }
    if (batch.length) await flush();
    return rows.filter((_, index) => matched.has(index));
}

const regexTest = (regex, options) => Object.assign(async text => Boolean((await matchBatch(regex, [text], options))[0]), { regex });

const regexStats = () => ({ queued: queue.length, urgent: queue.filter(task => task.urgent).length, busy: Boolean(current),
    maxQueue: MAX_QUEUE, ...totals });

module.exports = { matchBatch, matchingRows, regexStats, regexTest };
