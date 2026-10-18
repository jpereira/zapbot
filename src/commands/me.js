/*
 * /me: sends the typed text. Its {/command}s run and the reply goes in their place,
 * as in /cron and /alias; the typed \n becomes a line break. It goes straight to the chat, without
 * quote the command (without msg.reply). With -repeat|-r <n>, the text is repeated n times, joined,
 * in a single message (the {/command}s run only once).
 */
const { client } = require('../client');
const { sendMedia, commandsError, assembleText, breakLines } = require('../textCommands');

const MAX_REPETITIONS = 30;

async function cmdMe({ msg, args, chatId, chatName, isGroup, admin, podeUsar: canUse, senderContact, senderName, senderNumber }) {
    let times = 1;
    const rest = args.trim().replace(/^-(?:repeat|r)\s+(\S+)(?:\s+|$)/i, (_, n) => {
        times = /^\d+$/.test(n) ? Number(n) : 0;
        return '';
    });
    if (times < 1 || times > MAX_REPETITIONS) {
        return msg.reply(`❌ -repeat precisa de um número de 1 a ${MAX_REPETITIONS}`);
    }

    const textAlt = breakLines(rest);
    if (!textAlt) return msg.reply('❌ Use: /me [-repeat|-r <n>] <mensagem com {/comando}>');

    const errorAlt = commandsError(textAlt, '/me');
    if (errorAlt) return msg.reply(errorAlt);

    const { texto: final, midias: mediaAltAlt } = await assembleText(textAlt,
        { chat_id: chatId, chat_name: chatName, is_group: isGroup },
        { onde: '/me', quem: { admin, podeUsar: canUse, senderContact, senderName, senderNumber } });

    // assembleText only trims with {/command}: it normalizes and returns the trailing space/line break, so "Haha!\n" repeats as "Haha!\nHaha!\n"
    const buf = (final.trimEnd() + textAlt.match(/\s*$/)[0]).repeat(times);
    if (final) await client.sendMessage(chatId, buf);
    await sendMedia(chatId, mediaAltAlt);
}

module.exports = { cmdMe };
