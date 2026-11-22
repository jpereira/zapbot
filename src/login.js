/*
 * /bot -login <password>: whoever is an outsider becomes admin (bot.admins) with the owner's password.
 * The password is never in the clear: the 'bot.login' setting stores "scrypt$salt$hash" (scrypt with salt
 * random). The owner sets it with /bot -passwd <password> (or off) and is notified of each access
 * (WhatsApp and email). Get it wrong too often and the number is blocked for a while.
 */

const crypto = require('crypto');
const { messageToSelf } = require('./client');
const { dbRun } = require('./db');
const { alertPerEmail } = require('./email');
const { printInfo } = require('./log');
const { getSetting, setSetting } = require('./settings');
const { t } = require('./i18n');

const MAX_ERRORS = 5;
const BLOCK_MS = 15 * 60 * 1000;
const PASSWORD_MIN = 8;

// number → { errors, until }
const attempts = new Map();

const hash = (password, salt) => crypto.scryptSync(password, salt, 32);

function createHash(password) {
    const salt = crypto.randomBytes(8);
    return `scrypt$${salt.toString('hex')}$${hash(password, salt).toString('hex')}`;
}

function checkPassword(password, saved) {
    const [alg, salt, expected] = String(saved ?? '').split('$');
    if (alg !== 'scrypt' || !salt || !expected) return false;
    const a = hash(password, Buffer.from(salt, 'hex'));
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// What comes after "-login": the password (the rest of the line, may have spaces)
function loginPassword(args) {
    const m = /^\s*-login(?:\s+([\s\S]*?))?\s*$/i.exec(String(args ?? ''));
    return m ? (m[1] ?? '') : null;
}

// The owner sets (or, with "off", deletes) the password
async function definePassword(password) {
    if (/^off$/i.test(password)) {
        await setSetting('bot.login', '');
        return t('login.desligado');
    }
    if (password.length < PASSWORD_MIN) return t('login.senhaCurta', { min: PASSWORD_MIN });
    await setSetting('bot.login', createHash(password));
    return t('login.senhaGravada');
}

// Deletes the password from the messages database (the bot stores every body before handling the command)
const hideInDb = (id) =>
    dbRun("UPDATE messages SET body = '/bot -login ***' WHERE id = ?", [id]).catch(() => {});

/**
 * Tries the login of an outsider. Returns the reply text.
 * @param {{ number: string, name: string, password: string, isGroup: boolean }} o
 */
async function tryLogin({ number: numberAlt, name: nameAlt, password, isGroup }) {
    if (isGroup) return t('login.soPrivado');
    const saved = getSetting('bot.login');
    if (!saved) return t('login.desativado');
    if (!numberAlt) return t('login.semNumero');
    if (!password) return t('login.uso');

    const tent = attempts.get(numberAlt) ?? { errors: 0, until: 0 };
    if (tent.until > Date.now()) return t('login.muitasTentativas', { min: Math.ceil((tent.until - Date.now()) / 60000) });

    if (!checkPassword(password, saved)) {
        tent.errors += 1;
        if (tent.errors >= MAX_ERRORS) {
            tent.errors = 0;
            tent.until = Date.now() + BLOCK_MS;
            await notifyOwner(t('login.bloqueadoTitulo'),
                t('login.bloqueadoCorpo', { name: nameAlt, number: numberAlt, errors: MAX_ERRORS, min: BLOCK_MS / 60000 }));
        }
        attempts.set(numberAlt, tent);
        printInfo(`/bot -login: wrong password from ${nameAlt} (+${numberAlt})`);
        return t('login.senhaIncorreta');
    }

    attempts.delete(numberAlt);
    const admins = getSetting('bot.admins');
    if (admins.includes(numberAlt)) return t('login.jaAdmin');
    await setSetting('bot.admins', [...admins, numberAlt]);
    await notifyOwner(t('login.novoAdminTitulo'), t('login.novoAdminCorpo', { name: nameAlt, number: numberAlt }));
    return t('login.pronto');
}

async function notifyOwner(title, details) {
    printInfo(`${title}: ${details.split('\n')[0]}`);
    await messageToSelf(`${title}\n${details}`);
    await alertPerEmail(title, details, { force: true });
}

module.exports = { checkPassword, createHash, definePassword, hideInDb, loginPassword, tryLogin };
