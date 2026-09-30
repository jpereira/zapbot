/*
 * General constants: directories, time windows, external binaries and the environment (APP_ENV).
 */

const path = require('path');

// Project root (this file lives in src/): cache/, config/ and package.json are there
const ROOT_DIR = path.join(__dirname, '..');

const BOT_START_TIME = Date.now();

// Maximum time WhatsApp allows deleting for everyone: 68 hours in milliseconds
const MAX_DELETE_WINDOW = 68 * 60 * 60 * 1000;

// 1 day in milliseconds (retention of deleted ones: setting 'cache.revokedRetentionDays')
const DAY_MS = 24 * 60 * 60 * 1000;

// ZAPBOT_CACHE_DIR swaps the directory of the database and media (the tests use a temporary folder)
const CACHE_DIR = process.env.ZAPBOT_CACHE_DIR || path.join(ROOT_DIR, 'cache');
const MEDIA_DIR = path.join(CACHE_DIR, 'media'); // media saved to recover deleted messages
const TMP_DIR = path.join(CACHE_DIR, 'tmp');     // /get temporary files

const BIN_FFMPEG = '/usr/bin/ffmpeg';
const BIN_YT = '/venv/bin/yt-dlp';

// /get: each yt-dlp/ffmpeg is killed after this time; at most N downloads at the same time
const GET_TIMEOUT_MS = 5 * 60 * 1000;
const GET_MAX_CONCURRENT = 2;

/*
 * Ambiente
 */
const APP_ENV = process.env.APP_ENV || 'dev';

module.exports = {
    APP_ENV,
    BIN_FFMPEG,
    BIN_YT,
    BOT_START_TIME,
    CACHE_DIR,
    DAY_MS,
    GET_MAX_CONCURRENT,
    GET_TIMEOUT_MS,
    MAX_DELETE_WINDOW,
    MEDIA_DIR,
    ROOT_DIR,
    TMP_DIR
};
