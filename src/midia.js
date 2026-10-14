/*
 * Mídia do /get e do /sticker: os argumentos do ffmpeg, o recorte da figurinha
 * de imagem e a prévia (thumbnail) de um link.
 */

const { MessageMedia } = require('whatsapp-web.js');
const sharp = require('sharp');

const { printError, printInfo } = require('./log');
const { httpGetSeguro } = require('./util/url');
const { THUMBNAIL_MAX_BYTES, THUMBNAIL_TIMEOUT_MS } = require('./constantes');

/*
 * As tentativas da figurinha animada, da melhor para a menor: o /get tenta em
 * ordem até o webp caber no limite do WhatsApp (STICKER_ANIMADO_MAX_BYTES).
 */
const TENTATIVAS_STICKER = [
    { qualidade: 75, fps: 15 },
    { qualidade: 50, fps: 12 },
    { qualidade: 30, fps: 10 },
    { qualidade: 20, fps: 8 }
];

/**
 * @param {object} [sticker]  a tentativa da figurinha (TENTATIVAS_STICKER), com -st
 */
function argsDoFfmpeg(opts, originalFile, outputFile, sticker = TENTATIVAS_STICKER[0]) {
    const isSticker = opts.opt.sticker;  // -sticker  | -st
    const isAudio   = opts.opt.audio;    // -audio    | -a
    const startSec  = opts.opt.startSec; // -startSec | -ss
    const endSec    = opts.opt.endSec;   // -endSec   | -es
    // A entrada é um arquivo local baixado da internet: o ffmpeg não pode abrir
    // rede nem outros protocolos a partir dele (playlists/concat maliciosos)
    const args      = ['-y', '-protocol_whitelist', 'file'];

    if (startSec != null) {
        args.push('-ss', String(startSec));
    }

    args.push('-i', originalFile);

    const duracao = endSec == null ? null : Number(endSec) - Number(startSec ?? 0);
    if (isSticker || duracao != null) {
        args.push('-t', String(isSticker ? Math.min(duracao ?? 6, 6) : duracao));
    }

    if (isAudio) {
        // Somente áudio
        args.push(
            '-vn',
            '-c:a', 'libmp3lame',
            '-b:a', '192k',
            outputFile
        );
    } else if (isSticker) {
        // Sticker animado 512x512 enquadrado no meio do vídeo (como o /sticker):
        // escala até cobrir o quadrado e o crop (centralizado por padrão) corta as sobras.
        // Já sai em webp: um mp4 o whatsapp-web.js converteria de novo, sem limite de
        // tamanho, e o WhatsApp recusa a figurinha acima de 500 KB
        args.push(
            '-vf',
            `fps=${sticker.fps},scale=512:512:force_original_aspect_ratio=increase,crop=512:512,setsar=1`,
            '-an',
            '-c:v', 'libwebp',
            '-lossless', '0',
            '-q:v', String(sticker.qualidade),
            '-compression_level', '6',
            '-loop', '0',
            outputFile
        );
    } else {
        // Vídeo normal
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
 * Figurinha a partir de imagem: recorte quadrado 512x512 enquadrado no MEIO
 * da imagem (sem isto o WhatsApp Web converte sem centralizar). WebP já é
 * figurinha e vai como está; vídeos passam pelo ffmpeg (argsDoFfmpeg).
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

// A prévia que o WhatsApp mostra para o link da mensagem: o thumbnail interno ou o externo
async function thumbnailDoLink(quotedMsg) {
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

        // A URL vem da mensagem de outra pessoa: busca com pin de IP e revalidação
        // de cada redirect, fechando o rebinding/redirect que o isUrlPublica sozinho
        // (usado no MessageMedia.fromUrl) não cobre.
        if (thumbnailUrl?.startsWith('http')) {
            try {
                const { data, headers } = await httpGetSeguro(thumbnailUrl, {
                    responseType: 'arraybuffer',
                    timeout: THUMBNAIL_TIMEOUT_MS,
                    maxContentLength: THUMBNAIL_MAX_BYTES
                });
                const mime = String(headers['content-type'] || 'image/jpeg').split(';')[0];
                media = new MessageMedia(mime, Buffer.from(data).toString('base64'), 'thumbnail.jpg');
            } catch (err) {
                printInfo(`Prévia do link recusada ou indisponível: ${err.message}`);
            }
        }
    }

    return media;
}

module.exports = {
    STICKER_ANIMADO_MAX_BYTES,
    TENTATIVAS_STICKER,
    argsDoFfmpeg,
    enquadrarSticker,
    thumbnailDoLink
};
