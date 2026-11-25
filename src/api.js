/*
 * The bot's local HTTP API (off by default) and, on top of it, the MCP server (EXPERIMENTAL).
 *
 * GET  /health      → { ok, connected }  (no key: it serves the healthcheck)
 * GET  /status      → version, connection and what is on
 * GET  /notes       → the /notes notes (?limit=N)
 *   POST /send        → { "to": "5521999999999" | "<id>@g.us", "text": "..." }
 * POST /mcp         → MCP JSON-RPC (only with zapbot.mcp.enabled): the send_message tools,
 *                       list_notes, get_note e get_status
 *
 * Security (the API speaks through the owner's account):
 * - only turns on with zapbot.api.enabled AND zapbot.api.key (the key comes in the "Authorization: Bearer <key>" header
 * or "X-API-Key", compared in constant time); the default listens only on 127.0.0.1;
 * - 5 wrong keys from the same address block it for 15 minutes, the same as the web login;
 * - /send only delivers to your own chat and to the one in zapbot.api.sendTo ("all" allows any);
 * - at most 10 sends per minute (the excess is what takes accounts down) and a body of up to 64 KB.
 */

const crypto = require('crypto');
const http = require('http');

const packageJson = require('../package.json');
const { client } = require('./client');
const { dbAll, dbGet, dbReady } = require('./db');
const { state: stateAlt } = require('./state');
const { printError, printInfo } = require('./log');
const { getSetting } = require('./settings');
const { attemptFor } = require('./util/attempts');

const MAX_BODY = 64 * 1024;
const MAX_TEXT = 4000;
const SENDINGS_PER_MIN = 10;
const MAX_KEY_ERRORS = 5;
const KEY_BLOCK_MS = 15 * 60 * 1000;
const MCP_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

class ErrorApi extends Error {
    constructor(status, messageAlt) {
        super(messageAlt);
        this.status = status;
    }
}

const hash = (s) => crypto.createHash('sha256').update(String(s)).digest();

// address → { errors, until } (wrong API keys, like the web login's own attempts)
const keyAttempts = new Map();

const clientAddress = (req) => req.socket.remoteAddress ?? '?';

// The right key? (constant time; with no key configured, nobody gets in)
function keyMatches(req) {
    const keyAlt = getSetting('zapbot.api.key');
    if (!keyAlt) return false;
    const auth = String(req.headers.authorization ?? '');
    const sent = auth.startsWith('Bearer ') ? auth.slice(7).trim() : String(req.headers['x-api-key'] ?? '');
    return crypto.timingSafeEqual(hash(sent), hash(keyAlt));
}

/**
 * The key check, with the same brute-force protection as the web login: 5 wrong keys from an address block it for
 * 15 minutes (without this, a short or leaked zapbot.api.key could be brute-forced at full speed, silently: a wrong
 * key used to cost nothing, was never logged and never counted anywhere). With no key configured there is nothing
 * to guess, so that case is not tracked at all (it never blocks, and nobody gets in anyway).
 */
function authenticated(req) {
    if (!getSetting('zapbot.api.key')) return false;
    const address = clientAddress(req);
    const entry = attemptFor(keyAttempts, address, KEY_BLOCK_MS);
    if (!entry || entry.until > Date.now()) return false;
    if (keyMatches(req)) {
        keyAttempts.delete(address);
        return true;
    }
    entry.errors += 1;
    if (entry.errors >= MAX_KEY_ERRORS) {
        entry.errors = 0;
        entry.until = Date.now() + KEY_BLOCK_MS;
        printError(`API: ${MAX_KEY_ERRORS} wrong keys from ${address}: blocked for ${KEY_BLOCK_MS / 60000} minutes`);
    } else {
        printError(`API: wrong key from ${address}`);
    }
    return false;
}

// Sliding window of the last minute's sends
let sendings = [];
let pendingSends = 0;
const sendingsLimit = (nowAlt = Date.now()) => {
    sendings = sendings.filter(t => nowAlt - t < 60_000);
    return sendings.length + pendingSends >= SENDINGS_PER_MIN;
};

/**
 * The WhatsApp id of a typed destination: the phone (checked with WhatsApp), a group id or
 * the @c.us itself. Outside zapbot.api.sendTo (and your chat), it refuses.
 * @returns {Promise<string>}
 */
