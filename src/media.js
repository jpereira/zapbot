/*
 * /get and /sticker media: the ffmpeg arguments, the sticker crop
 * image and the preview (thumbnail) of a link.
 */

const { MessageMedia } = require('whatsapp-web.js');
const sharp = require('sharp');

const { printError, printInfo } = require('./log');
const { isUrlPublic } = require('./util/url');

function argsDoFfmpeg(opts, originalFile, outputFile) {
    const isSticker = opts.opt.sticker;  // -sticker  | -st
    const isAudio   = opts.opt.audio;    // -audio    | -a
    const startSec  = opts.opt.startSec; // -startSec | -ss
    const endSec    = opts.opt.endSec;   // -endSec   | -es
    // The input is a local file downloaded from the internet: ffmpeg must not open
    // rede nem outros protocolos a partir dele (playlists/concat maliciosos)
    const args      = ['-y', '-protocol_whitelist', 'file'];

    if (startSec != null) {
        args.push('-ss', String(startSec));
    }

    args.push('-i', originalFile);

    const duration = endSec == null ? null : Number(endSec) - Number(startSec ?? 0);
    if (isSticker || duration != null) {
        args.push('-t', String(isSticker ? Math.min(duration ?? 6, 6) : duration));
    }

    if (isAudio) {
        // Audio only
        args.push(
            '-vn',
            '-c:a', 'libmp3lame',
            '-b:a', '192k',
            outputFile
        );
    } else if (isSticker) {
        // 512x512 animated sticker framed in the middle of the video (like /sticker):
        // scales until it covers the square and the crop (centered by default) cuts off the excess
        args.push(
            '-vf',
            'fps=15,scale=512:512:force_original_aspect_ratio=increase,crop=512:512,setsar=1',
            '-an',
            '-c:v', 'libx264',
            '-b:v', '500k',
            '-maxrate', '500k',
            '-bufsize', '1000k',
            '-pix_fmt', 'yuv420p',
            '-profile:v', 'baseline',
            '-movflags', '+faststart',
            outputFile
        );
    } else {
        // Normal video
        args.push(
            '-c:v', 'libx264',
            '-b:v', '800k',
            '-maxrate', '800k',
            '-bufsize', '1600k',
            '-pix_fmt', 'yuv420p',
            '-profile:v', 'baseline',
            '-movflags', '+faststart',
            '-c:a', 'aac',
            outputFile
        );
    }

    return args;
}

/*
 * Sticker from an image: 512x512 square crop framed in the MIDDLE
 * of the image (without this WhatsApp Web converts without centering). WebP is already
 * sticker and goes as it is; videos go through ffmpeg (argsDoFfmpeg).
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

// The preview WhatsApp shows for the message link: the internal thumbnail or the external one
async function thumbnailDoLink(quotedMsg) {
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

        // The URL comes from someone else's message: the /get anti-SSRF applies here too
        if (thumbnailUrl?.startsWith('http') && !(await isUrlPublic(thumbnailUrl))) {
            printInfo(`Prévia do link recusada (endereço não permitido): ${thumbnailUrl}`);
        } else if (thumbnailUrl?.startsWith('http')) {
            try {
                media = await MessageMedia.fromUrl(thumbnailUrl, { unsafeMime: true });
            } catch (err) {
                printError('Erro baixando thumbnail:', err.message);
            }
        }
    }

    return media;
}

module.exports = {
    argsDoFfmpeg,
    fitSticker,
    thumbnailDoLink
};
