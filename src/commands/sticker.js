/*
 * Comando /sticker.
 */

const { MessageMedia } = require('whatsapp-web.js');
const sharp = require('sharp');
const { getCommandSyntax } = require('./base');

const { printError } = require('../log');
const { stickerMeta } = require('../settings');
const { MAX_CHARACTERS, readCor, textSticker } = require('../stickerText');

/*
 * Sticker from an image: 512x512 square crop framed in the MIDDLE
 * of the image (without this WhatsApp Web converts without centering). WebP is already
 * sticker and goes as it is; videos keep the whatsapp-web.js conversion.
 */
const STICKER_SIZE = 512;
const STICKER_MAX_BYTES = 100 * 1024;          // WhatsApp limit: static sticker
const STICKER_ANIMATED_MAX_BYTES = 500 * 1024;  // WhatsApp limit: animated sticker

async function fitSticker(media) {
    if (!media?.mimetype?.startsWith('image/') || media.mimetype === 'image/webp') return media;

    try {
        const animated = media.mimetype === 'image/gif';
        const maxBytes = animated ? STICKER_ANIMATED_MAX_BYTES : STICKER_MAX_BYTES;
        const inputAlt = Buffer.from(media.data, 'base64');
        let outputAlt;

        // Lowers the quality until it fits WhatsApp's limit
        for (const quality of [80, 60, 40, 20]) {
            outputAlt = await sharp(inputAlt, { animated: animated })
                .rotate() // respects the EXIF orientation of phone photos
                .resize(STICKER_SIZE, STICKER_SIZE, { fit: 'cover', position: 'centre' })
                .webp({ quality })
                .toBuffer();

            if (outputAlt.length <= maxBytes) break;
        }

        return new MessageMedia('image/webp', outputAlt.toString('base64'), 'sticker.webp');
    } catch (err) {
        // Without the crop the sticker still goes out, just not centered
        printError('/sticker: falha ao enquadrar a imagem, enviando sem recorte:', err.message);
        return media;
    }
}

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

async function cmdSticker({ msg, quotedMsg, args }) {
    const t = readText(args);
    if (t.semTxt) {
        await msg.reply('❌ O -bg e o -fg são do -txt: /sticker -txt "Bom dia!" -bg "#FFFFFF" -fg "#000000"');
        return;
    }
    if (t.comTexto) {
        await stickerWithText(msg, t);
        return;
    }

    if (!quotedMsg) {
        await msg.reply('```' + getCommandSyntax('/sticker') + '```');
        return;
    }

    // 1. Real WhatsApp media
    if (quotedMsg.hasMedia) {
        const media = await fitSticker(await quotedMsg.downloadMedia());
        await msg.reply(media, null, { sendMediaAsSticker: true, ...stickerMeta() });
        return;
    }

    // 2. Link with thumbnail / preview
    if (!quotedMsg.links?.length) {
        await msg.reply('A mensagem respondida não tem mídia nem link.');
        return;
    }

    const link = quotedMsg.links[0].link;
    let media = null;

    // First tries WhatsApp's own internal thumbnail
    const thumbnail =
        quotedMsg._data?.thumbnail ||
        quotedMsg._data?.jpegThumbnail ||
        quotedMsg._data?.body?.jpegThumbnail ||
        null;

    if (thumbnail) {
        let base64;

        if (Buffer.isBuffer(thumbnail)) {
            base64 = thumbnail.toString('base64');
        } else if (Array.isArray(thumbnail)) {
            base64 = Buffer.from(thumbnail).toString('base64');
        } else if (typeof thumbnail === 'string') {
            base64 = thumbnail.replace(/^data:image\/[^;]+;base64,/, '');
        }

        if (base64) {
            media = new MessageMedia('image/jpeg', base64, 'thumbnail.jpg');
        }
    }

    // Then tries the external thumbnail
    if (!media) {
        const thumbnailUrl = quotedMsg._data?.thumbnailUrl || quotedMsg._data?.thumbnailDirectPath || null;

        if (thumbnailUrl?.startsWith('http')) {
            try {
                media = await MessageMedia.fromUrl(thumbnailUrl, { unsafeMime: true });
            } catch (err) {
                printError('Erro baixando thumbnail:', err.message);
            }
        }
    }

    if (!media) {
        await msg.reply(`Não encontrei thumbnail baixável para:\n${link}`);
        return;
    }

    await msg.reply(await fitSticker(media), null, { sendMediaAsSticker: true, ...stickerMeta() });
}

module.exports = {
    cmdSticker
};
