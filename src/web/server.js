/*
 * The web interface (off by default): the history of the database in the style of WhatsApp Web, behind a password.
 *
 *   zapbot.web.enabled + zapbot.web.login + zapbot.web.password   → src/web/server.js starts (app.js) on host:port
 *
 * Security (it shows every message of the account):
 * - only the login (zapbot.web.login) and its password (zapbot.web.password, stored as an scrypt hash) get in; the session is a random token in an
 *   HttpOnly + SameSite=Strict cookie, in memory (restarting the bot logs everybody out), for zapbot.web.sessionHours;
 * - 5 wrong passwords block the address for 15 minutes; every access and every failure is logged;
 * - the default listens only on 127.0.0.1: outside it, put an HTTPS proxy in front (and set zapbot.web.trustProxy);
 * - every POST takes only JSON (with the SameSite=Strict cookie, that is what stops CSRF); what changes data goes
 *   through /api/manage (src/web/manage.js), with the same checks as the commands;
 * - the page has no inline script and the media is served with a sandbox CSP and nosniff.
 */

const crypto = require('crypto');
const fs = require('fs-extra');
const http = require('http');
const os = require('os');
const path = require('path');
const { isIP } = require('net');
const { pipeline } = require('stream/promises');
const zlib = require('zlib');

const { dbReady } = require('../db');
const { printError, printInfo } = require('../log');
const { attemptFor } = require('../util/attempts');
const { envOuSetting, getSetting } = require('../settings');
const { checkPassword } = require('../util/password');
const sha = (text) => crypto.createHash('sha256').update(String(text)).digest();
const totp = require('../util/totp');
const { versionWithCommit } = require('../version');
const { searchPeople } = require('../destinations');
const { chatInfo, chatPhoto, chatReactions, contactProfile, listChats, listMessages, messageMedia, searchMessages } = require('./data');
const { exportChat } = require('./export');
const { statsData } = require('./stats');
const { notifyWeb } = require('./alert');
const lists = require('./lists');
const { ManageError, manage } = require('./manage');
const webNotes = require('./notes');
const { overview } = require('./overview');
const { showItems, showSummary } = require('./show');
const { monitorOverview } = require('./monitor');
const { health } = require('./health');
const { duplicates, gallery, mimeOf: mimeOfFile } = require('./gallery');
const { thumbnail } = require('./thumbs');
const webPush = require('../webPush');

const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY = 32 * 1024; // the login is tiny; what is saved (a shortcut, a setting, the ids to export) is not
const MAX_ERRORS = 5;
const BLOCK_MS = 15 * 60 * 1000;
const COOKIE = 'zb_session';

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const STATIC = {
    '/': ['index.html', 'text/html; charset=utf-8'],
    '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
    '/style.css': ['style.css', 'text/css; charset=utf-8'],
    // The installable app (PWA): the service worker (the push notices and the page offline), its manifest and icons
    '/sw.js': ['sw.js', 'text/javascript; charset=utf-8'],
    '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json; charset=utf-8'],
    '/icon.svg': ['icon.svg', 'image/svg+xml'],
    '/icon-192.png': ['icon-192.png', 'image/png'],
    '/icon-512.png': ['icon-512.png', 'image/png']
};

// token → expiry (ms); address → { errors, until }
const sessions = new Map();
let sessionEpoch = 0;
const attempts = new Map();
let lastTotpStep = -1;

function trustsPeer(req) {
    if (!getSetting('zapbot.web.trustProxy')) return false;
    const peer = req.socket.remoteAddress?.replace(/^::ffff:/i, '');
    const allowed = (process.env.ZAPBOT_WEB_TRUSTED_PROXIES ?? '').split(',').map(ip => ip.trim());
    return isIP(peer ?? '') !== 0 && allowed.includes(peer);
}

const isSecure = (req) => Boolean(req.socket.encrypted)
    || (trustsPeer(req) && req.headers['x-forwarded-proto'] === 'https');

function clientAddress(req) {
    if (trustsPeer(req)) {
        const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',').at(-1).trim();
        if (isIP(forwarded)) return forwarded.replace(/^::ffff:/i, '');
    }
    return req.socket.remoteAddress ?? '?';
}

