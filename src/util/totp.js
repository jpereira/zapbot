/*
 * TOTP (RFC 6238: the 6 digits of Google Authenticator, Authy...), no dependencies: HMAC-SHA1, 30 s, base32 secret.
 */

const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** "JBSWY3DP..." → Buffer (spaces, dashes and the case do not matter) */
function decodeBase32(text) {
    const bits = String(text).toUpperCase().replace(/[\s=-]/g, '').split('').map((c) => {
        const i = ALPHABET.indexOf(c);
        if (i < 0) throw new Error('not base32');
        return i.toString(2).padStart(5, '0');
    }).join('');
    const bytes = bits.match(/.{8}/g) ?? [];
    return Buffer.from(bytes.map(b => parseInt(b, 2)));
}

/** A new secret (160 bits) in base32, to put in the authenticator app */
function newSecret() {
    return [...crypto.randomBytes(20)].map(b => b.toString(2).padStart(8, '0')).join('').match(/.{5}/g).map(b => ALPHABET[parseInt(b, 2)]).join('');
}

/** The 6-digit code of the secret at `now` (ms) */
function code(secret, now = Date.now()) {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
    const hmac = crypto.createHmac('sha1', decodeBase32(secret)).update(counter).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const value = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
    return String(value % 1_000_000).padStart(6, '0');
}

/** The 30 s step whose code `typed` is (now, the previous or the next: clocks that differ a little), or null */
function verifyStep(secret, typed, now = Date.now()) {
    const wanted = String(typed ?? '').replace(/\s/g, '');
    if (!/^\d{6}$/.test(wanted)) return null;
    for (const step of [-1, 0, 1]) {
        const a = Buffer.from(code(secret, now + step * 30_000));
        if (crypto.timingSafeEqual(a, Buffer.from(wanted))) return Math.floor(now / 30_000) + step;
    }
    return null;
}

/** Is `typed` the code of now, of the previous 30 s or of the next? */
const verify = (secret, typed, now = Date.now()) => verifyStep(secret, typed, now) !== null;

module.exports = { code, decodeBase32, newSecret, verify, verifyStep };
