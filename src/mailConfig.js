/*
 * The email settings can live in the database too (zapbot.email.*, set from the web or with /set), not only in
 * config/.env (QRCODE_EMAIL_*): the first setup of the web asks for them, so a new install needs no file to edit.
 *
 * The bot keeps reading the QRCODE_EMAIL_* variables everywhere (the SMTP, the QR Code email, the IMAP...): this file
 * puts the database values in them. A variable set in config/.env wins over the database, and the boot says which
 * ("Overriding db mail settings by local env: QRCODE_EMAIL_SMTP_HOST, ..."), unless zapbot.email.overrideEnv is on: then
 * the database wins and those variables are ignored. A setting changed rebuilds the SMTP.
 */

const { printInfo } = require('./log');

// The variable of each setting
const MAIL_ENV = {
    'zapbot.email.qr': 'QRCODE_EMAIL_ENABLE',
    'zapbot.email.qrFallbackTerminal': 'QRCODE_EMAIL_FALLBACK_TERMINAL',
    'zapbot.email.smtp.host': 'QRCODE_EMAIL_SMTP_HOST',
    'zapbot.email.smtp.port': 'QRCODE_EMAIL_SMTP_PORT',
    'zapbot.email.smtp.user': 'QRCODE_EMAIL_SMTP_USER',
    'zapbot.email.smtp.pass': 'QRCODE_EMAIL_SMTP_PASS',
    'zapbot.email.imap.host': 'QRCODE_EMAIL_IMAP_HOST',
    'zapbot.email.from': 'QRCODE_EMAIL_SMTP_FROM',
    'zapbot.email.to': 'QRCODE_EMAIL_SMTP_TO',
    'zapbot.email.antiphishing': 'QRCODE_EMAIL_SMTP_ANTIPHISHING'
};

// What config/.env had when the process started: those win (the ones put here later do not)
const FROM_ENV = new Set(Object.values(MAIL_ENV).filter(name => String(process.env[name] ?? '').trim()));
const ORIGINAL = Object.fromEntries([...FROM_ENV].map(name => [name, process.env[name]])); // to give them back
const fromDatabase = new Set();
const OVERRIDE_ENV = 'zapbot.email.overrideEnv';

const isMailSetting = (key) => Object.hasOwn(MAIL_ENV, key) || key === OVERRIDE_ENV;
const databaseWins = () => Boolean(require('./settings').getSetting(OVERRIDE_ENV));

// An empty text is "not set"; a boolean or a number always is (its default included)
const asEnv = (value) => (value === '' || value == null ? null : String(value));

/**
 * Puts the database email settings in the QRCODE_EMAIL_* variables, except the ones config/.env set.
 * @param {{boot?: boolean}} [o]  boot: says which database values the .env overrides
 * @returns {{overridden: string[], applied: string[]}}
 */
function applyMailSettings({ boot = false } = {}) {
    const { getSetting, SETTINGS_SCHEMA } = require('./settings');
    const overridden = [];
    const applied = [];
    const ignored = [];
    const dbWins = databaseWins();
    for (const [key, name] of Object.entries(MAIL_ENV)) {
        const value = getSetting(key);
        const changed = asEnv(value) !== asEnv(SETTINGS_SCHEMA[key].default);
        if (FROM_ENV.has(name) && !dbWins) {
            if (changed) overridden.push(name);
            process.env[name] = ORIGINAL[name]; // back from a database that won before
            fromDatabase.delete(name);
            continue;
        }
        if (FROM_ENV.has(name)) ignored.push(name);
        const text = asEnv(value);
        if (text !== null && (changed || typeof value !== 'string')) {
            process.env[name] = text;
            fromDatabase.add(name);
            applied.push(name);
        } else if (fromDatabase.has(name) || FROM_ENV.has(name)) {
            // emptied in the database, or a variable of config/.env the database overrides: not set
            delete process.env[name];
            fromDatabase.delete(name);
        }
    }
    if (boot && overridden.length) printInfo(`Overriding db mail settings by local env: ${overridden.join(', ')} (config/.env wins over /set zapbot.email.*; /set zapbot.email.overrideEnv on gives the database priority)`);
    if (boot && ignored.length) printInfo(`Overriding local env mail settings by db: ${ignored.join(', ')} ignored (zapbot.email.overrideEnv is on)`);
    // at the boot too: email.js may have built the SMTP before the database values came (127.0.0.1:465)
    require('./email').rebuildTransport();
    return { overridden, applied, ignored };
}

// The variable that decides a setting, when config/.env sets it (the web shows it as 🔧, read-only)
function envOverride(key) {
    const name = MAIL_ENV[key];
    if (!name || !FROM_ENV.has(name) || databaseWins()) return null;
    return { env: name, value: name === 'QRCODE_EMAIL_SMTP_PASS' ? '••••••••' : String(process.env[name]).trim() };
}

// The variables of config/.env (names only), for the web to offer the switch
const envNames = () => [...FROM_ENV];

module.exports = { MAIL_ENV, OVERRIDE_ENV, applyMailSettings, envOverride, envNames, isMailSetting };