const cookies = (req) => Object.fromEntries(String(req.headers.cookie ?? '').split(';').map(c => c.trim().split(/=(.*)/s).slice(0, 2)).filter(([k]) => k));

function forgetSession(token) {
    sessions.delete(token);
    webNotes.forget(token);
}

function sessionDeadline(session, idleMinutes) {
    return idleMinutes ? Math.min(session.until, session.lastActivity + idleMinutes * 60_000)
        : session.until;
}

function activeSessions() {
    const now = Date.now();
    const idleMinutes = getSetting('zapbot.web.sessionTimeout');
    const active = [];
    for (const [token, session] of sessions) {
        const until = sessionDeadline(session, idleMinutes);
        if (until <= now) forgetSession(token);
        else active.push({ id: session.id, until });
    }
    return active;
}

function destroySessions(id) {
    if (!id) sessionEpoch++;
    activeSessions();
    let count = 0;
    for (const [token, session] of sessions) {
        if (!id || session.id === id) {
            forgetSession(token);
            count++;
        }
    }
    return count;
}

function sessionOf(req) {
    const token = cookies(req)[COOKIE];
    const session = sessions.get(token);
    if (!session) return null;
    if (sessionDeadline(session, getSetting('zapbot.web.sessionTimeout')) <= Date.now()) {
        forgetSession(token);
        return null;
    }
    return token;
}

function securityHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy',
        "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; " +
        "connect-src 'self'; worker-src 'self'; manifest-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
}

function sendJson(res, status, body) {
    const text = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text) });
    res.end(text);
}

function readJson(req) {
    return new Promise((resolve, reject) => {
        if (!/^application\/json\b/i.test(String(req.headers['content-type'] ?? ''))) {
            reject(Object.assign(new Error('JSON only'), { status: 415 }));
            return;
        }
        let size = 0;
        const chunks = [];
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY) {
                reject(Object.assign(new Error('too big'), { status: 413 }));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
            } catch {
                reject(Object.assign(new Error('invalid JSON'), { status: 400 }));
            }
        });
        req.on('error', reject);
    });
}

// The login name that came in the request, for the log (one line, short: someone may type a password in this field)
const shown = (user) => String(typeof user === 'string' ? user : '').replace(/[^\P{C}]/gu, '').slice(0, 40);

