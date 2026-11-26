/*
 * The thumbnails of the media gallery: a frame of each video (ffmpeg, at 1 s, or at the start of a shorter one) with
 * its duration (ffprobe), and a small copy of each big picture (sharp), so a page of the grid does not download 60
 * whole photos and videos. Made on the first look and kept in cache/tmp/thumbs, named by the file, its size and
 * its date (a file that changes gets a new one; /cache -tmp clears them and they are made again).
 */

const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');

const { BIN_FFMPEG, BIN_FFPROBE, MEDIA_DIR, TMP_DIR } = require('../constants');
const { dbGet } = require('../db');
const { printError } = require('../log');
const { captureOutput, runCommand } = require('../util/processes');

const THUMBS_DIR = path.join(TMP_DIR, 'thumbs');
const SIZE = 360;
const SMALL_PICTURE = 80 * 1024; // a picture this small is its own thumbnail
const TIMEOUT_MS = 20_000;
const PARALLEL = 2;

// At most PARALLEL made at the same time (a page of videos does not start 60 ffmpegs), one per file
let running = 0;
const waiting = [];
const making = new Map();
async function limited(fn) {
    if (running >= PARALLEL) await new Promise(resolve => waiting.push(resolve));
    running++;
    try {
        return await fn();
    } finally {
        running--;
        waiting.shift()?.();
    }
}

// The name of a file's thumbnail: its path, size and date
const keyOf = (file, stat) => crypto.createHash('sha1').update(`${file}:${stat.size}:${stat.mtimeMs}`).digest('hex').slice(0, 24);

// The duration of the videos (seconds), from the .json beside each thumbnail
const durations = new Map();
function durationOf(file, info) {
    if (!info) return null;
    const key = keyOf(file, { size: info.size, mtimeMs: info.mtime });
    if (durations.has(key)) return durations.get(key);
    try {
        const { duration } = JSON.parse(fs.readFileSync(path.join(THUMBS_DIR, `${key}.json`), 'utf8'));
        durations.set(key, duration);
        return duration;
    } catch {
        return null;
    }
}

async function videoFrame(file, out) {
    const duration = Number(await captureOutput(BIN_FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], TIMEOUT_MS).catch(() => NaN));
    const at = Number.isFinite(duration) && duration < 2 ? '0' : '1';
    // the input is a file of the cache: no network nor other protocols from inside it
    await runCommand(BIN_FFMPEG, ['-y', '-protocol_whitelist', 'file', '-ss', at, '-i', file, '-frames:v', '1', '-vf', `scale=${SIZE}:-2`, '-q:v', '5', out], 'ignore', TIMEOUT_MS);
    return Number.isFinite(duration) ? Math.round(duration) : null;
}

/**
 * The thumbnail of a message's media: { file, mime } (a small picture may be the file itself), or null when it has
 * none (a document, an audio, a sticker, a file that is gone, a frame ffmpeg could not read).
 */
async function thumbnail(id) {
    const row = await dbGet('SELECT type, media_path FROM messages WHERE id = ? AND has_media = 1 AND media_path IS NOT NULL', [String(id ?? '')]);
    if (!row || !['image', 'video'].includes(row.type)) return null;
    const file = path.resolve(MEDIA_DIR, row.media_path);
    const root = await fs.realpath(MEDIA_DIR).catch(() => null);
    const real = await fs.realpath(file).catch(() => null);
    if (!root || !real?.startsWith(root + path.sep)) return null;
    const stat = await fs.stat(real).catch(() => null);
    if (!stat?.isFile()) return null;
    if (row.type === 'image' && stat.size <= SMALL_PICTURE) return { file: real, mime: null };

    const key = keyOf(file, stat);
    const out = path.join(THUMBS_DIR, `${key}.jpg`);
    if (await fs.pathExists(out)) return { file: out, mime: 'image/jpeg' };
    if (!making.has(key)) {
        making.set(key, limited(async () => {
            await fs.ensureDir(THUMBS_DIR);
            const partial = `${out}.${process.pid}.part.jpg`;
            try {
                if (row.type === 'video') {
                    const duration = await videoFrame(real, partial);
                    durations.set(key, duration);
                    await fs.writeJson(path.join(THUMBS_DIR, `${key}.json`), { duration });
                } else {
                    await fs.writeFile(partial, await sharp(real).rotate().resize(SIZE, SIZE, { fit: 'cover' }).jpeg({ quality: 72 }).toBuffer());
                }
                if (!(await fs.stat(partial).catch(() => null))?.size) return false;
                await fs.rename(partial, out);
                return true;
            } catch (err) {
                printError(`Thumbnail of ${path.basename(file)}:`, err.message);
                return false;
            } finally {
                await fs.remove(partial).catch(() => {});
                making.delete(key);
            }
        }));
    }
    return (await making.get(key)) ? { file: out, mime: 'image/jpeg' } : null;
}

module.exports = { THUMBS_DIR, durationOf, keyOf, thumbnail };
