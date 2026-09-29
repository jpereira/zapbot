const { Client, MessageMedia, LocalAuth, Location } = require('whatsapp-web.js');
const { spawn } = require('child_process');
const util = require('util');
const path = require('path');

const axios = require('axios');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const colors = require('colors');
const fs = require('fs-extra');
const dotenv = require('dotenv');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');

const packageJson = require('./package.json');

// Loads the .env before any process.env read
dotenv.config();

/*
 * Constantes
 */
const BOT_START_TIME = Date.now();
let BOT_AUTHENTICATED_TIME = 0;

// Maximum time WhatsApp allows deleting for everyone: 68 hours in milliseconds
const MAX_DELETE_WINDOW = 68 * 60 * 60 * 1000;

// DELETED messages are kept longer (for /show): 30 days
const REVOKED_RETENTION = 30 * 24 * 60 * 60 * 1000;

// /show: maximum messages per call and interval between sends (avoids flood/ban)
const UNDO_MAX = 20;
const UNDO_DELAY_MS = 700;

const CACHE_DIR = path.join(__dirname, 'cache');
const MEDIA_DIR = path.join(CACHE_DIR, 'media'); // media saved to recover deleted messages
const TMP_DIR = path.join(CACHE_DIR, 'tmp');     // /get temporary files

const BIN_FFMPEG = '/usr/bin/ffmpeg';
const BIN_YT = '/venv/bin/yt-dlp';

const STICKER_META = {
    stickerName: 'ZapBot',
    stickerAuthor: 'https://github.com/jpereira/zapbot/'
};

/*
 * Time and log utilities
 */
function getBotUptime(startedTime) {
    const totalSeconds = Math.floor((Date.now() - startedTime) / 1000);

    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];

    if (days) parts.push(`${days} ${days === 1 ? 'dia' : 'dias'}`);
    if (hours) parts.push(`${hours} ${hours === 1 ? 'hora' : 'horas'}`);
    if (minutes) parts.push(`${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`);
    if (!days && !hours) parts.push(`${seconds} ${seconds === 1 ? 'segundo' : 'segundos'}`);

    return parts.join(', ');
}

