/*
 * /get on a photo-only post (an Instagram carousel, for example): yt-dlp does not download images ("No video
 * formats found"), but with --ignore-no-formats-error -J --no-download it returns the post items, each one
 * with the photos in several sizes (the last is the largest, the original), and the post caption. The bot downloads the
 * photos and sends them all to the chat, the last one with the post text.
 */

const { MessageMedia } = require('whatsapp-web.js');

const { BIN_YT } = require('./constants');
const { captureOutput } = require('./util/processes');
const { httpGetSafe } = require('./util/url');

const PHOTOS_MAX = 20;                       // the Instagram carousel goes up to 20
const PHOTO_MAX_BYTES = 15 * 1024 * 1024;
const PHOTO_TIMEOUT_MS = 30 * 1000;
const METADATA_TIMEOUT_MS = 90 * 1000;

/**
 * The photos (URL of the largest of each item) and the text of a post. Items with video are left out: they belong to the normal download.
 * @param {string} url
 * @param {string[]} argsDeCookies  the yt-dlp cookies (cache/cookies.txt), if any
 * @returns {Promise<{ fotos: string[], texto: string, total: number }>}
 */
async function postPhotos(url, argsDeCookies = []) {
    const outputAlt = await captureOutput(BIN_YT, [
        ...argsDeCookies, '--ignore-no-formats-error', '-J', '--no-download', '--no-warnings', '--', url
    ], METADATA_TIMEOUT_MS);
    const post = JSON.parse(outputAlt.split('\n').at(-1));

    const items = post.entries?.length ? post.entries : [post];
    const photos = items
        .filter((it) => !it.formats?.length)
        .map((it) => it.thumbnails?.at(-1)?.url)
        .filter(Boolean);
    return {
        fotos: photos.slice(0, PHOTOS_MAX),
        total: photos.length,
        texto: String(post.description ?? items[0]?.description ?? '').trim()
    };
}

// Downloads a photo (with the usual anti-SSRF defense: verified IP and revalidated redirects)
async function downloadPhoto(url, indexAlt = 1) {
    const { data, headers } = await httpGetSafe(url, {
        responseType: 'arraybuffer',
        timeout: PHOTO_TIMEOUT_MS,
        maxContentLength: PHOTO_MAX_BYTES
    });
    const mimetype = String(headers?.['content-type'] ?? 'image/jpeg').split(';')[0].trim() || 'image/jpeg';
    return new MessageMedia(mimetype.startsWith('image/') ? mimetype : 'image/jpeg', Buffer.from(data).toString('base64'), `foto-${indexAlt}.jpg`);
}

module.exports = { PHOTOS_MAX, downloadPhoto, postPhotos };
