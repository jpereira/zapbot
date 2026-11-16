/*
 * /get and /sticker media: the ffmpeg arguments, the sticker crop
 * image and the preview (thumbnail) of a link.
 */

const { MessageMedia } = require('whatsapp-web.js');
const sharp = require('sharp');

const { printError, printInfo } = require('./log');
const { httpGetSafe } = require('./util/url');
const { THUMBNAIL_MAX_BYTES, THUMBNAIL_TIMEOUT_MS } = require('./constants');

/*
 * The animated sticker attempts, from best to smallest: /get tries in
 * order until the webp fits WhatsApp's limit (STICKER_ANIMATED_MAX_BYTES).
 */
const ATTEMPTS_STICKER = [
    { qualidade: 75, fps: 15 },
    { qualidade: 50, fps: 12 },
    { qualidade: 30, fps: 10 },
    { qualidade: 20, fps: 8 }
];

/*
 * Where the sticker's square crop goes (-pos): at the top, middle (default) or bottom. In
 * image wider than tall, top = left and bottom = right. `fator` is the fraction of the leftover
 * that is left out before the crop (0, 0.5 or 1); `sharp`, the resize position.
 */
const POSITIONS = {
    topo: { fator: 0, sharp: 'left top' },
    meio: { fator: 0.5, sharp: 'centre' },
    baixo: { fator: 1, sharp: 'right bottom' }
};
const SYNONYMS = { topo: 'topo', cima: 'topo', top: 'topo', meio: 'meio', centro: 'meio', middle: 'meio',
    center: 'meio', baixo: 'baixo', bottom: 'baixo' };

/** "topo" | "cima" | "top" → 'topo' (same for middle and bottom); no value → 'meio'; invalid → null */
const readPosition = (valueAlt) => (valueAlt == null ? 'meio' : SYNONYMS[String(valueAlt).trim().toLowerCase()] ?? null);

/**
 * @param {object} [sticker]  the sticker attempt (ATTEMPTS_STICKER), with -st
 */
function argsDoFfmpeg(opts, originalFile, outputFile, sticker = ATTEMPTS_STICKER[0]) {
    const isSticker = opts.opt.sticker;  // -sticker  | -st
    const { fator: factor } = POSITIONS[readPosition(opts.opt.pos) ?? 'meio']; // -pos
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
        // 512x512 animated sticker framed on the video (like /sticker):
        // scales until it covers the square and the crop cuts off the excess, in the middle or at the top/bottom (-pos).
        // Already comes out as webp: whatsapp-web.js would convert an mp4 again, with no limit of
        // size, and WhatsApp refuses a sticker over 500 KB
        args.push(
            '-vf',
            `fps=${sticker.fps},scale=512:512:force_original_aspect_ratio=increase,` +
                `crop=512:512:(in_w-512)*${factor}:(in_h-512)*${factor},setsar=1`,
            '-an',
            '-c:v', 'libwebp',
            '-lossless', '0',
            '-q:v', String(sticker.qualidade),
            '-compression_level', '6',
            '-loop', '0',
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
 * of the image, or at the top/bottom with -pos (without this WhatsApp Web converts without centering). WebP is already
 * sticker and goes as it is; videos go through ffmpeg (argsDoFfmpeg).
 */
const STICKER_SIZE = 512;
const STICKER_MAX_BYTES = 100 * 1024;          // WhatsApp limit: static sticker
const STICKER_ANIMATED_MAX_BYTES = 500 * 1024;  // WhatsApp limit: animated sticker

async function fitSticker(media, pos = 'meio') {
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
                .resize(STICKER_SIZE, STICKER_SIZE, { fit: 'cover', position: POSITIONS[readPosition(pos) ?? 'meio'].sharp })
                .webp({ quality })
                .toBuffer();

            if (outputAlt.length <= maxBytes) break;
        }

        return new MessageMedia('image/webp', outputAlt.toString('base64'), 'sticker.webp');
    } catch (err) {
        // Without the crop the sticker still goes out, just not centered
        printError('/sticker: failed to frame the image, sending without cropping:', err.message);
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

        // The URL comes from someone else's message: fetch with an IP pin and revalidation
        // of each redirect, closing the rebinding/redirect that isUrlPublic alone
        // (used in MessageMedia.fromUrl) does not cover.
        if (thumbnailUrl?.startsWith('http')) {
            try {
                const { data, headers } = await httpGetSafe(thumbnailUrl, {
                    responseType: 'arraybuffer',
                    timeout: THUMBNAIL_TIMEOUT_MS,
                    maxContentLength: THUMBNAIL_MAX_BYTES
                });
                const mime = String(headers['content-type'] || 'image/jpeg').split(';')[0];
                media = new MessageMedia(mime, Buffer.from(data).toString('base64'), 'thumbnail.jpg');
            } catch (err) {
                printInfo(`Link preview refused or unavailable: ${err.message}`);
            }
        }
    }

    return media;
}

module.exports = {
    STICKER_ANIMATED_MAX_BYTES,
    ATTEMPTS_STICKER,
    argsDoFfmpeg,
    fitSticker,
    readPosition,
    thumbnailDoLink
};