function getTimestamp() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');

    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
           `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function getCaller() {
    // [0] Error, [1] getCaller, [2] printX, [3] whoever called printX
    return new Error().stack.split('\n')[3]?.trim()?.replace('at ', '');
}

/*
 * All the print* accept several arguments (like console.log).
 * Before, printError('msg:', err.message) dropped the second argument.
 */
function printDebug(...args) {
    console.log(colors.white(`[${getTimestamp()}] [DEBUG] [${getCaller()}] ${util.format(...args)}`));
}

function printInfo(...args) {
    console.log(colors.yellow(`[${getTimestamp()}] [!] ${util.format(...args)}`));
}

function printSuccess(...args) {
    console.log(colors.green(`[${getTimestamp()}] [+] ${util.format(...args)}`));
}

function printError(...args) {
    console.log(colors.red(`[${getTimestamp()}] [*] [${getCaller()}] ${util.format(...args)}`));
}

function printCall(senderContact, call) {
    console.log(colors.blue(`[${getTimestamp()}] [+] '${senderContact?.pushname}' used '${call}'`));
}

/*
 * Ambiente
 */
const APP_ENV = process.env.APP_ENV || 'dev';

// Case-insensitive comparison: before, "dev" !== "Dev" and debug never turned on.
let isDebugMode = APP_ENV.toLowerCase() === 'dev';

printInfo(`Running in APP_ENV=${APP_ENV} QRCODE_EMAIL_ENABLE=${process.env.QRCODE_EMAIL_ENABLE} isDebugMode=${isDebugMode}`);

/*
 * Database (SQLite)
 */
const dbPath = path.join(CACHE_DIR, 'bot_database.db');
fs.mkdirSync(CACHE_DIR, { recursive: true });

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) return printError('Erro ao conectar ao SQLite:', err.message);
    printInfo(`Conectado com sucesso ao banco de dados SQLite: ${dbPath}`);
});

// Promise versions to use async/await
const dbGet = (sql, params = []) => new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));

const dbAll = (sql, params = []) => new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));

const dbRun = (sql, params = []) => new Promise((resolve, reject) =>
    db.run(sql, params, function (err) { return err ? reject(err) : resolve(this); }));

/*
 * Creation of the tables.
 * All in sequence (await): before, CREATE TABLE might not yet have
 * finished when the first query arrived.
 *
 * Handlers that use the database do `await dbReady` before querying.
 */
async function initializeDb() {
    // History of when the monitored contacts come online
    await dbRun(`
        CREATE TABLE IF NOT EXISTS presence_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone_number TEXT,
            display_name TEXT,
            status TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Numbers monitored via /monitor
    await dbRun(`
        CREATE TABLE IF NOT EXISTS monitored_numbers (
            phone_number TEXT PRIMARY KEY,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Received messages (to recover the deleted ones)
    await dbRun(`
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,

            sender_name TEXT,
            sender_jid TEXT,
            sender_number TEXT,

            chat_id TEXT,
            chat_name TEXT,
            is_group INTEGER DEFAULT 0,

            body TEXT,
            type TEXT,

            timestamp INTEGER,

            has_media INTEGER DEFAULT 0,
            media_path TEXT,

            location_lat REAL,
            location_lng REAL,

            raw_json TEXT,

            revoked INTEGER DEFAULT 0,
            revoked_at INTEGER
        )
    `);

    // /show query: a chat's deleted messages, from most recent to oldest
    await dbRun('CREATE INDEX IF NOT EXISTS idx_messages_chat_revoked ON messages (chat_id, revoked, revoked_at)');

    for (const dir of [MEDIA_DIR, TMP_DIR]) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            printInfo(`Creating ${dir}`);
        }
    }
}

const dbReady = initializeDb().catch((e) => {
    console.error('Bootstrap Erro:', e);
    process.exit(1);
});

/*
 * Command configuration
 */
const botConfig = require('./config/bot-config.json');
const commands = botConfig.commands.map(c => c.cmd);
printSuccess(`Loaded ${commands.length} callers (${commands.join(',')})`);

function findCommand(name) {
    return botConfig.commands.find(c => c.cmd === name || c.aliases?.includes(name));
}

/*
 * QR Code email
 */
const transporter = nodemailer.createTransport({
    host: process.env.QRCODE_EMAIL_SMTP_HOST,
    port: process.env.QRCODE_EMAIL_SMTP_PORT,
    secure: true, // SSL (465)
    auth: {
        user: process.env.QRCODE_EMAIL_SMTP_USER,
        pass: process.env.QRCODE_EMAIL_SMTP_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
});

/*
 * Running external processes (yt-dlp / ffmpeg)
 */
function runCommand(bin, args, logFd) {
    return new Promise((resolve, reject) => {
        const child = spawn(bin, args, { stdio: ['ignore', logFd, logFd] });

        child.on('error', reject);
        child.on('close', code => {
            if (code === 0) return resolve();
            reject(new Error(`${bin} exited with code ${code}`));
        });
    });
}

function extractFirstUrl(text) {
    const m = String(text ?? '').match(/https?:\/\/[^\s"'<>]+/);
    return m ? m[0] : null;
}

function isValidHttpUrl(str) {
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function GetOptFromCommandForFfmpeg(opts, originalFile, outputFile) {
    const isSticker = opts.opt.sticker;  // -sticker  | -st
    const isAudio   = opts.opt.audio;    // -audio    | -a
    const startSec  = opts.opt.startSec; // -startSec | -ss
    const endSec    = opts.opt.endSec;   // -endSec   | -es
    const args      = ['-y'];

    if (startSec != null) {
        args.push('-ss', String(startSec));
    }

    if (isSticker) {
        args.push('-t', '6');
    } else if (startSec != null && endSec != null && Number(endSec) > Number(startSec)) {
        args.push('-t', String(Number(endSec) - Number(startSec)));
    }

    args.push('-i', originalFile);

    if (isAudio) {
        // Audio only
        args.push(
            '-vn',
            '-c:a', 'libmp3lame',
            '-b:a', '192k',
            outputFile
        );
    } else if (isSticker) {
        // Sticker animado 512x512
        args.push(
            '-vf',
            'fps=15,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black',
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
 * Getopt-style option parser
 */
function tokenizeCommand(input) {
    return [...input.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)]
        .map(m => m[1] ?? m[2] ?? m[3]);
}

function normalizeArg(arg) {
    // Fixes the common typo: uol..com.br
    return arg.replace('..com.br', '.com.br');
}

function isOption(token) {
    return token.startsWith('-') && token.length > 1;
}

/*
 * Converts "-ss 10 -a https://..." into:
 *   { opt: { startSec: '10', audio: true, ..., argv: [...] }, argv: ['https://...'] }
 *
 * Options with empty "values" are boolean; with values they expect a value.
 * "-help" / "-h" are added automatically to every command.
 */
function GetOptFromCommand(input, config = {}) {
    const tokens = tokenizeCommand(input);

    // Same array in result.argv and result.opt.argv
    const argv = [];
    const result = { opt: { argv }, argv };

    const commandOptions = [
        { opts: ['help', 'h'], values: [], desc: 'Exibe ajuda.' },
        ...(config.cmd_opts ?? [])
    ];

    // alias -> canonical definition (e.g.: ss -> startSec)
    const optionMap = new Map();

    for (const option of commandOptions) {
        if (!option.opts?.length) continue; // positional argv definitions

        const canonicalName = option.opts[0];
        const expectedValues = (option.values ?? [])
            .filter(v => v != null && String(v).trim() !== '');
        const expectsValue = expectedValues.length > 0;

        result.opt[canonicalName] = expectsValue ? null : false;

        for (const alias of option.opts) {
            optionMap.set(alias, { ...option, canonicalName, expectedValues, expectsValue });
        }
    }

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        // Ignores the command itself (/get, /download...)
        if (i === 0 && token.startsWith('/')) continue;

        if (!isOption(token)) {
            argv.push(normalizeArg(token));
            continue;
        }

        const option = optionMap.get(token.slice(1));

        // An unknown option goes to argv
        if (!option) {
            argv.push(normalizeArg(token));
            continue;
        }

        const { canonicalName } = option;

        if (!option.expectsValue) {
            result.opt[canonicalName] = true;
            continue;
        }

        if (option.expectedValues.length === 1) {
            const nextToken = tokens[i + 1];

            if (nextToken === undefined || isOption(nextToken)) {
                result.opt[canonicalName] = null;
                continue;
            }

            result.opt[canonicalName] = normalizeArg(nextToken);
            i++;
            continue;
        }

        // Option with multiple values
        const values = [];
        for (let x = 0; x < option.expectedValues.length; x++) {
            const nextToken = tokens[i + 1];
            if (nextToken === undefined || isOption(nextToken)) break;
            values.push(normalizeArg(nextToken));
            i++;
        }
        result.opt[canonicalName] = values;
    }

    return result;
}

/**
 * Formats a command's help in the "command -help" style.
 * (There used to be two almost identical functions; now only this one.)
 */
function formatCommandHelp(command) {
    const lines = [`Usage: ${command.usage ?? command.cmd}`];

    if (command.help) lines.push(command.help);

    const cmdOpts = command.cmd_opts ?? [];
    const notEmpty = v => v != null && v !== '';

    const options = cmdOpts
        .filter(o => o?.opts?.length)
        .map(o => {
            const opts = o.opts.filter(Boolean).map(opt => `-${opt}`).join(', ');
            const values = (o.values ?? []).filter(notEmpty).join(' ');
            return { syntax: values ? `${opts} ${values}` : opts, desc: o.desc ?? '' };
        });

    const positional = cmdOpts
        .filter(o => o?.argv?.length)
        .map(o => ({ syntax: o.argv.filter(Boolean).join(' '), desc: o.desc ?? '' }));

    // A single column so Options and Arguments line up
    const width = Math.max(0, ...[...options, ...positional].map(o => o.syntax.length));

    if (options.length) {
        lines.push('', 'Options:');
        options.forEach(o => lines.push(`  ${o.syntax.padEnd(width)}  ${o.desc}`));
    }

    if (positional.length) {
        lines.push('', 'Arguments:');
        positional.forEach(a => lines.push(`  ${a.syntax.padEnd(width)}  ${a.desc}`));
    }

    if (command.aliases?.length) {
        lines.push('', `Aliases: ${command.aliases.join(', ')}`);
    }

    return lines.join('\n');
}

function getCommandSyntax(cmd) {
    const command = findCommand(cmd);
    return command ? formatCommandHelp(command) : null;
}

/*
 * Cache utilities
 */
function getDirSize(dir) {
    let total = 0;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        total += entry.isDirectory() ? getDirSize(fullPath) : fs.statSync(fullPath).size;
    }

    return total;
}

function humanSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function listCacheLevelOnly(dir = CACHE_DIR) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    if (!entries.length) return 'Diretório vazio.\n';

    let totalBytes = 0;

    const rows = entries.map((entry, index) => {
        const fullPath = path.join(dir, entry.name);
        const branch = index === entries.length - 1 ? '└── ' : '├── ';
        const sizeBytes = entry.isDirectory() ? getDirSize(fullPath) : fs.statSync(fullPath).size;

        totalBytes += sizeBytes;

        return {
            name: entry.isDirectory() ? `${branch}📁 ${entry.name}/` : `${branch}${entry.name}`,
            size: humanSize(sizeBytes)
        };
    });

    const maxName = Math.max(...rows.map(r => r.name.length));

    let output = rows
        .map(r => `${r.name.padEnd(maxName)}  ${r.size.padStart(10)}`)
        .join('\n');

    output += '\n';
    output += `${''.padEnd(maxName, '─')} ${'─'.repeat(12)}\n`;
    output += `${'Total:'.padEnd(maxName)}  ${humanSize(totalBytes).padStart(10)}`;

    return output;
}

// Pasta cache/media/ano/mes/dia
function getFolderMedia() {
    const nowAlt = new Date();
    const folderDestination = path.join(
        MEDIA_DIR,
        String(nowAlt.getFullYear()),
        String(nowAlt.getMonth() + 1).padStart(2, '0'),
        String(nowAlt.getDate()).padStart(2, '0')
    );

    fs.mkdirSync(folderDestination, { recursive: true });
    return folderDestination;
}

/*
 * Database + media cleanup:
 * - normal messages: removed after the "delete for everyone" window (68h),
 * because after that they can no longer be deleted;
 * - DELETED messages (revoked=1): kept for REVOKED_RETENTION (30 days),
 * so /show keeps working.
 * With /cache -clean -force, both windows are 0 and everything is removed.
 */
async function cleanCacheOld(maxDeleteWin = MAX_DELETE_WINDOW, retentionDeleted = REVOKED_RETENTION) {
    await dbReady;

    const nowAlt = Date.now();
    const filter = `
        (revoked = 0 AND timestamp < ?)
        OR (revoked = 1 AND COALESCE(revoked_at, timestamp) < ?)
    `;
    const params = [nowAlt - maxDeleteWin, nowAlt - retentionDeleted];

    try {
        const rows = await dbAll(`SELECT media_path FROM messages WHERE media_path IS NOT NULL AND (${filter})`, params);

        for (const row of rows) {
            if (fs.existsSync(row.media_path)) {
                printInfo(`Removendo ${row.media_path}`);
                fs.unlinkSync(row.media_path);
            }
        }

        const res = await dbRun(`DELETE FROM messages WHERE ${filter}`, params);
        if (res.changes > 0) {
            printInfo(`Limpeza: ${res.changes} registros antigos limpos.`);
        }
    } catch (err) {
        printError('Erro na limpeza do cache:', err.message);
    }
}

/*
 * General cleanup (/cache -c -f): ALL messages (including the deleted ones
 * stored for /show), all the media and all the temporaries.
 * At the end, VACUUM gives the space back to the disk: DELETE alone does not shrink the .db.
 * Does not touch monitored_numbers or presence_logs (configuration and history).
 */
async function cleanAll() {
    await dbReady;

    const bytesBefore = getDirSize(CACHE_DIR);
    const { total, apagadas: deletedAlt } = await dbGet(
        'SELECT COUNT(*) AS total, COALESCE(SUM(revoked), 0) AS apagadas FROM messages'
    );

    await dbRun('DELETE FROM messages');
    cleanContentDirectory(MEDIA_DIR);
    cleanContentDirectory(TMP_DIR);
    await dbRun('VACUUM');

    return { total, apagadas: deletedAlt, liberado: Math.max(0, bytesBefore - getDirSize(CACHE_DIR)) };
}

function cleanContentDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
        printInfo(`Diretório não existe: ${dirPath}`);
        return;
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        fs.rmSync(path.join(dirPath, entry.name), { recursive: true, force: true });
    }

    printInfo(`Conteúdo de ${dirPath} removido (${entries.length} itens).`);
}

async function cleanFilesOld(dir = TMP_DIR, maxAgeHours = 2) {
    const now = Date.now();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

    try {
        for (const file of await fs.readdir(dir)) {
            const fullPath = path.join(dir, file);

            try {
                const stat = await fs.stat(fullPath);
                if (!stat.isFile()) continue;

                if (now - stat.mtimeMs > maxAgeMs) {
                    await fs.unlink(fullPath);
                    printInfo(`[cleanup] Deleted: ${fullPath}`);
                }
            } catch (err) {
                printError(`[cleanup] Error processing ${fullPath}:`, err.message);
            }
        }
    } catch (err) {
        printError(`[cleanup] Error reading directory ${dir}:`, err.message);
    }
}

/*
 * Periodic cleanup. It used to run on EVERY received message
 * (a DELETE in SQLite + a folder sweep per message).
 */
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

function runCleanup() {
    cleanCacheOld();
    cleanFilesOld();
}

// First run postponed: on the first boot the tables are still being created.
setTimeout(runCleanup, 60 * 1000);
setInterval(runCleanup, CLEANUP_INTERVAL_MS);

/*
 * Contact utilities
 */
function messageToSelf(message) {
    return client.sendMessage(process.env.PHONE_NUMBER, message)
        .catch(err => printError('messageToSelf falhou:', err.message));
}

function normalizerPhoneNumber(phoneNumber) {
    return String(phoneNumber ?? '').replace(/\D/g, '');
}

function isPhoneNumber(value) {
    const digits = normalizerPhoneNumber(value);
    return digits.length >= 10 && digits.length <= 13;
}

function normalizeWid(wid) {
    if (!wid) return null;
    return `${wid.split('@')[0].split(':')[0]}@c.us`;
}

/**
 * Removes the device identifier (:1, :93 etc.)
 * without changing the original server: @lid stays @lid.
 */
function removeDeviceSuffix(jid) {
    if (!jid || typeof jid !== 'string') return null;

    const atIndex = jid.indexOf('@');
    if (atIndex === -1) return jid;

    const userPart = jid.substring(0, atIndex).split(':')[0];
    const serverPart = jid.substring(atIndex + 1);

    return `${userPart}@${serverPart}`;
}

const lidPhoneCache = new Map();

/**
 * Converts a @lid identifier to the real @c.us phone.
 */
async function resolveLidToPhone(lidJid) {
    const normalizedLid = removeDeviceSuffix(lidJid);

    if (!normalizedLid?.endsWith('@lid')) return normalizedLid;
    if (lidPhoneCache.has(normalizedLid)) return lidPhoneCache.get(normalizedLid);

    try {
        const result = await client.getContactLidAndPhone([normalizedLid]);

        const mapping = Array.isArray(result)
            ? result.find(item => removeDeviceSuffix(item?.lid) === normalizedLid)
            : null;

        let phoneJid = mapping?.pn || null;

        if (phoneJid && !phoneJid.includes('@')) {
            phoneJid = `${phoneJid}@c.us`;
        }

        phoneJid = removeDeviceSuffix(phoneJid);

        if (phoneJid?.endsWith('@c.us')) {
            lidPhoneCache.set(normalizedLid, phoneJid);
            return phoneJid;
        }

        return null;
    } catch (error) {
        printError('[LID] Falha ao converter LID para telefone:', normalizedLid, error?.message || String(error));
        return null;
    }
}

/*
 * main()
 */
const banner = `
*          ____ ____ _____
|_        /_  // __ \`/ __ \\
(O) [@@]   / // /_/ / /_/ /
|#|/|__|\\ /___\\__,_/ .___/
'-' d  b          /_/
`;
console.log(colors.rainbow(banner));
printInfo('🤖 Starting ZapBot...');

const client = new Client({
    authStrategy: new LocalAuth(),

    webVersion: '2.3000.1023151854-alpha',

    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html'
    },

    puppeteer: {
        headless: true,
        // On Windows, remove executablePath and args.
        executablePath: '/usr/bin/chromium-browser',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    }
});

printSuccess('Client created');

/*
 * Connection state + restart with a lock.
 * Before, watchdog, 'disconnected' and startBot() could restart the client
 * at the same time, corrupting the session and generating QR Codes after authentication.
 */
let isReady = false;
let isRestarting = false;
let lastDisconnectReason = null;

// Reasons where restarting does not help: they need manual action.
const NOT_RESTART = new Set(['LOGOUT', 'CONFLICT', 'UNPAIRED', 'UNPAIRED_IDLE']);

async function restartClient(reasonAlt) {
    if (isRestarting) {
        printInfo(`Restart ignorado (já em andamento). Motivo: ${reasonAlt}`);
        return;
    }

    isRestarting = true;
    isReady = false;
    printInfo(`♻️ Reiniciando cliente. Motivo: ${reasonAlt}`);

    try {
        await client.destroy();
    } catch (e) {
        printError('destroy falhou:', e.message);
    }

    await new Promise(r => setTimeout(r, 5000));

    try {
        await client.initialize();
    } catch (e) {
        printError('initialize falhou:', e.message);
    } finally {
        isRestarting = false;
    }
}

// Health check: only after the client is ready
setInterval(async () => {
    if (!isReady || isRestarting) return;

    try {
        await client.getState();
    } catch {
        printInfo('Healthcheck falhou');
    }
}, 30000);

// Watchdog: only watches a client that was already ready and is not restarting
setInterval(async () => {
    if (!isReady || isRestarting) return;

    if (!client.pupBrowser?.isConnected()) {
        await restartClient('browser desconectado (watchdog)');
    }
}, 30000);

/*
 * QR Code
 */
let lastQrSent = null;
let qrEmailSending = false;
let qrEmailCounter = 0;

client.on('qr', async (qr) => {
    const currentdatetimeday =
        new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo', hour12: false }) + ' BRT';

    const emailEnabled = String(process.env.QRCODE_EMAIL_ENABLE).trim().toLowerCase() === 'true';

    printInfo(`[QR] PID=${process.pid} emailEnabled=${emailEnabled}`);

    // Diagnostic: a QR after already authenticating indicates a lost session.
    if (BOT_AUTHENTICATED_TIME > 0 || lastDisconnectReason) {
        printError(
            '⚠️ QR recebido APÓS autenticação.',
            `lastDisconnect=${lastDisconnectReason} restarting=${isRestarting} ready=${isReady}`
        );
    }

    if (!emailEnabled) {
        printInfo(`QR Code received at (${currentdatetimeday}), scan it please`);
        qrcodeTerminal.generate(qr, { small: true });
        return;
    }

    // Ignores the same QR already sent and simultaneous sends
    if (qr === lastQrSent || qrEmailSending) return;

    qrEmailSending = true;

    try {
        const myantiphishing = process.env.QRCODE_EMAIL_SMTP_ANTIPHISHING;
        const pngBuffer = await qrcode.toBuffer(qr, { type: 'png', width: 300 });
        const phoneNumber = process.env.PHONE_NUMBER.split('@')[0];
        const maskPhone = phoneNumber.replace(/(\d{4})\d+(\d{4})$/, '$1XXXX$2');

        // The real counter is only updated after SMTP succeeds
        const nextQrEmailCounter = qrEmailCounter + 1;

        const info = await transporter.sendMail({
            from: process.env.QRCODE_EMAIL_SMTP_FROM,
            to: process.env.QRCODE_EMAIL_SMTP_TO,
            subject: '[ZapBot] WhatsApp QR Code Authentication',
            html: `
                <table width="50%" style="background:#f8f8f8;border:1px solid #dddddd;border-radius:5px;">
                    <tr>
                        <td style="padding:12px;">
                            <strong>🔢 QR Code:</strong>
                            <span style="color:#d9534f;font-weight:bold;">#${nextQrEmailCounter}</span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:12px;">
                            <strong>📱 Phone Number:</strong>
                            <span style="color:#d9534f;font-weight:bold;">${maskPhone}</span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:12px;">
                            <strong>🛡️ Anti-Phishing Code:</strong>
                            <span style="color:#d9534f;font-weight:bold;">${myantiphishing}</span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:12px;">
                            <strong>📅 Generated At:</strong>
                            <span style="color:#000000;font-weight:bold;">${currentdatetimeday}</span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:12px;background:#fff3cd;border:1px solid #ffeeba;">
                            <strong>⚠️ Atenção:</strong>
                            Este QR Code substitui qualquer QR Code enviado anteriormente.
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:12px;">
                            <strong>📱 Escaneie o QR:</strong>
                            <br><br>
                            <img src="cid:qrcode">
                        </td>
                    </tr>
                </table>
            `,
            attachments: [
                {
                    filename: `qrcode-${nextQrEmailCounter}.png`,
                    content: pngBuffer,
                    cid: 'qrcode'
                }
            ]
        });

        lastQrSent = qr;
        qrEmailCounter = nextQrEmailCounter;

        printInfo(
            `QR Code #${qrEmailCounter} received at (${currentdatetimeday}) ` +
            `and sent to '${process.env.QRCODE_EMAIL_SMTP_TO}' (messageId=${info.messageId})`
        );
    } catch (err) {
        printError('Erro ao enviar QR por email:', err);
    } finally {
        qrEmailSending = false;
    }
});

