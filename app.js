/*
 * ZapBot - WhatsApp bot based on whatsapp-web.js
 *
 * Recovers deleted messages, downloads videos (/get), creates stickers,
 * watches messages by text/regex (/watch), monitors contacts and more. The commands are defined in
 * config/bot-config.json e implementados neste arquivo (ver HANDLERS).
 *
 * Version:  see package.json
 * Author:   Jorge Pereira <jpereiran@gmail.com>
 * Site:    https://github.com/jpereira/zapbot
 *
 * Copyright (c) 2026 Jorge Pereira
 *
 * Licensed under the MIT license. It is permitted to use, copy, modify,
 * merge, publish, distribute, sublicense and/or sell copies of this
 * software, provided that this copyright notice is kept.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
 *
 * Unofficial project, with no link to WhatsApp or Meta. Using bots on
 * personal accounts violates WhatsApp's Terms of Service and may lead to
 * number ban. Use at your own risk.
 */

const { Client, MessageMedia, LocalAuth, Location } = require('whatsapp-web.js');
const { spawn } = require('child_process');
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const util = require('util');
const path = require('path');

const axios = require('axios');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const colors = require('colors');
const fs = require('fs-extra');
const sharp = require('sharp');
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

// 1 day in milliseconds (retention of deleted ones: setting 'cache.revokedRetentionDays')
const DAY_MS = 24 * 60 * 60 * 1000;

const CACHE_DIR = path.join(__dirname, 'cache');
const MEDIA_DIR = path.join(CACHE_DIR, 'media'); // media saved to recover deleted messages
const TMP_DIR = path.join(CACHE_DIR, 'tmp');     // /get temporary files

const BIN_FFMPEG = '/usr/bin/ffmpeg';
const BIN_YT = '/venv/bin/yt-dlp';

// /get: each yt-dlp/ffmpeg is killed after this time; at most N downloads at the same time
const GET_TIMEOUT_MS = 5 * 60 * 1000;
const GET_MAX_CONCURRENT = 2;

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

// Debug mode comes from the 'debug.enabled' setting (default: on if APP_ENV=dev, case-insensitive)
printInfo(`Running in APP_ENV=${APP_ENV} QRCODE_EMAIL_ENABLE=${process.env.QRCODE_EMAIL_ENABLE}`);

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

    // General bot settings (key -> value in JSON)
    await dbRun(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // /watch occurrences: messages that matched some rule in the 'watch.rules' setting.
    // UNIQUE(rule, message_id): the same message does not generate two notices for the same rule.
    await dbRun(`
        CREATE TABLE IF NOT EXISTS watch_hits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rule TEXT NOT NULL,
            message_id TEXT NOT NULL,
            chat_id TEXT,
            chat_name TEXT,
            is_group INTEGER DEFAULT 0,
            sender_name TEXT,
            sender_number TEXT,
            body TEXT,
            timestamp INTEGER,
            UNIQUE (rule, message_id)
        )
    `);
    await dbRun('CREATE INDEX IF NOT EXISTS idx_watch_hits_rule ON watch_hits (rule, timestamp)');

    await loadSettings();

    for (const dir of [MEDIA_DIR, TMP_DIR]) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            printInfo(`Creating ${dir}`);
        }
    }
}

/*
 * Settings: general configuration persisted in the `settings` table.
 * Loaded at boot into `settings` (memory); getSetting() reads from there and
 * setSetting() validates, saves to the database and to memory. Changeable through /set.
 *
 * Each key declares: default (stored on the first boot, without overwriting the
 * existente), type (boolean | number | string | list), desc e, opcionalmente,
 * min/max (number), item() to normalize/validate each item of a list,
 * separator (list whose items may have spaces/commas: e.g. '\n', one per line),
 * allowEmpty (string that may be empty) and secret (value masked in /set and in the logs).
 */
// item() of the /news feed lists
function validateUrlFeed(v) {
    if (!isValidHttpUrl(v)) throw new Error(`URL inválida: ${v}`);
    return v;
}

const SETTINGS_SCHEMA = {
    'debug.enabled': {
        default: APP_ENV.toLowerCase() === 'dev',
        type: 'boolean',
        desc: 'Debug mode (o mesmo do /debug on|off).'
    },
    'commands.disabled': {
        default: [],
        type: 'list',
        desc: 'Comandos desativados em tempo de execução (somem do /help).',
        item: (v) => {
            const nameAlt = v.startsWith('/') ? v.toLowerCase() : `/${v.toLowerCase()}`;
            const command = botConfig.commands.find(c => c.cmd === nameAlt || c.aliases?.includes(nameAlt));
            if (!command) throw new Error(`comando desconhecido: ${nameAlt}`);
            if (command.cmd === '/set') throw new Error('o /set não pode ser desativado');
            return command.cmd;
        }
    },
    'crypto.coins': {
        default: ['BTC', 'ETH', 'SOL', 'HYPE'],
        type: 'list',
        desc: 'Moedas exibidas pelo /crypto.',
        item: (v) => {
            const sym = v.toUpperCase().replace(/USDT$/, '');
            if (!CRYPTO_SUPPORTED[sym]) throw new Error(`moeda não suportada: ${sym}`);
            return sym;
        }
    },
    'sticker.name': {
        default: 'ZapBot',
        type: 'string',
        desc: 'Nome do pacote das figurinhas (/sticker e /get -st).'
    },
    'sticker.author': {
        default: 'https://github.com/jpereira/zapbot/',
        type: 'string',
        desc: 'Autor das figurinhas (/sticker e /get -st).'
    },
    'cache.revokedRetentionDays': {
        default: 30,
        type: 'number', min: 1, max: 365,
        desc: 'Dias que as mensagens apagadas ficam guardadas para o /show.'
    },
    'revoke.status': {
        default: true,
        type: 'boolean',
        desc: 'Recupera status (stories) apagados; off ignora.'
    },
    'get.maxSizeMB': {
        default: 20,
        type: 'number', min: 1, max: 100,
        desc: 'Tamanho máximo (MB) do arquivo enviado pelo /get.'
    },
    'get.maxDownloadMB': {
        default: 200,
        type: 'number', min: 10, max: 2000,
        desc: 'Tamanho máximo (MB) baixado pelo yt-dlp no /get, antes da conversão.'
    },
    'show.max': {
        default: 20,
        type: 'number', min: 1, max: 100,
        desc: 'Máximo de mensagens reexibidas por /show -N.'
    },
    'show.delayMs': {
        default: 700,
        type: 'number', min: 0, max: 10000,
        desc: 'Intervalo (ms) entre os envios do /show (evita flood/ban).'
    },
    'monitor.max': {
        default: 20,
        type: 'number', min: 1, max: 1000,
        desc: 'Máximo de números monitorados pelo /monitor.'
    },
    'watch.rules': {
        default: [],
        type: 'list',
        separator: '\n',
        desc: 'Regras do /watch, uma por linha: texto (sem diferenciar maiúsculas/acentos) ou /regex/flags.',
        item: (v) => {
            compileRuleWatch(v); // throws Error if the rule is invalid
            return v;
        }
    },
    'watch.max': {
        default: 20,
        type: 'number', min: 1, max: 100,
        desc: 'Máximo de regras do /watch.'
    },
    'watch.showMax': {
        default: 20,
        type: 'number', min: 1, max: 100,
        desc: 'Máximo de ocorrências listadas por /watch -show.'
    },
    'watch.hitsRetentionDays': {
        default: 30,
        type: 'number', min: 1, max: 365,
        desc: 'Dias que as ocorrências do /watch ficam guardadas.'
    },
    'gif.tag': {
        default: 'fail',
        type: 'string',
        desc: 'Tag padrão do /gif quando nenhuma é informada.'
    },
    'gif.giphy.api.key': {
        default: '',
        type: 'string',
        allowEmpty: true,
        secret: true,
        desc: 'Chave do GIPHY (/gif), usada quando GIPHY_API_KEY não está no config/.env.'
    },
    'cve.max': {
        default: 10,
        type: 'number', min: 1, max: 20,
        desc: 'Quantidade de CVEs exibidas pelo /cve (o /cve <max> sobrepõe).'
    },
    'cve.maxDays': {
        default: 7,
        type: 'number', min: 1, max: 120, // 120: maximum window accepted by the NVD
        desc: 'Janela (dias) do /cve -highscore.'
    },
    'tempo.city': {
        default: 'Niteroi, Rio de Janeiro, Brazil',
        type: 'string',
        desc: 'Cidade padrão do /tempo (ex.: "Niteroi, Rio de Janeiro, Brazil").'
    },
    'bot.paused': {
        default: false,
        type: 'boolean',
        desc: 'Bot desligado: todos os comandos são ignorados, exceto o /bot (o mesmo do /bot -on|-off).'
    },
    'bot.adminMode': {
        default: false,
        type: 'boolean',
        desc: 'Modo admin: só o dono usa comandos (o mesmo do /bot +admin|-admin).'
    },
    'news.hack': {
        default: [
            'https://feeds.feedburner.com/TheHackersNews',
            'https://www.bleepingcomputer.com/feed/',
            'https://krebsonsecurity.com/feed/'
        ],
        type: 'list',
        desc: 'Feeds RSS do /news -hack (hacking/segurança).',
        item: validateUrlFeed
    },
    'news.g1': {
        default: ['https://g1.globo.com/dynamo/rss2.xml'],
        type: 'list',
        desc: 'Feeds RSS do /news -g1.',
        item: validateUrlFeed
    },
    'news.gazeta': {
        default: ['https://www.gazetadopovo.com.br/feed/rss/brasil.xml'],
        type: 'list',
        desc: 'Feeds RSS do /news -gazeta (Gazeta do Povo).',
        item: validateUrlFeed
    },
    'news.brasil': {
        // The feeds listed at https://rss.feedspot.com/brazil_rss_feeds/ (the page is HTML, not RSS)
        default: [
            'http://lifeinrocinha.blogspot.com/feeds/posts/default?alt=rss',
            'https://braziliangringo.com/feed/',
            'https://brazilianspace.blogspot.com/feeds/posts/default?alt=rss',
            'https://cursosbiblicos.teo.br/feed/',
            'https://feeds.feedburner.com/aviacaobrasil',
            'https://feeds.feedburner.com/Eatrionet',
            'https://foodsafetybrazil.org/feed/',
            'https://jornaldebrasilia.com.br/feed/',
            'https://lyricalbrazil.com/feed/',
            'https://nocoupinbrazil.wordpress.com/feed/',
            'https://rioonwatch.org/?feed=rss2',
            'https://riorealblog.com/feed/',
            'https://vexus.com.br/en/feed/feed.xml',
            'https://www.absoluterio.com.br/blog-feed.xml',
            'https://www.brasilwire.com/feed/'
        ],
        type: 'list',
        desc: 'Feeds RSS do /news -brasil (blogs sobre o Brasil, do feedspot).',
        item: validateUrlFeed
    },
    'openai.api.key': {
        default: '',
        type: 'string',
        allowEmpty: true,
        secret: true,
        desc: 'Chave da OpenAI (/gpt), usada quando OPENAI_API_KEY não está no config/.env.'
    },
    'openai.timeout.ms': {
        default: 60000,
        type: 'number', min: 5000, max: 300000,
        desc: 'Timeout (ms) do /gpt, usado quando OPENAI_TIMEOUT_MS não está no config/.env.'
    },
    'news.max': {
        default: 5,
        type: 'number', min: 1, max: 10,
        desc: 'Manchetes exibidas pelo /news (o /news <quantidade> sobrepõe).'
    }
};

