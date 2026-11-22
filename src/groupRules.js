/*
 * /antitag and /antibadword: two moderation rules per group, in the same mold as /antilink (the modes
 * and what to do about the violation are in moderation.js).
 *
 * antitag      deletes the message of whoever is not an admin and tags (@) many people at once: at least
 * `min` people (default 10), or 80% of the group if the group is small (never fewer than 3).
 * antibadword  deletes the message of whoever is not an admin and has a word (or phrase) from the group list,
 * ignoring case, accents and punctuation, and only the whole word ("cu" does not catch
 *                "cuidado").
 */

const { t } = require('./i18n');
const { applyMode, groupRule } = require('./moderation');

const TAG_MIN_DEFAULT = 10;
const TAG_MIN_MIN = 3;
const WORDS_MAX = 100;
const WORD_MAX_CHARACTERS = 40;

// Lowercase, without accents and with punctuation becoming a space: "Você é um IDIOTA!" → "voce e um idiota "
const normalize = (textAlt) => ` ${String(textAlt ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;

// The word for the list, in the comparison format ("Idiota!" → "idiota"); empty or too long: null
function normalizeWord(textAlt) {
    const p = normalize(textAlt).trim();
    return p && p.length <= WORD_MAX_CHARACTERS ? p : null;
}

// The words from the list that appear whole in the text
function wordsProhibited(textAlt, list) {
    const target = normalize(textAlt);
    return list.filter((p) => target.includes(` ${p} `));
}

// How many tags make a message "tagged everyone" in this group
function marksLimit(min, participants) {
    return Math.max(TAG_MIN_MIN, Math.min(min ?? TAG_MIN_DEFAULT, Math.ceil(participants * 0.8)));
}

/**
 * Checks a group message against the two rules. Called by the messages event.
 * @param {object} o  like checkAntilink's
 * @returns {Promise<boolean>} true = a message foi tratada (apagada)
 */
async function checkRules({ msg, chatId, body, dismissed, senderName }) {
    if (dismissed || msg.fromMe || !chatId.endsWith('@g.us') || body.startsWith('/')) return false;

    const marked = msg.mentionedIds?.length ?? 0;
    if (marked >= TAG_MIN_MIN) {
        const { mode, data: dataAlt } = await groupRule(chatId, 'antitag');
        if (mode !== 'off') {
            const group = await msg.getChat().catch(() => null);
            if (group?.isGroup && marked >= marksLimit(dataAlt.min, group.participants.length)) {
                const handled = await applyMode({
                    msg, chatId, mode, senderName,
                    tag: 'Antitag',
                    detail: `${marked} marcações`,
                    deletedNotice: t('antitag.deleted', { name: '{name}' }),
                    removedNotice: t('antitag.removed', { name: '{name}' }),
                    reason: t('antitag.reason')
                });
                if (handled) return true;
            }
        }
    }

    if (body) {
        const { mode, data: dataAlt } = await groupRule(chatId, 'antibadword');
        if (mode !== 'off' && dataAlt.words?.length) {
            const foundAlt3 = wordsProhibited(body, dataAlt.words);
            if (foundAlt3.length) {
                return applyMode({
                    msg, chatId, mode, senderName,
                    tag: 'Antibadword',
                    detail: foundAlt3.join(', '),
                    deletedNotice: t('antibadword.deleted', { name: '{name}' }),
                    removedNotice: t('antibadword.removed', { name: '{name}' }),
                    reason: t('antibadword.reason')
                });
            }
        }
    }
    return false;
}

module.exports = {
    WORDS_MAX,
    TAG_MIN_MIN,
    TAG_MIN_DEFAULT,
    marksLimit,
    normalizeWord,
    wordsProhibited,
    checkRules
};
