/*
 * Web Push: the notices of the bot (an online contact of /monitor, a /watch match, a price alert, an access to the web
 * page) also go to the browsers that turned them on in the web interface, even with the page closed.
 *
 * No library: VAPID (RFC 8292, a JWT signed with ES256) and the encryption of the message (RFC 8291, aes128gcm) are
 * done with node:crypto. The keys of the server are made once and kept in the database (web_push_keys); each browser
 * is a row of web_push (its endpoint, its keys and the kinds of notice it wants). A browser the push service says is
 * gone (404/410) is removed.
 */

const axios = require('axios');
const crypto = require('crypto');

const { dbAll, dbGet, dbRun } = require('./db');
const { printError, printInfo } = require('./log');

const KINDS = ['monitor', 'watch', 'price', 'web'];
const TTL_SECONDS = 24 * 60 * 60;
// The "sub" of the VAPID token: a contact of whoever runs the server, required by some push services
const VAPID_SUBJECT = 'mailto:zapbot@example.com';

const b64url = (buffer) => Buffer.from(buffer).toString('base64url');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

/** The VAPID keys of the server (made the first time): { publicKey (base64url, 65 bytes), privateKey (KeyObject) } */
let keys = null;
async function vapidKeys() {
    if (keys) return keys;
    let row = await dbGet('SELECT public_key, private_jwk FROM web_push_keys WHERE id = 1');
    if (!row) {
        const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
        const jwk = pair.privateKey.export({ format: 'jwk' });
        const publicKey = b64url(Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]));
        await dbRun('INSERT OR IGNORE INTO web_push_keys (id, public_key, private_jwk) VALUES (1, ?, ?)', [publicKey, JSON.stringify(jwk)]);
        row = await dbGet('SELECT public_key, private_jwk FROM web_push_keys WHERE id = 1');
    }
    keys = { publicKey: row.public_key, privateKey: crypto.createPrivateKey({ key: JSON.parse(row.private_jwk), format: 'jwk' }) };
    return keys;
}

// Authorization: vapid t=<JWT for the origin of the endpoint>, k=<the public key>
async function vapidHeader(endpoint) {
    const { publicKey, privateKey } = await vapidKeys();
    const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
    const claims = b64url(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: VAPID_SUBJECT }));
    const signature = crypto.sign('sha256', Buffer.from(`${header}.${claims}`), { key: privateKey, dsaEncoding: 'ieee-p1363' });
    return `vapid t=${header}.${claims}.${b64url(signature)}, k=${publicKey}`;
}

/**
 * The body of a push (RFC 8291, one aes128gcm record): only the browser that subscribed can read it.
 * @param {Buffer} payload
 * @param {{p256dh: string, auth: string}} subscription  the keys the browser gave (base64url)
 * @param {object} [fixed]  the server key pair and the salt (only the tests fix them)
 */
function encrypt(payload, subscription, fixed = {}) {
    const uaPublic = Buffer.from(subscription.p256dh, 'base64url');
    const authSecret = Buffer.from(subscription.auth, 'base64url');
    const ecdh = fixed.ecdh ?? crypto.createECDH('prime256v1');
    if (!fixed.ecdh) ecdh.generateKeys();
    const asPublic = ecdh.getPublicKey();
    const shared = ecdh.computeSecret(uaPublic);
    const salt = fixed.salt ?? crypto.randomBytes(16);

    const ikm = hmac(hmac(authSecret, shared), Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
    const prk = hmac(salt, ikm);
    const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
    const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);

    const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
    // 0x02: the last (and only) record, with no padding
    const body = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
    const recordSize = Buffer.alloc(4);
    recordSize.writeUInt32BE(4096);
    return Buffer.concat([salt, recordSize, Buffer.from([asPublic.length]), asPublic, body]);
}

