const path = require('path');
const { Worker } = require('worker_threads');
const { MAX_TEXT_TESTED } = require('./safeRegex');

const queue = [];
let worker;
let current;

function next() {
    if (current || !queue.length) return;
    current = queue.shift();
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
    current.timer = setTimeout(stop, 500, worker);
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

function matchBatch(regex, texts) {
    if (queue.length >= 64) return Promise.resolve([]);
    const data = {
        source: regex.source,
        flags: regex.flags.replace(/[gy]/g, ''),
        texts: texts.map(text => String(text ?? '').slice(0, MAX_TEXT_TESTED))
    };
    return new Promise(resolve => {
        queue.push({ data, resolve });
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

const regexTest = regex => Object.assign(async text => Boolean((await matchBatch(regex, [text]))[0]), { regex });

module.exports = { matchBatch, matchingRows, regexTest };
