/*
 * The read-only lists of the web interface: alerts, shortcuts (aliases), schedule, statistics and settings.
 *
 * Every function returns { sections: [{ title, columns, rows, note? }] }: a table per section. A cell is a text,
 * a number or { text, bar } (bar: from 0 to 1, drawn as a horizontal bar behind the text).
 */

const { dbAll, dbGet } = require('../db');
const { destinationsSaved, lineDestination } = require('../destinations');
const { chatName } = require('./data');
const { SETTINGS_SCHEMA, getSetting } = require('../settings');
const { PROTECTED_SETTINGS } = require('./manage');

const MASK = '••••••••';

// The environment variables that decide a web setting (config/.env)
const WEB_ENV = { 'zapbot.web.enabled': 'ZAPBOT_WEB_ENABLED', 'zapbot.web.host': 'ZAPBOT_WEB_HOST', 'zapbot.web.port': 'ZAPBOT_WEB_PORT' };

const safeJson = (text) => {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
};

// Where a saved alert or schedule notifies: the text is the name that was saved (or the id), and the title (the hover)
// is each one resolved to its current name, with its id: { text, title }
async function recipientCell(row, keys) {
    const list = safeJson(row.recipients);
    const items = Array.isArray(list) && list.length
        ? list.map(r => ({ id: r.id ?? null, name: r.name ?? null, email: r.email ?? null, group: Boolean(r.group) }))
        : [{ id: row[keys.id] ?? null, name: row[keys.name] ?? null, email: row[keys.email] ?? null, group: Boolean(row[keys.group]) }].filter(r => r.id || r.name || r.email);
    if (!items.length) return '—';
    const text = items.map(r => r.name || r.email || r.id).join(', ');
    const resolved = await Promise.all(items.map(async (r) => {
        if (r.email) return r.email;
        if (!r.id) return r.name;
        const name = await chatName({ chat_id: r.id, chat_name: r.name, is_group: r.group || r.id.endsWith('@g.us') ? 1 : 0 });
        return `${name} (${r.id})`;
    }));
    return { text, title: resolved.join('\n') };
}

// Where a row notifies, as the form edits it: [{ id, name, group } | { email }] ([]: your private chat)
const peopleOf = (row) => destinationsSaved(row.recipients, lineDestination(row)).map(d => (d.email ? { email: d.email } : { id: d.id, name: d.name, group: Boolean(d.group) }));
const peopleText = (people) => (people.length ? people.map(r => r.name || r.email || r.id).join(', ') : '—');

// The target as it was typed: 6.2 is 6.20 (a price has cents); a whole number stays whole; more decimals stay as they are
const priceText = (n) => {
    const value = Number(n);
    if (!Number.isFinite(value) || Number.isInteger(value)) return String(n);
    const decimals = (String(value).split('.')[1] ?? '').length;
    return value.toFixed(Math.max(2, decimals));
};

// A row that can be turned on and off (a /watch notice, a price alert, a scheduled message) has the same kind of
// cell in the "alert" column; clicking it toggles (manage: op 'toggle')
// (a notice: 🔔 / 🔕; a scheduled message, which runs or is paused: ▶️ / ⏸️)
const bell = (on, icons = ['🔔', '🔕']) => ({ bell: Boolean(on), text: on ? 'on' : 'off', icon: on ? icons[0] : icons[1], play: icons[0] === '▶️' });
const PLAY = ['▶️', '⏸️'];

const text = (name, label, extra = {}) => ({ name, label, type: 'text', ...extra });
const area = (name, label, extra = {}) => ({ name, label, type: 'textarea', ...extra });
const people = (name, label, extra = {}) => ({ name, label, type: 'people', ...extra });
const select = (name, label, options, extra = {}) => ({ name, label, type: 'select', options, ...extra });

