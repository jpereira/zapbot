/*
 * Comando /members.
 */

const { client } = require('../client');
const { contactName, removeDeviceSuffix, resolveLidToPhone } = require('../contacts');

// /members: group members (number, name, admins)
async function cmdMembers({ msg }) {
    const chat = await msg.getChat().catch(() => null);

    if (!chat?.isGroup) {
        await msg.reply('Apenas utilizado dentro de grupos.');
        return;
    }

    const linesAlt = [];

    for (const p of chat.participants) {
        const jid = removeDeviceSuffix(p.id._serialized);
        const phoneJid = jid.endsWith('@lid') ? await resolveLidToPhone(jid) : jid;
        const contactAlt = await client.getContactById(phoneJid || jid).catch(() => null);
        const nameAlt = contactName(contactAlt) || 'Desconhecido';
        const numberAlt = phoneJid?.endsWith('@c.us') ? `+${phoneJid.split('@')[0]}` : '(número oculto)';
        const admin = p.isSuperAdmin ? ' 👑' : p.isAdmin ? ' ⭐' : '';

        linesAlt.push(`${numberAlt} - ${nameAlt}${admin}`);
    }

    await msg.reply(`👥 *Membros de ${chat.name}* (${linesAlt.length})\n\n${linesAlt.join('\n')}`);
}

module.exports = {
    cmdMembers
};