const settings = new Map();

/*
 * Validates/normalizes a value for the key. Accepts the already typed value (coming from the
 * database) or text (coming from /set). Throws Error with the message for the user.
 */
function validateSetting(key, value) {
    const schema = SETTINGS_SCHEMA[key];
    if (!schema) throw new Error(`setting desconhecido: ${key}`);

    switch (schema.type) {
        case 'boolean': {
            if (typeof value === 'boolean') return value;
            const v = String(value).trim().toLowerCase();
            if (['on', 'true', '1', 'sim', 'yes'].includes(v)) return true;
            if (['off', 'false', '0', 'nao', 'não', 'no'].includes(v)) return false;
            throw new Error('use on|off');
        }

        case 'number': {
            const n = Number(value);
            if (String(value).trim() === '' || !Number.isInteger(n)) throw new Error('precisa ser um número inteiro');
            if (n < schema.min || n > schema.max) throw new Error(`precisa estar entre ${schema.min} e ${schema.max}`);
            return n;
        }

        case 'string': {
            const s = String(value ?? '').trim();
            if (!s && schema.allowEmpty) return s;
            if (!s || s.length > 100) throw new Error('precisa ter de 1 a 100 caracteres');
            return s;
        }

        case 'list': {
            const items = Array.isArray(value)
                ? value.map(String)
                : String(value ?? '').split(schema.separator ?? /[\s,]+/);
            const list = items.map(v => v.trim()).filter(Boolean).map(schema.item ?? (v => v));
            return [...new Set(list)];
        }
    }

    throw new Error(`tipo inválido no schema: ${schema.type}`);
}

// Renamed keys (old → new): the value saved in the database moves to the new name
const SETTINGS_RENAMED = {
    'api.key.giphy': 'gif.giphy.api.key'
};

async function loadSettings() {
    for (const [old, fresh] of Object.entries(SETTINGS_RENAMED)) {
        await dbRun('UPDATE OR IGNORE settings SET key = ? WHERE key = ?', [fresh, old]);
        await dbRun('DELETE FROM settings WHERE key = ?', [old]);
    }

    for (const [key, schema] of Object.entries(SETTINGS_SCHEMA)) {
        await dbRun('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [key, JSON.stringify(schema.default)]);
    }

    for (const row of await dbAll('SELECT key, value FROM settings')) {
        if (!SETTINGS_SCHEMA[row.key]) {
            printInfo(`Setting '${row.key}' desconhecido, ignorado.`);
            continue;
        }

        try {
            settings.set(row.key, validateSetting(row.key, JSON.parse(row.value)));
        } catch (e) {
            printError(`Setting '${row.key}' inválido (${e.message}), usando o padrão.`);
        }
    }

    printSuccess(`Loaded ${settings.size} settings (${[...settings.keys()].join(',')})`);
    printSuccess(`Loaded ${getSetting('crypto.coins').length} crypto coins (${getSetting('crypto.coins').join(',')})`);
    printInfo(`debug.enabled=${getSetting('debug.enabled')} commands.disabled=${getSetting('commands.disabled').join(',') || '-'}`);
    printInfo(`Loaded ${getSetting('watch.rules').length} watch rules`);
}

function getSetting(key) {
    return settings.has(key) ? settings.get(key) : SETTINGS_SCHEMA[key]?.default;
}

/*
 * Value from config/.env or, if empty, from the setting (e.g.: API keys, timeouts).
 * The .env value goes through the same validation as the setting: invalid is ignored
 * (with a log warning) and the setting applies.
 */
function envOuSetting(env, key) {
    const valueAlt = process.env[env]?.trim();
    if (!valueAlt) return getSetting(key);

    try {
        return validateSetting(key, valueAlt);
    } catch (e) {
        printError(`${env} inválido (${e.message}), usando o setting '${key}'.`);
        return getSetting(key);
    }
}

async function setSetting(key, value) {
    value = validateSetting(key, value);

    await dbRun(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, JSON.stringify(value)]
    );
    settings.set(key, value);

    return value;
}

function isDebugMode() {
    return getSetting('debug.enabled');
}

function stickerMeta() {
    return { stickerName: getSetting('sticker.name'), stickerAuthor: getSetting('sticker.author') };
}

const dbReady = initializeDb().catch((e) => {
    console.error('Bootstrap Erro:', e);
    process.exit(1);
});

/*
 * Command configuration
 */
const botConfig = require('./config/bot-config.json');

// "disabled": true takes the command out of the bot: it does not answer, it does not show in /help
const disabledCommands = botConfig.commands.filter(c => c.disabled).map(c => c.cmd);
botConfig.commands = botConfig.commands.filter(c => !c.disabled);

const commands = botConfig.commands.map(c => c.cmd);
printSuccess(`Loaded ${commands.length} callers (${commands.join(',')})`);

if (disabledCommands.length) {
    printInfo(`Disabled ${disabledCommands.length} callers (${disabledCommands.join(',')})`);
}

// Active commands: those in bot-config minus those in the 'commands.disabled' setting (via /set)
function activeCommands() {
    const disabled = getSetting('commands.disabled');
    return botConfig.commands.filter(c => !disabled.includes(c.cmd));
}

function findCommand(name) {
    return activeCommands().find(c => c.cmd === name || c.aliases?.includes(name));
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
    }
    // No "tls.rejectUnauthorized: false": the SMTP certificate must be valid,
    // otherwise a MITM captures the password and the QR Code (= the WhatsApp session).
});

/*
 * Running external processes (yt-dlp / ffmpeg)
 */
function runCommand(bin, args, logFd, timeoutMs = GET_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const child = spawn(bin, args, { stdio: ['ignore', logFd, logFd] });

        // Without this, a stuck download/conversion holds /get (and the disk) forever
        const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);

        child.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
        child.on('close', (code, signal) => {
            clearTimeout(timer);
            if (code === 0) return resolve();
            reject(new Error(signal === 'SIGKILL'
                ? `${bin} excedeu ${timeoutMs / 1000}s e foi interrompido`
                : `${bin} exited with code ${code}`));
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

/*
 * Anti-SSRF for /get: yt-dlp runs on the server's network, so a URL like
 * http://192.168.0.1/ or http://localhost:2375/ would reach the internal network.
 * We refuse hosts that resolve to private/loopback/link-local addresses.
 * (Does not cover redirects or DNS rebinding done later by yt-dlp.)
 */
const NETWORKS_BLOCKED = new net.BlockList();

for (const [network, prefix] of [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
    ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16],
    ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]
]) {
    NETWORKS_BLOCKED.addSubnet(network, prefix, 'ipv4');
}

