/*
 * The regex worker (src/util/regexRunner.js): the user's regexes never run on the bot's thread, the /watch of an arriving
 * message goes ahead of the searches, and a full queue is no longer a silent "no match".
 */
const bot = require('./helpers/bot');

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { matchBatch } = bot.src('util/regexRunner');

test('a full queue: the searches past the room answer "no match" (and the log says so); an urgent one still runs, first', async () => {
    const order = [];
    const searches = Array.from({ length: 70 }, (_, i) => matchBatch(/x/, ['x']).then((r) => { order.push(`s${i}`); return r; }));
    const urgent = matchBatch(/needle/, ['hay needle'], { urgent: true }).then((r) => { order.push('urgent'); return r; });
    const [first, ...rest] = await Promise.all([urgent, ...searches]);
    assert.deepEqual(first, [{ start: 4, end: 10 }]);
    assert.ok(rest.slice(65).every(r => r.length === 0), 'past the room: no answer');
    assert.ok(rest.slice(1, 60).every(r => r[0]), 'the ones in the queue answer');
    // the refused ones answer at once; among the queued ones, the urgent goes right after the batch already running
    const queued = order.filter(o => o === 'urgent' || Number(o.slice(1)) < 64);
    assert.ok(queued.indexOf('urgent') <= 1, `urgent at ${queued.indexOf('urgent')}`);
    assert.ok(bot.logs.some(l => /Regex: \d+ batch\(es\) refused \(queue full\)/.test(l)), 'the miss is in the log');
});

test('a catastrophic regex is cut by the deadline, and the next batch works', async () => {
    const [slow] = await matchBatch(/^(a+)+$/, [`${'a'.repeat(40)}b`]);
    assert.equal(slow, undefined);
    assert.deepEqual(await matchBatch(/b/, ['ab']), [{ start: 1, end: 2 }]);
});