async function login(req, res) {
    const address = clientAddress(req);
    const { login: user, password, code } = (await readJson(req)) ?? {};
    const entry = attemptFor(attempts, address, BLOCK_MS);
    if (!entry || entry.active) return sendJson(res, 429, { error: 'busy' });
    if (entry.until > Date.now()) {
        sendJson(res, 429, { error: 'blocked', minutes: Math.ceil((entry.until - Date.now()) / 60000) });
        return;
    }
    const epoch = sessionEpoch;
    const secret = getSetting('zapbot.web.totp');
    // Password and, when zapbot.web.totp is set, the 6-digit code of the app: a miss in either counts as a wrong password
    // The login name, the password and (when set) the code: all of them have to be right, and the answer never says which one was not
    const userOk = typeof user === 'string' && crypto.timingSafeEqual(sha(user), sha(getSetting('zapbot.web.login')));
    entry.active = true;
    let passwordOk;
    try {
        passwordOk = typeof password === 'string'
            && await checkPassword(password, getSetting('zapbot.web.password'));
    } finally {
        entry.active = false;
    }
    if (epoch !== sessionEpoch) return sendJson(res, 401, { error: 'retry login' });
    if (passwordOk === null) return sendJson(res, 429, { error: 'busy' });
    // A code works once: the same 6 digits (seen on the screen, or in a recorded request) do not log in again
    // within the 90 s they are valid. The step of the last login with a code is kept
    const step = secret ? totp.verifyStep(secret, code) : null;
    const valid = userOk && passwordOk && (!secret || (step !== null && step > lastTotpStep));
    if (!valid) {
        entry.errors += 1;
        const vars = { address, attempt: entry.errors, max: MAX_ERRORS, minutes: BLOCK_MS / 60000 };
        if (entry.errors >= MAX_ERRORS) {
            entry.errors = 0;
            entry.until = Date.now() + BLOCK_MS;
            printError(`Web: ${MAX_ERRORS} wrong passwords for '${shown(user)}' from ${address}: blocked for ${BLOCK_MS / 60000} minutes`);
            notifyWeb('blocked', vars).catch(() => {});
        } else {
            printError(`Web: wrong password for '${shown(user)}' from ${address}`);
            notifyWeb('wrong', vars).catch(() => {});
        }
        await new Promise(resolve => setTimeout(resolve, 500)); // wrong guesses are slow
        sendJson(res, 401, { error: 'wrong password', needsCode: Boolean(secret) });
        return;
    }
    attempts.delete(address);
    if (secret) lastTotpStep = step;
    const token = crypto.randomBytes(32).toString('hex');
    const hours = getSetting('zapbot.web.sessionHours');
    activeSessions();
    if (sessions.size >= 256) forgetSession(sessions.keys().next().value);
    const now = Date.now();
    sessions.set(token, { id: crypto.randomUUID(), until: now + hours * 3600_000, lastActivity: now });
    printInfo(`Web: login of '${shown(user)}' from ${address}`);
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${hours * 3600}${isSecure(req) ? '; Secure' : ''}`);
    sendJson(res, 200, { ok: true });
}

// "Range: bytes=0-1023" of a file of the given size → { start, end } (null: not a valid range)
function parseRange(header, size) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(header ?? ''));
    if (!m || (m[1] === '' && m[2] === '')) return null;
    let start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]);
    let end = m[1] === '' || m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
    if (start > end || start >= size) return null;
    start = Math.max(0, start);
    end = Math.max(start, end);
    return { start, end };
}

async function sendMedia(req, res, url) {
    const media = await messageMedia(url.searchParams.get('id') ?? '');
    if (!media) return sendJson(res, 404, { error: 'no media' });
    const asDownload = url.searchParams.has('download') || !media.inline;
    const headers = {
        'Content-Type': media.mime,
        'Accept-Ranges': 'bytes',
        'Content-Security-Policy': 'sandbox',
        'Content-Disposition': `${asDownload ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(media.name)}`,
        'Cache-Control': 'private, max-age=3600'
    };
    let file;
    try {
        file = await fs.promises.open(media.file, 'r');
    } catch (err) {
        if (err.code === 'ENOENT') return sendJson(res, 404, { error: 'no media' });
        throw err;
    }
    try {
        const { size } = await file.stat();
        const range = parseRange(req.headers.range, size);
        if (req.headers.range && !range) {
            res.writeHead(416, { 'Content-Range': `bytes */${size}` });
            return res.end();
        }
        if (range) {
            headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`;
            headers['Content-Length'] = range.end - range.start + 1;
        } else {
            headers['Content-Length'] = size;
        }
        res.writeHead(range ? 206 : 200, headers);
        await pipeline(file.createReadStream(range ?? undefined), res);
    } finally {
        await file.close();
    }
}

const toSeconds = (value) => {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? Math.floor(n) : null;
};

