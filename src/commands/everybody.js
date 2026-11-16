/*
 * Comando /everybody.
 */

const { client } = require('../client');
const { t } = require('../i18n');
const { printDebug, printError, printSuccess } = require('../log');

async function cmdEverybody({ msg, senderContact }) {
    const groupChat = await msg.getChat().catch(() => null);

    if (!groupChat?.isGroup) {
        await msg.reply(t('grp.onlyGroups'));
        return;
    }

    let text = '';
    const mentions = [];

    for (const participant of groupChat.participants) {
        const cleanId = participant.id._serialized.split(':')[0];

        if (participant.id.user === senderContact?.id?.user) continue;

        if (cleanId && !mentions.includes(cleanId)) {
            mentions.push(cleanId);
            text += `@${participant.id.user} `;
        }
    }

    if (!mentions.length) {
        printDebug('No other participant found to mention.');
        return;
    }

    try {
        await client.sendMessage(groupChat.id._serialized, text, {
            mentions,
            quotedMessageId: msg.id._serialized
        });
        printSuccess('/everybody responded OK');
    } catch (replyError) {
        printError('WhatsApp Web internal error while processing mentions:', replyError.message);
    }
}

module.exports = {
    cmdEverybody
};
