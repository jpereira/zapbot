/*
 * Comando /status.
 */

const { client } = require('../client');
const { dbGet, dbRun } = require('../db');
const { t } = require('../i18n');
const { printError, printInfo } = require('../log');
const { getSetting } = require('../settings');

/*
 * /status: posts to the WhatsApp Status (the bot account's "stories").
 * /status <text>              → text status
 * /status [caption], with photo/video (or replying to one) → media status, with the caption
 *
 * Status is a "status@broadcast" channel: whatsapp-web.js sends to it as to a chat.
 * RISK: posting a lot in a row is the kind of automation WhatsApp tends to punish (the account
 * may be banned). Each post stays in the status_posts table and, from status.warnAfter
 * posts in 24 h, the reply carries the warning (it does not block).
 */
const STATUS_ID = 'status@broadcast';
const MAX_TEXT = 700;
const DAY_MS = 24 * 60 * 60 * 1000;

const isMedia = (m) => Boolean(m?.hasMedia) && ['image', 'video'].includes(m.type);

// Records the post and returns how many there were in the last 24 h (including this one)
async function register(chatId, nowAlt = Date.now()) {
    await dbRun('INSERT INTO status_posts (posted_at, chat) VALUES (?, ?)', [nowAlt, chatId ?? null]);
    await dbRun('DELETE FROM status_posts WHERE posted_at < ?', [nowAlt - 7 * DAY_MS]);
    return (await dbGet('SELECT COUNT(*) AS n FROM status_posts WHERE posted_at >= ?', [nowAlt - DAY_MS])).n;
}

async function cmdStatus({ msg, opts, quotedMsg, chatId }) {
    const textAlt = opts.argv.join(' ').trim();
    const origin = [msg, quotedMsg].find(isMedia);

    if (!textAlt && !origin) {
        await msg.reply(t('wstatus.usage'));
        return;
    }
    if (!origin && textAlt.length > MAX_TEXT) {
        await msg.reply(t('wstatus.tooLong', { max: MAX_TEXT, n: textAlt.length }));
        return;
    }

    try {
        if (origin) {
            const mediaAlt = await origin.downloadMedia().catch(() => null);
            if (!mediaAlt?.data) {
                await msg.reply(t('wstatus.download'));
                return;
            }
            await client.sendMessage(STATUS_ID, mediaAlt, textAlt ? { caption: textAlt } : {});
        } else {
            await client.sendMessage(STATUS_ID, textAlt);
        }
    } catch (err) {
        printError('/status:', err.message);
        await msg.reply(t('wstatus.failed', { error: err.message }));
        return;
    }

    const n = await register(chatId);
    printInfo(`/status: postado (${origin ? origin.type : 'texto'}), ${n} nas últimas 24 h`);

    const limitAlt = getSetting('status.warnAfter');
    await msg.reply(t('wstatus.posted') + (n >= limitAlt ? `\n${t('wstatus.risk', { n })}` : ''));
}

module.exports = { STATUS_ID, cmdStatus, register };