/** The price alerts (/stocks, /crypto -alert) and the /watch rules with how many hits each has (/monitor: ./monitor.js) */
async function alerts() {
    const price = await dbAll('SELECT * FROM price_alerts ORDER BY id');
    const hits = new Map((await dbAll('SELECT rule, COUNT(*) AS n, MAX(timestamp) AS lastAt FROM watch_hits GROUP BY rule')).map(r => [r.rule, r]));
    const rules = getSetting('watch.rules');
    const watchMuted = new Set((await dbAll('SELECT rule FROM watch_muted')).map(r => r.rule));
    const watchPeople = new Map((await dbAll('SELECT * FROM watch_destinations')).map(r => [r.rule, peopleOf(r)]));
    return {
        sections: [
            {
                title: 'price', columns: ['#', 'kind', 'symbol', 'rule', 'created', 'notifies', 'message', 'alert'],
                rows: await Promise.all(price.map(async a => {
                    const setting = a.kind === 'acao' ? 'stocks' : 'crypto';
                    return [a.id, setting, a.symbol, `${a.op} ${priceText(a.target)}`, { date: a.created_at },
                        await recipientCell(a, { id: 'dest_id', name: 'dest_name', email: 'dest_email', group: 'dest_is_group' }),
                        a.message ? `${getSetting(`${setting}.alert.msgPrepend`)}${a.message}` : '', bell(!a.paused, PLAY)];
                })),
                ids: price.map(a => a.id), values: price.map(a => ({ rule: `${a.symbol} ${a.op} ${priceText(a.target)}`, message: a.message ?? '', recipients: peopleOf(a) })),
                manage: {
                    kind: 'price', canAdd: true, canEdit: true, canDelete: true, editFields: ['rule', 'message', 'recipients'],
                    fields: [select('kind', 'kind', [['crypto', '/crypto'], ['stocks', '/stocks']]), text('rule', 'rule', { placeholder: 'BTC > 90000', required: true }), text('message', 'message'), people('recipients', 'notifies')]
                }
            },
            {
                title: 'watch', columns: ['rule', 'notifies', 'alert', 'hits', 'last hit'],
                rows: rules.map(rule => [rule, peopleText(watchPeople.get(rule) ?? []), bell(!watchMuted.has(rule)), hits.get(rule)?.n ?? 0, hits.get(rule)?.lastAt ? { date: hits.get(rule).lastAt } : '—']),
                ids: rules, values: rules.map(rule => ({ rule, recipients: watchPeople.get(rule) ?? [], muted: watchMuted.has(rule) })),
                manage: {
                    kind: 'watch', canAdd: true, canEdit: true, canDelete: true, idField: 'oldRule', history: 'watch',
                    fields: [text('rule', 'rule', { placeholder: 'text  or  /regex/i', required: true }), people('recipients', 'notifies')]
                }
            }
        ]
    };
}

/** The shortcuts: /name → command (🔇 quiet, 🔒 only you) */
async function aliases() {
    const rows = await dbAll('SELECT name, description, command, quiet, owner_only FROM command_aliases ORDER BY name');
    return {
        sections: [{
            title: 'aliases', columns: ['shortcut', 'command', 'description', 'flags'],
            // Each flag is a button in the list (🔇/🔊 quiet, 🔒/🔓 only you), the same as -q and -p in the edit form
            rows: rows.map(a => [a.name, a.command, a.description, {
                text: `${a.quiet ? '🔇' : ''}${a.owner_only ? '🔒' : ''}`,
                flags: [{ name: 'quiet', on: Boolean(a.quiet), icons: ['🔇', '🔊'] }, { name: 'ownerOnly', on: Boolean(a.owner_only), icons: ['🔒', '🔓'] }]
            }]),
            ids: rows.map(a => a.name),
            values: rows.map(a => ({ name: a.name, command: a.command, description: a.description, quiet: Boolean(a.quiet), ownerOnly: Boolean(a.owner_only) })),
            manage: {
                kind: 'alias', canAdd: true, canEdit: true, canDelete: true, idField: 'oldName',
                fields: [text('name', 'shortcut', { placeholder: '/name', required: true }), area('command', 'command', { required: true, placeholder: '/stocks USD' }), text('description', 'description'),
                    { name: 'quiet', label: '🔇 quiet (-q)', type: 'checkbox' }, { name: 'ownerOnly', label: '🔒 only you (-p)', type: 'checkbox' }]
            }
        }]
    };
}

/** The scheduled messages and reminders (/cron) */
async function schedule() {
    const rows = await dbAll('SELECT * FROM schedules ORDER BY due_at');
    return {
        sections: [{
            title: 'schedule', columns: ['#', 'kind', 'when', 'repeat', 'chat', 'text', 'alert'],
            rows: await Promise.all(rows.map(async s => [s.id, s.kind, { date: s.due_at }, s.repeat || '—', await recipientCell({ ...s, recipients: s.recipients }, { id: 'chat_id', name: 'chat_name', email: 'no_email', group: 'is_group' }),
                `${getSetting('cron.msgPrepend')}${s.text}`, bell(!s.paused, PLAY)])),
            ids: rows.map(s => s.id),
            values: rows.map(s => ({ kind: s.kind, text: s.text, dueAt: s.due_at, repeat: s.repeat || '', recipients: peopleOf({ recipients: s.recipients, dest_id: s.chat_id, dest_name: s.chat_name, dest_is_group: s.is_group }) })),
            manage: {
                kind: 'schedule', canAdd: true, canEdit: true, canDelete: true, canTry: true,
                fields: [select('kind', 'kind', [['agendar', 'message (as if you typed it)'], ['lembrete', 'reminder']]), area('text', 'text', { required: true }), people('recipients', 'chat', { noEmail: true }),
                    { name: 'dueAt', label: 'when', type: 'datetime', required: true }, select('repeat', 'repeat', [['', '—'], ['daily', 'daily'], ['weekly', 'weekly'], ['monthly', 'monthly']])]
            }
        }]
    };
}

