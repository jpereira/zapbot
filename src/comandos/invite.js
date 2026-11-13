/*
 * Comando /invite: o link de convite do grupo (o bot precisa ser admin dele).
 *   /invite        → o link atual
 *   /invite -revoke → invalida o link atual e gera outro
 */

const { t } = require('../i18n');
const { printError } = require('../log');

const LINK = 'https://chat.whatsapp.com/';

async function cmdInvite({ msg, opts, isGroup }) {
    const grupo = isGroup ? await msg.getChat().catch(() => null) : null;
    if (!grupo?.isGroup) {
        await msg.reply(t('grp.onlyGroups'));
        return;
    }

    const revogar = opts.given.has('revoke');
    try {
        const codigo = revogar ? await grupo.revokeInvite() : await grupo.getInviteCode();
        if (!codigo) throw new Error(t('grp.invite.noCode'));
        await msg.reply(t(revogar ? 'grp.invite.revoked' : 'grp.invite.link', { link: `${LINK}${codigo}` }));
    } catch (err) {
        printError('/invite:', err.message);
        await msg.reply(t('grp.invite.failed', { error: err.message }));
    }
}

module.exports = { cmdInvite };
