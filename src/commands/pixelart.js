/*
 * Comando /pixelart.
 */

const { MessageMedia } = require('whatsapp-web.js');
const axios = require('axios');
const sharp = require('sharp');

const { DAY_MS } = require('../constants');
const { t } = require('../i18n');
const { printError } = require('../log');
const { getSetting } = require('../settings');

/*
 * /pixelart: random ANSI/ASCII art from 16colo.rs (BBS art scene archive).
 * /pixelart            → from one of the packs in the 'pixelart.packs' setting
 * /pixelart <pack>     → from the given pack (e.g.: chuck-norris-lvl)
 * /pixelart -r         → from any pack in the file
 * /pixelart -y 1996    → from a pack of the year
 * The image comes rendered by the site itself (/x1/<file>.png). Title, artist and
 * group come from the SAUCE record stored at the end of the original file.
 */
const SIXTEEN_URL = 'https://16colo.rs';
const SIXTEEN_API = 'https://api.16colo.rs/v0';
const PIXELART_EXT = /\.(ans|asc|ice|bin|xb|adf|idf|pcb|tnd)$/i;
const PACK_NAME = /^[A-Za-z0-9._-]{1,100}$/;
const WA_HD_MAX_PX = 4096; // largest side accepted by WhatsApp with sendMediaAsHd
const HTTP_TIMEOUT_MS = 15000;

let allOsPacksCache = { at: 0, names: [] };

const draw = (list) => list[Math.floor(Math.random() * list.length)];

// Full list of packs (~800 KB): downloaded at most once a day
async function allOsPacks() {
    if (Date.now() - allOsPacksCache.at < DAY_MS) return allOsPacksCache.names;

    const { data } = await axios.get(`${SIXTEEN_API}/pack`, { timeout: 30000, maxContentLength: 20 * 1024 * 1024 });
    allOsPacksCache = { at: Date.now(), names: data.map(p => p.name).filter(n => PACK_NAME.test(n)) };

    return allOsPacksCache.names;
}

// Forgets the full list (the tests start without it)
function restartPacks() {
    allOsPacksCache = { at: 0, names: [] };
}

async function yearPacks(year) {
    const { data } = await axios.get(`${SIXTEEN_API}/year/${year}`, { timeout: HTTP_TIMEOUT_MS });
    return data.map(p => p.name).filter(n => PACK_NAME.test(n));
}

// null if the pack does not exist (the API answers 200 with [] instead of 404)
async function readPack(pack) {
    try {
        const { data } = await axios.get(`${SIXTEEN_API}/pack/${encodeURIComponent(pack)}`, { timeout: HTTP_TIMEOUT_MS });
        if (!data?.name) return null;

        const arts = (data.files ?? []).filter(f => PIXELART_EXT.test(f.filename) && !/^FILE_ID\./i.test(f.filename));
        return { name: data.name, year: data.year, arts };
    } catch (err) {
        if (err.response?.status === 404) return null;
        throw err;
    }
}

// SAUCE: 128-byte record at the end of the file (title 35, author 20, group 20, date 8)
function readSauce(buf) {
    const i = buf.lastIndexOf('SAUCE00');
    if (i < 0 || buf.length - i < 128) return null;

    const field = (marker, tam) => buf.subarray(i + marker, i + marker + tam).toString('latin1').replace(/\0/g, '').trim();
    const data = field(82, 8);

    return {
        title: field(7, 35),
        author: field(42, 20),
        group: field(62, 20),
        data: /^\d{8}$/.test(data) ? `${data.slice(6, 8)}/${data.slice(4, 6)}/${data.slice(0, 4)}` : ''
    };
}

/*
 * Pixel art suffers from WhatsApp's compression: doubles the size without smoothing
 * (nearest) when it fits the HD limit, and slices art taller than the limit.
 */
