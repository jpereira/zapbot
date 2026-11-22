/*
 * /me: sends the typed text. Its {/command}s run and the reply goes in their place,
 * as in /cron and /alias; the typed \n becomes a line break. It goes straight to the chat, without
 * quote the command (without msg.reply). With -repeat|-r <n>, the text is repeated n times, joined,
 * in a single message (the {/command}s run only once).
 */
const { client } = require('../client');
const { t } = require('../i18n');
const { commandUsage } = require('./base');
const { unescape } = require('../util/format');
const { getSetting } = require('../settings');
const { sendMedia, commandsError, assembleText, breakLines } = require('../textCommands');

async function cmdMe({ msg, args, chatId, chatName, isGroup, level, admin, canUse, senderContact, senderName, senderNumber }) {
    let times = 1;
    const rest = unescape(args.trim().replace(/^-(?:repeat|r)\s+(\S+)(?:\s+|$)/i, (_, n) => {
        times = /^\d+$/.test(n) ? Number(n) : 0;
        return '';
    }));
    const max = getSetting('me.maxRepeat');
    if (times < 1 || times > max) {
        return msg.reply(t('me.invalidRepeat', { max: max }));
    }

    const textAlt = breakLines(rest);
    if (!textAlt) return msg.reply(commandUsage('/me'));

    const errorAlt = await commandsError(textAlt, '/me');
    if (errorAlt) return msg.reply(errorAlt);

    const { text: final, mediaItems: mediaAltAlt } = await assembleText(textAlt,
        { chat_id: chatId, chat_name: chatName, is_group: isGroup },
        { where: '/me', who: { level, admin, canUse, senderContact, senderName, senderNumber } });

    // assembleText only trims with {/command}: it normalizes and returns the trailing space/line break, so "Haha!\n" repeats as "Haha!\nHaha!\n"
    const buf = (final.trimEnd() + textAlt.match(/\s*$/)[0]).repeat(times);
    if (final) await client.sendMessage(chatId, buf);
    await sendMedia(chatId, mediaAltAlt);
}

module.exports = { cmdMe };
