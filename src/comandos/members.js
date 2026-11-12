/*
 * Comando /members.
 */

const { client } = require('../cliente');
const { t } = require('../i18n');
const { nomeDoContato, removeDeviceSuffix, resolveLidToPhone } = require('../contatos');

// /members: membros do grupo (número, nome, admins)
async function cmdMembers({ msg }) {
    const chat = await msg.getChat().catch(() => null);

    if (!chat?.isGroup) {
        await msg.reply(t('grp.onlyGroups'));
        return;
    }

    const linhas = [];

    for (const p of chat.participants) {
        const jid = removeDeviceSuffix(p.id._serialized);
        const phoneJid = jid.endsWith('@lid') ? await resolveLidToPhone(jid) : jid;
        const contato = await client.getContactById(phoneJid || jid).catch(() => null);
        const nome = nomeDoContato(contato) || t('grp.unknown');
        const numero = phoneJid?.endsWith('@c.us') ? `+${phoneJid.split('@')[0]}` : t('grp.hiddenNumber');
        const admin = p.isSuperAdmin ? ' 👑' : p.isAdmin ? ' ⭐' : '';

        linhas.push(`${numero} - ${nome}${admin}`);
    }

    await msg.reply(t('grp.members', { name: chat.name, n: linhas.length, list: linhas.join('\n') }));
}

module.exports = {
    cmdMembers
};