async function resolveDestination(to) {
    const target = String(to ?? '').trim();
    let id;
    if (/^\+?\d{8,15}$/.test(target)) {
        const wid = await client.getNumberId(target.replace('+', '')).catch(() => null);
        if (!wid) throw new ErrorApi(404, 'number not on WhatsApp');
        id = wid._serialized;
    } else if (/^[\d-]+@(g|c)\.us$/.test(target)) {
        id = target;
    } else {
        throw new ErrorApi(400, '"to" must be a phone number or an id (…@c.us, …@g.us)');
    }

    const my = client.info?.wid?._serialized;
    const releasedAlt = getSetting('zapbot.api.sendTo');
    const digits = id.endsWith('@c.us') ? id.split('@')[0] : null;
    if (id !== my && !releasedAlt.includes('all') && !releasedAlt.includes(id) && !(digits && releasedAlt.includes(digits))) {
        throw new ErrorApi(403, 'destination not allowed: add it to zapbot.api.sendTo');
    }
    return id;
}

async function send({ to, text }) {
    const textAlt = String(text ?? '').trim();
    if (!textAlt) throw new ErrorApi(400, '"text" is required');
    if (textAlt.length > MAX_TEXT) throw new ErrorApi(400, `"text" has ${textAlt.length} characters; the limit is ${MAX_TEXT}`);
    if (!stateAlt.ready) throw new ErrorApi(503, 'WhatsApp not connected');
    if (sendingsLimit()) throw new ErrorApi(429, `at most ${SENDINGS_PER_MIN} messages per minute`);

    pendingSends++;
    let id;
    try {
        id = await resolveDestination(to);
        sendings.push(Date.now());
    } finally {
        pendingSends--;
    }
    await client.sendMessage(id, textAlt);
    printInfo(`API: message sent to ${id} (${textAlt.length} characters)`);
    return { ok: true, to: id };
}

async function listNotes(limit = 20) {
    await dbReady;
    const n = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const linesAlt = await dbAll('SELECT id, text, created_at, alert_at FROM notes ORDER BY id DESC LIMIT ?', [n]);
    return linesAlt.map(l => ({ id: l.id, text: l.text, createdAt: l.created_at, alertAt: l.alert_at }));
}

async function readNote(id) {
    await dbReady;
    const l = await dbGet('SELECT id, text, created_at, alert_at FROM notes WHERE id = ?', [Number(id)]);
    if (!l) throw new ErrorApi(404, 'note not found');
    return { id: l.id, text: l.text, createdAt: l.created_at, alertAt: l.alert_at };
}

const statusAlt = () => ({
    name: 'zapbot',
    version: packageJson.version,
    connected: Boolean(stateAlt.ready),
    mcp: Boolean(getSetting('zapbot.mcp.enabled'))
});

/*
 * MCP (Model Context Protocol) over HTTP, only what is needed: initialize, ping, tools/list and
 * tools/call, replying JSON in the POST itself. EXPERIMENTAL: the protocol and the tools may
 * change, and an AI with access to it speaks through your account.
 */
const EXP = '[EXPERIMENTAL] ';
const TOOLS = [
    {
        name: 'send_message',
        description: EXP + 'Sends a WhatsApp text message as the bot owner. Only to the owner\'s own chat and to the destinations in the zapbot.api.sendTo setting; at most 10 per minute.',
        inputSchema: {
            type: 'object',
            properties: {
                to: { type: 'string', description: 'Phone number with country code (5521999999999) or a group id (…@g.us)' },
                text: { type: 'string', description: 'The message text' }
            },
            required: ['to', 'text']
        }
    },
    {
        name: 'list_notes',
        description: EXP + 'Lists the latest notes saved with /notes (newest first).',
        inputSchema: { type: 'object', properties: { limit: { type: 'number', description: 'How many (1-100, default 20)' } } }
    },
    {
        name: 'get_note',
        description: EXP + 'Reads one note of /notes by its number.',
        inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] }
    },
    {
        name: 'get_status',
        description: EXP + 'The bot version and whether WhatsApp is connected.',
        inputSchema: { type: 'object', properties: {} }
    }
];

async function callTool(nameAlt, args = {}) {
    if (nameAlt === 'send_message') return send(args);
    if (nameAlt === 'list_notes') return listNotes(args.limit);
    if (nameAlt === 'get_note') return readNote(args.id);
    if (nameAlt === 'get_status') return statusAlt();
    throw new ErrorApi(404, `unknown tool: ${nameAlt}`);
}

