/*
 * Comando /members.
 */

const { client } = require('../client');
const { t } = require('../i18n');
const { contactName, removeDeviceSuffix, resolveLidToPhone } = require('../contacts');

// /members: group members (number, name, admins)
async function cmdMembers({ msg }) {
    const chat = await msg.getChat().catch(() => null);

    if (!chat?.isGroup) {
        await msg.reply(t('grp.onlyGroups'));
        return;
    }

    const linesAlt = [];

    for (const p of chat.participants) {
        const jid = removeDeviceSuffix(p.id._serialized);
        const phoneJid = jid.endsWith('@lid') ? await resolveLidToPhone(jid) : jid;
        const contactAlt = await client.getContactById(phoneJid || jid).catch(() => null);
        const nameAlt = contactName(contactAlt) || t('grp.unknown');
        const numberAlt = phoneJid?.endsWith('@c.us') ? `+${phoneJid.split('@')[0]}` : t('grp.hiddenNumber');
        const admin = p.isSuperAdmin ? ' 👑' : p.isAdmin ? ' ⭐' : '';

        linesAlt.push(`${numberAlt} - ${nameAlt}${admin}`);
    }

    await msg.reply(t('grp.members', { name: chat.name, n: linesAlt.length, list: linesAlt.join('\n') }));
}

module.exports = {
    cmdMembers
};
