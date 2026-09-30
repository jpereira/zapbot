/*
 * Comando /listageral.
 */

const { client } = require('../cliente');
const { removeDeviceSuffix, resolveLidToPhone } = require('../contatos');

// /listageral: membros do grupo (número, nome, admins)
async function cmdListaGeral({ msg }) {
    const chat = await msg.getChat().catch(() => null);

    if (!chat?.isGroup) {
        await msg.reply('Apenas utilizado dentro de grupos.');
        return;
    }

    const linhas = [];

    for (const p of chat.participants) {
        const jid = removeDeviceSuffix(p.id._serialized);
        const phoneJid = jid.endsWith('@lid') ? await resolveLidToPhone(jid) : jid;
        const contato = await client.getContactById(phoneJid || jid).catch(() => null);
        const nome = contato?.name || contato?.pushname || 'Desconhecido';
        const numero = phoneJid?.endsWith('@c.us') ? `+${phoneJid.split('@')[0]}` : '(número oculto)';
        const admin = p.isSuperAdmin ? ' 👑' : p.isAdmin ? ' ⭐' : '';

        linhas.push(`${numero} - ${nome}${admin}`);
    }

    await msg.reply(`👥 *Membros de ${chat.name}* (${linhas.length})\n\n${linhas.join('\n')}`);
}

module.exports = {
    cmdListaGeral
};