// A JSON-RPC message → the reply (null: it was a notification, no reply)
async function handleMcp(body) {
    const { id, method, params } = body ?? {};
    const errorAlt = (code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

    if (id === undefined) return null;   // notifications/initialized etc.

    if (method === 'initialize') {
        const requested = params?.protocolVersion;
        return {
            jsonrpc: '2.0', id,
            result: {
                protocolVersion: MCP_VERSIONS.includes(requested) ? requested : MCP_VERSIONS[0],
                capabilities: { tools: {} },
                serverInfo: { name: 'zapbot', version: packageJson.version },
                instructions: EXP + 'ZapBot MCP server: acts through the owner\'s WhatsApp account.'
            }
        };
    }
    if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
    if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
    if (method === 'tools/call') {
        try {
            const r = await callTool(params?.name, params?.arguments);
            return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(r) }] } };
        } catch (err) {
            return { jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: err.message }] } };
        }
    }
    return errorAlt(-32601, `method not found: ${method}`);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const partsAlt = [];
        req.on('data', (c) => {
            size += c.length;
            if (size > MAX_BODY) {
                reject(new ErrorApi(413, 'body too large'));
                req.destroy();
                return;
            }
            partsAlt.push(c);
        });
        req.on('end', () => {
            try {
                resolve(partsAlt.length ? JSON.parse(Buffer.concat(partsAlt).toString('utf8')) : {});
            } catch {
                reject(new ErrorApi(400, 'invalid JSON'));
            }
        });
        req.on('error', reject);
    });
}

function replyAlt(res, status, object) {
    const textAlt = object === null ? '' : JSON.stringify(object);
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(textAlt);
}

async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const rota = `${req.method} ${url.pathname}`;

    if (rota === 'GET /health') {
        replyAlt(res, 200, { ok: true, connected: Boolean(stateAlt.ready) });
        return;
    }
    if (!authenticated(req)) throw new ErrorApi(401, 'invalid or missing API key');

    if (rota === 'GET /status') replyAlt(res, 200, statusAlt());
    else if (rota === 'GET /notes') replyAlt(res, 200, await listNotes(url.searchParams.get('limit')));
    else if (rota === 'POST /send') replyAlt(res, 200, await send(await readBody(req)));
    else if (rota === 'POST /mcp' && getSetting('zapbot.mcp.enabled')) {
        const reply = await handleMcp(await readBody(req));
        replyAlt(res, reply ? 200 : 202, reply);
    } else throw new ErrorApi(404, 'not found');
}

function createServer() {
    return http.createServer((req, res) => {
        handle(req, res).catch((err) => {
            if (!(err instanceof ErrorApi)) printError('API:', err.message);
            if (!res.headersSent) replyAlt(res, err.status ?? 500, { error: err instanceof ErrorApi ? err.message : 'internal error' });
        });
    });
}

let server = null;

// Called in app.js: turns on if zapbot.api.enabled and zapbot.api.key are in the setting
async function startApi() {
    await dbReady;   // the settings come from the database
    if (!getSetting('zapbot.api.enabled')) return null;
    if (!getSetting('zapbot.api.key')) {
        printError('API: zapbot.api.enabled is on, but zapbot.api.key is missing: not starting');
        return null;
    }

    const host = getSetting('zapbot.api.host');
    const port = getSetting('zapbot.api.port');
    server = createServer();
    server.on('error', err => printError('API:', err.message));
    server.listen(port, host, () => {
        printInfo(`API: listening on http://${host}:${port}` +
            (getSetting('zapbot.mcp.enabled') ? ' (EXPERIMENTAL MCP on at /mcp)' : ''));
        if (host !== '127.0.0.1' && host !== 'localhost') {
            printInfo('API: listening outside localhost: put an HTTPS proxy in front and keep the zapbot.api.key strong');
        }
    });
    return server;
}

// Resets the minute's send count (the tests)
const restartSendings = () => { sendings = []; };

// Forgets every tracked wrong key (the tests)
const resetApiAttempts = () => { keyAttempts.clear(); };

module.exports = {
    ErrorApi,
    TOOLS,
    createServer,
    startApi,
    restartSendings,
    resetApiAttempts,
    handleMcp
};
