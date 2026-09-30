/*
 * Comando /noffa.
 */

async function cmdNoffa({ msg, args, quotedMsg }) {
    const rainbowHearts = ['🌈', '🏳️‍🌈', '🏳️‍⚧️', '🧡', '💛', '💚', '💙', '💜'];

    // It used to use only the first word (argv[1]) and produced "undefined" with no argument.
    const text = [args, quotedMsg?.body].filter(Boolean).join(' ').trim();

    if (!text) {
        await msg.reply('Syntax: /noffa <texto> (ou responda uma mensagem)');
        return;
    }

    let index = 0;
    let rainbowText = text.replace(/ /g, () => ` ${rainbowHearts[index++ % rainbowHearts.length]} `);

    // The reply never starts with "/": it must not be read as a command (see markSentByBot)
    if (rainbowText.startsWith('/')) rainbowText = `${rainbowHearts[0]} ${rainbowText}`;

    await msg.reply(rainbowText);
}

module.exports = {
    cmdNoffa
};
