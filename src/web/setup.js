/*
 * The first setup of the web, in a few clicks: on the first boot (no login nor password yet), the web starts anyway
 * and the log shows a link that works once, for 24 h: http://<web>/setup#<token>. It opens a page where you choose
 * your login and password; the link dies there. Then "First steps" (Home) walks through the rest: pairing WhatsApp
 * with the QR Code on the page, the address of the web, the email (SMTP and IMAP, saved in the database), the 2FA,
 * the notices on the phone and who can use the bot.
 *
 * No password ever goes to the log: the token is random, single-use and short-lived, and only its hash is kept. A
 * lost link (or a forgotten password): /web -setup in your private chat makes a new one.
 */

const crypto = require('crypto');

const { getSetting } = require('../settings');
const { printInfo } = require('../log');

const TOKEN_MS = 24 * 60 * 60 * 1000;
const MIN_PASSWORD = 12;

let pending = null; // { hash, until, reason }
const sha = (text) => crypto.createHash('sha256').update(String(text)).digest();

const needsSetup = () => !getSetting('zapbot.web.login') || !getSetting('zapbot.web.password');

/**
 * A new setup link (the previous one stops working).
 * @param {string} base  the address of the web (webUrl)
 * @param {string} reason  'first boot' or who asked (the log and the page say it)
 * @returns {{token: string, url: string, until: number}}
 */
function issueSetupLink(base, reason = 'first boot') {
    const token = crypto.randomBytes(18).toString('base64url');
    const until = Date.now() + TOKEN_MS;
    pending = { hash: sha(token), until, reason };
    return { token, url: `${base}/setup#${token}`, until };
}

// The banner of the first boot: hard to miss in a page of logs
function printSetupBanner(url) {
    const line = '═'.repeat(Math.min(100, url.length + 6));
    printInfo(`\n╔${line}╗\n║ 🔐 ZapBot web: configure the access (login and password) in a few clicks:\n║    ${url}\n║    It works once, for 24 h. Lost it? /web -setup in your private chat makes a new one.\n╚${line}╝`);
}

// The token of the link, checked in constant time; used, it dies
function consumeSetupToken(token) {
    if (!pending || typeof token !== 'string' || !token) return false;
    if (Date.now() > pending.until) {
        pending = null;
        return false;
    }
    const ok = crypto.timingSafeEqual(sha(token), pending.hash);
    if (ok) pending = null;
    return ok;
}

const setupPending = () => Boolean(pending && Date.now() <= pending.until);

// What the setup form accepts: a login of the setting's format and a password of 12+ characters, not the login
function setupError(login, password) {
    if (typeof login !== 'string' || !/^[\w.@-]{3,40}$/.test(login)) return 'login: 3 to 40 letters, digits, . - _ @';
    if (typeof password !== 'string' || password.length < MIN_PASSWORD) return `password: at least ${MIN_PASSWORD} characters`;
    if (password.toLowerCase().includes(login.toLowerCase())) return 'password: it cannot contain the login';
    return null;
}

/** The first steps after the setup, each one done or not (the page shows what is left, with a button for each) */
function onboarding() {
    const { state } = require('../state');
    const { smtpConfigured } = require('../email');
    return {
        login: !needsSetup(),
        whatsapp: Boolean(state.ready),
        address: Boolean(String(getSetting('zapbot.web.url') || process.env.ZAPBOT_WEB_URL || '').trim()),
        email: smtpConfigured(),
        twoFactor: Boolean(getSetting('zapbot.web.totp')),
        users: getSetting('bot.users').length > 0
    };
}

const reset = () => { pending = null; };

module.exports = { MIN_PASSWORD, consumeSetupToken, issueSetupLink, needsSetup, onboarding, printSetupBanner, reset, setupError, setupPending };
