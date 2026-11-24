/*
 * /get on a photo-only post: Instagram metadata comes from yt-dlp, while X photos and post text come from its
 * public syndication endpoint because yt-dlp omits photos from its JSON output. Photos are sent inline.
 */

const { MessageMedia } = require('whatsapp-web.js');

const { BIN_YT } = require('./constants');
const { captureOutput } = require('./util/processes');
const { httpGetSafe } = require('./util/url');

const PHOTOS_MAX = 20;                       // the Instagram carousel goes up to 20
const PHOTO_MAX_BYTES = 100 * 1024 * 1024;
const PHOTO_TIMEOUT_MS = 30 * 1000;
const METADATA_TIMEOUT_MS = 90 * 1000;

function isXUrl(url) {
    try {
        return /(^|\.)x\.com$|(^|\.)twitter\.com$/i.test(new URL(url).hostname);
    } catch {
        return false;
    }
}

function xPostId(url) {
    return new URL(url).pathname.match(/\/(?:status|statuses)\/(\d+)/i)?.[1] ?? null;
}

function xPhotoUrl(item) {
    const raw = item.media_url_https ?? item.media_url;
    if (!raw) return null;
    try {
        const photo = new URL(raw);
        if (photo.protocol !== 'https:' || !/(^|\.)twimg\.com$/i.test(photo.hostname)) return null;
        photo.searchParams.set('name', 'orig');
        return photo.toString();
    } catch {
        return null;
    }
}

async function xPostPhotos(url) {
    const id = xPostId(url);
    if (!id) throw new Error('Não foi possível identificar o post do X.');
    const token = ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
    const endpoint = new URL('https://cdn.syndication.twimg.com/tweet-result');
    endpoint.searchParams.set('id', id);
    endpoint.searchParams.set('token', token);
    const response = await httpGetSafe(endpoint.toString(), {
        headers: { 'User-Agent': 'Googlebot', Accept: 'application/json' },
        timeout: METADATA_TIMEOUT_MS,
        maxContentLength: 2 * 1024 * 1024
    });
    const post = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    const tweet = post.retweeted_tweet ?? post;
    const media = tweet.mediaDetails ?? tweet.extended_entities?.media ?? [];
    const photos = media.filter(item => item.type === 'photo').map(xPhotoUrl).filter(Boolean);
    return {
        photos: photos.slice(0, PHOTOS_MAX),
        total: photos.length,
        text: String(tweet.full_text ?? tweet.text ?? post.full_text ?? post.text ?? '').trim()
    };
}

/**
 * The photos (URL of the largest of each item) and the text of a post. Items with video are left out: they belong to the normal download.
 * @param {string} url
 * @param {string[]} argsDeCookies  the yt-dlp cookies (cache/cookies.txt), if any
 * @returns {Promise<{ photos: string[], text: string, total: number }>}
 */
async function postPhotos(url, argsDeCookies = []) {
    if (isXUrl(url)) return xPostPhotos(url);

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
        photos: photos.slice(0, PHOTOS_MAX),
        total: photos.length,
        text: String(post.description ?? items[0]?.description ?? '').trim()
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
