/*
 * The PDF of a chat's history (the period the page is showing): who said what and when, with the deleted and the
 * edited ones marked (and the text before and after of each edit). Text only: the media is listed by name.
 */

const os = require('os');

const packageJson = require('../../package.json');
const { generatePdf } = require('../util/pdf');
const { chatInfo, listMessages } = require('./data');

const MAX_MESSAGES = 5000;
const PAGE = 500;

const stamp = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');

/**
 * @param {object} o
 * @param {string} o.chat
 * @param {number|null} [o.from]
 * @param {number|null} [o.to]
 * @param {string[]|null} [o.ids]  only these messages (the selection)
 * @returns {Promise<{ pdf: Buffer, name: string, count: number, truncated: boolean } | null>}
 */
async function exportChat({ chat, from = null, to = null, q = '', ids = null }) {
    const info = await chatInfo(chat);
    if (!info) return null;

    const messages = [];
    let cursor = null;
    do {
        const page = await listMessages({ chat, from, to, q, ids, order: 'asc', cursor, limit: PAGE });
        messages.push(...page.messages);
        cursor = page.next;
    } while (cursor && messages.length < MAX_MESSAGES);
    const truncated = Boolean(cursor);

    const blocks = [{ type: 'text', text: `${info.name}: ${messages.length} messages${truncated ? ` (the first ${MAX_MESSAGES})` : ''}` }, { type: 'space', height: 6 }];
    let day = '';
    for (const m of messages) {
        const date = stamp(m.at).slice(0, 10);
        if (date !== day) {
            day = date;
            blocks.push({ type: 'title', text: date });
        }
        const who = m.fromMe ? 'You' : (m.sender || info.name);
        const marks = [m.deleted ? `DELETED${m.deletedAt ? ` at ${stamp(m.deletedAt)}` : ''}` : '', m.edits.length ? `EDITED x${m.edits.length}` : ''].filter(Boolean).join(' | ');
        blocks.push({ type: 'bold', text: `${stamp(m.at).slice(11)}  ${who}${marks ? `   [${marks}]` : ''}` });
        if (m.quoted && !m.quoted.missing) blocks.push({ type: 'meta', text: `> ${m.quoted.sender ?? 'You'}: ${m.quoted.body.replace(/\s+/g, ' ').slice(0, 120)}` });
        if (m.notice) blocks.push({ type: 'meta', text: m.notice.kind === 'security' ? `[${m.notice.who ? `${m.notice.who}'s` : "a participant's"} security code changed]` : `[WhatsApp notice${m.notice.text ? `: ${m.notice.text}` : ''}]` });
        if (m.body) blocks.push({ type: 'text', text: m.body });
        if (m.media && !m.media.missing) blocks.push({ type: 'meta', text: `[media: ${m.media.name}]` });
        else if (m.media) blocks.push({ type: 'meta', text: '[media no longer in the cache]' });
        if (m.transcription) blocks.push({ type: 'meta', text: `Transcription: ${m.transcription}` });
        for (const edit of m.edits) {
            blocks.push({ type: 'meta', text: `Edited at ${stamp(edit.at)}` });
            blocks.push({ type: 'meta', text: `  before: ${edit.old}` });
            blocks.push({ type: 'meta', text: `  after:  ${edit.new}` });
        }
        if (m.reactions.length) blocks.push({ type: 'meta', text: `Reactions: ${m.reactions.join(' ')}` });
        blocks.push({ type: 'space', height: 6 });
    }

    const now = new Date();
    const pdf = generatePdf({
        title: `Chat: ${info.name}`,
        right: now.toISOString().slice(0, 16).replace('T', ' '),
        footer: `ZapBot ${packageJson.version} - ${os.hostname()}`,
        blocks
    });
    const safe = info.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40) || 'chat';
    return { pdf, name: `ZapBot_chat_${safe}_${now.toISOString().slice(0, 10)}.pdf`, count: messages.length, truncated };
}

module.exports = { exportChat };
