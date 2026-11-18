/*
 * No-permission command notice: with bot.denied.enabled on, whoever types a command they cannot use
 * (outside bot.users, or above its level) receives the bot.denied.message, instead of silence. In the message,
 * $cmd is the typed command and $admin, the bot owner. So the bot does not turn into spam, whoever was already notified, or
 * tried another command, in the last bot.denied.interval minutes in this chat does not get one again, and each new
 * attempt renews the wait (whoever insists is left without a reply, instead of getting a notice at every interval).
 */

const { client } = require('./client');
const { t } = require('./i18n');
const { getSetting } = require('./settings');

const notified = new Map(); // person|chat → when the last attempt was (notified or not)

// The bot owner, for $admin: "Name (+5521999999999)", or just the phone
function botOwner() {
    const phoneAlt = client.info?.wid?.user;
    const nameAlt = client.info?.pushname;
    if (!phoneAlt) return nameAlt || '';
    return nameAlt ? `${nameAlt} (+${phoneAlt})` : `+${phoneAlt}`;
}

// The notice template: bot.denied.message or, if empty, the bot language's default text
const noticeModel = () => getSetting('bot.denied.message').trim() || t('mensagens.negadoPadrao');

// The notice text, with $cmd and $admin replaced
function noticeText(cmd) {
    return noticeModel()
        .replace(/\$cmd\b/g, cmd)
        .replace(/\$admin\b/g, botOwner());
}

/**
 * Notifies whoever typed a command they cannot use (if the notice is on and was not repeated recently).
 * @returns {Promise<boolean>} true if it replied
 */
async function notifyWithoutPermission(msg, cmd, who, nowAlt = Date.now()) {
    if (!getSetting('bot.denied.enabled')) return false;

    const wait = getSetting('bot.denied.interval') * 60 * 1000;
    const keyAlt = `${who}|${msg.from}`;
    const last = notified.get(keyAlt);
    notified.set(keyAlt, nowAlt);
    if (last !== undefined && nowAlt - last < wait) return false;
    // Whoever has not tried anything else for a long time leaves memory
    for (const [k, when] of notified) if (nowAlt - when > Math.max(wait, 60 * 60 * 1000)) notified.delete(k);

    await msg.reply(noticeText(cmd));
    return true;
}

module.exports = { notified, notifyWithoutPermission, noticeModel, noticeText };