/*
 * Connection events
 */
client.on('authenticated', () => {
    printSuccess('🔐 Whatsapp authentication success!');
    BOT_AUTHENTICATED_TIME = Date.now();

    if (!isDebugMode) return;

    const page = client.pupPage;

    if (!page) {
        printDebug('[WA] pupPage ainda não disponível');
        return;
    }

    page.on('console', msg => console.log('[BROWSER]', msg.type(), msg.text()));
    page.on('pageerror', err => console.error('[BROWSER PAGE ERROR]', err));
    page.on('error', err => console.error('[BROWSER ERROR]', err));
    page.on('requestfailed', request => {
        console.error('[BROWSER REQUEST FAILED]', request.url(), request.failure()?.errorText);
    });

    setTimeout(async () => {
        try {
            const debug = await client.pupPage.evaluate(() => ({
                href: location.href,
                title: document.title,
                readyState: document.readyState,
                WWebJS: typeof window.WWebJS,
                Store: typeof window.Store,
                AuthStore: typeof window.AuthStore,
                requireExists: typeof window.require,
                webpackChunk: typeof window.webpackChunkwhatsapp_web_client
            }));

            console.log('[WA DEBUG]', debug);
        } catch (err) {
            console.error('[WA DEBUG ERROR]', err);
        }
    }, 5000);
});

client.on('disconnected', async (reason) => {
    isReady = false;
    BOT_AUTHENTICATED_TIME = 0;
    lastDisconnectReason = reason;
    printInfo(`💥 WhatsApp desconectou: ${reason}`);

    if (NOT_RESTART.has(String(reason))) {
        printError(`Motivo '${reason}' exige ação manual (outra instância ou sessão revogada). Não vou reiniciar em loop.`);
        return;
    }

    await restartClient(`disconnected: ${reason}`);
});

client.on('loading_screen', (percent, message) => {
    printInfo(`[WA] loading_screen: ${percent}% - ${message}`);
});

client.on('auth_failure', msg => {
    printError('[WA] auth_failure:', msg);
});

client.on('change_state', state => {
    printInfo(`[WA STATE]=${state}`);
});

client.on('ready', () => {
    isReady = true;
    lastDisconnectReason = null;

    printSuccess(`🤖 ZapBot ${packageJson.version} inicializado! Informando ${process.env.PHONE_NUMBER}`);
    messageToSelf(`🤖 ZapBot ${packageJson.version} inicializado.`);
});

/*
 * Presence of the monitored numbers
 */
client.on('presence_update', async (presence) => {
    if (!presence?.id) return;

    const myid = process.env.PHONE_NUMBER;

    try {
        const rawId = presence.id._serialized || presence.id;
        const number = rawId.split('@')[0].split(':')[0];
        const currentStatus = presence.status || (presence.type === 'available' ? 'available' : 'unavailable');

        // This used to send a WhatsApp message for EVERY presence event.
        if (isDebugMode) {
            printDebug(`[Presence] ${number} -> ${currentStatus}`, presence);
        }

        if (currentStatus !== 'available') return;

        const row = await dbGet('SELECT phone_number FROM monitored_numbers WHERE phone_number = ?', [number]);
        if (!row) return;

        const contact = await client.getContactById(normalizeWid(rawId)).catch(() => null);
        const displayName = contact?.pushname || contact?.name || number;

        await dbRun(
            'INSERT INTO presence_logs (phone_number, display_name, status) VALUES (?, ?, ?)',
            [number, displayName, currentStatus]
        );

        if (myid) {
            await client.sendMessage(myid, `🔔 *${displayName}* (${number}) acabou de ficar online.`);
            printSuccess(`Notificação enviada e salva no banco para: ${number}`);
        }
    } catch (error) {
        printError('Erro controlado no evento de presença:', error.message);
    }
});

