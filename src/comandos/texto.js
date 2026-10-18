/*
 * /texto: envia o texto digitado. Os {/comando} dele rodam e a resposta entra no lugar,
 * como no /cron e no /alias; o \n digitado vira quebra de linha. Sai direto no chat, sem
 * citar o comando (sem msg.reply).
 */
const { client } = require('../cliente');
const { enviarMidias, erroDosComandos, montarTexto, quebrarLinhas } = require('../comandosNoTexto');

async function cmdTexto({ msg, args, chatId, chatName, isGroup, admin, podeUsar, senderContact, senderName, senderNumber }) {
    const texto = quebrarLinhas(args.trim());
    if (!texto) return msg.reply('❌ Use: /texto <mensagem com {/comando}>');

    const erro = erroDosComandos(texto, '/texto');
    if (erro) return msg.reply(erro);

    const { texto: final, midias } = await montarTexto(texto,
        { chat_id: chatId, chat_name: chatName, is_group: isGroup },
        { onde: '/texto', quem: { admin, podeUsar, senderContact, senderName, senderNumber } });

    if (final) await client.sendMessage(chatId, final);
    await enviarMidias(chatId, midias);
}

module.exports = { cmdTexto };
