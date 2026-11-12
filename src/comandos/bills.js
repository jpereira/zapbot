/*
 * Comando /bills: sorteio de membros do grupo. O sorteio também é usado pelo /walissu.
 */

const { client } = require('../cliente');
const { t } = require('../i18n');

// Sorteia `n` participantes diferentes (fora o próprio bot)
function sortearParticipantes(participantes, n) {
    const meuUser = client.info?.wid?.user;
    const pool = participantes.filter(p => p.id.user !== meuUser);

    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    return pool.slice(0, n);
}

async function enviarSorteio(msg, chat, sorteados, montarTexto) {
    const mentions = sorteados.map(p => p.id._serialized.split(':')[0]);
    const tags = sorteados.map(p => `@${p.id.user}`);

    await client.sendMessage(chat.id._serialized, montarTexto(tags), {
        mentions,
        quotedMessageId: msg.id._serialized
    });
}

async function cmdBills({ msg }) {
    const chat = await msg.getChat().catch(() => null);

    if (!chat?.isGroup) {
        await msg.reply(t('bills.groupOnly'));
        return;
    }

    const sorteados = sortearParticipantes(chat.participants, 2);

    if (sorteados.length < 2) {
        await msg.reply(t('bills.notEnough'));
        return;
    }

    await enviarSorteio(msg, chat, sorteados, ([a, b]) =>
        t('bills.winners', { a, b })
    );
}

module.exports = {
    cmdBills,
    enviarSorteio,
    sortearParticipantes
};