/*
 * Deleted message recovery
 *
 * The same renderer is used in two places:
 * - event 'message_revoke_everyone' → sends to yourself, right away;
 * - command /show                    → resends in the current chat, on demand.
 */

// Timestamp stored in seconds (WhatsApp) or milliseconds (Date.now())
function paraMs(valueAlt) {
    const n = Number(valueAlt);
    return n < 10_000_000_000 ? n * 1000 : n;
}

function formatData(valueAlt) {
    return new Date(paraMs(valueAlt)).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Finds the chat and sender names of a deleted message.
 * With the event objects (after/before) it gets more precise names;
 * without them (/show) uses what was stored in the database.
 */
async function resolverAuthorDeleted(row, { after, before, protocolKey } = {}) {
    let nameChat = row.chat_name || 'Conversa desconhecida';
    let nameSender = row.sender_name || 'Desconhecido';
    let numberSender = row.sender_number || null;

    // Real name of the chat where the deletion happened
    if (after) {
        try {
            const chat = await after.getChat();
            if (chat?.name) nameChat = chat.name;
        } catch (chatError) {
            printError('[Revoke] Não foi possível recuperar o chat:', chatError.message);
        }
    }

    // Sender from the original message, when available
    if (before) {
        try {
            const contactAlt = await before.getContact();

            nameSender = contactAlt.pushname || contactAlt.name || contactAlt.shortName || nameSender;

            const contactId = contactAlt.id?._serialized || '';

            if (contactId.endsWith('@c.us')) {
                numberSender = contactId.split('@')[0];
            } else if (contactAlt.number) {
                numberSender = contactAlt.number;
            }
        } catch (contactError) {
            printError('[Revoke] Não foi possível recuperar o contato original:', contactError.message);
        }
    }

    // Converts @lid to a real phone, if possible
    const senderId = before?.author || protocolKey?.participant;

    if (senderId?.endsWith('@lid')) {
        const phoneId = await resolveLidToPhone(senderId);

        if (phoneId) {
            numberSender = phoneId.replace('@c.us', '').replace(/\D/g, '');

            const contactAlt = await client.getContactById(phoneId).catch(() => null);
            nameSender = contactAlt?.pushname || contactAlt?.name || contactAlt?.shortName || nameSender;
        }
    }

    return { nomeChat: nameChat, nomeRemetente: nameSender, numeroRemetente: numberSender };
}

/**
 * Sends a deleted message (text, media, location or contact) to `destino`.
 *
 * @param {string} destino              chat that will receive
 * @param {object} row                  row of the messages table
 * @param {object} info                 { nomeChat, nomeRemetente, numeroRemetente }
 * @param {object} [opcoes]
 * @param {string} [opcoes.titulo]      first line of the alert
 * @param {string[]} [opcoes.extras]    extra lines after "Enviada em"
 */
async function sendMessageDeleted(destination, row, info, { titulo: title = '❌ *MENSAGEM APAGADA DETECTADA*', extras = [] } = {}) {
    let alertText = `${title}\n\n`;

    if (row.is_group === 1) {
        alertText += `👥 *Grupo:* ${info.nomeChat}\n`;
    }

    alertText +=
        `👤 *Nome:* ${info.nomeRemetente}\n` +
        `📱 *Número:* ${info.numeroRemetente ? `+${info.numeroRemetente}` : 'Número indisponível'}\n` +
        `📅 *Enviada em:* ${formatData(row.timestamp)}\n`;

    for (const line of extras) {
        alertText += `${line}\n`;
    }

    // Location
    if (row.type === 'location' && row.location_lat !== null && row.location_lng !== null) {
        const latitude = Number(row.location_lat);
        const longitude = Number(row.location_lng);

        alertText +=
            '🗺️ *Tipo:* LOCALIZAÇÃO\n' +
            `🔗 *Link do mapa:* https://www.google.com/maps?q=${latitude},${longitude}`;

        await client.sendMessage(destination, alertText);
        await client.sendMessage(destination, new Location(latitude, longitude, row.body || 'Localização compartilhada'));
        return;
    }

    // Contato / vCard
    if (['vcard', 'contact', 'multi_vcard'].includes(row.type)) {
        alertText +=
            '📇 *Tipo:* CARTÃO DE CONTATO\n' +
            '💡 *Nota:* O contato está anexado abaixo.';

        await client.sendMessage(destination, alertText);

        if (row.body) {
            await client.sendMessage(destination, row.body, { parseVCards: true });
        }
        return;
    }

    // Physical file
    if (row.has_media && row.media_path && fs.existsSync(row.media_path)) {
        const mediaAttachment = MessageMedia.fromFilePath(row.media_path);
        const mimetype = mediaAttachment.mimetype || '';
        const captionAlt = row.body || 'Sem texto';

        if (row.type === 'audio' || row.type === 'ptt' || mimetype.startsWith('audio/')) {
            alertText += '🎵 *Tipo:* ÁUDIO / NOTA DE VOZ';

            await client.sendMessage(destination, alertText);
            await client.sendMessage(destination, mediaAttachment, { sendAudioAsVoice: true });
            return;
        }

        if (row.type === 'video' || row.type === 'image' || mimetype.startsWith('image/') || mimetype.startsWith('video/')) {
            alertText +=
                `🎬 *Tipo:* ${String(row.type).toUpperCase()}\n` +
                `💬 *Legenda:* "${captionAlt}"`;

            await client.sendMessage(destination, mediaAttachment, { caption: alertText });
            return;
        }

        alertText +=
            '📄 *Tipo:* DOCUMENTO\n' +
            `💬 *Legenda:* "${captionAlt}"`;

        await client.sendMessage(destination, mediaAttachment, { caption: alertText, sendMediaAsDocument: true });
        return;
    }

    // Media that existed but the file is no longer on disk
    if (row.has_media) {
        alertText += `📎 *Tipo:* ${String(row.type).toUpperCase()} _(arquivo não disponível no cache)_\n`;
    }

    // Texto
    alertText += `💬 *Texto:* "${row.body || 'Mensagem sem conteúdo'}"`;

    await client.sendMessage(destination, alertText, { linkPreview: true });
}

client.on('message_revoke_everyone', async (after, before) => {
    const protocolKey = after._data?.protocolMessageKey;
    const targetId = protocolKey?.id || before?.id?.id || after?.id?.id;

    if (!targetId) {
        printError('[Revoke] Não foi possível identificar a mensagem apagada.');
        return;
    }

    let row;
    try {
        await dbReady;
        row = await dbGet('SELECT * FROM messages WHERE id = ?', [targetId]);
    } catch (err) {
        printError('[Revoke] Erro ao consultar banco:', err.message);
        return;
    }

    if (!row) {
        printError(`[Revoke] Mensagem apagada ID ${targetId} não encontrada no banco.`);
        return;
    }

    try {
        const info = await resolverAuthorDeleted(row, { after, before, protocolKey });

        // Marks as deleted BEFORE sending: even if the send fails, /show finds it.
        // Also stores the names resolved now, which are more precise than those from receiving.
        await dbRun(
            `UPDATE messages
                SET revoked = 1,
                    revoked_at = ?,
                    chat_name = ?,
                    sender_name = ?,
                    sender_number = COALESCE(?, sender_number)
              WHERE id = ?`,
            [Date.now(), info.nomeChat, info.nomeRemetente, info.numeroRemetente, row.id]
        );

        await sendMessageDeleted(client.info.wid._serialized, row, info);
    } catch (sendError) {
        printError('[Revoke] Erro ao processar item apagado:', sendError.message);
    }
});

/*
 * Initialization
 */
async function startBot() {
    try {
        printInfo('Starting WhatsApp authentication...');
        await client.initialize();
    } catch (error) {
        printError('Erro capturado na inicialização:', error.message);

        // Closes the old browser if it was partially opened
        try {
            printInfo('Fechando instâncias pendentes do navegador...');
            await client.destroy();
        } catch {
            printInfo('Nenhum navegador ativo para destruir.');
        }

        if (error.message.includes('Execution context was destroyed') || error.message.includes('browser is already running')) {
            printInfo('Reiniciando o processo de inicialização em 5 segundos...');
            setTimeout(startBot, 5000);
        }
    }
}

startBot();

/*
 * Command handlers
 */

// Default error reply of the /get and /cache commands
function formatErrorCommand(e) {
    let textAlt = `⚠️💥 ${e.message}.`;

    if (e?.cause?.cmd) textAlt += `\n🛠️ *Cmd*:    ${e.cause.cmd}`;
    if (e?.cause?.inner) textAlt += `\n⛓️‍💥 *Inner*:  ${e.cause.inner.message || e.cause.inner}`;

    return `${textAlt}\n`;
}

async function cmdHelp({ msg, args }) {
    // Reads straight from the text: the option parser discards a first token that starts with "/"
    let requestedCommand = args.split(/\s+/)[0];

    // /help /get  |  /help get
    if (requestedCommand) {
        if (!requestedCommand.startsWith('/')) {
            requestedCommand = `/${requestedCommand}`;
        }

        const command = findCommand(requestedCommand);

        if (!command) {
            await msg.reply(`❌ Comando não encontrado: ${requestedCommand}`);
            return;
        }

        await msg.reply('🤖 *AJUDA*\n\n```' + formatCommandHelp(command) + '\n```');
        return;
    }

    // /help alone: all the commands
    const helpText =
        '🤖 *MENU DE AJUDA*\n\n```' +
        botConfig.commands.map(formatCommandHelp).join('\n\n' + '─'.repeat(50) + '\n\n') +
        '\n```';

    await msg.reply(helpText);
}

async function cmdDebug({ msg, opts }) {
    if (opts.opt.on) isDebugMode = true;
    if (opts.opt.off) isDebugMode = false;

    await msg.reply(isDebugMode ? '🪲 Debug Ativado.' : '🪲 Debug Desativado.');
}

async function cmdUptime({ msg }) {
    const connected = BOT_AUTHENTICATED_TIME ? getBotUptime(BOT_AUTHENTICATED_TIME) : 'não conectado';

    await msg.reply(
        `🤖 *ZapBot ${packageJson.version}*\n` +
        '━━━━━━━━━━━━━━━━━━\n' +
        `⚡ Online: *${getBotUptime(BOT_START_TIME)}*\n` +
        `🔐 Conectado: *${connected}*`
    );
}

async function cmdPing({ msg }) {
    await msg.reply('pong');
}

async function cmdGay({ msg, args, quotedMsg }) {
    const rainbowHearts = ['🌈', '🏳️‍🌈', '🏳️‍⚧️', '🧡', '💛', '💚', '💙', '💜'];

    // It used to use only the first word (argv[1]) and produced "undefined" with no argument.
    const text = [args, quotedMsg?.body].filter(Boolean).join(' ').trim();

    if (!text) {
        await msg.reply('Syntax: /gay <texto> (ou responda uma mensagem)');
        return;
    }

    let index = 0;
    const rainbowText = text.replace(/ /g, () => ` ${rainbowHearts[index++ % rainbowHearts.length]} `);

    await msg.reply(rainbowText);
}

async function cmdCrypto({ msg }) {
    try {
        const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'DOGEUSDT'];

        const { data } = await axios.get('https://api.binance.com/api/v3/ticker/24hr', {
            params: { symbols: JSON.stringify(symbols) },
            timeout: 10000
        });

        const icon = { BTCUSDT: '₿', ETHUSDT: 'Ξ', SOLUSDT: '◎', DOGEUSDT: 'Ð' };

        const fmtPrice = (value) =>
            Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });

        const fmtVolume = (value) => {
            const n = Number(value);
            if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
            if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
            if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
            return `$${n.toFixed(2)}`;
        };

        const pct = (value) => {
            const n = Number(value);
            return `${n >= 0 ? '🟢' : '🔴'} ${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
        };

        const coins = data.map(item => ({
            symbol: item.symbol.replace('USDT', ''),
            icon: icon[item.symbol] || '',
            price: Number(item.lastPrice),
            change: Number(item.priceChangePercent),
            high: Number(item.highPrice),
            low: Number(item.lowPrice),
            volume: Number(item.quoteVolume)
        }));

        const topGainer = [...coins].sort((a, b) => b.change - a.change)[0];

        let text = '🚀 *CRYPTO MARKET*\n\n```\n';

        for (const c of coins) {
            const priceLine = `💰 $${fmtPrice(c.price)}`.padEnd(14);
            const change = pct(c.change).padStart(10);

            text += `${c.icon} ${c.symbol}\n`;
            text += `    ${priceLine}${change}\n`;
            text += `    📈 $${fmtPrice(c.high)}\n`;
            text += `    📉 $${fmtPrice(c.low)}\n`;
            text += `    📊 ${fmtVolume(c.volume)}\n\n`;
        }

        text += '```';
        text += `🔥 *Top:* ${topGainer.icon} ${topGainer.symbol}\n`;
        text += '🟡 Binance\n';
        text += '⚡ Live Market Data';

        await msg.reply(text);
    } catch (error) {
        printError('/crypto:', error.message);
        await msg.reply('❌ Error fetching crypto prices.');
    }
}