async function api(req, res, url) {
    const route = url.pathname;
    if (route === '/api/session') {
        return sendJson(res, 200, { authenticated: Boolean(sessionOf(req)), lang: getSetting('zapbot.lang'), pageSize: getSetting('zapbot.web.pageSize'), refreshSeconds: getSetting('zapbot.web.refreshSeconds'), needsCode: Boolean(getSetting('zapbot.web.totp')), version: versionWithCommit() });
    }
    if (route === '/api/login' && req.method === 'POST') return login(req, res);
    if (route === '/api/logout' && req.method === 'POST') {
        const token = sessionOf(req);
        if (token) {
            sessions.delete(token);
            webNotes.forget(token);
        }
        res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
        return sendJson(res, 200, { ok: true });
    }

    const token = sessionOf(req);
    if (!token) return sendJson(res, 401, { error: 'login required' });

    if (route === '/api/activity') {
        if (req.method === 'POST' && req.headers['x-zapbot-activity'] === '1') {
            sessions.get(token).lastActivity = Date.now();
        } else if (req.method !== 'GET') {
            return sendJson(res, 400, { error: 'invalid activity request' });
        }
        return res.writeHead(204).end();
    }

    // The only things that change anything: the password of a protected tag (here, in memory, for this login)
    if (req.method === 'POST' && (route === '/api/notes/unlock' || route === '/api/notes/lock')) {
        const { tag, password } = await readJson(req);
        if (typeof tag !== 'string' || !tag) return sendJson(res, 400, { error: 'tag' });
        if (route === '/api/notes/lock') return sendJson(res, 200, { ok: webNotes.lockTag(token, tag.toLowerCase()) });
        const result = await webNotes.unlockTag(token, tag.toLowerCase(), password, clientAddress(req));
        if (!sessionOf(req)) {
            webNotes.forget(token);
            return sendJson(res, 401, { error: 'login required' });
        }
        return sendJson(res, result.ok ? 200 : (result.error === 'blocked' ? 429 : result.error === 'unknown' ? 404 : 401), result);
    }
    if (req.method === 'POST' && route === '/api/manage') {
        try {
            return sendJson(res, 200, await manage(await readJson(req), clientAddress(req), token, String(req.headers['user-agent'] ?? '').replace(/[^\P{C}]/gu, '').slice(0, 120)));
        } catch (err) {
            if (!(err instanceof ManageError)) throw err;
            return sendJson(res, 400, { ok: false, error: err.message });
        }
    }
    if (req.method === 'POST' && route === '/api/export') {
        const body = await readJson(req);
        const ids = Array.isArray(body.ids) ? body.ids.filter(id => typeof id === 'string').slice(0, 2000) : [];
        const result = ids.length ? await exportChat({ chat: String(body.chat ?? ''), ids }) : null;
        if (!result) return sendJson(res, 404, { error: 'nothing to export' });
        res.writeHead(200, {
            'Content-Type': 'application/pdf', 'Content-Length': result.pdf.length, 'Cache-Control': 'private, no-store',
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(result.name)}`, 'X-Messages': String(result.count), 'X-Truncated': String(result.truncated)
        });
        return res.end(result.pdf);
    }
    if (route === '/api/reactions' && req.method === 'POST') {
        const { chat, ids } = (await readJson(req)) ?? {};
        if (typeof chat !== 'string' || !Array.isArray(ids) || ids.length > 200
            || ids.some(id => typeof id !== 'string' || !id || id.length > 128)) {
            return sendJson(res, 400, { error: 'invalid reaction request' });
        }
        return sendJson(res, 200, { messages: await chatReactions(chat, ids) });
    }
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'read-only' });

    const chat = url.searchParams.get('chat') ?? '';
    switch (route) {
        case '/api/chats':
            return sendJson(res, 200, { chats: await listChats(url.searchParams.get('q') ?? '') });
        case '/api/chat': {
            const info = await chatInfo(chat);
            return info ? sendJson(res, 200, info) : sendJson(res, 404, { error: 'no such chat' });
        }
        case '/api/messages':
            return sendJson(res, 200, await listMessages({
                chat,
                from: toSeconds(url.searchParams.get('from')),
                to: toSeconds(url.searchParams.get('to')),
                order: url.searchParams.get('order') === 'desc' ? 'desc' : 'asc',
                cursor: url.searchParams.get('cursor'),
                limit: toSeconds(url.searchParams.get('limit')),
                q: url.searchParams.get('q') ?? ''
            }));
        case '/api/search':
            return sendJson(res, 200, { results: await searchMessages(url.searchParams.get('q') ?? '') });
        case '/api/export': {
            const result = await exportChat({ chat, from: toSeconds(url.searchParams.get('from')), to: toSeconds(url.searchParams.get('to')), q: url.searchParams.get('q') ?? '' });
            if (!result) return sendJson(res, 404, { error: 'no such chat' });
            res.writeHead(200, {
                'Content-Type': 'application/pdf', 'Content-Length': result.pdf.length, 'Cache-Control': 'private, no-store',
                'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(result.name)}`, 'X-Messages': String(result.count), 'X-Truncated': String(result.truncated)
            });
            return res.end(result.pdf);
        }
        case '/api/contact': {
            const profile = await contactProfile(chat);
            return profile ? sendJson(res, 200, profile) : sendJson(res, 404, { error: 'no such contact' });
        }
        case '/api/photo': {
            const photo = await chatPhoto(chat);
            if (!photo) return sendJson(res, 404, { error: 'no photo' });
            res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': photo.length, 'Cache-Control': 'private, max-age=3600' });
            return res.end(photo);
        }
        case '/api/media':
            return sendMedia(req, res, url);
        // A frame of a video or a small copy of a picture (the gallery); 404: the page shows the icon (or the file)
        case '/api/media/thumb': {
            const thumb = await thumbnail(url.searchParams.get('id'));
            if (!thumb) return sendJson(res, 404, { error: 'no thumbnail' });
            const body = await fs.promises.readFile(thumb.file);
            res.writeHead(200, {
                'Content-Type': thumb.mime ?? mimeOfFile(thumb.file), 'Content-Length': body.length,
                'Content-Security-Policy': 'sandbox', 'Cache-Control': 'private, max-age=86400'
            });
            return res.end(body);
        }
        case '/api/show':
            return sendJson(res, 200, await showSummary());
        case '/api/show/items': {
            const page = await showItems({ kind: url.searchParams.get('kind') ?? '', q: url.searchParams.get('q') ?? '',
                person: url.searchParams.get('person') ?? '', before: url.searchParams.has('before') ? Number(url.searchParams.get('before')) : null });
            return page ? sendJson(res, 200, page) : sendJson(res, 400, { error: 'kind: deleted, status, channels, edited or reactions' });
        }
        case '/api/overview':
            return sendJson(res, 200, await overview());
        case '/api/lists/alerts':
            return sendJson(res, 200, await lists.alerts());
        case '/api/history/watch':
            return sendJson(res, 200, await lists.watchHits(url.searchParams.get('rule')));
        case '/api/health':
            return sendJson(res, 200, health());
        case '/api/gallery':
        case '/api/gallery/duplicates': {
            const filter = {
                chat, kind: url.searchParams.get('kind') ?? '', q: url.searchParams.get('q') ?? '',
                from: toSeconds(url.searchParams.get('from')), to: toSeconds(url.searchParams.get('to'))
            };
            if (route.endsWith('/duplicates')) return sendJson(res, 200, await duplicates(filter));
            return sendJson(res, 200, await gallery({
                ...filter, sort: url.searchParams.get('sort') ?? 'date', desc: url.searchParams.get('desc') !== '0',
                offset: toSeconds(url.searchParams.get('offset')) ?? 0
            }));
        }
        case '/api/push': {
            const endpoint = url.searchParams.get('endpoint');
            return sendJson(res, 200, { publicKey: (await webPush.vapidKeys()).publicKey, kinds: webPush.KINDS, devices: await webPush.devices(), subscription: endpoint ? await webPush.subscription(endpoint) : null });
        }
        case '/api/monitor':
            return sendJson(res, 200, await monitorOverview());
        case '/api/history/monitor': {
            const history = await lists.monitorHistory(url.searchParams.get('id'));
            return history ? sendJson(res, 200, history) : sendJson(res, 404, { error: 'not found' });
        }
        case '/api/contacts':
            return sendJson(res, 200, { people: await searchPeople(url.searchParams.get('q')).catch(() => []) });
        case '/api/lists/aliases':
            return sendJson(res, 200, await lists.aliases());
        case '/api/lists/schedule':
            return sendJson(res, 200, await lists.schedule());
        case '/api/stats':
            return sendJson(res, 200, await statsData(toSeconds(url.searchParams.get('days'))));
        case '/api/lists/settings':
            return sendJson(res, 200, lists.settings());
        // X-Offline: 1 → the service worker may keep it for the page offline (never a note of a protected tag)
        case '/api/notes/tags':
            res.setHeader('X-Offline', '1');
            return sendJson(res, 200, { tags: await webNotes.listTags(token) });
        case '/api/notes': {
            const notes = await webNotes.listNotes(token, url.searchParams.get('tag') ?? '', url.searchParams.get('q') ?? '');
            if (!notes.some(n => n.protected && !n.locked)) res.setHeader('X-Offline', '1');
            return sendJson(res, 200, { notes });
        }
        case '/api/notes/media': {
            const media = await webNotes.noteMedia(token, toSeconds(url.searchParams.get('id')));
            if (!media) return sendJson(res, 404, { error: 'no media' });
            if (media.locked) return sendJson(res, 403, { error: 'locked' });
            // Pictures, videos and audio play on the page (Range, so the player can seek); the rest, and ?download, is a download
            const inline = /^(?:image\/(?:jpeg|png|webp|gif)|video\/(?:mp4|webm|quicktime|3gpp)|audio\/(?:ogg|mpeg|mp4|aac|wav|webm))$/.test(media.mime) && !url.searchParams.has('download');
            const headers = {
                'Content-Type': inline ? media.mime : 'application/octet-stream', 'Accept-Ranges': 'bytes',
                'Content-Security-Policy': 'sandbox', 'Cache-Control': 'private, no-store',
                'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(media.name)}`,
                ...(media.open ? { 'X-Offline': '1' } : {})
            };
            const range = parseRange(req.headers.range, media.buffer.length);
            if (req.headers.range && !range) {
                res.writeHead(416, { 'Content-Range': `bytes */${media.buffer.length}` });
                return res.end();
            }
            if (range) {
                res.writeHead(206, { ...headers, 'Content-Range': `bytes ${range.start}-${range.end}/${media.buffer.length}`, 'Content-Length': range.end - range.start + 1 });
                return res.end(media.buffer.subarray(range.start, range.end + 1));
            }
            res.writeHead(200, { ...headers, 'Content-Length': media.buffer.length });
            return res.end(media.buffer);
        }
        case '/api/notes/pdf': {
            const result = await webNotes.notesPdf(token, url.searchParams.get('tag') ?? '');
            if (!result) return sendJson(res, 404, { error: 'no notes to export' });
            res.writeHead(200, {
                'Content-Type': 'application/pdf', 'Content-Length': result.pdf.length, 'Cache-Control': 'private, no-store',
                'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(result.name)}`,
                'X-Skipped-Locked': result.skipped.join(',')
            });
            return res.end(result.pdf);
        }
        default:
            return sendJson(res, 404, { error: 'not found' });
    }
}

