/*
 * /antilink: deletes the links of whoever is not a group admin (see src/antilink.js).
 * /antilink                  → the mode and the allowed domains of this group
 *   /antilink -delete|-warn|-remove|-off   → o mode
 * /antilink -allow <domain> → allows a domain (with the subdomains)
 * /antilink -deny <domain>  → removes from the allowed list
 */

const { MODES, groupConfig, recordConfig, normalizeDomain } = require('../antilink');
const { client } = require('../client');
const { t } = require('../i18n');

const isAdmin = (p) => Boolean(p?.isAdmin || p?.isSuperAdmin);

async function showAlt(msg, config, group) {
    const eu = group.participants.find((p) => p.id._serialized === client.info.wid._serialized || p.id.user === client.info.wid.user);
    const releasedAlt = config.allowed.length ? config.allowed.join(', ') : t('antilink.noneAllowed');
    await msg.reply(t('antilink.status', { mode: t(`antilink.mode.${config.mode}`), allowed: releasedAlt }) +
        (config.mode !== 'off' && !isAdmin(eu) ? `\n${t('antilink.botNotAdmin')}` : ''));
}

async function cmdAntilink({ msg, opts, isGroup }) {
    const group = isGroup ? await msg.getChat().catch(() => null) : null;
    if (!group?.isGroup) {
        await msg.reply(t('grp.onlyGroups'));
        return;
    }

    const chatId = group.id._serialized;
    const config = await groupConfig(chatId);

    // The modes are options (-off, -delete, -warn, -remove)
    const modes = MODES.filter((m) => opts.given.has(m));
    if (modes.length > 1) {
        await msg.reply(t('antilink.oneMode'));
        return;
    }

    const touched = [];
    if (modes.length) {
        config.mode = modes[0];
        touched.push(t('antilink.setMode', { mode: t(`antilink.mode.${config.mode}`) }));
    }

    for (const [optionAlt, release] of [['allow', true], ['deny', false]]) {
        if (!opts.given.has(optionAlt)) continue;
        const domain = normalizeDomain(opts.opt[optionAlt]);
        if (!domain) {
            await msg.reply(t('antilink.badDomain', { value: opts.opt[optionAlt] ?? '' }));
            return;
        }
        const has = config.allowed.includes(domain);
        if (release && !has) config.allowed.push(domain);
        if (!release) config.allowed = config.allowed.filter((d) => d !== domain);
        touched.push(t(release ? 'antilink.allowed' : 'antilink.denied', { domain: domain }));
    }

    if (!touched.length) {
        await showAlt(msg, config, group);
        return;
    }

    await recordConfig(chatId, config);
    await msg.reply(touched.join('\n'));
    await showAlt(msg, config, group);
}

module.exports = { cmdAntilink };