async function cmdEveryone({ msg, senderContact }) {
    const groupChat = await msg.getChat().catch(() => null);

    if (!groupChat?.isGroup) {
        await msg.reply('Apenas utilizado dentro de grupos.');
        return;
    }

    let text = '';
    const mentions = [];

    for (const participant of groupChat.participants) {
        const cleanId = participant.id._serialized.split(':')[0];

        if (participant.id.user === senderContact?.id?.user) continue;

        if (cleanId && !mentions.includes(cleanId)) {
            mentions.push(cleanId);
            text += `@${participant.id.user} `;
        }
    }

    if (!mentions.length) {
        printDebug('Nenhum outro participante encontrado para marcar.');
        return;
    }

    try {
        await client.sendMessage(groupChat.id._serialized, text, {
            mentions,
            quotedMessageId: msg.id._serialized
        });
        printSuccess('/everyone responded OK');
    } catch (replyError) {
        printError('Erro interno do WhatsApp Web ao processar menções:', replyError.message);
    }
}

/*
 * /monitor
 * Accepts both the bot-config option style (/monitor -add 5521...)
 * quanto o posicional (/monitor add 5521...).
 * The switch used to use argv[0], which is always "/monitor": no subcommand worked.
 */
async function cmdMonitor({ msg, opts }) {
    let sub = null;
    let target = null;

    for (const s of ['list', 'logs', 'clean']) {
        if (opts.opt[s] === true) sub = s;
    }

    // "-add +55 21 99999-8888": the parser only takes "+55"; the rest of the number falls into argv
    if (typeof opts.opt.add === 'string') { sub = 'add'; target = [opts.opt.add, ...opts.argv].join(' '); }
    if (typeof opts.opt.del === 'string') { sub = 'del'; target = [opts.opt.del, ...opts.argv].join(' '); }

    if (!sub && opts.argv.length) {
        sub = opts.argv[0].toLowerCase();
        target = opts.argv.slice(1).join(' ');
    }

    try {
        switch (sub) {
            case 'logs': {
                const rows = await dbAll(`
                    SELECT pl.phone_number, pl.display_name, pl.status, pl.timestamp
                    FROM presence_logs pl
                    INNER JOIN monitored_numbers mn ON pl.phone_number = mn.phone_number
                    ORDER BY pl.timestamp DESC
                    LIMIT 50
                `);

                if (!rows.length) {
                    await msg.reply('Nenhum histórico encontrado para os números ativos. Use /monitor -list');
                    return;
                }

                let responseText = '📊 *Histórico de Presença (Números Ativos):*\n';
                for (const row of rows) {
                    responseText += `⏱️ *${row.display_name}* ficou online em: _${row.timestamp}_\n`;
                }

                await msg.reply(responseText);
                return;
            }

            case 'list': {
                const rows = await dbAll('SELECT phone_number, timestamp FROM monitored_numbers LIMIT 20');

                if (!rows.length) {
                    await msg.reply('Nenhum número está sendo monitorado.');
                    return;
                }

                let responseText = '📲🔔 *Números Monitorados:*\n\n';
                for (const row of rows) {
                    responseText += `* ${row.phone_number} adicionado em: _${row.timestamp}_\n`;
                }

                await msg.reply(responseText);
                return;
            }

            case 'clean': {
                const res = await dbRun('DELETE FROM monitored_numbers');

                await msg.reply(res.changes === 0
                    ? 'A lista de monitoramento já estava vazia. Nenhum número foi removido.'
                    : `🧼 Faxina concluída! Todos os números foram removidos.\nTotal de números limpos: *${res.changes}*`);
                return;
            }

            case 'add': {
                const phoneNumber = normalizerPhoneNumber(target);

                if (!isPhoneNumber(phoneNumber)) {
                    await msg.reply('Número inválido informado.');
                    return;
                }

                const total = await dbGet('SELECT COUNT(*) AS n FROM monitored_numbers');
                if (total.n >= 20) {
                    await msg.reply('Limite de 20 números monitorados atingido.');
                    return;
                }

                const exists = await dbGet('SELECT phone_number FROM monitored_numbers WHERE phone_number = ?', [phoneNumber]);

                if (exists) {
                    await msg.reply(`🔔 O número ${phoneNumber} já está sendo monitorado.`);
                    return;
                }

                await dbRun('INSERT INTO monitored_numbers (phone_number) VALUES (?)', [phoneNumber]);
                await msg.reply(`🔔 O número ${phoneNumber} agora está sendo monitorado.`);
                printInfo(`O número ${phoneNumber} agora está sendo monitorado.`);
                return;
            }

            case 'del': {
                const phoneNumber = normalizerPhoneNumber(target);

                if (!isPhoneNumber(phoneNumber)) {
                    await msg.reply('Número inválido informado.');
                    return;
                }

                const res = await dbRun('DELETE FROM monitored_numbers WHERE phone_number = ?', [phoneNumber]);

                await msg.reply(res.changes
                    ? `Número ${phoneNumber} removido com sucesso.`
                    : `O número ${phoneNumber} não está sendo monitorado.`);
                return;
            }

            default:
                await msg.reply('```' + getCommandSyntax('/monitor') + '```');
        }
    } catch (err) {
        printError('/monitor:', err.message);
        await msg.reply(`Erro no /monitor: ${err.message}`);
    }
}

async function cmdSticker({ msg, quotedMsg }) {
    if (!quotedMsg) {
        await msg.reply("Syntax: Faça um 'reply' utilizando /sticker");
        return;
    }

    // 1. Real WhatsApp media
    if (quotedMsg.hasMedia) {
        const media = await quotedMsg.downloadMedia();
        await msg.reply(media, null, { sendMediaAsSticker: true, ...STICKER_META });
        return;
    }

    // 2. Link with thumbnail / preview
    if (!quotedMsg.links?.length) {
        await msg.reply('A mensagem respondida não tem mídia nem link.');
        return;
    }

    const link = quotedMsg.links[0].link;
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

        if (thumbnailUrl?.startsWith('http')) {
            try {
                media = await MessageMedia.fromUrl(thumbnailUrl, { unsafeMime: true });
            } catch (err) {
                printError('Erro baixando thumbnail:', err.message);
            }
        }
    }

    if (!media) {
        await msg.reply(`Não encontrei thumbnail baixável para:\n${link}`);
        return;
    }

    await msg.reply(media, null, { sendMediaAsSticker: true, ...STICKER_META });
}

