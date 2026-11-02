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

const MAX_ERRORS = 5;
const BLOCK_MS = 15 * 60 * 1000;
const PASSWORD_MIN = 8;

// numero → { erros, ate }
const attempts = new Map();

const hash = (password, sal) => crypto.scryptSync(password, sal, 32);

function createHash(password) {
    const sal = crypto.randomBytes(8);
    return `scrypt$${sal.toString('hex')}$${hash(password, sal).toString('hex')}`;
}

function checkPassword(password, saved) {
    const [alg, sal, expected] = String(saved ?? '').split('$');
    if (alg !== 'scrypt' || !sal || !expected) return false;
    const a = hash(password, Buffer.from(sal, 'hex'));
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
        return '🔓 *Login desligado:* ninguém de fora vira admin pela senha.';
    }
    if (password.length < PASSWORD_MIN) return `❌ A senha precisa de pelo menos ${PASSWORD_MIN} caracteres.`;
    await setSetting('bot.login', createHash(password));
    return '🔐 *Senha gravada* (só o hash fica no banco). Quem mandar `/bot -login <senha>` no ' +
        'privado vira admin e você é avisado.\n💡 _Apague a sua mensagem com a senha._';
}

// Deletes the password from the messages database (the bot stores every body before handling the command)
const hideInDb = (id) =>
    dbRun("UPDATE messages SET body = '/bot -login ***' WHERE id = ?", [id]).catch(() => {});

/**
 * Tries the login of an outsider. Returns the reply text.
 * @param {{ numero: string, nome: string, senha: string, isGroup: boolean }} o
 */
async function tryLogin({ numero: numberAlt, nome: nameAlt, senha: password, isGroup }) {
    if (isGroup) return '🚫 Use o login só no privado.';
    const saved = getSetting('bot.login');
    if (!saved) return '🚫 Login desativado.';
    if (!numberAlt) return '🚫 Não consegui identificar o seu número.';
    if (!password) return '❌ Uso: /bot -login <senha>';

    const t = attempts.get(numberAlt) ?? { erros: 0, ate: 0 };
    if (t.ate > Date.now()) return `⛔ Muitas tentativas. Aguarde ${Math.ceil((t.ate - Date.now()) / 60000)} min.`;

    if (!checkPassword(password, saved)) {
        t.erros += 1;
        if (t.erros >= MAX_ERRORS) {
            t.erros = 0;
            t.ate = Date.now() + BLOCK_MS;
            await notifyOwner('🚨 Login bloqueado', `${nameAlt} (+${numberAlt}) errou a senha do /bot -login ` +
                `${MAX_ERRORS} vezes. Bloqueado por ${BLOCK_MS / 60000} min.`);
        }
        attempts.set(numberAlt, t);
        printInfo(`/bot -login: senha errada de ${nameAlt} (+${numberAlt})`);
        return '❌ Senha incorreta.';
    }

    attempts.delete(numberAlt);
    const admins = getSetting('bot.admins');
    if (admins.includes(numberAlt)) return '👑 Você já é admin.';
    await setSetting('bot.admins', [...admins, numberAlt]);
    await notifyOwner('🔑 Novo admin por senha', `${nameAlt} (+${numberAlt}) virou admin com o /bot -login.\n` +
        `Para revogar: /bot -o +${numberAlt}`);
    return '👑 *Pronto:* você agora é admin do bot.';
}

async function notifyOwner(title, details) {
    printInfo(`${title}: ${details.split('\n')[0]}`);
    await messageToSelf(`${title}\n${details}`);
    await alertPerEmail(title, details, { forcar: true });
}

module.exports = { checkPassword, createHash, definePassword, hideInDb, loginPassword, tryLogin };
