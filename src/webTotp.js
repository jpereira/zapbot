/*
 * The 2FA of the web interface by the chat:
 *
 *   /set zapbot.web.totp new       makes a secret and sends the QR code and the code, but does NOT turn the 2FA on: the secret
 *                                  waits (in memory, 10 minutes) for you to prove that the app works
 *   /set zapbot.web.totp 123456    the code the app shows: with a secret waiting, if it is right the 2FA is turned on (the secret
 *                                  is saved); with the 2FA already on, it only tells whether the code is right
 *   /set zapbot.web.totp qr        sends the QR code and the code again (of the secret waiting, or of the one in use)
 *
 * Only the owner, only in your own private chat. What is sent is not saved in the database or in the media folder, and the bot
 * deletes the QR message (when the 2FA is confirmed, at once; otherwise after a few minutes).
 */

const qrcode = require('qrcode');
const { MessageMedia } = require('whatsapp-web.js');

const { client } = require('./client');
const { isOwnPrivate } = require('./notesLock');
const { printInfo } = require('./log');
const { t } = require('./i18n');
const { getSetting, setSetting } = require('./settings');
const { runSecret } = require('./secretOutput');
const { newSecret, verify } = require('./util/totp');

const DELETE_AFTER_MS = 3 * 60 * 1000;
const PENDING_MS = 10 * 60 * 1000;
const MAX_ERRORS = 5;

let pending = null; // { secret, expires, errors, sent }

// otpauth://totp/ZapBot:jorge.admin?secret=ABCD...&issuer=ZapBot: what the authenticator apps read from the QR code
const otpauthUri = (secret, login) => `otpauth://totp/ZapBot:${encodeURIComponent(login || 'web')}?secret=${secret}&issuer=ZapBot&digits=6&period=30`;

// "ABCD EFGH IJKL ..." (easier to type)
const grouped = (secret) => secret.match(/.{1,4}/g).join(' ');

const waiting = () => (pending && pending.expires > Date.now() ? pending : null);

// Deletes it once: the timer of 3 minutes and the confirmation both delete it, and the second delete of a message that is already gone
// fails ("Cannot read properties of undefined (reading 'id')"). One that was deleted by hand fails the same way: not an error.
const deleted = new WeakSet();
async function deleteMessage(sent) {
    if (!sent || deleted.has(sent)) return;
    deleted.add(sent);
    try {
        await sent.delete?.(true);
    } catch (err) {
        printInfo(`2FA message: it was not deleted (maybe it is already gone): ${err.message}`);
    }
}

// Where the answers go: a new message, never a reply (a reply would quote the /set that has the code)
const say = (chatId, text) => client.sendMessage(chatId, text, { linkPreview: false });

async function guard({ msg, chatId }) {
    if (!msg.fromMe) {
        await msg.reply(t('web.totp.ownerOnly'));
        return false;
    }
    if (!(await isOwnPrivate(chatId).catch(() => false))) {
        await msg.reply(t('web.totp.privateOnly'));
        return false;
    }
    return true;
}

async function sendQr(chatId, secret, caption) {
    const image = await qrcode.toBuffer(otpauthUri(secret, getSetting('zapbot.web.login')), { width: 420, margin: 2 });
    const media = new MessageMedia('image/png', image.toString('base64'), 'zapbot-2fa.png');
    return runSecret(async () => {
        const sent = await client.sendMessage(chatId, media, { caption });
        // The bot deletes it for everybody soon: the QR code and the code are only for the moment of the setup
        const timer = setTimeout(() => deleteMessage(sent), DELETE_AFTER_MS);
        timer.unref?.();
        return sent;
    });
}

/** /set zapbot.web.totp new | qr */
async function totpSetup({ msg, chatId, mode, command = '/set zapbot.web.totp' }) {
    if (!(await guard({ msg, chatId }))) return;
    if (mode === 'new') {
        const secret = newSecret();
        pending = { secret, expires: Date.now() + PENDING_MS, errors: 0, sent: null };
        pending.sent = await sendQr(chatId, secret, t('web.totp.created', { command, code: grouped(secret), minutes: DELETE_AFTER_MS / 60000, wait: PENDING_MS / 60000 }));
        printInfo('Web: a new 2FA secret is waiting for its code (zapbot.web.totp)');
        return;
    }
    const secret = waiting()?.secret || getSetting('zapbot.web.totp');
    if (!secret) {
        await say(chatId, t('web.totp.none'));
        return;
    }
    await sendQr(chatId, secret, t('web.totp.shown', { code: grouped(secret), minutes: DELETE_AFTER_MS / 60000 }));
}

/** /set zapbot.web.totp 123456: the code of the app */
async function totpConfirm({ msg, chatId, code }) {
    if (!(await guard({ msg, chatId }))) return;
    const wait = waiting();
    if (wait) {
        if (verify(wait.secret, code)) {
            await setSetting('zapbot.web.totp', wait.secret);
            require('./web/server').destroySessions();
            await deleteMessage(wait.sent);
            pending = null;
            printInfo('Web: the 2FA was confirmed and is on (zapbot.web.totp)');
            await say(chatId, t('web.totp.on'));
            return;
        }
        wait.errors += 1;
        if (wait.errors >= MAX_ERRORS) {
            await deleteMessage(wait.sent);
            pending = null;
            await say(chatId, t('web.totp.discarded', { n: MAX_ERRORS }));
            return;
        }
        await say(chatId, t('web.totp.wrong', { left: MAX_ERRORS - wait.errors }));
        return;
    }
    const active = getSetting('zapbot.web.totp');
    if (!active) {
        await say(chatId, t('web.totp.none'));
        return;
    }
    await say(chatId, t(verify(active, code) ? 'web.totp.right' : 'web.totp.wrongActive'));
}

async function cancelTotp() {
    const previous = pending;
    pending = null;
    await deleteMessage(previous?.sent);
}

// Forgets what is waiting (the tests start from zero)
const reset = () => { pending = null; };

module.exports = { cancelTotp, grouped, otpauthUri, reset, totpConfirm, totpSetup, waiting };