async function cmdGet({ msg, opts, quotedMsg, senderName }) {
    const id = Date.now();
    let originalFile = null;
    let outputFile = null;
    let logCmdFile = null;
    let logCmd = null;

    try {
        let urlInput;

        if (quotedMsg) {
            urlInput = quotedMsg.links?.length ? quotedMsg.links[0].link : extractFirstUrl(quotedMsg.body);
        } else {
            urlInput = opts.argv[0];
        }

        if (!urlInput) {
            await msg.reply('Syntax: /get <opções> http://www.instagram.com/ajsh12j\n```' + getCommandSyntax('/get') + '```');
            return;
        }

        const { audio: isAudio, sticker: isSticker, verbose: isVerbose } = opts.opt;

        if (isDebugMode) {
            printDebug(`urlInput=${urlInput} opts=`, opts);
        }

        if (!isValidHttpUrl(urlInput)) {
            throw new Error(`A URL '${urlInput}' é inválida. Ignorando`);
        }

        await msg.reply(`💡 Processando ${isSticker ? 'seu sticker' : 'sua mídia'}, aguarde.`, null, { linkPreview: false });

        fs.mkdirSync(TMP_DIR, { recursive: true });

        originalFile = path.join(TMP_DIR, `${id}_original.mp4`);
        outputFile = path.join(TMP_DIR, `${id}_output.${isAudio ? 'mp3' : 'mp4'}`);
        logCmdFile = path.join(TMP_DIR, `${id}_cmd.log`);
        logCmd = fs.openSync(logCmdFile, 'a');

        printInfo(`> Todo o output dos comandos salvo em ${logCmdFile}`);

        // Download video
        const cmdYtArgs = ['-f', 'mp4', '--merge-output-format', 'mp4', '-o', originalFile, urlInput];
        const cmdYt = [BIN_YT, ...cmdYtArgs].join(' ');

        try {
            printInfo(`> Executando: ${cmdYt}`);
            fs.writeSync(logCmd, `# Executando: ${cmdYt}\n`);
            await runCommand(BIN_YT, cmdYtArgs, logCmd);
        } catch (inner) {
            throw new Error(`Problemas para baixar com '${BIN_YT}'`, { cause: { inner, cmd: cmdYt } });
        }

        // Converter
        const ffmpegArgs = GetOptFromCommandForFfmpeg(opts, originalFile, outputFile);
        const cmdFfmpeg = [BIN_FFMPEG, ...ffmpegArgs].join(' ');

        try {
            printInfo(`> Executando: ${cmdFfmpeg}`);
            fs.writeSync(logCmd, `\n\n# Executando: ${cmdFfmpeg}\n`);
            await runCommand(BIN_FFMPEG, ffmpegArgs, logCmd);
        } catch (inner) {
            throw new Error(`Problemas para decodificar com '${BIN_FFMPEG}'`, { cause: { inner, cmd: cmdFfmpeg } });
        }

        if (fs.statSync(outputFile).size > 20 * 1024 * 1024) {
            throw new Error('Arquivo muito grande para WhatsApp Web (máx. 20 MB)');
        }

        try {
            const media = MessageMedia.fromFilePath(outputFile);

            if (isVerbose) {
                let textMsg = '🛠️ *Verbose Mode*\n\n';
                textMsg += `💾 *yt-dlp*: _${cmdYt}_\n\n`;
                textMsg += `🔗 *ffmpeg*: _${cmdFfmpeg}_\n\n`;
                textMsg += '🧩 *cmdArgs*:```\n' + JSON.stringify(opts, null, 4) + '\n```';

                await msg.reply(textMsg, null, { linkPreview: false });
            }

            const msgOpts = { linkPreview: false, ...STICKER_META };

            if (isSticker) {
                msgOpts.sendMediaAsSticker = true;
                printInfo(`> Enviando a mídia como sticker para '${senderName}'`);
            } else {
                msgOpts.caption = '📥 Aqui está a mídia para download.';
                msgOpts.sendMediaAsDocument = true;
                printInfo(`> Enviando a mídia ${outputFile} para '${senderName}'`);
            }

            await msg.reply(media, null, msgOpts);
        } catch (inner) {
            throw new Error(`Problemas para enviar com 'MessageMedia.fromFilePath(${outputFile})'`, { cause: { inner } });
        }
    } catch (e) {
        printError(e.message);
        await msg.reply(formatErrorCommand(e), null, { linkPreview: false });
    } finally {
        if (logCmd !== null) {
            try { fs.closeSync(logCmd); } catch { /* already closed */ }
        }

        for (const tmp of [originalFile, outputFile, logCmdFile]) {
            if (!tmp) continue;
            try { fs.unlinkSync(tmp); } catch { /* file may not exist */ }
        }
    }
}

async function cmdCache({ msg, opts }) {
    try {
        let textMsg;

        if (opts.opt.clean && opts.opt.force) {
            // General cleanup: messages, deleted ones, media, temporaries
            const r = await cleanAll();

            textMsg =
                '🧹 *Limpeza geral concluída* (force)\n\n' +
                `🗄️ Mensagens removidas: *${r.total}* _(${r.apagadas} apagada${r.apagadas === 1 ? '' : 's'})_\n` +
                `💾 Espaço liberado: *${humanSize(r.liberado)}*`;
        } else if (opts.opt.clean) {
            // Normal cleanup: only what is past the retention windows
            await cleanCacheOld();
            await cleanFilesOld();

            textMsg = '🧹 Cache limpo (itens fora da janela de retenção).\n';
        } else {
            const { total, apagadas: deletedAlt } = await dbGet(
                'SELECT COUNT(*) AS total, COALESCE(SUM(revoked), 0) AS apagadas FROM messages'
            );

            textMsg = `🗂️ Exibindo conteúdo de ${CACHE_DIR}/*`;
            textMsg += '\n\n```' + listCacheLevelOnly(CACHE_DIR) + '```\n\n';
            textMsg += `🗄️ Existem ${total} mensagens no cache (${deletedAlt} apagadas).`;
        }

        await msg.reply(textMsg, null, { linkPreview: false });
    } catch (e) {
        printError(e.message);
        await msg.reply(formatErrorCommand(e), null, { linkPreview: false });
    }
}

/*
 * /show [-N] [-pv]
 * Re-shows the last N deleted messages of THIS chat (default: 1), in the same
 * format of the 'message_revoke_everyone' alert.
 * /show        → the last deleted one
 * /show -3     → the last 3 (max. UNDO_MAX)
 * /show -3 -pv → sends to YOUR private chat instead of exposing it in the current chat
 * /show -list  → how many deleted messages exist in the cache
 * /show -flush → removes the deleted ones of this chat (in your private chat: of all chats)
 * /show -2 -c 1       → (in your private chat) the last 2 of chat no. 1 of /show -l
 * /show -2 -c zapbot  → (in your private chat) same, looking up the chat by name
 * /show -f -c 1       → (in your private chat) flush only chat no. 1
 * Sends in chronological order: the last one sent is the most recently deleted.
 */
// In private conversations the same chat may appear as @lid or @c.us
async function chatCurrentIds(chatId) {
    const ids = [chatId];

    if (chatId.endsWith('@lid')) {
        const phoneAlt = await resolveLidToPhone(chatId);
        if (phoneAlt) ids.push(phoneAlt);
    }

    return ids;
}

/*
 * Numbering of the last /show -l (index → chat_id).
 * We keep the snapshot because the list order changes with every new message
 * deleted: without it, "chat 2" could point to another chat between -l and -c.
 */
let chatsLastList = [];

// Chats with deleted messages, in the same order as /show -l
function queryChatsWithDeleted() {
    return dbAll(
        `SELECT chat_id,
                MAX(chat_name) AS chat_name,
                MAX(is_group) AS is_group,
                COUNT(*) AS total,
                MAX(revoked_at) AS ultima
           FROM messages
          WHERE revoked = 1
          GROUP BY chat_id
          ORDER BY total DESC, ultima DESC`
    );
}

const chatNameAlt = (c) => c.chat_name || c.chat_id.split('@')[0];

/**
 * Resolves the -c value to a chat:
 * number → position in the last /show -l
 * text  → search by name (case insensitive)
 * @returns {Promise<{ids: string[], nome: string} | {erro: string}>}
 */
async function resolverChatTarget(valueAlt) {
    const chats = await queryChatsWithDeleted();

    if (!chats.length) {
        return { erro: '♻️ Nenhuma mensagem apagada no cache.' };
    }

    // By number
    if (/^\d+$/.test(valueAlt)) {
        const indexAlt = Number(valueAlt);
        const list = chatsLastList.length ? chatsLastList : chats.map(c => c.chat_id);
        const chatId = list[indexAlt - 1];
        const chat = chats.find(c => c.chat_id === chatId);

        if (!chat) {
            return { erro: `❌ Chat nº ${indexAlt} não existe (ou não tem mais apagadas). Rode /show -l para ver a lista atual.` };
        }

        return { ids: [chat.chat_id], nome: chatNameAlt(chat) };
    }

    // By name
    const search = valueAlt.toLowerCase();
    const foundAlt6 = chats.filter(c => chatNameAlt(c).toLowerCase().includes(search));
    const exact = foundAlt6.find(c => chatNameAlt(c).toLowerCase() === search);

    if (exact || foundAlt6.length === 1) {
        const chat = exact || foundAlt6[0];
        return { ids: [chat.chat_id], nome: chatNameAlt(chat) };
    }

    if (!foundAlt6.length) {
        return { erro: `❌ Nenhum chat com apagadas contém "${valueAlt}". Rode /show -l para ver a lista.` };
    }

    return {
        erro: `🔎 "${valueAlt}" corresponde a ${foundAlt6.length} chats. Seja mais específico ou use o número:\n` +
              foundAlt6.map(c => `• ${chatNameAlt(c)}`).join('\n')
    };
}

