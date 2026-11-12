/*
 * General constants: directories, time windows, external binaries.
 */

const path = require('path');

// Project root (this file lives in src/): cache/, config/ and package.json are there
const ROOT_DIR = path.join(__dirname, '..');

const BOT_START_TIME = Date.now();

// Maximum time WhatsApp allows deleting for everyone: 68 hours in milliseconds (the retention minimum
// of regular messages and media: 'cache.messageRetentionHours' and 'cache.messageMediaRetentionHours')
const MAX_DELETE_WINDOW = 68 * 60 * 60 * 1000;

// 1 day in milliseconds (retention of deleted ones: setting 'cache.revokedRetentionDays')
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// ZAPBOT_CACHE_DIR swaps the directory of the database and media (the tests use a temporary folder)
const CACHE_DIR = process.env.ZAPBOT_CACHE_DIR || path.join(ROOT_DIR, 'cache');
const DB_PATH = path.join(CACHE_DIR, 'zapbot.db'); // the SQLite database (it was bot_database.db until 2.0.11)
const MEDIA_DIR = path.join(CACHE_DIR, 'media'); // media saved to recover deleted messages
const TMP_DIR = path.join(CACHE_DIR, 'tmp');     // /get temporary files
const BACKUP_DIR = path.join(CACHE_DIR, 'backups'); // database backups (/backup)
const NOTES_DIR = path.join(CACHE_DIR, 'notes');   // note images (/notes)

// The image's (Debian); outside it, PUPPETEER_EXECUTABLE_PATH points to another
const BIN_CHROMIUM = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
const BIN_FFMPEG = '/usr/bin/ffmpeg';
const BIN_FFPROBE = '/usr/bin/ffprobe';
const BIN_YT = '/venv/bin/yt-dlp';

// /get: each yt-dlp/ffmpeg is killed after this time; at most N downloads at the same time
const GET_TIMEOUT_MS = 5 * 60 * 1000;
const GET_MAX_CONCURRENT = 2;

// Link preview (external thumbnail): timeout and download size ceiling
const THUMBNAIL_TIMEOUT_MS = 15 * 1000;
const THUMBNAIL_MAX_BYTES = 10 * 1024 * 1024;

module.exports = {
    DB_PATH,
    BACKUP_DIR,
    NOTES_DIR,
    BIN_CHROMIUM,
    BIN_FFMPEG,
    BIN_FFPROBE,
    BIN_YT,
    BOT_START_TIME,
    CACHE_DIR,
    DAY_MS,
    HOUR_MS,
    GET_MAX_CONCURRENT,
    GET_TIMEOUT_MS,
    MAX_DELETE_WINDOW,
    MEDIA_DIR,
    ROOT_DIR,
    THUMBNAIL_MAX_BYTES,
    THUMBNAIL_TIMEOUT_MS,
    TMP_DIR
};