const show = (value) => (Array.isArray(value) ? value.join(', ') : typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? ''));

/** Every setting with its value (the secret ones masked) and its default; editable except the web login ones */
function settings() {
    const keys = Object.keys(SETTINGS_SCHEMA);
    const separatorOf = (schema) => (typeof schema.separator === 'string' ? schema.separator : ', ');
    const raw = (key) => {
        const schema = SETTINGS_SCHEMA[key];
        const value = getSetting(key);
        return schema.secret ? '' : (Array.isArray(value) ? value.join(separatorOf(schema)) : show(value));
    };
    const rows = keys.map((key) => {
        const schema = SETTINGS_SCHEMA[key];
        const value = getSetting(key);
        const current = schema.secret ? (value && (!Array.isArray(value) || value.length) ? MASK : '') : show(value);
        return [key, current, schema.secret ? '' : show(schema.default), schema.desc ?? ''];
    });
    // (loaded here: the server requires this file)
    const { webUrl } = require('./server');
    return {
        // overridden: the settings an environment variable decides (it has priority; the page shows them as read-only)
        web: { url: webUrl(), restartKeys: ['zapbot.web.enabled', 'zapbot.web.host', 'zapbot.web.port'], overridden: Object.fromEntries(Object.entries(WEB_ENV).filter(([, env]) => String(process.env[env] ?? '').trim()).map(([key, env]) => [key, { env, value: String(process.env[env]).trim() }])) },
        sections: [{
            title: 'settings', columns: ['setting', 'value', 'default', 'what it does'], rows, ids: keys,
            values: keys.map(key => ({ value: raw(key), type: SETTINGS_SCHEMA[key].type, secret: Boolean(SETTINGS_SCHEMA[key].secret), protected: PROTECTED_SETTINGS.has(key) })),
            manage: { kind: 'setting', canAdd: false, canEdit: true, canDelete: true, deleteLabel: 'reset', fields: [area('value', 'value')], protected: [...PROTECTED_SETTINGS] }
        }]
    };
}

/** The messages that matched a /watch rule, the most recent first */
async function watchHits(rule, limit = 200) {
    const rows = await dbAll('SELECT id, message_id, chat_id, chat_name, is_group, sender_name, sender_number, body, timestamp FROM watch_hits WHERE rule = ? ORDER BY timestamp DESC, id DESC LIMIT ?', [String(rule ?? ''), Math.min(500, Number(limit) || 200)]);
    const total = (await dbGet('SELECT COUNT(*) AS n FROM watch_hits WHERE rule = ?', [String(rule ?? '')])).n;
    return {
        title: String(rule ?? ''), total,
        columns: ['when', 'chat', 'who', 'message'],
        // The chat and the text open the chat in the history, at the message (the rule is marked there)
        rows: rows.map((r) => {
            const link = r.chat_id && r.message_id ? { chat: r.chat_id, id: r.message_id, at: r.timestamp } : null;
            return [{ date: r.timestamp }, link ? { text: r.chat_name || r.chat_id, link } : (r.chat_name || '—'), r.sender_name || (r.sender_number ? `+${r.sender_number}` : '—'), link ? { text: String(r.body ?? '').slice(0, 400) || '—', link } : String(r.body ?? '').slice(0, 400)];
        }),
        ids: rows.map(r => r.id)
    };
}

/** What the monitor saw of a contact: each "last seen" it read, the most recent first (with who said it) */
async function monitorHistory(id) {
    const contact = await dbGet('SELECT id, contact_name FROM monitor_contacts WHERE id = ?', [Number(id)]);
    if (!contact) return null;
    const rows = await dbAll('SELECT id, last_seen, observed_at, source, kind FROM monitor_history WHERE contact_id = ? ORDER BY last_seen DESC, id DESC LIMIT ?', [contact.id, getSetting('monitor.maxRecords')]);
    return {
        title: contact.contact_name, total: rows.length,
        columns: ['last seen', 'read at', 'source'],
        // Where the time came from is a technical text of the WhatsApp page: a short label, with the original on hover
        rows: rows.map(r => [{ date: r.last_seen * 1000 }, { date: r.observed_at }, { text: 'presence', title: [r.source, r.kind].filter(Boolean).join(' · ') || 'presence' }]),
        ids: rows.map(r => r.id)
    };
}

module.exports = { MASK, alerts, aliases, monitorHistory, schedule, settings, watchHits };
