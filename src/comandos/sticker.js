/*
 * Comando /sticker.
 */

const { MessageMedia } = require('whatsapp-web.js');
const sharp = require('sharp');

const { printError } = require('../log');
const { stickerMeta } = require('../settings');
const { MAX_CARACTERES, lerCor, stickerDeTexto } = require('../stickerTexto');

/*
 * Figurinha a partir de imagem: recorte quadrado 512x512 enquadrado no MEIO
 * da imagem (sem isto o WhatsApp Web converte sem centralizar). WebP já é
 * figurinha e vai como está; vídeos seguem com a conversão do whatsapp-web.js.
 */
const STICKER_SIZE = 512;
const STICKER_MAX_BYTES = 100 * 1024;          // limite do WhatsApp: figurinha estática
const STICKER_ANIMADO_MAX_BYTES = 500 * 1024;  // limite do WhatsApp: figurinha animada

async function enquadrarSticker(media) {
    if (!media?.mimetype?.startsWith('image/') || media.mimetype === 'image/webp') return media;

    try {
        const animado = media.mimetype === 'image/gif';
        const maxBytes = animado ? STICKER_ANIMADO_MAX_BYTES : STICKER_MAX_BYTES;
        const entrada = Buffer.from(media.data, 'base64');
        let saida;

        // Reduz a qualidade até caber no limite do WhatsApp
        for (const quality of [80, 60, 40, 20]) {
            saida = await sharp(entrada, { animated: animado })
                .rotate() // respeita a orientação EXIF de fotos de celular
                .resize(STICKER_SIZE, STICKER_SIZE, { fit: 'cover', position: 'centre' })
                .webp({ quality })
                .toBuffer();

            if (saida.length <= maxBytes) break;
        }

        return new MessageMedia('image/webp', saida.toString('base64'), 'sticker.webp');
    } catch (err) {
        // Sem o recorte a figurinha ainda sai, só que sem centralizar
        printError('/sticker: falha ao enquadrar a imagem, enviando sem recorte:', err.message);
        return media;
    }
}

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
        await msg.reply("Syntax: Faça um 'reply' utilizando /sticker, ou /sticker -txt \"Bom dia!\" para uma figurinha de texto");
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
    let media = null;

    // Primeiro tenta o thumbnail interno do próprio WhatsApp
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

    // Depois tenta o thumbnail externo
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

    await msg.reply(await enquadrarSticker(media), null, { sendMediaAsSticker: true, ...stickerMeta() });
}

module.exports = {
    cmdSticker
};
