/*
 * Comando /sticker.
 */

const { MessageMedia } = require('whatsapp-web.js');
const { downloadMedia } = require('./get');

const { t } = require('../i18n');
const { printError } = require('../log');
const { applyPosShortcuts } = require('../media');
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

    // Before -txt (after it is the text): options and the video URL do not go with it
    const beforeAlt = m ? rest.slice(0, m.index) : '';

    return {
        comTexto: Boolean(m),
        comVideo: /(^|\s)(-(ss|es|startSec|endSec|photo|ph|v|verbose)(\s|$)|https?:\/\/)/i.test(beforeAlt),
        texto: (m?.[2] ?? '').trim().replace(/^(["'])(.*)\1$/s, '$2').trim(),
        bg: bg ?? '#FFFFFF',
        fg: fg ?? '#000000',
        semTxt: !m && (bg !== undefined || fg !== undefined)
    };
}

async function stickerWithText(msg, { texto: textAlt, bg: bgTyped, fg: fgTyped }) {
    const [bg, fg] = [readCor(bgTyped), readCor(fgTyped)];
    const errorAlt = !textAlt ? t('sticker.needText')
        : textAlt.length > MAX_CHARACTERS ? t('sticker.tooLong', { max: MAX_CHARACTERS })
            : !bg ? t('sticker.badBg', { cor: bgTyped })
                : !fg ? t('sticker.badFg', { cor: fgTyped })
                    : bg === fg ? t('sticker.sameColor')
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
        await msg.reply(t('sticker.fail', { erro: err.message }));
    }
}

/*
 * /sticker is /get -sticker: the URL, the replied link or the replied media
 * (with -ss, -es and -v). Only -txt is its own.
 */
async function cmdSticker(ctx) {
    const { msg, args, opts } = ctx;
    if (!applyPosShortcuts(opts)) {
        await msg.reply(t('get.posConflict'));
        return;
    }
    const txt = readText(args);
    if (txt.semTxt) {
        await msg.reply(t('sticker.colorsNeedTxt'));
        return;
    }
    if (txt.comVideo) {
        await msg.reply(t('sticker.txtConflict'));
        return;
    }
    if (txt.comTexto && opts.given.has('pos')) {
        await msg.reply(t('sticker.posConflict'));
        return;
    }
    if (txt.comTexto) {
        await stickerWithText(msg, txt);
        return;
    }

    await downloadMedia({ ...ctx, opts: { ...opts, opt: { ...opts.opt, sticker: true } } }, { cmd: '/sticker' });
}

module.exports = {
    cmdSticker
};
