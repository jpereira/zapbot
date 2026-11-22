/*
 * Copy in batches: too much log already weighs on the terminal; on WhatsApp, even more.
 */
const { withContextDebug, contextDebug } = require('./debugContext');
const { configureDebug } = require('./debugData');

const PREFIX_COPY = '🪲 [ZapBot log]\n';
const LIMIT_QUEUE = 500;
const SIZE_BATCH = 3000;
let queue = [];
let discarded = 0;
let timer;
let sending;
let paused = false;
let generation = 0;

function cleanCopiesDebug() {
    clearTimeout(timer);
    timer = null;
    queue = [];
    discarded = 0;
    paused = false;
    generation++;
}

function copyLog(line) {
    if (contextDebug().noTrace || paused || !configureDebug().copyTo) return;
    if (queue.length >= LIMIT_QUEUE) { queue.shift(); discarded++; }
    // Also limits the size of a very large line, preserving the rest in blocks.
    for (let i = 0; i < line.length; i += SIZE_BATCH) {
        queue.push(line.slice(i, i + SIZE_BATCH));
        if (queue.length > LIMIT_QUEUE) { queue.shift(); discarded++; }
    }
    if (!timer && !sending) {
        timer = setTimeout(() => { timer = null; void flushCopiesDebug(); }, 500);
        timer.unref?.();
    }
}

async function flushCopiesDebug() {
    if (sending) return sending;
    clearTimeout(timer);
    timer = null;
    const current = generation;
    sending = withContextDebug({ noTrace: true }, async () => {
        while (queue.length && current === generation) {
            const cfg = configureDebug();
            if (!cfg.enabled || !cfg.copyTo || paused) { queue = []; return; }
            // Settings may be loaded before the connection is ready at boot.
            if (!require('./state').state.ready) return;
            const linesAlt = [];
            let size = 0;
            if (discarded) {
                linesAlt.push(`(${discarded} blocos descartados: fila de logs cheia)`);
                discarded = 0;
            }
            while (queue.length && size + queue[0].length <= SIZE_BATCH) {
                const line = queue.shift();
                linesAlt.push(line);
                size += line.length + 1;
            }
            try {
                const { client } = require('./client');
                await client.sendMessage(cfg.copyTo, PREFIX_COPY + linesAlt.join('\n'),
                    { linkPreview: false });
            } catch (err) {
                if (current === generation) { paused = true; queue = []; }
                // A copy failure goes only to the console. Copying the failure would create an endless saga.
                require('./log').printError('Cópia dos logs pausada:', err.message);
                return;
            }
        }
    });
    try { await sending; } finally {
        sending = null;
        if (queue.length && !timer && !paused) {
            timer = setTimeout(() => { timer = null; void flushCopiesDebug(); }, 500);
            timer.unref?.();
        }
    }
}

const logIsCopy = (textAlt) => String(textAlt ?? '').startsWith(PREFIX_COPY);

module.exports = { copyLog, logIsCopy, flushCopiesDebug, cleanCopiesDebug };
