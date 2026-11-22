/*
 * Comando /poll.
 */

const { Poll } = require('whatsapp-web.js');

const { client } = require('../client');
const { t } = require('../i18n');
const { commandUsage } = require('./base');
const { chatCurrentIds } = require('../contacts');
const { pollScoreboard, registerPoll } = require('../polls');

/*
 * /poll [-m] Question | option 1 | option 2 ...
 * Sends a native WhatsApp poll in the chat. Separators: "|" or one per
 * line (the 1st line is the question). -m (or -multi) allows picking several options.
 * -m only counts at the start: in the middle of the text it is part of the question.
 *
 * /poll -r: scoreboard of the chat's most recent poll (or of the poll
 * replied), with who voted for each option. It also only counts at the start.
 */
const POLL_MAX_OPTIONS = 12;
const POLL_MAX_QUESTION = 255;
const POLL_MAX_OPTION = 100;

async function cmdPoll({ msg, args, chatId, chatName, quotedMsg }) {
    let textAlt = String(args ?? '').trim();
    let multi = false;

    if (/^-(r|result)(\s|$)/i.test(textAlt)) {
        const pollId = quotedMsg?.type === 'poll_creation' ? quotedMsg.id._serialized : null;
        await msg.reply(await pollScoreboard({ chatIds: await chatCurrentIds(chatId), pollId }));
        return;
    }

    const flag = textAlt.match(/^-(m|multi)(\s+|$)/i);
    if (flag) {
        multi = true;
        textAlt = textAlt.slice(flag[0].length);
    }

    const partsAlt = (textAlt.includes('|') ? textAlt.split('|') : textAlt.split('\n'))
        .map(p => p.trim())
        .filter(Boolean);

    let [question, ...optionsAlt] = partsAlt;
    const errorAlt = (m) => msg.reply(`❌ ${m}\n\n` + commandUsage('/poll'));

    if (!question || optionsAlt.length < 2) {
        await errorAlt(t('grp.poll.needOptions'));
        return;
    }

    if (optionsAlt.length > POLL_MAX_OPTIONS) {
        await errorAlt(t('grp.poll.maxOptions', { max: POLL_MAX_OPTIONS, n: optionsAlt.length }));
        return;
    }

    if (question.length > POLL_MAX_QUESTION || optionsAlt.some(o => o.length > POLL_MAX_OPTION)) {
        await errorAlt(t('grp.poll.maxLength', { question: POLL_MAX_QUESTION, option: POLL_MAX_OPTION }));
        return;
    }

    // WhatsApp does not accept repeated options
    const repeated = optionsAlt.filter((o, i) => optionsAlt.findIndex(x => x.toLowerCase() === o.toLowerCase()) !== i);
    if (repeated.length) {
        await errorAlt(t('grp.poll.duplicate', { list: [...new Set(repeated)].join(', ') }));
        return;
    }

    // The poll comes back in 'message_create' as yours: it can never look like a command
    if (question.startsWith('/')) question = `📊 ${question}`;

    const sent = await client.sendMessage(chatId, new Poll(question, optionsAlt, { allowMultipleAnswers: multi }));

    // Registered right at creation: -r works before the first vote
    if (sent?.id?._serialized) {
        await registerPoll({ id: sent.id._serialized, chatId, chatName, question, options: optionsAlt, multi });
    }
}

module.exports = {
    cmdPoll
};