for (const [network, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) {
    NETWORKS_BLOCKED.addSubnet(network, prefix, 'ipv6');
}

function isAddressBlocked(address) {
    // ::ffff:10.0.0.1 (IPv4 mapped into IPv6) is checked as IPv4
    const v4 = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
    if (v4) return NETWORKS_BLOCKED.check(v4, 'ipv4');

    return NETWORKS_BLOCKED.check(address, net.isIPv6(address) ? 'ipv6' : 'ipv4');
}

async function isUrlPublic(str) {
    const host = new URL(str).hostname.replace(/^\[|\]$/g, '');

    const addresses = net.isIP(host)
        ? [{ address: host }]
        : await dns.lookup(host, { all: true }).catch(() => []);

    return addresses.length > 0 && !addresses.some(e => isAddressBlocked(e.address));
}

function GetOptFromCommandForFfmpeg(opts, originalFile, outputFile) {
    const isSticker = opts.opt.sticker;  // -sticker  | -st
    const isAudio   = opts.opt.audio;    // -audio    | -a
    const startSec  = opts.opt.startSec; // -startSec | -ss
    const endSec    = opts.opt.endSec;   // -endSec   | -es
    // The input is a local file downloaded from the internet: ffmpeg must not open
    // rede nem outros protocolos a partir dele (playlists/concat maliciosos)
    const args      = ['-y', '-protocol_whitelist', 'file'];

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
        // 512x512 animated sticker framed in the middle of the video (like /sticker):
        // scales until it covers the square and the crop (centered by default) cuts off the excess
        args.push(
            '-vf',
            'fps=15,scale=512:512:force_original_aspect_ratio=increase,crop=512:512,setsar=1',
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
 * `given` stores the canonical name of the options provided: tells apart "-x" without
 * value (null, but present) of "-x" absent (null).
 */
function GetOptFromCommand(input, config = {}) {
    const tokens = tokenizeCommand(input);

    // Same array in result.argv and result.opt.argv
    const argv = [];
    const given = new Set();
    const result = { opt: { argv }, argv, given };

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
        given.add(canonicalName);

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
 * The message id and mimetype come from the sender's client: a client
 * modified could send "../../app/app" as the id. Only letters, numbers, _ and -.
 */
const nameSafe = (valueAlt, defaults) => String(valueAlt ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || defaults;

// true if `arquivo` is inside MEDIA_DIR (also applies to paths already stored in the database)
function mediaIsPath(fileAlt) {
    if (!fileAlt) return false;
    const relative = path.relative(MEDIA_DIR, path.resolve(fileAlt));
    return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/*
 * Database + media cleanup:
 * - normal messages: removed after the "delete for everyone" window (68h),
 * because after that they can no longer be deleted;
 * - DELETED messages (revoked=1): kept for 'cache.revokedRetentionDays' (default 30),
 * so /show keeps working.
 * With /cache -clean -force, both windows are 0 and everything is removed.
 */
async function cleanCacheOld(maxDeleteWin = MAX_DELETE_WINDOW, retentionDeleted = getSetting('cache.revokedRetentionDays') * DAY_MS) {
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
            if (mediaIsPath(row.media_path) && fs.existsSync(row.media_path)) {
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
 * Does not touch monitored_numbers, presence_logs or watch_hits (configuration and history).
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

// /watch occurrences older than 'watch.hitsRetentionDays'
async function cleanWatchOld() {
    await dbReady;

    try {
        const res = await dbRun('DELETE FROM watch_hits WHERE timestamp < ?',
            [Date.now() - getSetting('watch.hitsRetentionDays') * DAY_MS]);

        if (res.changes > 0) {
            printInfo(`Limpeza: ${res.changes} ocorrências antigas do /watch removidas.`);
        }
    } catch (err) {
        printError('Erro na limpeza do /watch:', err.message);
    }
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
    cleanWatchOld();
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
 * Real name of a group (chatId @g.us -> group subject).
 * msg._data.chat is not always filled in (or comes with another chat's data),
 * so we look the chat up by id. Short cache: the group subject may change.
 */
const GROUP_NAME_TTL_MS = 10 * 60 * 1000;
const groupNameCache = new Map();

async function groupResolverName(chatId) {
    if (!chatId?.endsWith('@g.us')) return null;

    const cache = groupNameCache.get(chatId);
    if (cache && Date.now() - cache.at < GROUP_NAME_TTL_MS) return cache.name;

    const chat = await client.getChatById(chatId).catch((err) => {
        if (isDebugMode()) printDebug(`[GRUPO] getChatById falhou para ${chatId}: ${err?.message || err}`);
        return null;
    });

    // getChatById builds the group's full model and breaks for some groups (@lid);
    // in that case we read the subject straight from the WhatsApp Web collections.
    const name =
        chat?.name ||
        chat?.groupMetadata?.subject ||
        (await groupInStoreName(chatId)) ||
        null;

    if (name) groupNameCache.set(chatId, { name, at: Date.now() });
    return name;
}

async function groupInStoreName(chatId) {
    if (!client.pupPage) return null;

    return client.pupPage.evaluate((id) => {
        const { Chat, GroupMetadata } = window.require('WAWebCollections');
        const wid = window.require('WAWebWidFactory').createWid(id);
        const chat = Chat.get(wid);

        return GroupMetadata?.get(wid)?.subject || chat?.name || chat?.formattedTitle || null;
    }, chatId).catch((err) => {
        if (isDebugMode()) printDebug(`[GRUPO] Store sem o grupo ${chatId}: ${err?.message || err}`);
        return null;
    });
}

/*
 * Swaps the text's raw mentions (@100000000000001, which may be a LID or a phone)
 * by the contact name: "@100000000000001" -> "@Fulano".
 * mentionedIds (of the message) helps tell whether the number is @lid or @c.us;
 * without it (old occurrences) we try both.
 */
const mentionNameCache = new Map();

async function mentionName(user, mentionedIds = []) {
    if (mentionNameCache.has(user)) return mentionNameCache.get(user);

    const candidates = mentionedIds
        .map(m => removeDeviceSuffix(typeof m === 'string' ? m : m?._serialized))
        .filter(jid => jid?.split('@')[0] === user);

    if (!candidates.length) candidates.push(`${user}@lid`, `${user}@c.us`);

    let nameAlt = null;

    for (const jid of candidates) {
        // For a @lid, the contact by real phone usually has the name saved in the address book
        const phoneJid = jid.endsWith('@lid') ? await resolveLidToPhone(jid) : null;

        for (const id of [phoneJid, jid].filter(Boolean)) {
            const contact = await client.getContactById(id).catch(() => null);
            nameAlt = contact?.name || contact?.pushname || contact?.verifiedName || null;
            if (nameAlt) break;
        }

        if (!nameAlt && phoneJid) nameAlt = `+${phoneJid.split('@')[0]}`;
        if (nameAlt) break;
    }

    if (nameAlt) mentionNameCache.set(user, nameAlt);
    return nameAlt;
}

async function resolverMentions(textAlt, mentionedIds = []) {
    textAlt = String(textAlt ?? '');
    const users = [...new Set([...textAlt.matchAll(/@(\d{6,})/g)].map(m => m[1]))];

    for (const user of users) {
        const nameAlt = await mentionName(user, mentionedIds);
        if (nameAlt) textAlt = textAlt.replaceAll(`@${user}`, `@${nameAlt}`);
    }

    return textAlt;
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

    /*
     * Without a remote cache: a third-party repo's HTML (main branch) would run on the
     * origin web.whatsapp.com, with access to the session. WhatsApp Web is loaded
     * straight from the official site.
     */
    webVersionCache: { type: 'none' },

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
 * Messages sent by the bot itself also fire 'message_create' with
 * fromMe=true. Without this mark, a reply starting with "/" (e.g.: the
 * /noffa echoing "/cache -c -f") would run as an owner command.
 *
 * msg.reply() also goes through client.sendMessage(). The text is registered
 * BEFORE the send because the event may arrive before sendMessage resolves.
 */
const SENT_TTL_MS = 60 * 1000;
const sentByBotAlt = new Map(); // text -> [expires at, ...]

function sendingText(content, options = {}) {
    if (typeof content === 'string') return content;
    return options.caption ?? content?.description ?? null;
}

function markSentByBot(textAlt) {
    textAlt = String(textAlt ?? '').trim();
    if (!textAlt.startsWith('/')) return; // only what could become a command

    const nowAlt = Date.now();
    const validAlt = (sentByBotAlt.get(textAlt) ?? []).filter(t => t > nowAlt);
    sentByBotAlt.set(textAlt, [...validAlt, nowAlt + SENT_TTL_MS]);
}

// Consumes the mark: true if this message was sent by the bot
function wasSentByBot(textAlt) {
    textAlt = String(textAlt ?? '').trim();

    const nowAlt = Date.now();
    const validAlt = (sentByBotAlt.get(textAlt) ?? []).filter(t => t > nowAlt);
    if (!validAlt.length) {
        sentByBotAlt.delete(textAlt);
        return false;
    }

    validAlt.shift();
    if (validAlt.length) sentByBotAlt.set(textAlt, validAlt);
    else sentByBotAlt.delete(textAlt);
    return true;
}

const sendMessageOriginal = client.sendMessage.bind(client);

client.sendMessage = (chatId, content, options = {}) => {
    markSentByBot(sendingText(content, options));
    return sendMessageOriginal(chatId, content, options);
};

// Marks that never became 'message_create' (send failed) expire here
setInterval(() => {
    const nowAlt = Date.now();
    for (const [textAlt, expirations] of sentByBotAlt) {
        if (!expirations.some(t => t > nowAlt)) sentByBotAlt.delete(textAlt);
    }
}, SENT_TTL_MS);

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

    if (!isDebugMode()) return;

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

client.on('ready', async () => {
    isReady = true;
    lastDisconnectReason = null;

    // The settings come from the database: warns right at boot if the bot is off or in admin mode
    await dbReady;
    const notices = [
        getSetting('bot.paused') && 'Bot desligado: use /bot -on para ativar os comandos.',
        getSetting('bot.adminMode') && 'Modo admin ligado: só você usa comandos (/bot -admin desliga).'
    ].filter(Boolean).map(a => ` ${a}`).join('');

    printSuccess(`🤖 ZapBot ${packageJson.version} inicializado! Informando ${process.env.PHONE_NUMBER}`);
    messageToSelf(`🤖 ZapBot ${packageJson.version} inicializado.${notices}`);
});

/*
 * Presence of the monitored numbers
 */
client.on('presence_update', async (presence) => {
    // Without /monitor loaded, already registered numbers generate no notices
    if (!findCommand('/monitor')) return;
    if (!presence?.id) return;

    const myid = process.env.PHONE_NUMBER;

    try {
        const rawId = presence.id._serialized || presence.id;
        const number = rawId.split('@')[0].split(':')[0];
        const currentStatus = presence.status || (presence.type === 'available' ? 'available' : 'unavailable');

        // This used to send a WhatsApp message for EVERY presence event.
        if (isDebugMode()) {
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

const plural = (n, um, several) => `${n} ${n === 1 ? um : several}`;

// Status (stories) arrive through the 'status@broadcast' chat
const isStatus = (row) => row.chat_id === 'status@broadcast';

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

        // The body comes from whoever sent it: it only goes raw if it really is a vCard (never a text like "/cache -c -f")
        if (!row.body || /^BEGIN:VCARD/i.test(row.body.trim())) {
            await client.sendMessage(destination, alertText);
            if (row.body) await client.sendMessage(destination, row.body, { parseVCards: true });
        } else {
            await client.sendMessage(destination, `${alertText}\n💬 *Conteúdo:* "${row.body}"`);
        }
        return;
    }

    // Physical file
    if (row.has_media && mediaIsPath(row.media_path) && fs.existsSync(row.media_path)) {
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

    if (isStatus(row) && !getSetting('revoke.status')) {
        printDebug(`[Revoke] Status apagado ID ${targetId} ignorado (revoke.status off).`);
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

        await sendMessageDeleted(client.info.wid._serialized, row, info, {
            titulo: isStatus(row) ? '📸 *STATUS APAGADO DETECTADO*' : '❌ *MENSAGEM APAGADA DETECTADA*'
        });
    } catch (sendError) {
        printError('[Revoke] Erro ao processar item apagado:', sendError.message);
    }
});

/*
 * Watch: every received message (except yours and the commands) is tested against
 * the rules from the 'watch.rules' setting. Each rule is:
 * text        → "contains", case and accent insensitive
 * /regex/flags → JavaScript RegExp (the g and y flags are ignored)
 * When it matches, the occurrence goes to watch_hits and you are notified in private.
 */
const RULE_REGEX = /^\/(.+)\/([a-z]*)$/s;
const RULE_MAX_LEN = 200;

const withoutAccents = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// rule -> test function (compiled once, not on every message)
const rulesCompiled = new Map();

function compileRuleWatch(rule) {
    if (rulesCompiled.has(rule)) return rulesCompiled.get(rule);

    if (!rule || rule.length > RULE_MAX_LEN) {
        throw new Error(`a regra precisa ter de 1 a ${RULE_MAX_LEN} caracteres`);
    }

    let test;
    const m = rule.match(RULE_REGEX);

    if (m) {
        let re;
        try {
            re = new RegExp(m[1], m[2].replace(/[gy]/g, ''));
        } catch (e) {
            throw new Error(`regex inválida: ${e.message}`);
        }
        test = (textAlt) => re.test(textAlt);
    } else {
        const target = withoutAccents(rule);
        test = (textAlt) => withoutAccents(textAlt).includes(target);
    }

    rulesCompiled.set(rule, test);
    return test;
}

async function checkWatch({ msg, msgIdPure, body, chatId, chatName, isGroup, senderName, senderNumber, timestamp }) {
    // Your messages are left out: including /watch's own notices in your private chat
    if (msg.fromMe || !body) return;
    if (!findCommand('/watch')) return;

    const rules = getSetting('watch.rules');
    if (!rules.length) return;

    const matched = rules
        .map((rule, i) => ({ regra: rule, n: i + 1 }))
        .filter(({ regra: rule }) => {
            try {
                return compileRuleWatch(rule)(body);
            } catch {
                return false;
            }
        });

    if (!matched.length) return;

    // Only notifies about new occurrences (WhatsApp may resend the same message)
    const freshAlt2 = [];

    for (const c of matched) {
        const res = await dbRun(
            `INSERT OR IGNORE INTO watch_hits
                (rule, message_id, chat_id, chat_name, is_group, sender_name, sender_number, body, timestamp)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [c.regra, msgIdPure, chatId, chatName, isGroup, senderName, senderNumber, body, timestamp]
        );

        if (res.changes) freshAlt2.push(c);
    }

    if (!freshAlt2.length) return;

    let textAlt = '👀 *WATCH: MENSAGEM DETECTADA*\n\n';

    for (const c of freshAlt2) {
        textAlt += `🔎 *Regra #${c.n}:* ${c.regra}\n`;
    }

    if (isGroup) {
        textAlt += `👥 *Grupo:* ${chatName}\n`;
    }

    textAlt +=
        `👤 *Nome:* ${senderName}\n` +
        `📱 *Número:* ${senderNumber ? `+${senderNumber}` : 'Número indisponível'}\n` +
        `📅 *Enviada em:* ${formatData(timestamp)}\n` +
        `💬 *Texto:* "${await resolverMentions(body, msg.mentionedIds)}"`;

    printInfo(`/watch: regra(s) ${freshAlt2.map(c => `#${c.n}`).join(',')} casaram em '${chatName}' (${senderName})`);
    await client.sendMessage(client.info.wid._serialized, textAlt, { linkPreview: false });
}

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
        activeCommands().map(formatCommandHelp).join('\n\n' + '─'.repeat(50) + '\n\n') +
        '\n```';

    await msg.reply(helpText);
}

async function cmdDebug({ msg, opts }) {
    // Persisted in the 'debug.enabled' setting: survives restarts
    if (opts.opt.on) await setSetting('debug.enabled', true);
    if (opts.opt.off) await setSetting('debug.enabled', false);

    await msg.reply(isDebugMode() ? '🪲 Debug Ativado.' : '🪲 Debug Desativado.');
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

async function cmdNoffa({ msg, args, quotedMsg }) {
    const rainbowHearts = ['🌈', '🏳️‍🌈', '🏳️‍⚧️', '🧡', '💛', '💚', '💙', '💜'];

    // It used to use only the first word (argv[1]) and produced "undefined" with no argument.
    const text = [args, quotedMsg?.body].filter(Boolean).join(' ').trim();

    if (!text) {
        await msg.reply('Syntax: /noffa <texto> (ou responda uma mensagem)');
        return;
    }

    let index = 0;
    let rainbowText = text.replace(/ /g, () => ` ${rainbowHearts[index++ % rainbowHearts.length]} `);

    // The reply never starts with "/": it must not be read as a command (see markSentByBot)
    if (rainbowText.startsWith('/')) rainbowText = `${rainbowHearts[0]} ${rainbowText}`;

    await msg.reply(rainbowText);
}

/*
 * Currencies accepted by /crypto -a (<TOKEN>USDT pair on Binance) and their icons.
 * The active ones stay in the 'crypto.coins' setting.
 */
const CRYPTO_SUPPORTED = {
    BTC: '₿', ETH: 'Ξ', SOL: '◎', HYPE: 'Ⓗ', BNB: '🔶', XRP: '✕', DOGE: 'Ð',
    ADA: '₳', TRX: '🔺', AVAX: '🔻', LINK: '🔗', DOT: '●', LTC: 'Ł', TON: '💎',
    SUI: '💧', PEPE: '🐸', SHIB: '🐕', XLM: '🚀', NEAR: 'Ⓝ', UNI: '🦄'
};

async function cmdCrypto({ msg, opts }) {
    await dbReady;

    const active = getSetting('crypto.coins');
    const token = (v) => String(v ?? '').trim().toUpperCase().replace(/USDT$/, '');

    if (opts.opt.list) {
        const list = Object.entries(CRYPTO_SUPPORTED)
            .map(([sym, icon]) => `${active.includes(sym) ? '*' : ' '} ${icon} ${sym}`)
            .join('\n');

        await msg.reply('🪙 *MOEDAS SUPORTADAS*\n\n```\n' + list + '\n```\n_* = ativada_');
        return;
    }

    if (opts.opt.add !== null || opts.opt.del !== null) {
        // Touches the global configuration: bot owner only
        if (!msg.fromMe) {
            await msg.reply('⛔ Apenas o dono do bot pode alterar as moedas.');
            return;
        }

        const addAlt = opts.opt.add !== null;
        const sym = token(addAlt ? opts.opt.add : opts.opt.del);

        if (!sym) {
            await msg.reply('```' + getCommandSyntax('/crypto') + '```');
            return;
        }

        if (addAlt) {
            if (!CRYPTO_SUPPORTED[sym]) {
                await msg.reply(`❌ Moeda não suportada: ${sym}\n💡 _Veja as suportadas com /crypto -l_`);
                return;
            }
            if (active.includes(sym)) {
                await msg.reply(`ℹ️ ${sym} já está ativada.`);
                return;
            }
            await setSetting('crypto.coins', [...active, sym]);
            await msg.reply(`✅ ${CRYPTO_SUPPORTED[sym]} ${sym} adicionada.`);
            return;
        }

        if (!active.includes(sym)) {
            await msg.reply(`ℹ️ ${sym} não está ativada.`);
            return;
        }
        await setSetting('crypto.coins', active.filter(c => c !== sym));
        await msg.reply(`🗑️ ${sym} removida.`);
        return;
    }

    if (!active.length) {
        await msg.reply('ℹ️ Nenhuma moeda ativada.\n💡 _Adicione com /crypto -a <TOKEN>_');
        return;
    }

    try {
        const symbols = active.map(c => `${c}USDT`);

        const { data } = await axios.get('https://api.binance.com/api/v3/ticker/24hr', {
            params: { symbols: JSON.stringify(symbols) },
            timeout: 10000
        });

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

        // Keeps the configured order (Binance does not guarantee the response order)
        const coins = data.map(item => ({
            symbol: item.symbol.replace(/USDT$/, ''),
            icon: CRYPTO_SUPPORTED[item.symbol.replace(/USDT$/, '')] || '',
            price: Number(item.lastPrice),
            change: Number(item.priceChangePercent),
            high: Number(item.highPrice),
            low: Number(item.lowPrice),
            volume: Number(item.quoteVolume)
        })).sort((a, b) => active.indexOf(a.symbol) - active.indexOf(b.symbol));

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
                const rows = await dbAll('SELECT phone_number, timestamp FROM monitored_numbers LIMIT ?', [getSetting('monitor.max')]);

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
                const max = getSetting('monitor.max');
                if (total.n >= max) {
                    await msg.reply(`Limite de ${max} números monitorados atingido.`);
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

/*
 * Sticker from an image: 512x512 square crop framed in the MIDDLE
 * of the image (without this WhatsApp Web converts without centering). WebP is already
 * sticker and goes as it is; videos keep the whatsapp-web.js conversion.
 */
const STICKER_SIZE = 512;
const STICKER_MAX_BYTES = 100 * 1024;          // WhatsApp limit: static sticker
const STICKER_ANIMATED_MAX_BYTES = 500 * 1024;  // WhatsApp limit: animated sticker

async function fitSticker(media) {
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
                .resize(STICKER_SIZE, STICKER_SIZE, { fit: 'cover', position: 'centre' })
                .webp({ quality })
                .toBuffer();

            if (outputAlt.length <= maxBytes) break;
        }

        return new MessageMedia('image/webp', outputAlt.toString('base64'), 'sticker.webp');
    } catch (err) {
        // Without the crop the sticker still goes out, just not centered
        printError('/sticker: falha ao enquadrar a imagem, enviando sem recorte:', err.message);
        return media;
    }
}

async function cmdSticker({ msg, quotedMsg }) {
    if (!quotedMsg) {
        await msg.reply("Syntax: Faça um 'reply' utilizando /sticker");
        return;
    }

    // 1. Real WhatsApp media
    if (quotedMsg.hasMedia) {
        const media = await fitSticker(await quotedMsg.downloadMedia());
        await msg.reply(media, null, { sendMediaAsSticker: true, ...stickerMeta() });
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

    await msg.reply(await fitSticker(media), null, { sendMediaAsSticker: true, ...stickerMeta() });
}

let getInProgress = 0;

async function cmdGet({ msg, opts, quotedMsg, senderName }) {
    // Open to anyone: without a limit, several /get in a row exhaust CPU and disk
    if (getInProgress >= GET_MAX_CONCURRENT) {
        await msg.reply(`⏳ Já existem ${GET_MAX_CONCURRENT} downloads em andamento. Tente de novo em instantes.`);
        return;
    }

    getInProgress++;

    try {
        await runGet({ msg, opts, quotedMsg, senderName });
    } finally {
        getInProgress--;
    }
}

async function runGet({ msg, opts, quotedMsg, senderName }) {
    // Random: with Date.now() two /get in the same millisecond would use the same files
    const id = crypto.randomUUID();
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

        if (isDebugMode()) {
            printDebug(`urlInput=${urlInput} opts=`, opts);
        }

        if (!isValidHttpUrl(urlInput)) {
            throw new Error(`A URL '${urlInput}' é inválida. Ignorando`);
        }

        if (!(await isUrlPublic(urlInput))) {
            printInfo(`/get: URL recusada (host privado ou não resolvido) de '${senderName}': ${urlInput}`);
            throw new Error(`A URL '${urlInput}' aponta para um endereço não permitido. Ignorando`);
        }

        await msg.reply(`💡 Processando ${isSticker ? 'seu sticker' : 'sua mídia'}, aguarde.`, null, { linkPreview: false });

        fs.mkdirSync(TMP_DIR, { recursive: true });

        originalFile = path.join(TMP_DIR, `${id}_original.mp4`);
        outputFile = path.join(TMP_DIR, `${id}_output.${isAudio ? 'mp3' : 'mp4'}`);
        logCmdFile = path.join(TMP_DIR, `${id}_cmd.log`);
        logCmd = fs.openSync(logCmdFile, 'a');

        printInfo(`> Todo o output dos comandos salvo em ${logCmdFile}`);

        // Download video
        // --no-playlist: a playlist link would download everything; --max-filesize: does not fill the disk
        const cmdYtArgs = [
            '-f', 'mp4', '--merge-output-format', 'mp4',
            '--no-playlist',
            '--max-filesize', `${getSetting('get.maxDownloadMB')}M`,
            '-o', originalFile,
            '--', urlInput
        ];
        const cmdYt = [BIN_YT, ...cmdYtArgs].join(' ');

        try {
            printInfo(`> Executando: ${cmdYt}`);
            fs.writeSync(logCmd, `# Executando: ${cmdYt}\n`);
            await runCommand(BIN_YT, cmdYtArgs, logCmd);
        } catch (inner) {
            throw new Error(`Problemas para baixar com '${BIN_YT}'`, { cause: { inner, cmd: cmdYt } });
        }

        // Above --max-filesize yt-dlp aborts with no error and no file
        if (!fs.existsSync(originalFile)) {
            throw new Error(`Nada foi baixado (acima de ${getSetting('get.maxDownloadMB')} MB? veja o setting get.maxDownloadMB)`);
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

        const maxSizeMB = getSetting('get.maxSizeMB');
        if (fs.statSync(outputFile).size > maxSizeMB * 1024 * 1024) {
            throw new Error(`Arquivo muito grande para WhatsApp Web (máx. ${maxSizeMB} MB)`);
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

            const msgOpts = { linkPreview: false, ...stickerMeta() };

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
            await cleanWatchOld();

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
 * /show -3     → the last 3 (max. setting 'show.max')
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
        const expiresIn = paraMs(general.mais_antiga) + getSetting('cache.revokedRetentionDays') * DAY_MS;
        const daysAlt = Math.max(0, Math.ceil((expiresIn - Date.now()) / DAY_MS));
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

    textAlt += `\n💡 _Use /show -N para reexibir (máx. ${getSetting('show.max')})._`;

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
        if (!mediaIsPath(media_path)) continue;

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
    const max = getSetting('show.max');
    if (n > max) {
        notice = `\n_(limitado a ${max} por vez)_`;
        n = max;
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
                titulo: `${isStatus(row) ? '📸 *STATUS APAGADO*' : '❌ *MENSAGEM APAGADA*'} (${i + 1}/${rows.length})`,
                extras: [`🗑️ *Apagada em:* ${formatData(row.revoked_at)}`]
            });
        } catch (err) {
            printError(`/show: falha ao reenviar ${row.id}:`, err.message);
            await client.sendMessage(destination, `⚠️ Não consegui reenviar a mensagem ${i + 1}/${rows.length}: ${err.message}`);
        }

        if (i < rows.length - 1) await wait(getSetting('show.delayMs'));
    }
}

/*
 * /set
 * /set                  → lists all the settings and their values
 * /set <key>          → shows value, default and description
 * /set <key> <value>  → changes (list: items separated by comma or space)
 * /set -reset <key>   → back to default
 */
function formatValueSetting(value, sep = ', ', secret = false) {
    if (Array.isArray(value)) return value.length ? value.join(sep) : '(vazio)';
    if (typeof value === 'boolean') return value ? 'on' : 'off';
    if (value === '') return '(vazio)';
    // Secret: shows only the last 4 characters
    if (secret) return `••••${String(value).slice(-4)}`;
    return String(value);
}

async function cmdSet({ msg, opts, args }) {
    await dbReady;

    if (opts.opt.reset !== null) {
        const key = opts.opt.reset;
        const schema = SETTINGS_SCHEMA[key];

        if (!schema) {
            await msg.reply(`❌ Setting desconhecido: ${key}\n💡 _Veja todos com /set_`);
            return;
        }

        await setSetting(key, schema.default);
        await msg.reply(`♻️ *${key}* = ${formatValueSetting(getSetting(key), ', ', schema.secret)} _(padrão)_`);
        return;
    }

    const [key, ...rest] = opts.argv;

    if (!key) {
        const width = Math.max(...Object.keys(SETTINGS_SCHEMA).map(k => k.length));
        const list = Object.entries(SETTINGS_SCHEMA)
            .map(([k, s]) => `${k.padEnd(width)}  ${formatValueSetting(getSetting(k), s.separator ? ' | ' : ', ', s.secret)}`)
            .join('\n');

        await msg.reply('⚙️ *SETTINGS*\n\n```\n' + list + '\n```\n💡 _/set <chave> para detalhes_');
        return;
    }

    const schema = SETTINGS_SCHEMA[key];

    if (!schema) {
        await msg.reply(`❌ Setting desconhecido: ${key}\n💡 _Veja todos com /set_`);
        return;
    }

    if (!rest.length) {
        const limits = schema.type === 'number' ? ` (${schema.min}..${schema.max})` : '';
        const valueAlt = getSetting(key);
        // "One per line" list: one item per line in the display too
        const valueText = schema.separator && valueAlt.length
            ? '\n' + valueAlt.map((v, i) => `${i + 1}. ${v}`).join('\n')
            : formatValueSetting(valueAlt, ', ', schema.secret);

        await msg.reply(
            `⚙️ *${key}*\n${schema.desc}\n\n` +
            `*Valor:* ${valueText}\n` +
            `*Padrão:* ${formatValueSetting(schema.default)}\n` +
            `*Tipo:* ${schema.type}${limits}`
        );
        return;
    }

    // With separator (e.g.: watch.rules, one per line) uses the raw text: the tokenizer
    // would lose the line breaks and the quotes inside the rules
    const raw = schema.separator
        ? args.slice(args.indexOf(key) + key.length).trim().replace(/^(["'])([\s\S]*)\1$/, '$2')
        : rest.join(' ');

    try {
        const valueAlt = await setSetting(key, raw);
        printInfo(`Setting '${key}' alterado para ${schema.secret ? formatValueSetting(valueAlt, ', ', true) : JSON.stringify(valueAlt)}`);
        await msg.reply(`✅ *${key}* = ${formatValueSetting(valueAlt, schema.separator ? ' | ' : ', ', schema.secret)}`);
    } catch (e) {
        await msg.reply(`❌ Valor inválido para *${key}*: ${e.message}`);
    }
}

/*
 * /watch (alias /w)
 * /watch                     → the same as /watch -s (occurrences of all the rules)
 * /watch -l                  → lists the rules (no., rule, occurrences)
 * /watch -s [-N]             → summary of the messages that matched rule N (without N: all)
 *   /watch -a <texto|/regex/>  → adiciona regra
 * /watch -d -N               → removes rule N and its occurrences
 * /watch -f [-N]             → deletes rule N's occurrences (without N: of all); keeps the rules
 * The rules stay in the 'watch.rules' setting; the occurrences in the watch_hits table.
 * -l and -s show other people's conversations: outside your private chat, the reply goes there.
 */
const summarizeText = (textAlt, max = 100) => {
    const t = String(textAlt ?? '').replace(/\s+/g, ' ').trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

async function replyInPrivate({ msg, chatId }, textAlt) {
    const myId = client.info.wid._serialized;

    if ((await chatCurrentIds(chatId)).includes(myId)) {
        await msg.reply(textAlt);
        return;
    }

    await msg.reply('👀 Enviado no seu privado.');
    await client.sendMessage(myId, textAlt);
}

// "-2" or "2" in argv → 2; otherwise null
function ruleNumber(argv) {
    const m = String(argv.filter(Boolean)[0] ?? '').match(/^-?(\d+)$/);
    return m ? Number(m[1]) : null;
}

async function cmdWatch({ msg, opts, args, chatId }) {
    await dbReady;

    const rules = getSetting('watch.rules');
    const help = () => msg.reply('```' + getCommandSyntax('/watch') + '```');

    // -add uses the raw text: the rule can have spaces, quotes or start with "-"
    const add = args.match(/^-(?:add|a)(?:\s+([\s\S]*))?$/);

    if (add) {
        const rule = (add[1] ?? '').trim().replace(/^(["'])([\s\S]*)\1$/, '$2').trim();

        if (!rule) {
            await help();
            return;
        }

        if (rules.includes(rule)) {
            await msg.reply(`ℹ️ A regra #${rules.indexOf(rule) + 1} já existe: ${rule}`);
            return;
        }

        const max = getSetting('watch.max');
        if (rules.length >= max) {
            await msg.reply(`❌ Limite de ${max} regras atingido (setting watch.max).\n💡 _Remova uma com /watch -d -N_`);
            return;
        }

        try {
            await setSetting('watch.rules', [...rules, rule]);
        } catch (e) {
            await msg.reply(`❌ Regra inválida: ${e.message}`);
            return;
        }

        const type = RULE_REGEX.test(rule) ? 'regex' : 'texto';
        printInfo(`/watch: regra #${rules.length + 1} adicionada: ${rule}`);
        await msg.reply(`✅ Regra *#${rules.length + 1}* adicionada _(${type})_: ${rule}\n💡 _Avisos chegam no seu privado._`);
        return;
    }

    if (opts.opt.list) {
        if (!rules.length) {
            await msg.reply('👀 Nenhuma regra cadastrada.\n💡 _Adicione com /watch -a <texto|/regex/>_');
            return;
        }

        const count = new Map(
            (await dbAll('SELECT rule, COUNT(*) AS total FROM watch_hits GROUP BY rule'))
                .map(r => [r.rule, r.total])
        );

        const width = String(rules.length).length + 1;
        const list = rules
            .map((r, i) => `${`#${i + 1}`.padEnd(width)}  ${r}  (${count.get(r) ?? 0})`)
            .join('\n');

        await replyInPrivate({ msg, chatId },
            `👀 *WATCH: REGRAS* (${rules.length}/${getSetting('watch.max')})\n\n` +
            '```\n' + list + '\n```\n' +
            '_(entre parênteses: ocorrências guardadas)_\n' +
            '💡 _/watch -s -N para ver as mensagens da regra N._');
        return;
    }

    // With nothing: the same as /watch -s (occurrences of all the rules)
    if (opts.opt.show || !args.trim()) {
        let rule = null;

        if (opts.argv.filter(Boolean).length) {
            const n = ruleNumber(opts.argv);

            if (!n || n > rules.length) {
                await msg.reply(`❌ Regra inválida. Existem ${plural(rules.length, 'regra', 'regras')}: veja /watch -l`);
                return;
            }

            rule = rules[n - 1];
        }

        const filter = rule === null ? '' : 'WHERE rule = ?';
        const params = rule === null ? [] : [rule];
        const max = getSetting('watch.showMax');

        const { total } = await dbGet(`SELECT COUNT(*) AS total FROM watch_hits ${filter}`, params);
        const rows = await dbAll(
            `SELECT * FROM watch_hits ${filter} ORDER BY timestamp DESC LIMIT ?`,
            [...params, max]
        );

        let textAlt = '👀 *WATCH: OCORRÊNCIAS*\n';
        textAlt += rule === null
            ? '🔎 *Regras:* todas\n'
            : `🔎 *Regra #${rules.indexOf(rule) + 1}:* ${rule}\n`;
        textAlt += `📦 *Total:* ${total}${total > rows.length ? ` _(exibindo as ${rows.length} mais recentes)_` : ''}\n`;

        if (!rows.length) {
            textAlt += '\n_Nenhuma mensagem casou ainda._';
        }

        for (const [i, h] of rows.entries()) {
            // Current group name (the stored one may be the "Grupo <id>" fallback or out of date)
            const group = h.is_group ? (await groupResolverName(h.chat_id)) || h.chat_name : null;
            const whereAlt = h.is_group ? `👥 ${group} · 👤 ${h.sender_name}` : `👤 ${h.sender_name}`;
            const n = rules.indexOf(h.rule) + 1;
            const which = rule === null ? ` · 🔎 ${n ? `#${n}` : '(removida)'}` : '';

            textAlt += `\n${i + 1}. 📅 ${formatData(h.timestamp)}${which}\n`;
            textAlt += `    ${whereAlt}\n`;
            textAlt += `    💬 "${summarizeText(await resolverMentions(h.body))}"\n`;
        }

        await replyInPrivate({ msg, chatId }, textAlt);
        return;
    }

    if (opts.opt.del) {
        const n = ruleNumber(opts.argv);

        if (!n) {
            await help();
            return;
        }

        if (n > rules.length) {
            await msg.reply(`❌ A regra #${n} não existe. Existem ${plural(rules.length, 'regra', 'regras')}: veja /watch -l`);
            return;
        }

        const rule = rules[n - 1];

        await setSetting('watch.rules', rules.filter((_, i) => i !== n - 1));
        const res = await dbRun('DELETE FROM watch_hits WHERE rule = ?', [rule]);

        printInfo(`/watch: regra #${n} removida: ${rule}`);
        await msg.reply(
            `🗑️ Regra *#${n}* removida: ${rule}\n` +
            `🗄️ Ocorrências apagadas: *${res.changes}*` +
            (n <= rules.length - 1 ? '\n💡 _As regras seguintes foram renumeradas: veja /watch -l_' : '')
        );
        return;
    }

    if (opts.opt.flush) {
        let rule = null;

        if (opts.argv.filter(Boolean).length) {
            const n = ruleNumber(opts.argv);

            if (!n || n > rules.length) {
                await msg.reply(`❌ Regra inválida. Existem ${plural(rules.length, 'regra', 'regras')}: veja /watch -l`);
                return;
            }

            rule = rules[n - 1];
        }

        // Without -N deletes everything, including occurrences of already removed rules
        const res = rule === null
            ? await dbRun('DELETE FROM watch_hits')
            : await dbRun('DELETE FROM watch_hits WHERE rule = ?', [rule]);

        printInfo(`/watch -flush (${rule === null ? 'todas' : rule}): ${res.changes} ocorrências removidas`);
        await msg.reply(
            (rule === null
                ? '🧹 *Flush das ocorrências de todas as regras*\n'
                : `🧹 *Flush das ocorrências da regra #${rules.indexOf(rule) + 1}:* ${rule}\n`) +
            `🗄️ Ocorrências apagadas: *${res.changes}*\n` +
            '💡 _As regras continuam ativas: veja /watch -l_'
        );
        return;
    }

    await help();
}

// /kernel: current versions published on kernel.org
async function cmdKernel({ msg }) {
    try {
        const { data } = await axios.get('https://www.kernel.org/releases.json', { timeout: 15000 });

        const linesAlt = data.releases
            .filter(r => ['mainline', 'stable', 'longterm'].includes(r.moniker))
            .slice(0, 6)
            .map(r => `${r.moniker.padEnd(9)} ${r.version.padEnd(12)} ${r.released?.isodate ?? ''}`);

        await msg.reply(
            `🐧 *Linux ${data.latest_stable.version}* _(latest stable)_\n\n` +
            '```\n' + linesAlt.join('\n') + '\n```'
        );
    } catch (err) {
        printError('/kernel:', err.message);
        await msg.reply('❌ Não consegui consultar o kernel.org agora.');
    }
}

/*
 * /boletos: draw of group members
 */
// Draws `n` different participants (other than the bot itself)
function drawParticipants(participants, n) {
    const myUser = client.info?.wid?.user;
    const pool = participants.filter(p => p.id.user !== myUser);

    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    return pool.slice(0, n);
}

async function sendDraw(msg, chat, drawn, assembleText) {
    const mentions = drawn.map(p => p.id._serialized.split(':')[0]);
    const tags = drawn.map(p => `@${p.id.user}`);

    await client.sendMessage(chat.id._serialized, assembleText(tags), {
        mentions,
        quotedMessageId: msg.id._serialized
    });
}

async function cmdBills({ msg }) {
    const chat = await msg.getChat().catch(() => null);

    if (!chat?.isGroup) {
        await msg.reply('Apenas utilizado dentro de grupos.');
        return;
    }

    const drawn = drawParticipants(chat.participants, 2);

    if (drawn.length < 2) {
        await msg.reply('Membros insuficientes no grupo.');
        return;
    }

    await sendDraw(msg, chat, drawn, ([a, b]) =>
        `🥳 Parabéns ${a} e ${b} 🎉\n` +
        'Vocês foram sorteados para pagar um boleto! 💸✨\n' +
        'Anote o número: 📝 001 9 337370000000100 05009 401448 16060680935031\n' +
        'Boa sorte pagando! 😉💰'
    );
}

// /meme [search]: random imgflip template
async function cmdMeme({ msg, args }) {
    try {
        const { data } = await axios.get('https://api.imgflip.com/get_memes', { timeout: 15000 });
        const search = args.trim().toLowerCase();
        const memes = data.data.memes.filter(m => !search || m.name.toLowerCase().includes(search));

        if (!memes.length) {
            await msg.reply(`❌ Nenhum meme com "${args.trim()}".`);
            return;
        }

        const meme = memes[Math.floor(Math.random() * memes.length)];
        const { data: image, headers } = await axios.get(meme.url, { responseType: 'arraybuffer', timeout: 15000, maxContentLength: 10 * 1024 * 1024 });
        const media = new MessageMedia(headers['content-type'] || 'image/jpeg', Buffer.from(image).toString('base64'), 'meme.jpg');

        await msg.reply(media, null, { caption: `🖼️ ${meme.name}` });
    } catch (err) {
        printError('/meme:', err.message);
        await msg.reply('❌ Não consegui buscar um meme agora.');
    }
}

// /listageral: group members (number, name, admins)
async function cmdListGeneral({ msg }) {
    const chat = await msg.getChat().catch(() => null);

    if (!chat?.isGroup) {
        await msg.reply('Apenas utilizado dentro de grupos.');
        return;
    }

    const linesAlt = [];

    for (const p of chat.participants) {
        const jid = removeDeviceSuffix(p.id._serialized);
        const phoneJid = jid.endsWith('@lid') ? await resolveLidToPhone(jid) : jid;
        const contactAlt = await client.getContactById(phoneJid || jid).catch(() => null);
        const nameAlt = contactAlt?.name || contactAlt?.pushname || 'Desconhecido';
        const numberAlt = phoneJid?.endsWith('@c.us') ? `+${phoneJid.split('@')[0]}` : '(número oculto)';
        const admin = p.isSuperAdmin ? ' 👑' : p.isAdmin ? ' ⭐' : '';

        linesAlt.push(`${numberAlt} - ${nameAlt}${admin}`);
    }

    await msg.reply(`👥 *Membros de ${chat.name}* (${linesAlt.length})\n\n${linesAlt.join('\n')}`);
}

// /gif [tag]: random GIF from GIPHY, sent as a looping MP4.
// Key: GIPHY_API_KEY in config/.env or, if missing, the 'gif.giphy.api.key' setting
async function cmdGif({ msg, args }) {
    const apiKey = envOuSetting('GIPHY_API_KEY', 'gif.giphy.api.key');

    if (!apiKey) {
        await msg.reply('⚠️ Chave do GIPHY não configurada: defina GIPHY_API_KEY no config/.env ou use /set gif.giphy.api.key <chave>.');
        return;
    }

    try {
        const { data } = await axios.get('https://api.giphy.com/v1/gifs/random', {
            timeout: 15000,
            params: { api_key: apiKey, tag: args.trim() || getSetting('gif.tag'), rating: 'pg-13' }
        });

        const mp4 = data.data?.images?.original?.mp4;

        if (!mp4) {
            await msg.reply('❌ Nenhum GIF encontrado.');
            return;
        }

        const { data: video } = await axios.get(mp4, { responseType: 'arraybuffer', timeout: 15000, maxContentLength: 10 * 1024 * 1024 });
        const media = new MessageMedia('video/mp4', Buffer.from(video).toString('base64'), 'gif.mp4');

        await msg.reply(media, null, { sendVideoAsGif: true });
    } catch (err) {
        printError('/gif:', err.message);
        await msg.reply('❌ Não consegui buscar um GIF agora.');
    }
}

// /joke: JokeAPI in Portuguese (safe-mode)
async function cmdJoke({ msg }) {
    try {
        const { data } = await axios.get('https://v2.jokeapi.dev/joke/Any', { timeout: 15000, params: { lang: 'pt', 'safe-mode': '' } });

        if (data.error) throw new Error(data.message || 'erro da JokeAPI');

        await msg.reply(data.type === 'twopart' ? `${data.setup}\n\n... ${data.delivery} 🥁` : data.joke);
    } catch (err) {
        printError('/joke:', err.message);
        await msg.reply('❌ Não consegui buscar uma piada agora.');
    }
}

/*
 * /cve [max] [-highscore|-high [max]]: CVEs published on the NVD (nvd.nist.gov).
 * /cve [N]         → the N most recent ones from the last CVE_DAYS_RECENT days
 * /cve -high [N]   → the N most recent critical ones (CVSS v3 CRITICAL, ≥ 9) from the
 * last 'cve.maxDays' days
 * Without N uses the 'cve.max' setting.
 *
 * The cve.circl.lu API that zapzap used changed format and almost never brings the
 * CVSS score. Without a key the NVD accepts ~5 queries every 30s.
 */
const NVD_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const CVE_DAYS_RECENT = 2;

// The NVD wants ISO-8601 without the 'Z'
const nvdData = (d) => d.toISOString().replace('Z', '');

const periodDays = (daysAlt) => daysAlt === 1 ? 'último dia' : `últimos ${daysAlt} dias`;

// Preferred score: CVSS v3.1 > v4.0 > v3.0 > v2 (Primary metric, otherwise the first)
function noteCvss(cve) {
    const m = cve.metrics ?? {};

    for (const keyAlt of ['cvssMetricV31', 'cvssMetricV40', 'cvssMetricV30', 'cvssMetricV2']) {
        const metric = m[keyAlt]?.find(x => x.type === 'Primary') ?? m[keyAlt]?.[0];
        if (metric?.cvssData?.baseScore != null) {
            return { score: metric.cvssData.baseScore, severity: metric.cvssData.baseSeverity ?? metric.baseSeverity ?? '' };
        }
    }

    return null;
}

/*
 * The `max` most recently published CVEs in the last `dias`, newest first
 * to the oldest. The NVD sorts from oldest to newest and has no
 * reverse ordering: one query counts the total and the other fetches only the end.
 */
async function searchCvesRecent({ dias: daysAlt, max, critical = false }) {
    const end = new Date();
    const filter = {
        pubStartDate: nvdData(new Date(end.getTime() - daysAlt * DAY_MS)),
        pubEndDate: nvdData(end),
        noRejected: '',
        ...(critical && { cvssV3Severity: 'CRITICAL' })
    };

    const query = async (params) =>
        (await axios.get(NVD_URL, { params: { ...filter, ...params }, timeout: 30000 })).data;

    const { totalResults } = await query({ resultsPerPage: 1 });
    if (!totalResults) return [];

    const { vulnerabilities } = await query({ resultsPerPage: max, startIndex: Math.max(0, totalResults - max) });

    return vulnerabilities.map(v => v.cve).reverse();
}

function formatCve(cve) {
    const note = noteCvss(cve);
    const description = cve.descriptions?.find(d => d.lang === 'en')?.value ?? '';

    return `🛡️ *${cve.id}*${note ? ` — ${note.score} ${note.severity}` : ''}\n` +
           `${summarizeText(description, 220)}\n` +
           `https://nvd.nist.gov/vuln/detail/${cve.id}`;
}

async function cmdCve({ msg, opts }) {
    const critical = opts.given.has('highscore');
    const daysAlt = critical ? getSetting('cve.maxDays') : CVE_DAYS_RECENT;

    // the given <max> (/cve 5 or /cve -high 5) overrides the cve.max setting
    const { max: limitAlt } = SETTINGS_SCHEMA['cve.max'];
    const valueAlt = opts.opt.highscore ?? opts.argv[0] ?? getSetting('cve.max');
    const max = Number(valueAlt);

    if (!Number.isInteger(max) || max < 1 || max > limitAlt) {
        await msg.reply(`❌ Quantidade inválida: ${valueAlt}. Use de 1 a ${limitAlt}.\n💡 _/cve 5 ou /cve -high 5_`);
        return;
    }

    try {
        const cves = await searchCvesRecent({ dias: daysAlt, max, critical });

        if (!cves.length) {
            await msg.reply(`🛡️ Nenhuma CVE${critical ? ' crítica' : ''} publicada no ${periodDays(daysAlt)}.`);
            return;
        }

        const title = critical
            ? `🔥 *${cves.length} CVEs críticas mais recentes* _(CVSS ≥ 9, ${periodDays(daysAlt)})_`
            : `🛡️ *Últimas ${cves.length} CVEs publicadas* _(${periodDays(daysAlt)})_`;

        await msg.reply(`${title}\n\n${cves.map(formatCve).join('\n\n')}`, null, { linkPreview: false });
    } catch (err) {
        printError('/cve:', err.response?.status ?? '', err.message);
        await msg.reply('❌ Não consegui consultar o NVD agora (limite de consultas? tente em 30s).');
    }
}

// /tempo [city]: Open-Meteo (no API key)
const WEATHER_WMO = {
    0: ['☀️', 'Céu limpo'], 1: ['🌤️', 'Predominantemente limpo'], 2: ['⛅', 'Parcialmente nublado'],
    3: ['☁️', 'Nublado'], 45: ['🌫️', 'Neblina'], 48: ['🌫️', 'Neblina com geada'],
    51: ['🌦️', 'Garoa fraca'], 53: ['🌦️', 'Garoa'], 55: ['🌦️', 'Garoa forte'],
    56: ['🌧️', 'Garoa congelante'], 57: ['🌧️', 'Garoa congelante forte'],
    61: ['🌧️', 'Chuva fraca'], 63: ['🌧️', 'Chuva'], 65: ['🌧️', 'Chuva forte'],
    66: ['🌧️', 'Chuva congelante'], 67: ['🌧️', 'Chuva congelante forte'],
    71: ['🌨️', 'Neve fraca'], 73: ['🌨️', 'Neve'], 75: ['❄️', 'Neve forte'], 77: ['🌨️', 'Grãos de neve'],
    80: ['🌦️', 'Pancadas de chuva'], 81: ['🌧️', 'Pancadas de chuva fortes'], 82: ['⛈️', 'Pancadas violentas'],
    85: ['🌨️', 'Pancadas de neve'], 86: ['❄️', 'Pancadas de neve fortes'],
    95: ['⛈️', 'Trovoada'], 96: ['⛈️', 'Trovoada com granizo'], 99: ['⛈️', 'Trovoada com granizo forte']
};

const OPEN_METEO_GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const TIME_COLD = 5;   // °C: "It's freezing!"
const TIME_CALOR = 30; // °C: "So hot!"

// Geocoding kept in memory: a city's coordinates do not change and the city
// default (tempo.city) is queried all the time
const geoCache = new Map();
const GEO_CACHE_MAX = 100;

/*
 * Resolves "city[, state][, country]" to { name, admin1, country, latitude, longitude }
 * or null. Open-Meteo understands the whole text and picks the most
 * relevant (normally the most populous).
 */
async function geocodeCity(city) {
    const keyAlt = city.toLowerCase();
    if (geoCache.has(keyAlt)) return geoCache.get(keyAlt);

    const { data } = await axios.get(OPEN_METEO_GEO_URL, {
        timeout: 15000,
        params: { name: city, count: 1, language: 'pt' }
    });
    const local = data.results?.[0] ?? null;

    // Only stores hits: "not found" may be a typo corrected later
    if (local) {
        if (geoCache.size >= GEO_CACHE_MAX) geoCache.delete(geoCache.keys().next().value);
        geoCache.set(keyAlt, local);
    }

    return local;
}

async function queryTime({ latitude, longitude }) {
    const { data } = await axios.get(OPEN_METEO_URL, {
        timeout: 15000,
        params: {
            latitude,
            longitude,
            current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
            daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
            forecast_days: 1,
            timezone: 'auto'
        }
    });

    return data;
}

// Missing value (Open-Meteo sometimes sends null) becomes '-'
const measure = (valueAlt, unit) => valueAlt == null ? '-' : `${Math.round(valueAlt)}${unit}`;

function formatTime(local, { current: c, daily: d }) {
    const [iconAlt, description] = WEATHER_WMO[c.weather_code] ?? ['🌡️', `Código ${c.weather_code}`];
    const whereAlt = [local.name, local.admin1, local.country].filter(Boolean).join(', ');
    const temp = Math.round(c.temperature_2m);

    let textAlt =
        `${iconAlt} *Tempo em ${whereAlt}*\n\n` +
        `${description}\n` +
        `🌡️ *Agora:* ${measure(c.temperature_2m, '°C')} _(sensação ${measure(c.apparent_temperature, '°C')})_\n` +
        `📈 *Máx:* ${measure(d.temperature_2m_max?.[0], '°C')}  📉 *Mín:* ${measure(d.temperature_2m_min?.[0], '°C')}\n` +
        `💧 *Umidade:* ${measure(c.relative_humidity_2m, '%')}  🌬️ *Vento:* ${measure(c.wind_speed_10m, ' km/h')}\n` +
        `☔ *Chance de chuva:* ${measure(d.precipitation_probability_max?.[0], '%')}`;

    if (temp <= TIME_COLD) textAlt += '\n\n🥶 Tá congelando!';
    if (temp >= TIME_CALOR) textAlt += '\n\n🔥 Que calor da porra!';

    return textAlt;
}

async function cmdTime({ msg, args }) {
    // Without a city uses the tempo.city setting
    const city = args.trim() || getSetting('tempo.city');

    try {
        const local = await geocodeCity(city);

        if (!local) {
            await msg.reply(`❌ Cidade não encontrada: ${city}\n💡 _Tente com estado e país: /tempo Niteroi, Rio de Janeiro, Brazil_`);
            return;
        }

        await msg.reply(formatTime(local, await queryTime(local)));
    } catch (err) {
        printError('/tempo:', err.response?.status ?? '', err.message);
        await msg.reply('❌ Não consegui consultar o tempo agora.');
    }
}

// /ualisu: Walissu CVE BOT (uses the /boletos draw and the /cve CVEs)
async function cmdUalisu({ msg }) {
    const chat = await msg.getChat().catch(() => null);

    if (!chat?.isGroup) {
        await msg.reply('Apenas utilizado dentro de grupos.');
        return;
    }

    const drawn = drawParticipants(chat.participants, 2);

    if (drawn.length < 2) {
        await msg.reply('Membros insuficientes no grupo.');
        return;
    }

    try {
        const cves = await searchCvesRecent({ dias: 2, max: 50 });
        const cve = cves[Math.floor(Math.random() * cves.length)];

        if (!cve) {
            await msg.reply('🛡️ Nenhuma CVE publicada nos últimos 2 dias.');
            return;
        }

        await sendDraw(msg, chat, drawn, ([a, b]) =>
            `Hey ${a} e ${b}, aqui é o Walissu CVE BOT! Dá uma olhada nesse CVE ou você vai sair da rave 😊\n\n` +
            `${formatCve(cve)}\n\n` +
            'Cadê o exploit? Preciso sair de Brasília!'
        );
    } catch (err) {
        printError('/ualisu:', err.message);
        await msg.reply('❌ Não consegui consultar o NVD agora.');
    }
}

/*
 * /bot: bot state (settings 'bot.paused' and 'bot.adminMode', survive restarts)
 *   /bot        → mostra o estado
 *   /bot -on    → ativa
 * /bot -off   → turns off: ALL commands are ignored, including yours, except /bot
 * /bot +admin → admin mode: only the owner uses commands (other people's are silently ignored)
 * /bot -admin → turns admin mode off (each command goes back to following its own onlyAdmin)
 * Options combine: /bot -on +admin. Deleted-message recovery and /watch keep working.
 * The parser only recognizes options with '-', so '+admin' arrives in opts.argv.
 */
function stateBot() {
    return (getSetting('bot.paused')
        ? '⏸️ *Bot:* desligado (todos os comandos são ignorados)'
        : '▶️ *Bot:* ativo') + '\n' +
        (getSetting('bot.adminMode')
            ? '🔒 *Modo admin:* ligado (só o dono usa comandos)'
            : '🔓 *Modo admin:* desligado');
}

async function cmdBot({ msg, opts }) {
    const { on, off, admin: adminOff } = opts.opt;
    const adminOn = opts.argv.includes('+admin');
    const unknown = opts.argv.filter(a => a !== '+admin');

    if (unknown.length || (on && off) || (adminOn && adminOff)) {
        await msg.reply('❌ Uso: /bot [-on|-off] [+admin|-admin]\n💡 _/bot -h para ajuda_');
        return;
    }

    if (on || off) await setSetting('bot.paused', off);
    if (adminOn || adminOff) await setSetting('bot.adminMode', adminOn);

    await msg.reply(stateBot());
}

/*
 * /news <-category> [amount]: headlines from the category's RSS feeds.
 * Categories in NEWS_CATEGORIES, each with its feeds in the 'news.<category>' setting;
 * several together add up the feeds (/news -g1 -gazeta). Without a category shows the help.
 * amount → 1 to 10 (default: 'news.max' setting)
 */
const NEWS_CATEGORIES = {
    hack: '🏴‍☠️ *Hacking News*',
    g1: '📰 *g1*',
    gazeta: '📰 *Gazeta do Povo*',
    brasil: '🇧🇷 *Brasil*'
};

const ENTITIES_XML = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

// A single pass: "&amp;lt;" becomes "&lt;" (and not "<"), as it should
const decodeEntities = (s) => String(s ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (ent, dec, hex, nameAlt) => {
        if (nameAlt) return ENTITIES_XML[nameAlt.toLowerCase()] ?? ent;
        const codeAlt = dec ? Number(dec) : parseInt(hex, 16);
        return codeAlt <= 0x10FFFF ? String.fromCodePoint(codeAlt) : ent;
    })
    .trim();

// Decoded content of the first <tag> of the XML snippet
const tagXml = (xml, tag) => decodeEntities(xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]);

async function readFeed(url) {
    // Some sites (e.g.: BleepingComputer) refuse axios' default User-Agent with 403
    const { data: xml } = await axios.get(url, { responseType: 'text', timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (ZapBot RSS reader)' } });
    const sourceAlt = tagXml(xml.match(/<channel>[\s\S]*?<\/title>/)?.[0] ?? '', 'title') || new URL(url).hostname;

    return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/g)]
        .map(([item]) => ({
            fonte: sourceAlt,
            titulo: tagXml(item, 'title'),
            link: tagXml(item, 'link'),
            data: Date.parse(tagXml(item, 'pubDate')) || 0
        }))
        .filter(i => i.titulo)
        .sort((a, b) => b.data - a.data);
}

async function cmdNews({ msg, opts }) {
    const categories = Object.keys(NEWS_CATEGORIES).filter(c => opts.opt[c]);

    if (!categories.length) {
        await msg.reply('```' + getCommandSyntax('/news') + '```');
        return;
    }

    const { max: limitAlt } = SETTINGS_SCHEMA['news.max'];
    const valueAlt = opts.argv[0] ?? getSetting('news.max');
    const max = Number(valueAlt);

    if (!Number.isInteger(max) || max < 1 || max > limitAlt) {
        await msg.reply(`❌ Quantidade inválida: ${valueAlt}. Use de 1 a ${limitAlt}.\n💡 _/news -g1 5_`);
        return;
    }

    const feeds = categories.flatMap(c => getSetting(`news.${c}`));

    if (!feeds.length) {
        await msg.reply(`ℹ️ Nenhum feed configurado.\n💡 _Adicione com /set news.${categories[0]} <url1> <url2>_`);
        return;
    }

    const results = await Promise.allSettled(feeds.map(readFeed));
    const bySource = [];

    results.forEach((r, i) => {
        if (r.status === 'fulfilled') bySource.push(r.value);
        else printError(`/news: feed ${feeds[i]} falhou:`, r.reason?.message);
    });

    // Each source takes at most its slice: otherwise the one that publishes more takes the whole list
    const slice = Math.ceil(max / Math.max(1, bySource.length));
    const items = bySource
        .flatMap(list => list.slice(0, slice))
        .sort((a, b) => b.data - a.data)
        .slice(0, max);

    if (!items.length) {
        await msg.reply('❌ Não consegui buscar as manchetes agora.');
        return;
    }

    const linesAlt = items.map((i, n) =>
        `${n + 1}. *${i.titulo}*\n_${i.fonte}${i.data ? ` · ${formatData(i.data)}` : ''}_${i.link ? `\n${i.link}` : ''}`);

    const title = categories.length === 1 ? NEWS_CATEGORIES[categories[0]] : '📰 *News*';

    await msg.reply(`${title}\n\n${linesAlt.join('\n\n')}`, null, { linkPreview: false });
}

/*
 * /gpt: asks ChatGPT. Key and timeout come from config/.env (OPENAI_API_KEY,
 * OPENAI_TIMEOUT_MS) or, if they are missing, from the settings 'openai.api.key' and
 * 'openai.timeout.ms'. The key is never logged nor echoed: the returned error is only
 * the API message.
 */
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL_DEFAULT = 'gpt-4o-mini';
const GPT_INSTRUCTIONS = 'Você é um assistente no WhatsApp. Responda de forma direta, em português, salvo se pedirem outro idioma.';

// OpenAI error → message for the chat (never contains the key)
function errorOpenAi(err, timeout) {
    if (err.code === 'ECONNABORTED') return `⏱️ A OpenAI não respondeu em ${timeout / 1000}s. Tente de novo ou aumente o openai.timeout.ms.`;
    if (err.response?.status === 401) return '🔑 API key da OpenAI inválida. Confira o OPENAI_API_KEY ou o openai.api.key.';
    if (err.response?.status === 429) return '💸 Limite ou créditos da OpenAI esgotados. Tente mais tarde.';
    return `❌ Erro no /gpt: ${err.response?.data?.error?.message || err.message}`;
}

async function cmdGpt({ msg, args, quotedMsg }) {
    const apiKey = envOuSetting('OPENAI_API_KEY', 'openai.api.key');

    if (!apiKey) {
        await msg.reply('⚠️ API key da OpenAI não encontrada: o /gpt está desativado.\n💡 _Defina OPENAI_API_KEY no config/.env ou use /set openai.api.key <chave>_');
        return;
    }

    // Replying to a message, its text goes before the question
    const question = [quotedMsg?.body, args].filter(Boolean).join('\n\n').trim();

    if (!question) {
        await msg.reply('```' + getCommandSyntax('/gpt') + '```');
        return;
    }

    const timeout = envOuSetting('OPENAI_TIMEOUT_MS', 'openai.timeout.ms');

    try {
        // "digitando..." enquanto a OpenAI responde (pode levar alguns segundos)
        msg.getChat().then(chat => chat.sendStateTyping()).catch(() => {});

        const { data } = await axios.post(OPENAI_URL, {
            model: process.env.OPENAI_MODEL?.trim() || OPENAI_MODEL_DEFAULT,
            messages: [
                { role: 'system', content: GPT_INSTRUCTIONS },
                { role: 'user', content: question }
            ]
        }, {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout
        });

        let reply = data.choices?.[0]?.message?.content?.trim() || '(resposta vazia)';

        // The reply never starts with "/": it must not be read as a command (see markSentByBot)
        if (reply.startsWith('/')) reply = `🤖 ${reply}`;

        await msg.reply(reply);
    } catch (err) {
        // On a 401 OpenAI's message carries a piece of the key: it does not go to the log
        const status = err.response?.status;
        printError('/gpt:', status ?? '', status === 401 ? 'API key inválida' : err.response?.data?.error?.message || err.message);
        await msg.reply(errorOpenAi(err, timeout));
    }
}

// bot-config.json cmd -> handler
const HANDLERS = {
    '/help': cmdHelp,
    '/debug': cmdDebug,
    '/uptime': cmdUptime,
    '/ping': cmdPing,
    '/noffa': cmdNoffa,
    '/everyone': cmdEveryone,
    '/monitor': cmdMonitor,
    '/crypto': cmdCrypto,
    '/sticker': cmdSticker,
    '/get': cmdGet,
    '/cache': cmdCache,
    '/show': cmdUndo,
    '/set': cmdSet,
    '/watch': cmdWatch,
    '/kernel': cmdKernel,
    '/boletos': cmdBills,
    '/meme': cmdMeme,
    '/listageral': cmdListGeneral,
    '/gif': cmdGif,
    '/joke': cmdJoke,
    '/cve': cmdCve,
    '/tempo': cmdTime,
    '/ualisu': cmdUalisu,
    '/bot': cmdBot,
    '/news': cmdNews,
    '/gpt': cmdGpt
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

        // Group: name looked up by chatId (_data.chat may carry the wrong name)
        const chatName =
            (isGroup ? await groupResolverName(chatId) : null) ||
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

        if (isDebugMode()) {
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
                    const extension = nameSafe(media.mimetype?.split('/')[1]?.split(';')[0], 'bin');
                    const fileAlt = path.join(getFolderMedia(), `${nameSafe(msgIdPure, `fallback_${timestamp}`)}.${extension}`);

                    if (!mediaIsPath(fileAlt)) throw new Error(`caminho de mídia inválido: ${fileAlt}`);

                    fs.writeFileSync(fileAlt, Buffer.from(media.data, 'base64'));
                    localMediaPath = fileAlt;
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

        const body = (msg.body || '').trim();
        // The bot's own reply is never a command, even starting with "/" (see markSentByBot)
        const sentByBot = msg.fromMe && body.startsWith('/') && wasSentByBot(body);
        const caller = body.startsWith('/') && !sentByBot ? body.split(/\s+/, 1)[0] : null;

        if (sentByBot) printInfo(`Mensagem do próprio bot começando com '/' ignorada como comando: ${body.slice(0, 60)}`);
        const command = caller ? findCommand(caller) : null;

        /*
         * Watch: messages that are not commands go through the /watch rules
         */
        if (!command) {
            await checkWatch({
                msg, msgIdPure, body, chatId, chatName, isGroup, senderName, senderNumber, timestamp
            }).catch(err => printError('/watch: erro ao verificar regras:', err.message));
        }

        /*
         * Comandos
         */
        if (!caller) return;

        const args = body.slice(caller.length).trim();

        if (!command) {
            if (isDebugMode()) printDebug(`Comando '${caller}' não encontrado`);
            return;
        }

        // Bot off: everything ignored (including your commands) until /bot -on
        if (getSetting('bot.paused') && command.cmd !== '/bot') {
            printInfo(`Comando '${command.cmd}' ignorado: bot desligado (/bot -on para ativar)`);
            return;
        }

        // Admin mode (/bot +admin): other people's commands are silently ignored
        if (getSetting('bot.adminMode') && !msg.fromMe) {
            printDebug(`Comando '${command.cmd}' de ${senderName} ignorado: modo admin`);
            return;
        }

        /*
         * Command restricted to the bot owner: silently ignored in the chat and only warns
         * in your private chat. Avoids that, with several zapbots in the same group, the command
         * of one person be executed by everyone.
         */
        if (!msg.fromMe && command.onlyAdmin) {
            if (isDebugMode()) {
                messageToSelf(`⚠️ ${senderName} tentou executar ${command.cmd} dentro de ${chatName}, mas sem permissão`);
            }
            return;
        }

        printDebug(isGroup
            ? `Executando comando '${body}' de '${senderName}' no grupo '${chatName}'`
            : `Executando comando '${body}' em '${chatName}'`);

        const opts = GetOptFromCommand(args, command);

        if (isDebugMode()) {
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
