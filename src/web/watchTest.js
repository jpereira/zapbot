/*
 * The rule of a /watch tried before saving: the same compile of the /watch (a risky or invalid regex is refused with
 * its text) against the last messages it would have seen (received, not commands), with where each one matched.
 */

const { dbAll } = require('../db');
const { matchingRows } = require('../util/regexRunner');
const { compileSearch, findMatch, RULE_REGEX } = require('../watch/rules');

const TESTED = 3000;
const SAMPLES = 40;
const MAX_LENGTH = 200;

async function tryWatchRule(text) {
    const rule = String(text ?? '').trim();
    if (!rule) return { ok: false, error: 'empty' };
    if (rule.length > MAX_LENGTH) return { ok: false, error: `the limit is ${MAX_LENGTH} characters` };
    let test;
    try {
        test = compileSearch(rule);
    } catch (err) {
        return { ok: false, error: err.message, regex: RULE_REGEX.test(rule) };
    }
    const rows = await dbAll(`SELECT id, chat_id, chat_name, is_group, sender_name, sender_number, body, timestamp FROM messages
        WHERE from_me = 0 AND body IS NOT NULL AND body <> '' AND body NOT LIKE '/%' AND chat_id <> 'status@broadcast'
        ORDER BY timestamp DESC LIMIT ?`, [TESTED]);
    const started = Date.now();
    const hits = await matchingRows(test, rows, r => [r.body]);
    const chats = new Map();
    for (const r of hits) {
        const c = chats.get(r.chat_id) ?? { id: r.chat_id, name: r.chat_name || r.chat_id, count: 0 };
        c.count++;
        chats.set(r.chat_id, c);
    }
    const samples = await Promise.all(hits.slice(0, SAMPLES).map(async r => ({
        id: r.id, chat: r.chat_id, chatName: r.chat_name || r.chat_id, sender: r.sender_name || (r.sender_number ? `+${r.sender_number}` : null),
        at: r.timestamp, body: String(r.body).slice(0, 500), match: await findMatch(rule, String(r.body).slice(0, 500))
    })));
    return {
        ok: true, regex: RULE_REGEX.test(rule), tested: rows.length, matches: hits.length, ms: Date.now() - started,
        since: rows.at(-1)?.timestamp ?? null, chats: [...chats.values()].sort((a, b) => b.count - a.count).slice(0, 8), samples
    };
}

module.exports = { tryWatchRule };
