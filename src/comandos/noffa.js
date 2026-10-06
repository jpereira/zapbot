/*
 * Comando /noffa.
 */

const { getCommandSyntax } = require('./base');

async function cmdNoffa({ msg, args, quotedMsg }) {
    const rainbowHearts = ['🌈', '🏳️‍🌈', '🏳️‍⚧️', '🧡', '💛', '💚', '💙', '💜'];

    // Junta o texto digitado ao da mensagem respondida, sem perder palavras pelo caminho.
    const text = [args, quotedMsg?.body].filter(Boolean).join(' ').trim();

    if (!text) {
        await msg.reply('```' + getCommandSyntax('/noffa') + '```');
        return;
    }

    let index = 0;
    let rainbowText = text.replace(/ /g, () => ` ${rainbowHearts[index++ % rainbowHearts.length]} `);

    // A resposta nunca começa com "/": não pode ser lida como comando (ver marcarEnviadaPeloBot)
    if (rainbowText.startsWith('/')) rainbowText = `${rainbowHearts[0]} ${rainbowText}`;

    await msg.reply(rainbowText);
}

module.exports = {
    cmdNoffa
};
