/*
 * /antitag: deletes the message of whoever is not an admin and tags many people at once (see src/groupRules.js).
 * /antitag                      → the mode and the minimum number of mentions of this group
 *   /antitag -delete|-warn|-remove|-off   → o mode
 * /antitag -min <n>             → from how many mentions (3 to 1000; default 10)
 */

const { client } = require('../client');
const { t } = require('../i18n');
const { MODES, groupIsAdmin, recordRule, groupRule } = require('../moderation');
const { TAG_MIN_MIN, TAG_MIN_DEFAULT, marksLimit } = require('../groupRules');

async function showAlt(msg, rule, group) {
    const eu = group.participants.find((p) => p.id._serialized === client.info.wid._serialized || p.id.user === client.info.wid.user);
    await msg.reply(t('antitag.status', {
        mode: t(`antilink.mode.${rule.mode}`),
        min: marksLimit(rule.data.min, group.participants.length)
    }) + (rule.mode !== 'off' && !groupIsAdmin(eu) ? `\n${t('antitag.botNotAdmin')}` : ''));
}

async function cmdAntitag({ msg, opts, isGroup }) {
    const group = isGroup ? await msg.getChat().catch(() => null) : null;
    if (!group?.isGroup) {
        await msg.reply(t('grp.onlyGroups'));
        return;
    }

    const chatId = group.id._serialized;
    const rule = await groupRule(chatId, 'antitag');

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
    if (opts.given.has('min')) {
        const n = Number(opts.opt.min);
        if (!Number.isInteger(n) || n < TAG_MIN_MIN || n > 1000) {
            await msg.reply(t('antitag.badMin', { value: opts.opt.min ?? '', min: TAG_MIN_MIN }));
            return;
        }
        rule.data.min = n;
        touched.push(t('antitag.setMin', { n }));
    }

    if (!touched.length) {
        await showAlt(msg, rule, group);
        return;
    }

    rule.data.min ??= TAG_MIN_DEFAULT;
    await recordRule(chatId, 'antitag', rule);
    await msg.reply(touched.join('\n'));
    await showAlt(msg, rule, group);
}

module.exports = { cmdAntitag };
