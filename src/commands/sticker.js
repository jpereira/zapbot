/*
 * Comando /sticker.
 */

const { MessageMedia } = require('whatsapp-web.js');
const { downloadMedia } = require('./get');

const { t } = require('../i18n');
const { printError } = require('../log');
const { stickerMeta } = require('../settings');
const { MAX_CHARACTERS, readColor, textSticker } = require('../stickerText');

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
        withText: Boolean(m),
        withVideo: /(^|\s)(-(ss|es|startSec|endSec|v|verbose)(\s|$)|https?:\/\/)/i.test(beforeAlt),
        text: (m?.[2] ?? '').trim().replace(/^(["'])(.*)\1$/s, '$2').trim(),
        bg: bg ?? '#FFFFFF',
        fg: fg ?? '#000000',
        noTxt: !m && (bg !== undefined || fg !== undefined)
    };
}

async function stickerWithText(msg, { text: textAlt, bg: bgTyped, fg: fgTyped }) {
    const [bg, fg] = [readColor(bgTyped), readColor(fgTyped)];
    const errorAlt = !textAlt ? t('sticker.needText')
        : textAlt.length > MAX_CHARACTERS ? t('sticker.tooLong', { max: MAX_CHARACTERS })
            : !bg ? t('sticker.badBg', { color: bgTyped })
                : !fg ? t('sticker.badFg', { color: fgTyped })
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
        await msg.reply(t('sticker.fail', { error: err.message }));
    }
}

/*
 * /sticker is /get -sticker: the URL, the replied link or the replied media
 * (with -ss, -es and -v). Only -txt is its own.
 */
async function cmdSticker(ctx) {
    const { msg, args, opts } = ctx;
    const txt = readText(args);
    if (txt.noTxt) {
        await msg.reply(t('sticker.colorsNeedTxt'));
        return;
    }
    if (txt.withVideo) {
        await msg.reply(t('sticker.txtConflict'));
        return;
    }
    if (txt.withText && opts.given.has('pos')) {
        await msg.reply(t('sticker.posConflict'));
        return;
    }
    if (txt.withText) {
        await stickerWithText(msg, txt);
        return;
    }

    await downloadMedia({ ...ctx, opts: { ...opts, opt: { ...opts.opt, sticker: true } } }, { cmd: '/sticker' });
}

module.exports = {
    cmdSticker
};