async function handle(req, res) {
    securityHeaders(res);
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return api(req, res, url);

    const file = STATIC[url.pathname];
    if (!file || !['GET', 'HEAD'].includes(req.method)) return sendJson(res, 404, { error: 'not found' });
    // Someone opened the page and is not logged in: a ⚠️ in your private chat (with the flood limits of notifyWeb)
    if (url.pathname === '/' && req.method === 'GET' && !sessionOf(req) && getSetting('zapbot.web.warnAccess')) {
        const agent = String(req.headers['user-agent'] ?? '').replace(/[^\P{C}]/gu, '').slice(0, 100);
        notifyWeb('access', { address: clientAddress(req), agent }).catch(() => {});
    }
    if (file[0] !== 'index.html') return sendAsset(req, res, file);
    const page = await fs.readFile(path.join(PUBLIC_DIR, file[0]), 'utf8');
    // The title of the tab tells which version is running: "ZapBot 1.0.25 (devel) (git+454e038/HEAD)"
    const body = Buffer.from(page.replace('<title>ZapBot</title>', `<title>ZapBot ${escapeHtml(versionWithCommit())}</title>`));
    res.writeHead(200, { 'Content-Type': file[1], 'Content-Length': body.length });
    return res.end(req.method === 'HEAD' ? undefined : body);
}

