/*
 * /antibadword: deletes the message of whoever is not an admin and has a word from the group list (see src/groupRules.js).
 * /antibadword                    → the mode and how many words there are
 *   /antibadword -delete|-warn|-remove|-off   → o mode
 * /antibadword -add <word>     → adds to the list (phrase in quotes)
 * /antibadword -rm <word>      → removes from the list
 * /antibadword -list              → shows the words
 */

const { client } = require('../client');
const { t } = require('../i18n');
const { MODES, groupIsAdmin, recordRule, groupRule } = require('../moderation');
const { WORDS_MAX, normalizeWord } = require('../groupRules');

async function showAlt(msg, rule, group, { list = false } = {}) {
    const eu = group.participants.find((p) => p.id._serialized === client.info.wid._serialized || p.id.user === client.info.wid.user);
    const words = rule.data.words ?? [];
    await msg.reply(t('antibadword.status', { mode: t(`antilink.mode.${rule.mode}`), n: words.length }) +
        (list ? `\n${words.length ? words.join(', ') : t('antibadword.empty')}` : '') +
        (rule.mode !== 'off' && !groupIsAdmin(eu) ? `\n${t('antibadword.botNotAdmin')}` : ''));
}

async function cmdAntibadword({ msg, opts, isGroup }) {
    const group = isGroup ? await msg.getChat().catch(() => null) : null;
    if (!group?.isGroup) {
        await msg.reply(t('grp.onlyGroups'));
        return;
    }

    const chatId = group.id._serialized;
    const rule = await groupRule(chatId, 'antibadword');
    rule.data.words ??= [];

    const modes = MODES.filter((m) => opts.given.has(m));
    if (modes.length > 1) {
        await msg.reply(t('antilink.oneMode'));
        return;
    }

    const touched = [];
    if (modes.length) {
        rule.mode = modes[0];
        touched.push(t('antilink.setMode', { mode: t(`antilink.mode.${rule.mode}`) }));
    }

    for (const [optionAlt, puts] of [['add', true], ['rm', false]]) {
        if (!opts.given.has(optionAlt)) continue;
        const word = normalizeWord(opts.opt[optionAlt]);
        if (!word) {
            await msg.reply(t('antibadword.badWord', { value: opts.opt[optionAlt] ?? '' }));
            return;
        }
        const has = rule.data.words.includes(word);
        if (puts && !has) {
            if (rule.data.words.length >= WORDS_MAX) {
                await msg.reply(t('antibadword.full', { max: WORDS_MAX }));
                return;
            }
            rule.data.words.push(word);
        }
        if (!puts) rule.data.words = rule.data.words.filter((p) => p !== word);
        touched.push(t(puts ? 'antibadword.added' : 'antibadword.removedWord', { word: word }));
    }

    if (!touched.length) {
        await showAlt(msg, rule, group, { list: opts.given.has('list') });
        return;
    }

    await recordRule(chatId, 'antibadword', rule);
    await msg.reply(touched.join('\n'));
    await showAlt(msg, rule, group);
}

module.exports = { cmdAntibadword };