/** A browser turned the notices on (or changed the kinds it wants) */
async function subscribe({ endpoint, keys: subKeys, kinds, agent }) {
    const url = new URL(String(endpoint ?? ''));
    if (url.protocol !== 'https:') throw new Error('endpoint: https only');
    if (!subKeys?.p256dh || !subKeys?.auth) throw new Error('keys: p256dh and auth are needed');
    if (Buffer.from(String(subKeys.p256dh), 'base64url').length !== 65 || Buffer.from(String(subKeys.auth), 'base64url').length !== 16) {
        throw new Error('keys: not a browser subscription');
    }
    const wanted = (Array.isArray(kinds) ? kinds : KINDS).filter(k => KINDS.includes(k));
    await dbRun(`INSERT INTO web_push (endpoint, p256dh, auth, kinds, agent, created_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, kinds = excluded.kinds, agent = excluded.agent`,
    [url.href, subKeys.p256dh, subKeys.auth, JSON.stringify(wanted), String(agent ?? '').slice(0, 120), Date.now()]);
    return { ok: true, kinds: wanted };
}

async function unsubscribe(endpoint) {
    await dbRun('DELETE FROM web_push WHERE endpoint = ?', [String(endpoint ?? '')]);
    return { ok: true };
}

async function subscription(endpoint) {
    const row = await dbGet('SELECT kinds, created_at FROM web_push WHERE endpoint = ?', [String(endpoint ?? '')]);
    return row ? { kinds: JSON.parse(row.kinds), createdAt: row.created_at } : null;
}

const devices = async () => (await dbGet('SELECT COUNT(*) AS n FROM web_push')).n;

async function deliver(row, payload) {
    try {
        const response = await axios.post(row.endpoint, encrypt(Buffer.from(JSON.stringify(payload)), row), {
            headers: {
                'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(TTL_SECONDS),
                Urgency: payload.urgent ? 'high' : 'normal', Authorization: await vapidHeader(row.endpoint)
            },
            timeout: 15000
        });
        await dbRun('UPDATE web_push SET last_ok = ?, failures = 0 WHERE endpoint = ?', [Date.now(), row.endpoint]);
        return response.status;
    } catch (err) {
        const status = err.response?.status;
        if (status === 404 || status === 410) {
            await dbRun('DELETE FROM web_push WHERE endpoint = ?', [row.endpoint]);
            printInfo(`Web push: a browser left (${status}); removed`);
        } else {
            await dbRun('UPDATE web_push SET failures = failures + 1 WHERE endpoint = ?', [row.endpoint]);
            printError('Web push: failed:', status ?? err.message);
        }
        return status ?? 0;
    }
}

/** A notice to one browser (the "send a test" of the page): the HTTP status of the push service, or 0 when unknown */
async function pushTo(endpoint, notice) {
    const row = await dbGet('SELECT * FROM web_push WHERE endpoint = ?', [endpoint]);
    if (!row) return 0;
    return deliver(row, { kind: 'test', title: notice.title, body: notice.body, url: notice.url ?? '/', tag: 'test', at: Date.now() });
}

/**
 * A notice to every browser that wants this kind. Never throws (a notice of the bot does not fail for this).
 * @param {'monitor'|'watch'|'price'|'web'} kind
 * @param {{title: string, body: string, url?: string, tag?: string, urgent?: boolean}} notice
 */
async function pushNotice(kind, notice) {
    try {
        const rows = (await dbAll('SELECT * FROM web_push')).filter(r => JSON.parse(r.kinds ?? '[]').includes(kind));
        if (!rows.length) return [];
        const payload = { kind, title: String(notice.title).slice(0, 120), body: String(notice.body ?? '').slice(0, 400),
            url: notice.url ?? '/', tag: notice.tag ?? kind, urgent: Boolean(notice.urgent), at: Date.now() };
        return await Promise.all(rows.map(row => deliver(row, payload)));
    } catch (err) {
        printError('Web push:', err.message);
        return [];
    }
}

module.exports = { KINDS, devices, encrypt, pushNotice, pushTo, subscribe, subscription, unsubscribe, vapidHeader, vapidKeys };
