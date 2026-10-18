/*
 * /me: envia o texto digitado. Os {/comando} dele rodam e a resposta entra no lugar,
 * como no /cron e no /alias; o \n digitado vira quebra de linha. Sai direto no chat, sem
 * citar o comando (sem msg.reply). Com -repeat|-r <n>, o texto é repetido n vezes, emendado,
 * numa mensagem só (os {/comando} rodam uma vez só).
 */
const { client } = require('../cliente');
const { enviarMidias, erroDosComandos, montarTexto, quebrarLinhas } = require('../comandosNoTexto');

const MAX_REPETICOES = 30;

async function cmdMe({ msg, args, chatId, chatName, isGroup, admin, podeUsar, senderContact, senderName, senderNumber }) {
    let vezes = 1;
    const resto = args.trim().replace(/^-(?:repeat|r)\s+(\S+)(?:\s+|$)/i, (_, n) => {
        vezes = /^\d+$/.test(n) ? Number(n) : 0;
        return '';
    });
    if (vezes < 1 || vezes > MAX_REPETICOES) {
        return msg.reply(`❌ -repeat precisa de um número de 1 a ${MAX_REPETICOES}`);
    }

    const texto = quebrarLinhas(resto);
    if (!texto) return msg.reply('❌ Use: /me [-repeat|-r <n>] <mensagem com {/comando}>');

    const erro = erroDosComandos(texto, '/me');
    if (erro) return msg.reply(erro);

    const { texto: final, midias } = await montarTexto(texto,
        { chat_id: chatId, chat_name: chatName, is_group: isGroup },
        { onde: '/me', quem: { admin, podeUsar, senderContact, senderName, senderNumber } });

    // O montarTexto só dá trim com {/comando}: normaliza e devolve o espaço/quebra do fim, para "Haha!\n" repetir como "Haha!\nHaha!\n"
    const buf = (final.trimEnd() + texto.match(/\s*$/)[0]).repeat(vezes);
    if (final) await client.sendMessage(chatId, buf);
    await enviarMidias(chatId, midias);
}

module.exports = { cmdMe };
