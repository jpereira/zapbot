/*
 * Comando /sticker.
 */

const { MessageMedia } = require('whatsapp-web.js');
const { baixarMidia } = require('./get');

const { printError } = require('../log');
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

    // Antes do -txt (depois dele é o texto): opções e URL do vídeo não combinam com ele
    const antes = m ? resto.slice(0, m.index) : '';

    return {
        comTexto: Boolean(m),
        comVideo: /(^|\s)(-(ss|es|startSec|endSec|v|verbose)(\s|$)|https?:\/\/)/i.test(antes),
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

/*
 * /sticker é o /get -sticker: a URL, o link respondido ou a mídia respondida
 * (com -ss, -es e -v). Só o -txt é dele.
 */
async function cmdSticker(ctx) {
    const { msg, args, opts } = ctx;
    const t = lerTexto(args);
    if (t.semTxt) {
        await msg.reply('❌ O -bg e o -fg são do -txt: /sticker -txt "Bom dia!" -bg "#FFFFFF" -fg "#000000"');
        return;
    }
    if (t.comVideo) {
        await msg.reply('❌ O -txt não combina com -ss, -es, -v nem com uma URL: ele faz a figurinha só do texto.');
        return;
    }
    if (t.comTexto) {
        await stickerComTexto(msg, t);
        return;
    }

    await baixarMidia({ ...ctx, opts: { ...opts, opt: { ...opts.opt, sticker: true } } }, { cmd: '/sticker' });
}

module.exports = {
    cmdSticker
};
