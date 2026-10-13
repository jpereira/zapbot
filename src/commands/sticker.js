/*
 * Comando /sticker.
 */

const { MessageMedia } = require('whatsapp-web.js');
const { downloadMedia } = require('./get');

const { printError } = require('../log');
const { stickerMeta } = require('../settings');
const { MAX_CHARACTERS, readCor, textSticker } = require('../stickerText');

/*
 * /sticker -txt <text> [-bg <color>] [-fg <color>]: -bg and -fg take a value
 * each; -txt, the rest (with or without quotes). Colors in #RRGGBB (or #RGB).
 */
function readText(args) {
    let rest = String(args ?? '');
    const remove = (nameAlt) => {
        const m = rest.match(new RegExp(`(^|\\s)-${nameAlt}\\s+("[^"]*"|'[^']*'|\\S+)`, 'i'));
        if (!m) return undefined;
        rest = rest.replace(m[0], ' ');
        return m[2].replace(/^(["'])(.*)\1$/s, '$2');
    };
    const bg = remove('bg');
    const fg = remove('fg');
    const m = rest.match(/(^|\s)-txt(?:\s+([\s\S]*))?$/i);

    return {
        comTexto: Boolean(m),
        texto: (m?.[2] ?? '').trim().replace(/^(["'])(.*)\1$/s, '$2').trim(),
        bg: bg ?? '#FFFFFF',
        fg: fg ?? '#000000',
        semTxt: !m && (bg !== undefined || fg !== undefined)
    };
}

async function stickerWithText(msg, { texto: textAlt, bg: bgTyped, fg: fgTyped }) {
    const [bg, fg] = [readCor(bgTyped), readCor(fgTyped)];
    const errorAlt = !textAlt ? '❌ Informe o texto: /sticker -txt "Bom dia!"'
        : textAlt.length > MAX_CHARACTERS ? `❌ Texto longo demais: até ${MAX_CHARACTERS} caracteres.`
            : !bg ? `❌ -bg: "${bgTyped}" não é uma cor. Use #RRGGBB (ex.: #FFFFFF).`
                : !fg ? `❌ -fg: "${fgTyped}" não é uma cor. Use #RRGGBB (ex.: #000000).`
                    : bg === fg ? '❌ O -bg e o -fg são a mesma cor: o texto não apareceria.'
                        : null;
    if (errorAlt) {
        await msg.reply(errorAlt);
        return;
    }

    try {
        const webp = await textSticker(textAlt, { fg, bg });
        await msg.reply(new MessageMedia('image/webp', webp, 'sticker.webp'), null, { sendMediaAsSticker: true, ...stickerMeta() });
    } catch (err) {
        printError('/sticker -txt:', err.message);
        await msg.reply(`❌ Não consegui gerar a figurinha: ${err.message}`);
    }
}

/*
 * /sticker is /get -sticker: the URL, the replied link or the replied media
 * (with -ss, -es and -v). Only -txt is its own.
 */
async function cmdSticker(ctx) {
    const { msg, args, opts } = ctx;
    const t = readText(args);
    if (t.semTxt) {
        await msg.reply('❌ O -bg e o -fg são do -txt: /sticker -txt "Bom dia!" -bg "#FFFFFF" -fg "#000000"');
        return;
    }
    if (t.comTexto) {
        await stickerWithText(msg, t);
        return;
    }

    await downloadMedia({ ...ctx, opts: { ...opts, opt: { ...opts.opt, sticker: true } } }, { cmd: '/sticker' });
}

module.exports = {
    cmdSticker
};
