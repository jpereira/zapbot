/*
 * Constantes gerais: diretórios, janelas de tempo, binários externos e o ambiente (APP_ENV).
 */

const path = require('path');

// Raiz do projeto (este arquivo fica em src/): cache/, config/ e package.json ficam lá
const ROOT_DIR = path.join(__dirname, '..');

const BOT_START_TIME = Date.now();

// Tempo máximo que o WhatsApp permite apagar para todos: 68 horas em milissegundos
const MAX_DELETE_WINDOW = 68 * 60 * 60 * 1000;

// 1 dia em milissegundos (retenção das apagadas: setting 'cache.revokedRetentionDays')
const DAY_MS = 24 * 60 * 60 * 1000;

// ZAPBOT_CACHE_DIR troca o diretório do banco e das mídias (os testes usam uma pasta temporária)
const CACHE_DIR = process.env.ZAPBOT_CACHE_DIR || path.join(ROOT_DIR, 'cache');
const MEDIA_DIR = path.join(CACHE_DIR, 'media'); // mídias salvas para recuperar mensagens apagadas
const TMP_DIR = path.join(CACHE_DIR, 'tmp');     // arquivos temporários do /get
const BACKUP_DIR = path.join(CACHE_DIR, 'backups'); // backups do banco (/backup)

// O da imagem (Debian); fora dela, PUPPETEER_EXECUTABLE_PATH aponta outro
const BIN_CHROMIUM = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
const BIN_FFMPEG = '/usr/bin/ffmpeg';
const BIN_YT = '/venv/bin/yt-dlp';

// /get: cada yt-dlp/ffmpeg é morto após este tempo; no máximo N downloads ao mesmo tempo
const GET_TIMEOUT_MS = 5 * 60 * 1000;
const GET_MAX_CONCURRENT = 2;

/*
 * Ambiente
 */
const APP_ENV = process.env.APP_ENV || 'dev';

module.exports = {
    APP_ENV,
    BACKUP_DIR,
    BIN_CHROMIUM,
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
