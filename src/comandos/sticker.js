/*
 * Comando /sticker.
 */

const { MessageMedia } = require('whatsapp-web.js');
const { getCommandSyntax } = require('./base');

const { printError } = require('../log');
const { enquadrarSticker, thumbnailDoLink } = require('../midia');
const { stickerMeta } = require('../settings');
const { MAX_CARACTERES, lerCor, stickerDeTexto } = require('../stickerTexto');

/*
 * /sticker -txt <texto> [-bg <cor>] [-fg <cor>]: o -bg e o -fg levam um valor
 * cada; o -txt, o resto (com ou sem aspas). Cores em #RRGGBB (ou #RGB).
 */
function lerTexto(args) {
    let resto = String(args ?? '');
    const tirar = (nome) => {
        const m = resto.match(new RegExp(`(^|\\s)-${nome}\\s+("[^"]*"|'[^']*'|\\S+)`, 'i'));
        if (!m) return undefined;
        resto = resto.replace(m[0], ' ');
        return m[2].replace(/^(["'])(.*)\1$/s, '$2');
    };
    const bg = tirar('bg');
    const fg = tirar('fg');
    const m = resto.match(/(^|\s)-txt(?:\s+([\s\S]*))?$/i);

    return {
        comTexto: Boolean(m),
        texto: (m?.[2] ?? '').trim().replace(/^(["'])(.*)\1$/s, '$2').trim(),
        bg: bg ?? '#FFFFFF',
        fg: fg ?? '#000000',
        semTxt: !m && (bg !== undefined || fg !== undefined)
    };
}

async function stickerComTexto(msg, { texto, bg: bgDigitado, fg: fgDigitado }) {
    const [bg, fg] = [lerCor(bgDigitado), lerCor(fgDigitado)];
    const erro = !texto ? '❌ Informe o texto: /sticker -txt "Bom dia!"'
        : texto.length > MAX_CARACTERES ? `❌ Texto longo demais: até ${MAX_CARACTERES} caracteres.`
            : !bg ? `❌ -bg: "${bgDigitado}" não é uma cor. Use #RRGGBB (ex.: #FFFFFF).`
                : !fg ? `❌ -fg: "${fgDigitado}" não é uma cor. Use #RRGGBB (ex.: #000000).`
                    : bg === fg ? '❌ O -bg e o -fg são a mesma cor: o texto não apareceria.'
                        : null;
    if (erro) {
        await msg.reply(erro);
        return;
    }

    try {
        const webp = await stickerDeTexto(texto, { fg, bg });
        await msg.reply(new MessageMedia('image/webp', webp, 'sticker.webp'), null, { sendMediaAsSticker: true, ...stickerMeta() });
    } catch (err) {
        printError('/sticker -txt:', err.message);
        await msg.reply(`❌ Não consegui gerar a figurinha: ${err.message}`);
    }
}

async function cmdSticker({ msg, quotedMsg, args }) {
    const t = lerTexto(args);
    if (t.semTxt) {
        await msg.reply('❌ O -bg e o -fg são do -txt: /sticker -txt "Bom dia!" -bg "#FFFFFF" -fg "#000000"');
        return;
    }
    if (t.comTexto) {
        await stickerComTexto(msg, t);
        return;
    }

    if (!quotedMsg) {
        await msg.reply('```' + getCommandSyntax('/sticker') + '```');
        return;
    }

    // 1. Mídia real do WhatsApp
    if (quotedMsg.hasMedia) {
        const media = await enquadrarSticker(await quotedMsg.downloadMedia());
        await msg.reply(media, null, { sendMediaAsSticker: true, ...stickerMeta() });
        return;
    }

    // 2. Link com thumbnail / preview
    if (!quotedMsg.links?.length) {
        await msg.reply('A mensagem respondida não tem mídia nem link.');
        return;
    }

    const link = quotedMsg.links[0].link;
    const media = await thumbnailDoLink(quotedMsg);

    if (!media) {
        await msg.reply(`Não encontrei thumbnail baixável para:\n${link}`);
        return;
    }

    await msg.reply(await enquadrarSticker(media), null, { sendMediaAsSticker: true, ...stickerMeta() });
}

module.exports = {
    cmdSticker
};