async function preparePixelArt(png) {
    const { width, height } = await sharp(png).metadata();
    const scale = Math.max(width, height) * 2 <= WA_HD_MAX_PX ? 2 : 1;
    const base = scale > 1
        ? await sharp(png).resize(width * scale, height * scale, { kernel: 'nearest' }).png().toBuffer()
        : png;

    const heightAlt = height * scale;
    const partsAlt = [];

    for (let top = 0; top < heightAlt && partsAlt.length < getSetting('pixelart.maxParts'); top += WA_HD_MAX_PX) {
        const h = Math.min(WA_HD_MAX_PX, heightAlt - top);
        partsAlt.push(h === heightAlt ? base : await sharp(base).extract({ left: 0, top, width: width * scale, height: h }).png().toBuffer());
    }

    return { parts: partsAlt, cut: heightAlt > partsAlt.length * WA_HD_MAX_PX };
}

async function cmdPixelArt({ msg, opts }) {
    try {
        let candidates;

        if (opts.opt.random) {
            candidates = await allOsPacks();
        } else if (opts.opt.year !== null) {
            const year = Number(opts.opt.year);
            if (!Number.isInteger(year) || year < 1980 || year > new Date().getFullYear()) {
                await msg.reply(t('pixelart.invalidYear'));
                return;
            }
            candidates = await yearPacks(year);
        } else if (opts.argv[0]) {
            if (!PACK_NAME.test(opts.argv[0])) {
                await msg.reply(t('pixelart.invalidPack'));
                return;
            }
            candidates = [opts.argv[0]];
        } else {
            candidates = getSetting('pixelart.packs');
        }

        if (!candidates.length) {
            await msg.reply(t('pixelart.noPack'));
            return;
        }

        // Drawing among many packs, some only have executables/texts: tries others
        let pack = null;
        for (let attemptAlt = 0; attemptAlt < 5 && !pack?.arts.length; attemptAlt++) {
            pack = await readPack(draw(candidates));
            if (candidates.length === 1) break;
        }

        if (!pack) {
            await msg.reply(t('pixelart.packNotFound', { pack: candidates[0], url: SIXTEEN_URL }));
            return;
        }

        if (!pack.arts.length) {
            await msg.reply(t('pixelart.noArt', { pack: pack.name }));
            return;
        }

        const art = draw(pack.arts);
        const fileAlt = encodeURIComponent(art.filename);
        const page = `${SIXTEEN_URL}/pack/${pack.name}/${fileAlt}`;

        const { data: png } = await axios.get(`${SIXTEEN_URL}/pack/${pack.name}/x1/${fileAlt}.png`, {
            responseType: 'arraybuffer', timeout: HTTP_TIMEOUT_MS, maxContentLength: 20 * 1024 * 1024
        });

        // SAUCE is optional: without it the art comes out with only the file name
        const sauce = await axios.get(`${SIXTEEN_URL}/pack/${pack.name}/raw/${fileAlt}`, { responseType: 'arraybuffer', timeout: HTTP_TIMEOUT_MS })
            .then(({ data }) => readSauce(Buffer.from(data)))
            .catch(() => null);

        const { parts: partsAlt, cut } = await preparePixelArt(Buffer.from(png));

        const authorship = [sauce?.author, sauce?.group].filter(Boolean).join(' / ');
        let captionAlt = `🎨 *${sauce?.title || art.filename}*\n`;
        if (authorship) captionAlt += `👤 ${authorship}\n`;
        captionAlt += `📦 ${pack.name} (${sauce?.data || pack.year})\n🔗 ${page}`;
        if (partsAlt.length > 1) captionAlt += `${t('pixelart.part1', { total: partsAlt.length })}${cut ? t('pixelart.cropped') : ''}`;

        for (const [i, part] of partsAlt.entries()) {
            const media = new MessageMedia('image/png', part.toString('base64'), `${art.filename}.png`);
            await msg.reply(media, null, {
                caption: i === 0 ? captionAlt : t('pixelart.partN', { i: i + 1, total: partsAlt.length }),
                sendMediaAsHd: true,
                linkPreview: false
            });
        }
    } catch (err) {
        printError('/pixelart:', err.message);
        await msg.reply(t('pixelart.fail'));
    }
}

module.exports = {
    cmdPixelArt,
    readSauce,
    restartPacks
};
