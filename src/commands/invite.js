/*
 * /invite command: the group invite link (the bot must be an admin of it).
 *   /invite        → o link atual
 *   /invite -revoke → invalida o link atual e gera outro
 */

const { t } = require('../i18n');
const { printError } = require('../log');

const LINK = 'https://chat.whatsapp.com/';

async function cmdInvite({ msg, opts, isGroup }) {
    const group = isGroup ? await msg.getChat().catch(() => null) : null;
    if (!group?.isGroup) {
        await msg.reply(t('grp.onlyGroups'));
        return;
    }

    const revoke = opts.given.has('revoke');
    try {
        const codeAlt = revoke ? await group.revokeInvite() : await group.getInviteCode();
        if (!codeAlt) throw new Error(t('grp.invite.noCode'));
        await msg.reply(t(revoke ? 'grp.invite.revoked' : 'grp.invite.link', { link: `${LINK}${codeAlt}` }));
    } catch (err) {
        printError('/invite:', err.message);
        await msg.reply(t('grp.invite.failed', { error: err.message }));
    }
}

module.exports = { cmdInvite };
