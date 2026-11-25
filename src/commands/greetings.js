/*
 * /welcome and /goodbye commands: each group's join and leave message (see src/greetings.js).
 *   /welcome               → show a deste group
 * /welcome <text>       → turns on with this text ({name} = the person, {group} = the group)
 * /welcome -on           → turns on with the default text
 *   /welcome -off          → desliga
 * /welcome -test         → sends how it would look, with you in place of whoever joins
 */

const {
    MAX_CHARACTERS, deleteGreeting, recordGreeting, readGreeting, assembleText
} = require('../greetings');
const { client } = require('../client');
const { t } = require('../i18n');
const { unescape } = require('../util/format');
const { resolveGroupName } = require('../contacts');

// The command text without the options (preserves the line breaks of what was typed)
const withoutOptions = (args) => args.replace(/(^|\s)-(?:on|off|test|t)(?=\s|$)/g, ' ').trim();

async function cmdGreeting(type, cmd, { msg, args, opts, chatId, isGroup, senderName }) {
    if (!isGroup) {
        await msg.reply(t('grp.onlyGroups'));
        return;
    }
    const typeTxt = t(`saudacoes.kind.${type}`);

    if (opts.given.has('off')) {
        await deleteGreeting(chatId, type);
        await msg.reply(t('saudacoes.off', { kind: typeTxt }));
        return;
    }

    const textAlt = unescape(withoutOptions(args));

    if (opts.given.has('test')) {
        const current = textAlt ? { text: textAlt } : (await readGreeting(chatId, type)) ?? { text: null };
        const group = (await resolveGroupName(chatId).catch(() => null)) ?? chatId.split('@')[0];
        const who = msg.author || client.info.wid._serialized;
        const nameAlt = type === 'welcome' ? `@${who.split('@')[0]}` : senderName;
        await msg.reply(assembleText(type, current, { name: nameAlt, group }), null, type === 'welcome' ? { mentions: [who] } : {});
        return;
    }

    if (textAlt) {
        if (textAlt.length > MAX_CHARACTERS) {
            await msg.reply(t('saudacoes.tooLong', { n: textAlt.length, max: MAX_CHARACTERS }));
            return;
        }
        await recordGreeting(chatId, type, textAlt);
        await msg.reply(t('saudacoes.set', { kind: typeTxt, text: textAlt }));
        return;
    }

    if (opts.given.has('on')) {
        await recordGreeting(chatId, type, null);
        await msg.reply(t('saudacoes.set', { kind: typeTxt, text: t(`saudacoes.${type}Default`) }));
        return;
    }

    const current = await readGreeting(chatId, type);
    if (!current) {
        await msg.reply(t('saudacoes.none', { kind: typeTxt, cmd }));
        return;
    }
    await msg.reply(t('saudacoes.current', { kind: typeTxt, cmd, text: current.text ?? t(`saudacoes.${type}Default`) }));
}

const cmdWelcome = (ctx) => cmdGreeting('welcome', '/welcome', ctx);
const cmdGoodbye = (ctx) => cmdGreeting('goodbye', '/goodbye', ctx);

module.exports = { cmdGoodbye, cmdWelcome };