// app.js and style.css: read once (they only change with a new deploy, which restarts the process), gzipped when the
// browser takes it, and revalidated by ETag (no-cache: a 304 instead of ~130 KB on every load, a deploy still shows at once)
const assets = new Map();
async function sendAsset(req, res, [name, type]) {
    if (!assets.has(name)) {
        const raw = await fs.readFile(path.join(PUBLIC_DIR, name));
        assets.set(name, { raw, gzip: zlib.gzipSync(raw), etag: `"${crypto.createHash('sha1').update(raw).digest('base64url')}"` });
    }
    const { raw, gzip, etag } = assets.get(name);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('ETag', etag);
    res.setHeader('Vary', 'Accept-Encoding');
    if (req.headers['if-none-match'] === etag) {
        res.writeHead(304);
        return res.end();
    }
    const zipped = /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
    const body = zipped ? gzip : raw;
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length, ...(zipped ? { 'Content-Encoding': 'gzip' } : {}) });
    return res.end(req.method === 'HEAD' ? undefined : body);
}

function createServer() {
    return http.createServer((req, res) => {
        handle(req, res).catch((err) => {
            if (!err.status) printError('Web:', err.message);
            if (!res.headersSent) sendJson(res, err.status ?? 500, { error: err.status ? err.message : 'internal error' });
            else res.end();
        });
    });
}