/*
 * /show -list
 * Summary of the deleted messages stored in the cache.
 *
 * The "per chat" breakdown shows NAMES of other conversations. So it only appears
 * in your own private chat or with -pv; in any other chat (e.g.: a group)
 * only the totals come out, so as not to expose who you talk to.
 */
async function listDeleted({ msg, opts, chatId }) {
    await dbReady;

    const myId = client.info.wid._serialized;
    const idsDoChat = await chatCurrentIds(chatId);
    const ownerInPrivate = idsDoChat.includes(myId);
    const showPerChat = ownerInPrivate || opts.opt.pv;

    const general = await dbGet(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(has_media), 0) AS com_midia,
                MIN(revoked_at) AS mais_antiga
           FROM messages
          WHERE revoked = 1`
    );

    const inChat = await dbGet(
        `SELECT COUNT(*) AS total
           FROM messages
          WHERE revoked = 1
            AND chat_id IN (${idsDoChat.map(() => '?').join(', ')})`,
        idsDoChat
    );

    let textAlt = '🗑️ *Mensagens apagadas no cache*\n\n';
    textAlt += `📦 *Total:* ${general.total}`;
    if (general.com_midia > 0) textAlt += ` _(${general.com_midia} com mídia)_`;
    textAlt += '\n';

    if (!ownerInPrivate) {
        textAlt += `💬 *Neste chat:* ${inChat.total}\n`;
    }

    if (general.total > 0 && general.mais_antiga) {
        const expiresIn = paraMs(general.mais_antiga) + REVOKED_RETENTION;
        const daysAlt = Math.max(0, Math.ceil((expiresIn - Date.now()) / (24 * 60 * 60 * 1000)));
        textAlt += `⏳ *Mais antiga:* ${formatData(general.mais_antiga)} _(expira em ${daysAlt} dia${daysAlt === 1 ? '' : 's'})_\n`;
    }

    if (showPerChat && general.total > 0) {
        const LIMIT = 10;

        const byChat = await queryChatsWithDeleted();
        chatsLastList = byChat.map(c => c.chat_id);

        textAlt += '\n*Por chat:*\n';

        byChat.slice(0, LIMIT).forEach((c, i) => {
            const iconAlt = c.is_group ? '👥' : '👤';
            const nameAlt = chatNameAlt(c);
            const current = idsDoChat.includes(c.chat_id) ? ' ← _este chat_' : '';
            textAlt += `${i + 1}. ${iconAlt} ${nameAlt} — *${c.total}* _(última ${formatData(c.ultima)})_${current}\n`;
        });

        if (byChat.length > LIMIT) {
            textAlt += `_+${byChat.length - LIMIT} chat(s)_\n`;
        }
    }

    textAlt += `\n💡 _Use /show -N para reexibir (máx. ${UNDO_MAX})._`;

    if (showPerChat && general.total > 0) {
        textAlt += '\n💡 _No seu privado: /show -N -c <nº ou nome> para ver as de um chat._';
    }

    if (opts.opt.pv && !ownerInPrivate) {
        await msg.reply('🗑️ Resumo enviado no seu privado.');
        await client.sendMessage(myId, textAlt);
    } else {
        await msg.reply(textAlt);
    }
}

/*
 * /show -flush
 * Removes the deleted messages from the cache (rows + media files):
 * - in any chat      → only the deleted ones of THIS chat;
 * - in your own private chat → the deleted ones of ALL chats.
 * Destructive: only the bot owner runs it, even if /show is opened up in the config.
 */
async function chatCleanDeleted({ msg, chatId, alvo: target = null }) {
    if (!msg.fromMe) {
        await msg.reply('⛔ Só o dono do bot pode usar /show -flush.');
        return;
    }

    await dbReady;

    const myId = client.info.wid._serialized;
    // With -c, the target is the chosen chat; without it, the current chat
    const idsDoChat = target ? target.ids : await chatCurrentIds(chatId);
    const general = !target && idsDoChat.includes(myId);

    // Filter: all deleted ones (owner's private chat) or only those of the target chat
    const filter = general
        ? 'revoked = 1'
        : `revoked = 1 AND chat_id IN (${idsDoChat.map(() => '?').join(', ')})`;
    const params = general ? [] : idsDoChat;

    // Collects what will go out BEFORE deleting, for the summary message
    const byChat = await dbAll(
        `SELECT chat_id,
                MAX(chat_name) AS chat_name,
                MAX(is_group) AS is_group,
                COUNT(*) AS total
           FROM messages
          WHERE ${filter}
          GROUP BY chat_id
          ORDER BY total DESC`,
        params
    );

    const total = byChat.reduce((sum, c) => sum + c.total, 0);

    if (!total) {
        await msg.reply(general
            ? '♻️ Nenhuma mensagem apagada no cache.'
            : '♻️ Nenhuma mensagem apagada registrada neste chat.');
        return;
    }

    // Deletes the media from disk
    const mediaAltAlt = await dbAll(`SELECT media_path FROM messages WHERE ${filter} AND media_path IS NOT NULL`, params);
    let files = 0;
    let bytes = 0;

    for (const { media_path } of mediaAltAlt) {
        try {
            bytes += fs.statSync(media_path).size;
            fs.unlinkSync(media_path);
            files++;
        } catch {
            // file no longer exists
        }
    }

    // Deletes the database rows
    const res = await dbRun(`DELETE FROM messages WHERE ${filter}`, params);

    printInfo(`/show -flush (${general ? 'geral' : chatId}): ${res.changes} mensagens e ${files} arquivos removidos`);

    const plural = (n, um, several) => `${n} ${n === 1 ? um : several}`;

    let textAlt = general
        ? '🧹 *Flush geral das mensagens apagadas*\n\n'
        : target
            ? `🧹 *Flush das mensagens apagadas de:* ${target.nome}\n\n`
            : '🧹 *Flush das mensagens apagadas deste chat*\n\n';

    textAlt += `🗄️ Removidas: *${plural(res.changes, 'mensagem', 'mensagens')}*`;
    textAlt += general ? ` de *${plural(byChat.length, 'chat', 'chats')}*\n` : '\n';
    textAlt += `📎 Mídias apagadas do disco: *${files}*${files ? ` _(${humanSize(bytes)})_` : ''}\n`;

    if (general) {
        const LIMIT = 10;

        textAlt += '\n*Por chat:*\n';
        byChat.slice(0, LIMIT).forEach((c, i) => {
            const iconAlt = c.is_group ? '👥' : '👤';
            const nameAlt = c.chat_name || c.chat_id.split('@')[0];
            textAlt += `${i + 1}. ${iconAlt} ${nameAlt} — *${c.total}*\n`;
        });

        if (byChat.length > LIMIT) {
            textAlt += `_+${byChat.length - LIMIT} chat(s)_\n`;
        }
    } else if (!target) {
        textAlt += '\n💡 _Para limpar as apagadas de todos os chats, use /show -f no seu privado._';
    }

    await msg.reply(textAlt);
}

async function cmdUndo({ msg, opts, chatId }) {
    /*
     * -c <no.|name>: picks another chat. Only in YOUR private chat; in a group this
     * would republish there the deleted messages of other conversations.
     */
    let target = null;

    if (opts.opt.chat) {
        const inMyPrivate = (await chatCurrentIds(chatId)).includes(client.info.wid._serialized);

        if (!msg.fromMe || !inMyPrivate) {
            await msg.reply('⛔ A opção -c só pode ser usada no seu privado.');
            return;
        }

        await dbReady;
        target = await resolverChatTarget(String(opts.opt.chat));

        if (target.erro) {
            await msg.reply(target.erro);
            return;
        }
    }

    if (opts.opt.flush) {
        await chatCleanDeleted({ msg, chatId, alvo: target });
        return;
    }

    if (opts.opt.list) {
        await listDeleted({ msg, opts, chatId });
        return;
    }

    // "-3" is not a declared option, so the parser puts it in argv (just like "3")
    const extras = opts.argv.filter(Boolean);
    let n = 1;

    if (extras.length > 1) {
        await msg.reply('```' + getCommandSyntax('/show') + '```');
        return;
    }

    if (extras.length === 1) {
        const m = extras[0].match(/^-?(\d+)$/);

        if (!m || Number(m[1]) < 1) {
            await msg.reply('```' + getCommandSyntax('/show') + '```');
            return;
        }

        n = Number(m[1]);
    }

    let notice = '';
    if (n > UNDO_MAX) {
        notice = `\n_(limitado a ${UNDO_MAX} por vez)_`;
        n = UNDO_MAX;
    }

    const idsDoChat = target ? target.ids : await chatCurrentIds(chatId);

    await dbReady;

    const rows = await dbAll(
        `SELECT *
           FROM messages
          WHERE revoked = 1
            AND chat_id IN (${idsDoChat.map(() => '?').join(', ')})
          ORDER BY revoked_at DESC, timestamp DESC
          LIMIT ?`,
        [...idsDoChat, n]
    );

    if (!rows.length) {
        // In private, without -c, the intent was almost always to see another chat
        const inMyPrivate = !target && idsDoChat.includes(client.info.wid._serialized);

        await msg.reply(inMyPrivate
            ? '♻️ Nenhuma mensagem apagada neste chat.\n💡 _Para ver as de outro chat: /show -l e depois /show -N -c <nº ou nome>._'
            : '♻️ Nenhuma mensagem apagada registrada neste chat.');
        return;
    }

    // Fetches the most recent, shows from oldest to newest
    rows.reverse();

    const destination = opts.opt.pv ? client.info.wid._serialized : chatId;
    const missing = n > rows.length ? ` (pedidas ${n}, encontradas ${rows.length})` : '';
    let summary = `♻️ *${rows.length} mensage${rows.length === 1 ? 'm apagada' : 'ns apagadas'}*${missing}${notice}`;

    if (target) {
        summary += `\n💬 *Chat:* ${target.nome}`;
    }

    if (opts.opt.pv && !target) {
        await msg.reply('♻️ Enviado no seu privado.');
        await client.sendMessage(destination, `${summary}\n💬 *Chat:* ${rows[0].chat_name || chatId}`);
    } else {
        await msg.reply(summary);
    }

    for (const [i, row] of rows.entries()) {
        const info = await resolverAuthorDeleted(row);

        try {
            await sendMessageDeleted(destination, row, info, {
                titulo: `❌ *MENSAGEM APAGADA* (${i + 1}/${rows.length})`,
                extras: [`🗑️ *Apagada em:* ${formatData(row.revoked_at)}`]
            });
        } catch (err) {
            printError(`/show: falha ao reenviar ${row.id}:`, err.message);
            await client.sendMessage(destination, `⚠️ Não consegui reenviar a mensagem ${i + 1}/${rows.length}: ${err.message}`);
        }

        if (i < rows.length - 1) await wait(UNDO_DELAY_MS);
    }
}

// bot-config.json cmd -> handler
const HANDLERS = {
    '/help': cmdHelp,
    '/debug': cmdDebug,
    '/uptime': cmdUptime,
    '/ping': cmdPing,
    '/gay': cmdGay,
    '/everyone': cmdEveryone,
    '/monitor': cmdMonitor,
    '/crypto': cmdCrypto,
    '/sticker': cmdSticker,
    '/get': cmdGet,
    '/cache': cmdCache,
    '/show': cmdUndo
};

// Warns at boot if the bot-config has a command without a handler (or vice versa)
for (const c of botConfig.commands) {
    if (!HANDLERS[c.cmd]) printError(`Comando '${c.cmd}' está no bot-config.json mas não tem handler.`);
}

/*
 * Mensagens
 */
client.on('message_create', async (msg) => {
    try {
        const timestamp = Date.now();
        const msgIdPure = msg?.id?.id || `fallback_${timestamp}`;
        const msgType = msg?.type || 'unknown';

        // msg.getChat() breaks for some chats/@lid; we use the raw data.
        const chatId = msg?.id?.remote || msg?.from || msg?.to || 'UNKNOWN';
        const isGroup = chatId.endsWith('@g.us') ? 1 : 0;

        const chatName =
            msg?._data?.chat?.name ||
            msg?._data?.chat?.formattedTitle ||
            // notifyName is the name of who SENT: it only serves as the chat name in a private conversation
            (isGroup ? null : msg?._data?.notifyName) ||
            (isGroup ? `Grupo ${chatId.split('@')[0]}` : chatId.split('@')[0]);

        /*
         * Remetente real:
         *   grupo   -> msg.author (participante)
         * private -> msg.from (or msg.to if it was me)
         */
        let rawSenderId = isGroup
            ? (msg?.author || msg?._data?.participant?._serialized || msg?._data?.participant || null)
            : (msg?.fromMe ? (msg?.to || msg?.from) : msg?.from);

        // 100000000000001:93@lid -> 100000000000001@lid (does not convert @lid to @c.us)
        rawSenderId = removeDeviceSuffix(rawSenderId);

        const originalSenderJid = rawSenderId;
        let resolvedSenderJid = rawSenderId;

        if (rawSenderId?.endsWith('@lid')) {
            const phoneJid = await resolveLidToPhone(rawSenderId);
            if (phoneJid) resolvedSenderJid = phoneJid;
        }

        // Contact, preferably by the real phone; otherwise by the LID
        let contact = null;

        if (resolvedSenderJid && !resolvedSenderJid.endsWith('@g.us')) {
            contact = await client.getContactById(resolvedSenderJid).catch(() => null);
        }

        if (!contact && originalSenderJid?.endsWith('@lid')) {
            contact = await client.getContactById(originalSenderJid).catch(() => null);
        }

        // Prioritizes the real phone; if it does not resolve, keeps the LID (does not invent a number)
        const senderJid = resolvedSenderJid || originalSenderJid || 'UNKNOWN';
        const senderNumber = senderJid.endsWith('@c.us') ? senderJid.split('@')[0] : null;

        const senderName =
            contact?.name ||
            contact?.pushname ||
            msg?._data?.notifyName ||
            senderNumber ||
            originalSenderJid ||
            'Desconhecido';

        const senderContact = contact || {
            id: { _serialized: senderJid, user: senderJid.split('@')[0] },
            number: senderNumber || senderJid.split('@')[0],
            name: senderName,
            pushname: msg?._data?.notifyName || senderName
        };

        if (isDebugMode) {
            printDebug(`msgIdPure=${msgIdPure} senderName=${senderName} senderJid=${senderJid} senderNumber=${senderNumber} chatId=${chatId} chatName=${chatName}`);
            printDebug({
                author: msg?.author,
                from: msg?.from,
                to: msg?.to,
                remote: msg?.id?.remote,
                contact_id: contact?.id?._serialized || null,
                number: contact?.number || null,
                pushname: contact?.pushname || null,
                name: contact?.name || null
            });
        }

        /*
         * Persistence (to recover deleted messages)
         */
        let hasMedia = msg.hasMedia ? 1 : 0;
        let localMediaPath = null;
        let lat = null;
        let lng = null;

        if (msgType === 'location' && msg.location) {
            lat = msg.location.latitude;
            lng = msg.location.longitude;
        }

        if (msg.hasMedia) {
            try {
                const media = await msg.downloadMedia();

                if (media?.data) {
                    const extension = media.mimetype?.includes('/')
                        ? media.mimetype.split('/').pop().split(';').shift()
                        : 'bin';

                    localMediaPath = path.join(getFolderMedia(), `${msgIdPure}.${extension}`);
                    fs.writeFileSync(localMediaPath, Buffer.from(media.data, 'base64'));
                }
            } catch (error) {
                printError('Falha ao baixar mídia:', error.message);
                hasMedia = 0;
            }
        }

        /*
         * UPSERT instead of INSERT OR REPLACE: REPLACE deletes and recreates the row,
         * what would reset revoked/revoked_at if WhatsApp resends the same id
         * (sync, reconnection). A row already marked as deleted is not touched,
         * and an existing media_path is not replaced by null.
         */
        await dbReady;
        await dbRun(
            `INSERT INTO messages
                (id, sender_name, sender_jid, sender_number,
                 chat_id, chat_name, is_group,
                 body, type, timestamp,
                 has_media, media_path,
                 location_lat, location_lng,
                 raw_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                sender_name   = excluded.sender_name,
                sender_jid    = excluded.sender_jid,
                sender_number = excluded.sender_number,
                chat_id       = excluded.chat_id,
                chat_name     = excluded.chat_name,
                is_group      = excluded.is_group,
                body          = excluded.body,
                type          = excluded.type,
                has_media     = excluded.has_media,
                media_path    = COALESCE(excluded.media_path, messages.media_path),
                location_lat  = excluded.location_lat,
                location_lng  = excluded.location_lng,
                raw_json      = excluded.raw_json
             WHERE messages.revoked = 0`,
            [
                msgIdPure, senderName, senderJid, senderNumber,
                chatId, chatName, isGroup,
                msg.body || '', msgType, timestamp,
                hasMedia, localMediaPath,
                lat, lng,
                'desativado'
            ]
        ).catch(err => printError('Erro ao salvar mensagem:', err.message));

        /*
         * Comandos
         */
        const body = (msg.body || '').trim();
        if (!body.startsWith('/')) return;

        const caller = body.split(/\s+/, 1)[0];
        const args = body.slice(caller.length).trim();

        const command = findCommand(caller);

        if (!command) {
            if (isDebugMode) printDebug(`Comando '${caller}' não encontrado`);
            return;
        }

        // Command restricted to the bot owner
        if (!msg.fromMe && command.onlyAdmin) {
            const warnMsg = isGroup
                ? `⚠️ Usuário '${senderName}' não pode executar '${command.cmd}' no grupo '${chatName}'`
                : `⚠️ Usuário '${chatName}' não pode executar: ${command.cmd}`;

            messageToSelf(warnMsg);
            return;
        }

        printDebug(isGroup
            ? `Executando comando '${body}' de '${senderName}' no grupo '${chatName}'`
            : `Executando comando '${body}' em '${chatName}'`);

        const opts = GetOptFromCommand(args, command);

        if (isDebugMode) {
            printDebug('GetOptFromCommand():', command.cmd, opts);
        }

        // foo -help
        if (opts.opt.help) {
            await msg.reply('```' + getCommandSyntax(command.cmd) + '```');
            return;
        }

        printCall(senderContact, body);

        const handler = HANDLERS[command.cmd];

        if (!handler) {
            await msg.reply(`⚠️ O comando ${command.cmd} ainda não foi implementado.`);
            return;
        }

        const quotedMsg = msg.hasQuotedMsg ? await msg.getQuotedMessage().catch(() => null) : null;

        await handler({ msg, opts, args, quotedMsg, senderContact, senderName, isGroup, chatId, chatName });
    } catch (error) {
        printError('[message_create] Erro geral controlado:', {
            error: error?.message || String(error),
            stack: error?.stack,
            from: msg?.from,
            to: msg?.to,
            remote: msg?.id?.remote,
            fromMe: msg?.fromMe,
            type: msg?.type
        });
    }
});
