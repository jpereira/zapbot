/*
 * Passwords that are never kept in the clear: "scrypt$salt$hash" (scrypt with a random salt).
 * Used by /bot -login (bot.login) and by the web interface (zapbot.web.password).
 */

const crypto = require('crypto');

const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);
let active = 0;

async function deriveKey(password, salt) {
    if (active >= 2) return null;
    active++;
    try {
        return await scrypt(password, salt, 32);
    } finally {
        active--;
    }
}

const hash = (password, salt) => crypto.scryptSync(password, salt, 32);

/** @returns {string} "scrypt$<salt hex>$<hash hex>" */
function createHash(password) {
    const salt = crypto.randomBytes(8);
    return `scrypt$${salt.toString('hex')}$${hash(password, salt).toString('hex')}`;
}

/** Is `password` the one behind the `saved` hash? (constant time; anything that is not a hash is no) */
async function checkPassword(password, saved) {
    const [alg, salt, expected] = String(saved ?? '').split('$');
    if (alg !== 'scrypt' || !salt || !expected) return false;
    const a = await deriveKey(password, Buffer.from(salt, 'hex'));
    if (!a) return null;
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { checkPassword, createHash, deriveKey };