let server = null;
let listening = false;

/**
 * The address to open the interface at: zapbot.web.url (or ZAPBOT_WEB_URL, which the docker/.env sets), else the first
 * address of the machine with the port (inside Docker, set the url: the container does not know the server's IP).
 */
function webUrl() {
    const configured = String(getSetting('zapbot.web.url') || process.env.ZAPBOT_WEB_URL || '').trim().replace(/\/+$/, '');
    if (configured) return configured;
    const host = process.env.ZAPBOT_WEB_HOST || getSetting('zapbot.web.host');
    const port = envOuSetting('ZAPBOT_WEB_PORT', 'zapbot.web.port');
    if (host !== '0.0.0.0' && host !== '::') return `http://${host}:${port}`;
    const lan = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal);
    return `http://${lan?.address ?? 'localhost'}:${port}`;
}

const isWebRunning = () => listening;

// Called in app.js: turns on with zapbot.web.enabled and a zapbot.web.password
async function startWeb() {
    await dbReady;
    if (server) return server;
    // ZAPBOT_WEB_ENABLED (true/false) has priority over the setting; empty: the setting
    if (!envOuSetting('ZAPBOT_WEB_ENABLED', 'zapbot.web.enabled')) return null;
    if (!getSetting('zapbot.web.login') || !getSetting('zapbot.web.password')) {
        printError('Web: zapbot.web.enabled is on, but the login or the password is missing: not starting (/set zapbot.web.login <name> and /set zapbot.web.password <password>)');
        return null;
    }
    // ZAPBOT_WEB_HOST (the Docker image sets 0.0.0.0, and the compose keeps the published port on the host's 127.0.0.1)
    const host = process.env.ZAPBOT_WEB_HOST || getSetting('zapbot.web.host');
    const port = envOuSetting('ZAPBOT_WEB_PORT', 'zapbot.web.port');
    server = createServer();
    const instance = server;
    const clear = () => {
        if (server !== instance) return;
        server = null;
        listening = false;
    };
    instance.on('error', err => { clear(); printError('Web:', err.message); });
    instance.on('close', clear);
    server.listen(port, host, () => {
        listening = true;
        printInfo(`Web: listening on http://${host}:${port} (open it at ${webUrl()})`);
        if (host !== '127.0.0.1' && host !== 'localhost') {
            printInfo('Web: listening outside localhost: put an HTTPS proxy in front and keep the password strong');
        }
    });
    return server;
}

// Forgets the sessions and the blocks (the tests)
const resetWeb = () => { destroySessions(); attempts.clear(); lastTotpStep = -1; webNotes.reset(); require('./alert').reset(); require('./data').resetNames(); };

async function stopWeb() {
    destroySessions();
    const instance = server;
    if (!instance) return;
    await new Promise((resolve, reject) => {
        instance.close(err => {
            if (err && err.code !== 'ERR_SERVER_NOT_RUNNING') reject(err);
            else resolve();
        });
        instance.closeAllConnections();
    });
}

module.exports = {
    activeSessions, createServer, destroySessions, isWebRunning, resetWeb, startWeb, stopWeb, webUrl
};
