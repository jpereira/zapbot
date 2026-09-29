/*
 * ZapBot - Bot para WhatsApp baseado no whatsapp-web.js
 *
 * Recupera mensagens apagadas, baixa vídeos (/get), cria figurinhas,
 * vigia mensagens por texto/regex (/watch), monitora contatos e mais. Os comandos são definidos em
 * config/bot-config.json e implementados neste arquivo (ver HANDLERS).
 *
 * Versão:  veja package.json
 * Autor:   Jorge Pereira <jpereiran@gmail.com>
 * Site:    https://github.com/jpereira/zapbot
 *
 * Copyright (c) 2026 Jorge Pereira
 *
 * Licenciado sob a licença MIT. É permitido usar, copiar, modificar,
 * mesclar, publicar, distribuir, sublicenciar e/ou vender cópias deste
 * software, desde que este aviso de copyright seja mantido.
 *
 * O SOFTWARE É FORNECIDO "COMO ESTÁ", SEM GARANTIA DE QUALQUER TIPO.
 *
 * Projeto não oficial, sem vínculo com o WhatsApp ou a Meta. Usar bots em
 * contas pessoais viola os Termos de Serviço do WhatsApp e pode levar ao
 * banimento do número. Use por sua conta e risco.
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

// Carrega o .env antes de qualquer leitura de process.env
dotenv.config();

/*
 * Constantes
 */
const BOT_START_TIME = Date.now();
let BOT_AUTHENTICATED_TIME = 0;

// Tempo máximo que o WhatsApp permite apagar para todos: 68 horas em milissegundos
const MAX_DELETE_WINDOW = 68 * 60 * 60 * 1000;

// 1 dia em milissegundos (retenção das apagadas: setting 'cache.revokedRetentionDays')
const DAY_MS = 24 * 60 * 60 * 1000;

const CACHE_DIR = path.join(__dirname, 'cache');
const MEDIA_DIR = path.join(CACHE_DIR, 'media'); // mídias salvas para recuperar mensagens apagadas
const TMP_DIR = path.join(CACHE_DIR, 'tmp');     // arquivos temporários do /get

const BIN_FFMPEG = '/usr/bin/ffmpeg';
const BIN_YT = '/venv/bin/yt-dlp';

// /get: cada yt-dlp/ffmpeg é morto após este tempo; no máximo N downloads ao mesmo tempo
const GET_TIMEOUT_MS = 5 * 60 * 1000;
const GET_MAX_CONCURRENT = 2;

/*
 * Utilitários de tempo e log
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
    // [0] Error, [1] getCaller, [2] printX, [3] quem chamou printX
    return new Error().stack.split('\n')[3]?.trim()?.replace('at ', '');
}

/*
 * Todos os print* aceitam vários argumentos (como console.log).
 * Antes, printError('msg:', err.message) descartava o segundo argumento.
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

// O debug mode vem do setting 'debug.enabled' (padrão: ligado se APP_ENV=dev, sem diferenciar maiúsculas)
printInfo(`Running in APP_ENV=${APP_ENV} QRCODE_EMAIL_ENABLE=${process.env.QRCODE_EMAIL_ENABLE}`);

/*
 * Banco de dados (SQLite)
 */
const dbPath = path.join(CACHE_DIR, 'bot_database.db');
fs.mkdirSync(CACHE_DIR, { recursive: true });

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) return printError('Erro ao conectar ao SQLite:', err.message);
    printInfo(`Conectado com sucesso ao banco de dados SQLite: ${dbPath}`);
});

// Versões com Promise para usar async/await
const dbGet = (sql, params = []) => new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));

const dbAll = (sql, params = []) => new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));

const dbRun = (sql, params = []) => new Promise((resolve, reject) =>
    db.run(sql, params, function (err) { return err ? reject(err) : resolve(this); }));

/*
 * Criação das tabelas.
 * Tudo em sequência (await): antes, o CREATE TABLE podia ainda não ter
 * terminado quando a primeira consulta chegava.
 *
 * Handlers que usam o banco fazem `await dbPronto` antes de consultar.
 */
async function inicializarBanco() {
    // Histórico de quando os contatos monitorados ficam online
    await dbRun(`
        CREATE TABLE IF NOT EXISTS presence_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone_number TEXT,
            display_name TEXT,
            status TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Números monitorados via /monitor
    await dbRun(`
        CREATE TABLE IF NOT EXISTS monitored_numbers (
            phone_number TEXT PRIMARY KEY,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Mensagens recebidas (para recuperar as apagadas)
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

    // Consulta do /show: apagadas de um chat, das mais recentes para as mais antigas
    await dbRun('CREATE INDEX IF NOT EXISTS idx_messages_chat_revoked ON messages (chat_id, revoked, revoked_at)');

    // Configurações gerais do bot (chave -> valor em JSON)
    await dbRun(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Ocorrências do /watch: mensagens que casaram com alguma regra do setting 'watch.rules'.
    // UNIQUE(rule, message_id): a mesma mensagem não gera dois avisos para a mesma regra.
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

    await carregarSettings();

    for (const dir of [MEDIA_DIR, TMP_DIR]) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            printInfo(`Creating ${dir}`);
        }
    }
}

/*
 * Settings: configurações gerais persistidas na tabela `settings`.
 * Carregadas no boot para `settings` (memória); getSetting() lê de lá e
 * setSetting() valida, grava no banco e na memória. Alteráveis pelo /set.
 *
 * Cada chave declara: default (gravado no primeiro boot, sem sobrescrever o
 * existente), type (boolean | number | string | list), desc e, opcionalmente,
 * min/max (number), item() para normalizar/validar cada item de uma list e
 * separator (list cujos itens podem ter espaço/vírgula: ex. '\n', um por linha).
 */
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
            const nome = v.startsWith('/') ? v.toLowerCase() : `/${v.toLowerCase()}`;
            const command = botConfig.commands.find(c => c.cmd === nome || c.aliases?.includes(nome));
            if (!command) throw new Error(`comando desconhecido: ${nome}`);
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
            compilarRegraWatch(v); // lança Error se a regra for inválida
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
    }
};

const settings = new Map();

/*
 * Valida/normaliza um valor para a chave. Aceita o valor já tipado (vindo do
 * banco) ou texto (vindo do /set). Lança Error com a mensagem para o usuário.
 */
function validarSetting(key, value) {
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
            if (!s || s.length > 100) throw new Error('precisa ter de 1 a 100 caracteres');
            return s;
        }

        case 'list': {
            const itens = Array.isArray(value)
                ? value.map(String)
                : String(value ?? '').split(schema.separator ?? /[\s,]+/);
            const lista = itens.map(v => v.trim()).filter(Boolean).map(schema.item ?? (v => v));
            return [...new Set(lista)];
        }
    }

    throw new Error(`tipo inválido no schema: ${schema.type}`);
}

async function carregarSettings() {
    for (const [key, schema] of Object.entries(SETTINGS_SCHEMA)) {
        await dbRun('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [key, JSON.stringify(schema.default)]);
    }

    for (const row of await dbAll('SELECT key, value FROM settings')) {
        if (!SETTINGS_SCHEMA[row.key]) {
            printInfo(`Setting '${row.key}' desconhecido, ignorado.`);
            continue;
        }

        try {
            settings.set(row.key, validarSetting(row.key, JSON.parse(row.value)));
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

async function setSetting(key, value) {
    value = validarSetting(key, value);

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

const dbPronto = inicializarBanco().catch((e) => {
    console.error('Bootstrap Erro:', e);
    process.exit(1);
});

/*
 * Configuração dos comandos
 */
const botConfig = require('./config/bot-config.json');

// "disabled": true tira o comando do bot: não responde, não aparece no /help
const disabledCommands = botConfig.commands.filter(c => c.disabled).map(c => c.cmd);
botConfig.commands = botConfig.commands.filter(c => !c.disabled);

const commands = botConfig.commands.map(c => c.cmd);
printSuccess(`Loaded ${commands.length} callers (${commands.join(',')})`);

if (disabledCommands.length) {
    printInfo(`Disabled ${disabledCommands.length} callers (${disabledCommands.join(',')})`);
}

// Comandos ativos: os do bot-config menos os do setting 'commands.disabled' (via /set)
function activeCommands() {
    const desativados = getSetting('commands.disabled');
    return botConfig.commands.filter(c => !desativados.includes(c.cmd));
}

function findCommand(name) {
    return activeCommands().find(c => c.cmd === name || c.aliases?.includes(name));
}

/*
 * E-mail do QR Code
 */
const transporter = nodemailer.createTransport({
    host: process.env.QRCODE_EMAIL_SMTP_HOST,
    port: process.env.QRCODE_EMAIL_SMTP_PORT,
    secure: true, // SSL (465)
    auth: {
        user: process.env.QRCODE_EMAIL_SMTP_USER,
        pass: process.env.QRCODE_EMAIL_SMTP_PASS
    }
    // Sem "tls.rejectUnauthorized: false": o certificado do SMTP precisa ser válido,
    // senão um MITM captura a senha e o QR Code (= sessão do WhatsApp).
});

/*
 * Execução de processos externos (yt-dlp / ffmpeg)
 */
function runCommand(bin, args, logFd, timeoutMs = GET_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const child = spawn(bin, args, { stdio: ['ignore', logFd, logFd] });

        // Sem isto um download/conversão travado segura o /get (e o disco) para sempre
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
 * Anti-SSRF do /get: o yt-dlp roda na rede do servidor, então uma URL como
 * http://192.168.0.1/ ou http://localhost:2375/ alcançaria a rede interna.
 * Recusamos hosts que resolvem para endereços privados/loopback/link-local.
 * (Não cobre redirects nem DNS rebinding feitos depois pelo yt-dlp.)
 */
const REDES_BLOQUEADAS = new net.BlockList();

for (const [rede, prefixo] of [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
    ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16],
    ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]
]) {
    REDES_BLOQUEADAS.addSubnet(rede, prefixo, 'ipv4');
}

for (const [rede, prefixo] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) {
    REDES_BLOQUEADAS.addSubnet(rede, prefixo, 'ipv6');
}

function isEnderecoBloqueado(address) {
    // ::ffff:10.0.0.1 (IPv4 mapeado em IPv6) é checado como IPv4
    const v4 = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
    if (v4) return REDES_BLOQUEADAS.check(v4, 'ipv4');

    return REDES_BLOQUEADAS.check(address, net.isIPv6(address) ? 'ipv6' : 'ipv4');
}

async function isUrlPublica(str) {
    const host = new URL(str).hostname.replace(/^\[|\]$/g, '');

    const enderecos = net.isIP(host)
        ? [{ address: host }]
        : await dns.lookup(host, { all: true }).catch(() => []);

    return enderecos.length > 0 && !enderecos.some(e => isEnderecoBloqueado(e.address));
}

function GetOptFromCommandForFfmpeg(opts, originalFile, outputFile) {
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

    if (isSticker) {
        args.push('-t', '6');
    } else if (startSec != null && endSec != null && Number(endSec) > Number(startSec)) {
        args.push('-t', String(Number(endSec) - Number(startSec)));
    }

    args.push('-i', originalFile);

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
        // escala até cobrir o quadrado e o crop (centralizado por padrão) corta as sobras
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
 * Parser de opções estilo getopt
 */
function tokenizeCommand(input) {
    return [...input.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)]
        .map(m => m[1] ?? m[2] ?? m[3]);
}

function normalizeArg(arg) {
    // Corrige o typo comum: uol..com.br
    return arg.replace('..com.br', '.com.br');
}

function isOption(token) {
    return token.startsWith('-') && token.length > 1;
}

/*
 * Converte "-ss 10 -a https://..." em:
 *   { opt: { startSec: '10', audio: true, ..., argv: [...] }, argv: ['https://...'] }
 *
 * Opções com "values" vazios são booleanas; com values esperam um valor.
 * "-help" / "-h" são adicionados automaticamente a todo comando.
 */
function GetOptFromCommand(input, config = {}) {
    const tokens = tokenizeCommand(input);

    // Mesmo array em result.argv e result.opt.argv
    const argv = [];
    const result = { opt: { argv }, argv };

    const commandOptions = [
        { opts: ['help', 'h'], values: [], desc: 'Exibe ajuda.' },
        ...(config.cmd_opts ?? [])
    ];

    // alias -> definição canônica (ex.: ss -> startSec)
    const optionMap = new Map();

    for (const option of commandOptions) {
        if (!option.opts?.length) continue; // definições de argv posicional

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

        // Ignora o próprio comando (/get, /download...)
        if (i === 0 && token.startsWith('/')) continue;

        if (!isOption(token)) {
            argv.push(normalizeArg(token));
            continue;
        }

        const option = optionMap.get(token.slice(1));

        // Opção desconhecida vai para argv
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

        // Opção com múltiplos valores
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
 * Formata a ajuda de um comando no estilo "command -help".
 * (Antes existiam duas funções quase idênticas; agora só esta.)
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

    // Uma única coluna para Options e Arguments ficarem alinhados
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
 * Utilitários de cache
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
function obterPastaMidia() {
    const agora = new Date();
    const pastaDestino = path.join(
        MEDIA_DIR,
        String(agora.getFullYear()),
        String(agora.getMonth() + 1).padStart(2, '0'),
        String(agora.getDate()).padStart(2, '0')
    );

    fs.mkdirSync(pastaDestino, { recursive: true });
    return pastaDestino;
}

/*
 * O id e o mimetype da mensagem vêm do cliente de quem enviou: um cliente
 * modificado pode mandar "../../app/app" como id. Só letras, números, _ e -.
 */
const nomeSeguro = (valor, padrao) => String(valor ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || padrao;

// true se `arquivo` está dentro de MEDIA_DIR (vale também para caminhos já gravados no banco)
function isCaminhoDeMidia(arquivo) {
    if (!arquivo) return false;
    const relativo = path.relative(MEDIA_DIR, path.resolve(arquivo));
    return relativo !== '' && !relativo.startsWith('..') && !path.isAbsolute(relativo);
}

/*
 * Limpeza do banco + mídias:
 *  - mensagens normais: removidas após a janela de "apagar para todos" (68h),
 *    porque depois disso não podem mais ser apagadas;
 *  - mensagens APAGADAS (revoked=1): guardadas por 'cache.revokedRetentionDays' (padrão 30),
 *    para o /show continuar funcionando.
 * Com o /cache -clean -force, as duas janelas são 0 e tudo é removido.
 */
async function limparCacheAntigo(maxDeleteWin = MAX_DELETE_WINDOW, retencaoApagadas = getSetting('cache.revokedRetentionDays') * DAY_MS) {
    await dbPronto;

    const agora = Date.now();
    const filtro = `
        (revoked = 0 AND timestamp < ?)
        OR (revoked = 1 AND COALESCE(revoked_at, timestamp) < ?)
    `;
    const params = [agora - maxDeleteWin, agora - retencaoApagadas];

    try {
        const rows = await dbAll(`SELECT media_path FROM messages WHERE media_path IS NOT NULL AND (${filtro})`, params);

        for (const row of rows) {
            if (isCaminhoDeMidia(row.media_path) && fs.existsSync(row.media_path)) {
                printInfo(`Removendo ${row.media_path}`);
                fs.unlinkSync(row.media_path);
            }
        }

        const res = await dbRun(`DELETE FROM messages WHERE ${filtro}`, params);
        if (res.changes > 0) {
            printInfo(`Limpeza: ${res.changes} registros antigos limpos.`);
        }
    } catch (err) {
        printError('Erro na limpeza do cache:', err.message);
    }
}

/*
 * Limpeza geral (/cache -c -f): TODAS as mensagens (inclusive as apagadas
 * guardadas para o /show), todas as mídias e todos os temporários.
 * No fim, VACUUM devolve o espaço ao disco: DELETE sozinho não encolhe o .db.
 * Não mexe em monitored_numbers, presence_logs nem watch_hits (configuração e histórico).
 */
async function limparTudo() {
    await dbPronto;

    const bytesAntes = getDirSize(CACHE_DIR);
    const { total, apagadas } = await dbGet(
        'SELECT COUNT(*) AS total, COALESCE(SUM(revoked), 0) AS apagadas FROM messages'
    );

    await dbRun('DELETE FROM messages');
    limparConteudoDiretorio(MEDIA_DIR);
    limparConteudoDiretorio(TMP_DIR);
    await dbRun('VACUUM');

    return { total, apagadas, liberado: Math.max(0, bytesAntes - getDirSize(CACHE_DIR)) };
}

// Ocorrências do /watch mais antigas que 'watch.hitsRetentionDays'
async function limparWatchAntigo() {
    await dbPronto;

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

function limparConteudoDiretorio(dirPath) {
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

async function limparArquivosAntigos(dir = TMP_DIR, maxAgeHours = 2) {
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
 * Limpeza periódica. Antes rodava a CADA mensagem recebida
 * (um DELETE no SQLite + varredura de pasta por mensagem).
 */
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

function rodarLimpeza() {
    limparCacheAntigo();
    limparArquivosAntigos();
    limparWatchAntigo();
}

// Primeira execução adiada: no primeiro boot as tabelas ainda estão sendo criadas.
setTimeout(rodarLimpeza, 60 * 1000);
setInterval(rodarLimpeza, CLEANUP_INTERVAL_MS);

/*
 * Utilitários de contato
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
 * Remove o identificador de dispositivo (:1, :93 etc.)
 * sem alterar o servidor original: @lid continua @lid.
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
 * Converte um identificador @lid para o telefone real @c.us.
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
 * Nome real de um grupo (chatId @g.us -> assunto do grupo).
 * O msg._data.chat nem sempre vem preenchido (ou vem com dados de outro chat),
 * então buscamos o chat pelo id. Cache curto: o assunto do grupo pode mudar.
 */
const GROUP_NAME_TTL_MS = 10 * 60 * 1000;
const groupNameCache = new Map();

async function resolverNomeDoGrupo(chatId) {
    if (!chatId?.endsWith('@g.us')) return null;

    const cache = groupNameCache.get(chatId);
    if (cache && Date.now() - cache.at < GROUP_NAME_TTL_MS) return cache.name;

    const chat = await client.getChatById(chatId).catch((err) => {
        if (isDebugMode()) printDebug(`[GRUPO] getChatById falhou para ${chatId}: ${err?.message || err}`);
        return null;
    });

    // getChatById monta o modelo completo do grupo e quebra para alguns grupos (@lid);
    // nesse caso lemos o assunto direto das coleções do WhatsApp Web.
    const name =
        chat?.name ||
        chat?.groupMetadata?.subject ||
        (await nomeDoGrupoNoStore(chatId)) ||
        null;

    if (name) groupNameCache.set(chatId, { name, at: Date.now() });
    return name;
}

async function nomeDoGrupoNoStore(chatId) {
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
 * Troca as menções cruas do texto (@111780869222483, que pode ser LID ou telefone)
 * pelo nome do contato: "@111780869222483" -> "@Fulano".
 * mentionedIds (da mensagem) ajuda a saber se o número é @lid ou @c.us;
 * sem ele (ocorrências antigas) tentamos os dois.
 */
const mentionNameCache = new Map();

async function nomeDaMencao(user, mentionedIds = []) {
    if (mentionNameCache.has(user)) return mentionNameCache.get(user);

    const candidatos = mentionedIds
        .map(m => removeDeviceSuffix(typeof m === 'string' ? m : m?._serialized))
        .filter(jid => jid?.split('@')[0] === user);

    if (!candidatos.length) candidatos.push(`${user}@lid`, `${user}@c.us`);

    let nome = null;

    for (const jid of candidatos) {
        // Para um @lid, o contato pelo telefone real costuma ter o nome salvo na agenda
        const phoneJid = jid.endsWith('@lid') ? await resolveLidToPhone(jid) : null;

        for (const id of [phoneJid, jid].filter(Boolean)) {
            const contact = await client.getContactById(id).catch(() => null);
            nome = contact?.name || contact?.pushname || contact?.verifiedName || null;
            if (nome) break;
        }

        if (!nome && phoneJid) nome = `+${phoneJid.split('@')[0]}`;
        if (nome) break;
    }

    if (nome) mentionNameCache.set(user, nome);
    return nome;
}

async function resolverMencoes(texto, mentionedIds = []) {
    texto = String(texto ?? '');
    const users = [...new Set([...texto.matchAll(/@(\d{6,})/g)].map(m => m[1]))];

    for (const user of users) {
        const nome = await nomeDaMencao(user, mentionedIds);
        if (nome) texto = texto.replaceAll(`@${user}`, `@${nome}`);
    }

    return texto;
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
     * Sem cache remoto: o HTML de um repo de terceiros (branch main) rodaria na
     * origem web.whatsapp.com, com acesso à sessão. O WhatsApp Web é carregado
     * direto do site oficial.
     */
    webVersionCache: { type: 'none' },

    puppeteer: {
        headless: true,
        // No Windows, remova executablePath e args.
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
 * Mensagens enviadas pelo próprio bot também disparam 'message_create' com
 * fromMe=true. Sem esta marca, uma resposta que começasse com "/" (ex.: o
 * /noffa ecoando "/cache -c -f") rodaria como comando do dono.
 *
 * msg.reply() também passa por client.sendMessage(). O texto é registrado
 * ANTES do envio porque o evento pode chegar antes do sendMessage resolver.
 */
const ENVIADAS_TTL_MS = 60 * 1000;
const enviadasPeloBot = new Map(); // texto -> [expira em, ...]

function textoDoEnvio(content, options = {}) {
    if (typeof content === 'string') return content;
    return options.caption ?? content?.description ?? null;
}

function marcarEnviadaPeloBot(texto) {
    texto = String(texto ?? '').trim();
    if (!texto.startsWith('/')) return; // só o que poderia virar comando

    const agora = Date.now();
    const validas = (enviadasPeloBot.get(texto) ?? []).filter(t => t > agora);
    enviadasPeloBot.set(texto, [...validas, agora + ENVIADAS_TTL_MS]);
}

// Consome a marca: true se esta mensagem foi enviada pelo bot
function foiEnviadaPeloBot(texto) {
    texto = String(texto ?? '').trim();

    const agora = Date.now();
    const validas = (enviadasPeloBot.get(texto) ?? []).filter(t => t > agora);
    if (!validas.length) {
        enviadasPeloBot.delete(texto);
        return false;
    }

    validas.shift();
    if (validas.length) enviadasPeloBot.set(texto, validas);
    else enviadasPeloBot.delete(texto);
    return true;
}

const sendMessageOriginal = client.sendMessage.bind(client);

client.sendMessage = (chatId, content, options = {}) => {
    marcarEnviadaPeloBot(textoDoEnvio(content, options));
    return sendMessageOriginal(chatId, content, options);
};

// Marcas que nunca viraram 'message_create' (envio falhou) expiram aqui
setInterval(() => {
    const agora = Date.now();
    for (const [texto, expiracoes] of enviadasPeloBot) {
        if (!expiracoes.some(t => t > agora)) enviadasPeloBot.delete(texto);
    }
}, ENVIADAS_TTL_MS);

/*
 * Estado da conexão + reinício com trava.
 * Antes, watchdog, 'disconnected' e iniciarBot() podiam reiniciar o cliente
 * ao mesmo tempo, corrompendo a sessão e gerando QR Codes após a autenticação.
 */
let isReady = false;
let isRestarting = false;
let lastDisconnectReason = null;

// Motivos em que reiniciar não resolve: exigem ação manual.
const NAO_REINICIAR = new Set(['LOGOUT', 'CONFLICT', 'UNPAIRED', 'UNPAIRED_IDLE']);

async function restartClient(motivo) {
    if (isRestarting) {
        printInfo(`Restart ignorado (já em andamento). Motivo: ${motivo}`);
        return;
    }

    isRestarting = true;
    isReady = false;
    printInfo(`♻️ Reiniciando cliente. Motivo: ${motivo}`);

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

// Health check: só depois que o cliente ficou pronto
setInterval(async () => {
    if (!isReady || isRestarting) return;

    try {
        await client.getState();
    } catch {
        printInfo('Healthcheck falhou');
    }
}, 30000);

// Watchdog: só vigia um cliente que já esteve pronto e não está reiniciando
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

    // Diagnóstico: QR depois de já ter autenticado indica sessão perdida.
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

    // Ignora o mesmo QR já enviado e envios simultâneos
    if (qr === lastQrSent || qrEmailSending) return;

    qrEmailSending = true;

    try {
        const myantiphishing = process.env.QRCODE_EMAIL_SMTP_ANTIPHISHING;
        const pngBuffer = await qrcode.toBuffer(qr, { type: 'png', width: 300 });
        const phoneNumber = process.env.PHONE_NUMBER.split('@')[0];
        const maskPhone = phoneNumber.replace(/(\d{4})\d+(\d{4})$/, '$1XXXX$2');

        // O contador real só é atualizado após sucesso no SMTP
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
 * Eventos de conexão
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

    if (NAO_REINICIAR.has(String(reason))) {
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
 * Presença dos números monitorados
 */
client.on('presence_update', async (presence) => {
    // Sem o /monitor carregado, números já cadastrados não geram avisos
    if (!findCommand('/monitor')) return;
    if (!presence?.id) return;

    const myid = process.env.PHONE_NUMBER;

    try {
        const rawId = presence.id._serialized || presence.id;
        const number = rawId.split('@')[0].split(':')[0];
        const currentStatus = presence.status || (presence.type === 'available' ? 'available' : 'unavailable');

        // Antes isto mandava uma mensagem no WhatsApp para CADA evento de presença.
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
 * Recuperação de mensagens apagadas
 *
 * O mesmo renderizador é usado em dois lugares:
 *  - evento 'message_revoke_everyone' → envia para você mesmo, na hora;
 *  - comando /show                    → reenvia no chat atual, sob demanda.
 */

// Timestamp salvo em segundos (WhatsApp) ou milissegundos (Date.now())
function paraMs(valor) {
    const n = Number(valor);
    return n < 10_000_000_000 ? n * 1000 : n;
}

function formatarData(valor) {
    return new Date(paraMs(valor)).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/**
 * Descobre nome do chat e do remetente de uma mensagem apagada.
 * Com os objetos do evento (after/before) consegue nomes mais precisos;
 * sem eles (/show) usa o que foi gravado no banco.
 */
async function resolverAutorApagada(row, { after, before, protocolKey } = {}) {
    let nomeChat = row.chat_name || 'Conversa desconhecida';
    let nomeRemetente = row.sender_name || 'Desconhecido';
    let numeroRemetente = row.sender_number || null;

    // Nome real do chat onde a exclusão aconteceu
    if (after) {
        try {
            const chat = await after.getChat();
            if (chat?.name) nomeChat = chat.name;
        } catch (chatError) {
            printError('[Revoke] Não foi possível recuperar o chat:', chatError.message);
        }
    }

    // Remetente pela mensagem original, quando disponível
    if (before) {
        try {
            const contato = await before.getContact();

            nomeRemetente = contato.pushname || contato.name || contato.shortName || nomeRemetente;

            const contatoId = contato.id?._serialized || '';

            if (contatoId.endsWith('@c.us')) {
                numeroRemetente = contatoId.split('@')[0];
            } else if (contato.number) {
                numeroRemetente = contato.number;
            }
        } catch (contactError) {
            printError('[Revoke] Não foi possível recuperar o contato original:', contactError.message);
        }
    }

    // Converte @lid para telefone real, se possível
    const senderId = before?.author || protocolKey?.participant;

    if (senderId?.endsWith('@lid')) {
        const phoneId = await resolveLidToPhone(senderId);

        if (phoneId) {
            numeroRemetente = phoneId.replace('@c.us', '').replace(/\D/g, '');

            const contato = await client.getContactById(phoneId).catch(() => null);
            nomeRemetente = contato?.pushname || contato?.name || contato?.shortName || nomeRemetente;
        }
    }

    return { nomeChat, nomeRemetente, numeroRemetente };
}

/**
 * Envia uma mensagem apagada (texto, mídia, localização ou contato) para `destino`.
 *
 * @param {string} destino              chat que vai receber
 * @param {object} row                  linha da tabela messages
 * @param {object} info                 { nomeChat, nomeRemetente, numeroRemetente }
 * @param {object} [opcoes]
 * @param {string} [opcoes.titulo]      primeira linha do alerta
 * @param {string[]} [opcoes.extras]    linhas extras após "Enviada em"
 */
async function enviarMensagemApagada(destino, row, info, { titulo = '❌ *MENSAGEM APAGADA DETECTADA*', extras = [] } = {}) {
    let alertaTexto = `${titulo}\n\n`;

    if (row.is_group === 1) {
        alertaTexto += `👥 *Grupo:* ${info.nomeChat}\n`;
    }

    alertaTexto +=
        `👤 *Nome:* ${info.nomeRemetente}\n` +
        `📱 *Número:* ${info.numeroRemetente ? `+${info.numeroRemetente}` : 'Número indisponível'}\n` +
        `📅 *Enviada em:* ${formatarData(row.timestamp)}\n`;

    for (const linha of extras) {
        alertaTexto += `${linha}\n`;
    }

    // Localização
    if (row.type === 'location' && row.location_lat !== null && row.location_lng !== null) {
        const latitude = Number(row.location_lat);
        const longitude = Number(row.location_lng);

        alertaTexto +=
            '🗺️ *Tipo:* LOCALIZAÇÃO\n' +
            `🔗 *Link do mapa:* https://www.google.com/maps?q=${latitude},${longitude}`;

        await client.sendMessage(destino, alertaTexto);
        await client.sendMessage(destino, new Location(latitude, longitude, row.body || 'Localização compartilhada'));
        return;
    }

    // Contato / vCard
    if (['vcard', 'contact', 'multi_vcard'].includes(row.type)) {
        alertaTexto +=
            '📇 *Tipo:* CARTÃO DE CONTATO\n' +
            '💡 *Nota:* O contato está anexado abaixo.';

        // O body vem de quem enviou: só vai cru se for mesmo um vCard (nunca um texto como "/cache -c -f")
        if (!row.body || /^BEGIN:VCARD/i.test(row.body.trim())) {
            await client.sendMessage(destino, alertaTexto);
            if (row.body) await client.sendMessage(destino, row.body, { parseVCards: true });
        } else {
            await client.sendMessage(destino, `${alertaTexto}\n💬 *Conteúdo:* "${row.body}"`);
        }
        return;
    }

    // Arquivo físico
    if (row.has_media && isCaminhoDeMidia(row.media_path) && fs.existsSync(row.media_path)) {
        const mediaAnexo = MessageMedia.fromFilePath(row.media_path);
        const mimetype = mediaAnexo.mimetype || '';
        const legenda = row.body || 'Sem texto';

        if (row.type === 'audio' || row.type === 'ptt' || mimetype.startsWith('audio/')) {
            alertaTexto += '🎵 *Tipo:* ÁUDIO / NOTA DE VOZ';

            await client.sendMessage(destino, alertaTexto);
            await client.sendMessage(destino, mediaAnexo, { sendAudioAsVoice: true });
            return;
        }

        if (row.type === 'video' || row.type === 'image' || mimetype.startsWith('image/') || mimetype.startsWith('video/')) {
            alertaTexto +=
                `🎬 *Tipo:* ${String(row.type).toUpperCase()}\n` +
                `💬 *Legenda:* "${legenda}"`;

            await client.sendMessage(destino, mediaAnexo, { caption: alertaTexto });
            return;
        }

        alertaTexto +=
            '📄 *Tipo:* DOCUMENTO\n' +
            `💬 *Legenda:* "${legenda}"`;

        await client.sendMessage(destino, mediaAnexo, { caption: alertaTexto, sendMediaAsDocument: true });
        return;
    }

    // Mídia que existia mas o arquivo já não está no disco
    if (row.has_media) {
        alertaTexto += `📎 *Tipo:* ${String(row.type).toUpperCase()} _(arquivo não disponível no cache)_\n`;
    }

    // Texto
    alertaTexto += `💬 *Texto:* "${row.body || 'Mensagem sem conteúdo'}"`;

    await client.sendMessage(destino, alertaTexto, { linkPreview: true });
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
        await dbPronto;
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
        const info = await resolverAutorApagada(row, { after, before, protocolKey });

        // Marca como apagada ANTES de enviar: mesmo que o envio falhe, o /show encontra.
        // Também grava os nomes resolvidos agora, que são mais precisos que os do recebimento.
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

        await enviarMensagemApagada(client.info.wid._serialized, row, info);
    } catch (sendError) {
        printError('[Revoke] Erro ao processar item apagado:', sendError.message);
    }
});

/*
 * Watch: toda mensagem recebida (menos as suas e os comandos) é testada contra
 * as regras do setting 'watch.rules'. Cada regra é:
 *   texto        → "contém", sem diferenciar maiúsculas nem acentos
 *   /regex/flags → RegExp do JavaScript (as flags g e y são ignoradas)
 * Quando casa, a ocorrência vai para watch_hits e você é avisado no privado.
 */
const REGRA_REGEX = /^\/(.+)\/([a-z]*)$/s;
const REGRA_MAX_LEN = 200;

const semAcentos = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// regra -> função de teste (compilada uma vez, não a cada mensagem)
const regrasCompiladas = new Map();

function compilarRegraWatch(regra) {
    if (regrasCompiladas.has(regra)) return regrasCompiladas.get(regra);

    if (!regra || regra.length > REGRA_MAX_LEN) {
        throw new Error(`a regra precisa ter de 1 a ${REGRA_MAX_LEN} caracteres`);
    }

    let testar;
    const m = regra.match(REGRA_REGEX);

    if (m) {
        let re;
        try {
            re = new RegExp(m[1], m[2].replace(/[gy]/g, ''));
        } catch (e) {
            throw new Error(`regex inválida: ${e.message}`);
        }
        testar = (texto) => re.test(texto);
    } else {
        const alvo = semAcentos(regra);
        testar = (texto) => semAcentos(texto).includes(alvo);
    }

    regrasCompiladas.set(regra, testar);
    return testar;
}

async function verificarWatch({ msg, msgIdPure, body, chatId, chatName, isGroup, senderName, senderNumber, timestamp }) {
    // As suas mensagens ficam de fora: inclusive os próprios avisos do /watch no seu privado
    if (msg.fromMe || !body) return;
    if (!findCommand('/watch')) return;

    const regras = getSetting('watch.rules');
    if (!regras.length) return;

    const casadas = regras
        .map((regra, i) => ({ regra, n: i + 1 }))
        .filter(({ regra }) => {
            try {
                return compilarRegraWatch(regra)(body);
            } catch {
                return false;
            }
        });

    if (!casadas.length) return;

    // Só avisa das ocorrências novas (o WhatsApp pode reenviar a mesma mensagem)
    const novas = [];

    for (const c of casadas) {
        const res = await dbRun(
            `INSERT OR IGNORE INTO watch_hits
                (rule, message_id, chat_id, chat_name, is_group, sender_name, sender_number, body, timestamp)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [c.regra, msgIdPure, chatId, chatName, isGroup, senderName, senderNumber, body, timestamp]
        );

        if (res.changes) novas.push(c);
    }

    if (!novas.length) return;

    let texto = '👀 *WATCH: MENSAGEM DETECTADA*\n\n';

    for (const c of novas) {
        texto += `🔎 *Regra #${c.n}:* ${c.regra}\n`;
    }

    if (isGroup) {
        texto += `👥 *Grupo:* ${chatName}\n`;
    }

    texto +=
        `👤 *Nome:* ${senderName}\n` +
        `📱 *Número:* ${senderNumber ? `+${senderNumber}` : 'Número indisponível'}\n` +
        `📅 *Enviada em:* ${formatarData(timestamp)}\n` +
        `💬 *Texto:* "${await resolverMencoes(body, msg.mentionedIds)}"`;

    printInfo(`/watch: regra(s) ${novas.map(c => `#${c.n}`).join(',')} casaram em '${chatName}' (${senderName})`);
    await client.sendMessage(client.info.wid._serialized, texto, { linkPreview: false });
}

/*
 * Inicialização
 */
async function iniciarBot() {
    try {
        printInfo('Starting WhatsApp authentication...');
        await client.initialize();
    } catch (error) {
        printError('Erro capturado na inicialização:', error.message);

        // Fecha o navegador antigo se ele tiver sido aberto parcialmente
        try {
            printInfo('Fechando instâncias pendentes do navegador...');
            await client.destroy();
        } catch {
            printInfo('Nenhum navegador ativo para destruir.');
        }

        if (error.message.includes('Execution context was destroyed') || error.message.includes('browser is already running')) {
            printInfo('Reiniciando o processo de inicialização em 5 segundos...');
            setTimeout(iniciarBot, 5000);
        }
    }
}

iniciarBot();

/*
 * Handlers de comandos
 */

// Resposta padrão de erro dos comandos /get e /cache
function formatarErroComando(e) {
    let texto = `⚠️💥 ${e.message}.`;

    if (e?.cause?.cmd) texto += `\n🛠️ *Cmd*:    ${e.cause.cmd}`;
    if (e?.cause?.inner) texto += `\n⛓️‍💥 *Inner*:  ${e.cause.inner.message || e.cause.inner}`;

    return `${texto}\n`;
}

async function cmdHelp({ msg, args }) {
    // Lê direto do texto: o parser de opções descarta um primeiro token que começa com "/"
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

    // /help sozinho: todos os comandos
    const helpText =
        '🤖 *MENU DE AJUDA*\n\n```' +
        activeCommands().map(formatCommandHelp).join('\n\n' + '─'.repeat(50) + '\n\n') +
        '\n```';

    await msg.reply(helpText);
}

async function cmdDebug({ msg, opts }) {
    // Persistido no setting 'debug.enabled': sobrevive a reinícios
    if (opts.opt.on) await setSetting('debug.enabled', true);
    if (opts.opt.off) await setSetting('debug.enabled', false);

    await msg.reply(isDebugMode() ? '🪲 Debug Ativado.' : '🪲 Debug Desativado.');
}

async function cmdUptime({ msg }) {
    const conectado = BOT_AUTHENTICATED_TIME ? getBotUptime(BOT_AUTHENTICATED_TIME) : 'não conectado';

    await msg.reply(
        `🤖 *ZapBot ${packageJson.version}*\n` +
        '━━━━━━━━━━━━━━━━━━\n' +
        `⚡ Online: *${getBotUptime(BOT_START_TIME)}*\n` +
        `🔐 Conectado: *${conectado}*`
    );
}

async function cmdPing({ msg }) {
    await msg.reply('pong');
}

async function cmdNoffa({ msg, args, quotedMsg }) {
    const rainbowHearts = ['🌈', '🏳️‍🌈', '🏳️‍⚧️', '🧡', '💛', '💚', '💙', '💜'];

    // Antes usava só a primeira palavra (argv[1]) e gerava "undefined" sem argumento.
    const text = [args, quotedMsg?.body].filter(Boolean).join(' ').trim();

    if (!text) {
        await msg.reply('Syntax: /noffa <texto> (ou responda uma mensagem)');
        return;
    }

    let index = 0;
    let rainbowText = text.replace(/ /g, () => ` ${rainbowHearts[index++ % rainbowHearts.length]} `);

    // A resposta nunca começa com "/": não pode ser lida como comando (ver marcarEnviadaPeloBot)
    if (rainbowText.startsWith('/')) rainbowText = `${rainbowHearts[0]} ${rainbowText}`;

    await msg.reply(rainbowText);
}

/*
 * Moedas aceitas pelo /crypto -a (par <TOKEN>USDT na Binance) e seus ícones.
 * As ativas ficam no setting 'crypto.coins'.
 */
const CRYPTO_SUPPORTED = {
    BTC: '₿', ETH: 'Ξ', SOL: '◎', HYPE: 'Ⓗ', BNB: '🔶', XRP: '✕', DOGE: 'Ð',
    ADA: '₳', TRX: '🔺', AVAX: '🔻', LINK: '🔗', DOT: '●', LTC: 'Ł', TON: '💎',
    SUI: '💧', PEPE: '🐸', SHIB: '🐕', XLM: '🚀', NEAR: 'Ⓝ', UNI: '🦄'
};

async function cmdCrypto({ msg, opts }) {
    await dbPronto;

    const ativas = getSetting('crypto.coins');
    const token = (v) => String(v ?? '').trim().toUpperCase().replace(/USDT$/, '');

    if (opts.opt.list) {
        const lista = Object.entries(CRYPTO_SUPPORTED)
            .map(([sym, icon]) => `${ativas.includes(sym) ? '*' : ' '} ${icon} ${sym}`)
            .join('\n');

        await msg.reply('🪙 *MOEDAS SUPORTADAS*\n\n```\n' + lista + '\n```\n_* = ativada_');
        return;
    }

    if (opts.opt.add !== null || opts.opt.del !== null) {
        // Mexe na configuração global: só o dono do bot
        if (!msg.fromMe) {
            await msg.reply('⛔ Apenas o dono do bot pode alterar as moedas.');
            return;
        }

        const adicionar = opts.opt.add !== null;
        const sym = token(adicionar ? opts.opt.add : opts.opt.del);

        if (!sym) {
            await msg.reply('```' + getCommandSyntax('/crypto') + '```');
            return;
        }

        if (adicionar) {
            if (!CRYPTO_SUPPORTED[sym]) {
                await msg.reply(`❌ Moeda não suportada: ${sym}\n💡 _Veja as suportadas com /crypto -l_`);
                return;
            }
            if (ativas.includes(sym)) {
                await msg.reply(`ℹ️ ${sym} já está ativada.`);
                return;
            }
            await setSetting('crypto.coins', [...ativas, sym]);
            await msg.reply(`✅ ${CRYPTO_SUPPORTED[sym]} ${sym} adicionada.`);
            return;
        }

        if (!ativas.includes(sym)) {
            await msg.reply(`ℹ️ ${sym} não está ativada.`);
            return;
        }
        await setSetting('crypto.coins', ativas.filter(c => c !== sym));
        await msg.reply(`🗑️ ${sym} removida.`);
        return;
    }

    if (!ativas.length) {
        await msg.reply('ℹ️ Nenhuma moeda ativada.\n💡 _Adicione com /crypto -a <TOKEN>_');
        return;
    }

    try {
        const symbols = ativas.map(c => `${c}USDT`);

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

        // Mantém a ordem configurada (a Binance não garante a ordem da resposta)
        const coins = data.map(item => ({
            symbol: item.symbol.replace(/USDT$/, ''),
            icon: CRYPTO_SUPPORTED[item.symbol.replace(/USDT$/, '')] || '',
            price: Number(item.lastPrice),
            change: Number(item.priceChangePercent),
            high: Number(item.highPrice),
            low: Number(item.lowPrice),
            volume: Number(item.quoteVolume)
        })).sort((a, b) => ativas.indexOf(a.symbol) - ativas.indexOf(b.symbol));

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
 * Aceita tanto o estilo das opções do bot-config (/monitor -add 5521...)
 * quanto o posicional (/monitor add 5521...).
 * Antes o switch usava argv[0], que é sempre "/monitor": nenhum subcomando funcionava.
 */
async function cmdMonitor({ msg, opts }) {
    let sub = null;
    let alvo = null;

    for (const s of ['list', 'logs', 'clean']) {
        if (opts.opt[s] === true) sub = s;
    }

    // "-add +55 21 99999-8888": o parser só pega "+55"; o resto do número cai em argv
    if (typeof opts.opt.add === 'string') { sub = 'add'; alvo = [opts.opt.add, ...opts.argv].join(' '); }
    if (typeof opts.opt.del === 'string') { sub = 'del'; alvo = [opts.opt.del, ...opts.argv].join(' '); }

    if (!sub && opts.argv.length) {
        sub = opts.argv[0].toLowerCase();
        alvo = opts.argv.slice(1).join(' ');
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
                const phoneNumber = normalizerPhoneNumber(alvo);

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

                const existe = await dbGet('SELECT phone_number FROM monitored_numbers WHERE phone_number = ?', [phoneNumber]);

                if (existe) {
                    await msg.reply(`🔔 O número ${phoneNumber} já está sendo monitorado.`);
                    return;
                }

                await dbRun('INSERT INTO monitored_numbers (phone_number) VALUES (?)', [phoneNumber]);
                await msg.reply(`🔔 O número ${phoneNumber} agora está sendo monitorado.`);
                printInfo(`O número ${phoneNumber} agora está sendo monitorado.`);
                return;
            }

            case 'del': {
                const phoneNumber = normalizerPhoneNumber(alvo);

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
 * Figurinha a partir de imagem: recorte quadrado 512x512 enquadrado no MEIO
 * da imagem (sem isto o WhatsApp Web converte sem centralizar). WebP já é
 * figurinha e vai como está; vídeos seguem com a conversão do whatsapp-web.js.
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

async function cmdSticker({ msg, quotedMsg }) {
    if (!quotedMsg) {
        await msg.reply("Syntax: Faça um 'reply' utilizando /sticker");
        return;
    }

    // 1. Mídia real do WhatsApp
    if (quotedMsg.hasMedia) {
        const media = await enquadrarSticker(await quotedMsg.downloadMedia());
        await msg.reply(media, null, { sendMediaAsSticker: true, ...stickerMeta() });
        return;
    }

    // 2. Link com thumbnail / preview
    if (!quotedMsg.links?.length) {
        await msg.reply('A mensagem respondida não tem mídia nem link.');
        return;
    }

    const link = quotedMsg.links[0].link;
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

    await msg.reply(await enquadrarSticker(media), null, { sendMediaAsSticker: true, ...stickerMeta() });
}

let getEmAndamento = 0;

async function cmdGet({ msg, opts, quotedMsg, senderName }) {
    // Liberado para qualquer um: sem limite, vários /get seguidos esgotam CPU e disco
    if (getEmAndamento >= GET_MAX_CONCURRENT) {
        await msg.reply(`⏳ Já existem ${GET_MAX_CONCURRENT} downloads em andamento. Tente de novo em instantes.`);
        return;
    }

    getEmAndamento++;

    try {
        await executarGet({ msg, opts, quotedMsg, senderName });
    } finally {
        getEmAndamento--;
    }
}

async function executarGet({ msg, opts, quotedMsg, senderName }) {
    // Aleatório: com Date.now() dois /get no mesmo milissegundo usariam os mesmos arquivos
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

        if (!(await isUrlPublica(urlInput))) {
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

        // Baixar vídeo
        // --no-playlist: um link de playlist baixaria tudo; --max-filesize: não enche o disco
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

        // Acima do --max-filesize o yt-dlp aborta sem erro e sem gerar o arquivo
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
        await msg.reply(formatarErroComando(e), null, { linkPreview: false });
    } finally {
        if (logCmd !== null) {
            try { fs.closeSync(logCmd); } catch { /* já fechado */ }
        }

        for (const tmp of [originalFile, outputFile, logCmdFile]) {
            if (!tmp) continue;
            try { fs.unlinkSync(tmp); } catch { /* arquivo pode não existir */ }
        }
    }
}

async function cmdCache({ msg, opts }) {
    try {
        let textMsg;

        if (opts.opt.clean && opts.opt.force) {
            // Limpeza geral: mensagens, apagadas, mídias, temporários
            const r = await limparTudo();

            textMsg =
                '🧹 *Limpeza geral concluída* (force)\n\n' +
                `🗄️ Mensagens removidas: *${r.total}* _(${r.apagadas} apagada${r.apagadas === 1 ? '' : 's'})_\n` +
                `💾 Espaço liberado: *${humanSize(r.liberado)}*`;
        } else if (opts.opt.clean) {
            // Limpeza normal: só o que passou das janelas de retenção
            await limparCacheAntigo();
            await limparArquivosAntigos();
            await limparWatchAntigo();

            textMsg = '🧹 Cache limpo (itens fora da janela de retenção).\n';
        } else {
            const { total, apagadas } = await dbGet(
                'SELECT COUNT(*) AS total, COALESCE(SUM(revoked), 0) AS apagadas FROM messages'
            );

            textMsg = `🗂️ Exibindo conteúdo de ${CACHE_DIR}/*`;
            textMsg += '\n\n```' + listCacheLevelOnly(CACHE_DIR) + '```\n\n';
            textMsg += `🗄️ Existem ${total} mensagens no cache (${apagadas} apagadas).`;
        }

        await msg.reply(textMsg, null, { linkPreview: false });
    } catch (e) {
        printError(e.message);
        await msg.reply(formatarErroComando(e), null, { linkPreview: false });
    }
}

/*
 * /show [-N] [-pv]
 * Reexibe as últimas N mensagens apagadas DESTE chat (padrão: 1), no mesmo
 * formato do alerta do 'message_revoke_everyone'.
 *   /show        → a última apagada
 *   /show -3     → as 3 últimas (máx. setting 'show.max')
 *   /show -3 -pv → envia no SEU privado em vez de expor no chat atual
 *   /show -list  → quantas mensagens apagadas existem no cache
 *   /show -flush → remove as apagadas deste chat (no seu privado: de todos os chats)
 *   /show -2 -c 1       → (no seu privado) as 2 últimas do chat nº 1 do /show -l
 *   /show -2 -c zapbot  → (no seu privado) idem, buscando o chat pelo nome
 *   /show -f -c 1       → (no seu privado) flush só do chat nº 1
 * Envia em ordem cronológica: a última enviada é a apagada mais recentemente.
 */
// Em conversas privadas o mesmo chat pode aparecer como @lid ou @c.us
async function idsDoChatAtual(chatId) {
    const ids = [chatId];

    if (chatId.endsWith('@lid')) {
        const telefone = await resolveLidToPhone(chatId);
        if (telefone) ids.push(telefone);
    }

    return ids;
}

/*
 * Numeração do último /show -l (índice → chat_id).
 * Guardamos o snapshot porque a ordem da lista muda a cada nova mensagem
 * apagada: sem ele, "chat 2" poderia apontar para outro chat entre o -l e o -c.
 */
let ultimaListaDeChats = [];

// Chats com mensagens apagadas, na mesma ordem do /show -l
function consultarChatsComApagadas() {
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

const nomeDoChat = (c) => c.chat_name || c.chat_id.split('@')[0];

/**
 * Resolve o valor do -c para um chat:
 *   número → posição no último /show -l
 *   texto  → busca pelo nome (sem diferenciar maiúsculas)
 * @returns {Promise<{ids: string[], nome: string} | {erro: string}>}
 */
async function resolverChatAlvo(valor) {
    const chats = await consultarChatsComApagadas();

    if (!chats.length) {
        return { erro: '♻️ Nenhuma mensagem apagada no cache.' };
    }

    // Por número
    if (/^\d+$/.test(valor)) {
        const indice = Number(valor);
        const lista = ultimaListaDeChats.length ? ultimaListaDeChats : chats.map(c => c.chat_id);
        const chatId = lista[indice - 1];
        const chat = chats.find(c => c.chat_id === chatId);

        if (!chat) {
            return { erro: `❌ Chat nº ${indice} não existe (ou não tem mais apagadas). Rode /show -l para ver a lista atual.` };
        }

        return { ids: [chat.chat_id], nome: nomeDoChat(chat) };
    }

    // Por nome
    const busca = valor.toLowerCase();
    const encontrados = chats.filter(c => nomeDoChat(c).toLowerCase().includes(busca));
    const exato = encontrados.find(c => nomeDoChat(c).toLowerCase() === busca);

    if (exato || encontrados.length === 1) {
        const chat = exato || encontrados[0];
        return { ids: [chat.chat_id], nome: nomeDoChat(chat) };
    }

    if (!encontrados.length) {
        return { erro: `❌ Nenhum chat com apagadas contém "${valor}". Rode /show -l para ver a lista.` };
    }

    return {
        erro: `🔎 "${valor}" corresponde a ${encontrados.length} chats. Seja mais específico ou use o número:\n` +
              encontrados.map(c => `• ${nomeDoChat(c)}`).join('\n')
    };
}

/*
 * /show -list
 * Resumo das mensagens apagadas guardadas no cache.
 *
 * A quebra "por chat" mostra NOMES de outras conversas. Por isso só aparece
 * no seu próprio privado ou com -pv; em qualquer outro chat (ex.: um grupo)
 * saem apenas os totais, para não expor com quem você conversa.
 */
async function listarApagadas({ msg, opts, chatId }) {
    await dbPronto;

    const meuId = client.info.wid._serialized;
    const idsDoChat = await idsDoChatAtual(chatId);
    const noPrivadoDoDono = idsDoChat.includes(meuId);
    const mostrarPorChat = noPrivadoDoDono || opts.opt.pv;

    const geral = await dbGet(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(has_media), 0) AS com_midia,
                MIN(revoked_at) AS mais_antiga
           FROM messages
          WHERE revoked = 1`
    );

    const noChat = await dbGet(
        `SELECT COUNT(*) AS total
           FROM messages
          WHERE revoked = 1
            AND chat_id IN (${idsDoChat.map(() => '?').join(', ')})`,
        idsDoChat
    );

    let texto = '🗑️ *Mensagens apagadas no cache*\n\n';
    texto += `📦 *Total:* ${geral.total}`;
    if (geral.com_midia > 0) texto += ` _(${geral.com_midia} com mídia)_`;
    texto += '\n';

    if (!noPrivadoDoDono) {
        texto += `💬 *Neste chat:* ${noChat.total}\n`;
    }

    if (geral.total > 0 && geral.mais_antiga) {
        const expiraEm = paraMs(geral.mais_antiga) + getSetting('cache.revokedRetentionDays') * DAY_MS;
        const dias = Math.max(0, Math.ceil((expiraEm - Date.now()) / DAY_MS));
        texto += `⏳ *Mais antiga:* ${formatarData(geral.mais_antiga)} _(expira em ${dias} dia${dias === 1 ? '' : 's'})_\n`;
    }

    if (mostrarPorChat && geral.total > 0) {
        const LIMITE = 10;

        const porChat = await consultarChatsComApagadas();
        ultimaListaDeChats = porChat.map(c => c.chat_id);

        texto += '\n*Por chat:*\n';

        porChat.slice(0, LIMITE).forEach((c, i) => {
            const icone = c.is_group ? '👥' : '👤';
            const nome = nomeDoChat(c);
            const atual = idsDoChat.includes(c.chat_id) ? ' ← _este chat_' : '';
            texto += `${i + 1}. ${icone} ${nome} — *${c.total}* _(última ${formatarData(c.ultima)})_${atual}\n`;
        });

        if (porChat.length > LIMITE) {
            texto += `_+${porChat.length - LIMITE} chat(s)_\n`;
        }
    }

    texto += `\n💡 _Use /show -N para reexibir (máx. ${getSetting('show.max')})._`;

    if (mostrarPorChat && geral.total > 0) {
        texto += '\n💡 _No seu privado: /show -N -c <nº ou nome> para ver as de um chat._';
    }

    if (opts.opt.pv && !noPrivadoDoDono) {
        await msg.reply('🗑️ Resumo enviado no seu privado.');
        await client.sendMessage(meuId, texto);
    } else {
        await msg.reply(texto);
    }
}

/*
 * /show -flush
 * Remove do cache as mensagens apagadas (linhas + arquivos de mídia):
 *   - num chat qualquer      → só as apagadas DESTE chat;
 *   - no seu próprio privado → as apagadas de TODOS os chats.
 * Destrutivo: só o dono do bot executa, mesmo que o /show seja liberado no config.
 */
async function limparApagadasDoChat({ msg, chatId, alvo = null }) {
    if (!msg.fromMe) {
        await msg.reply('⛔ Só o dono do bot pode usar /show -flush.');
        return;
    }

    await dbPronto;

    const meuId = client.info.wid._serialized;
    // Com -c, o alvo é o chat escolhido; sem ele, o chat atual
    const idsDoChat = alvo ? alvo.ids : await idsDoChatAtual(chatId);
    const geral = !alvo && idsDoChat.includes(meuId);

    // Filtro: todas as apagadas (privado do dono) ou só as do chat alvo
    const filtro = geral
        ? 'revoked = 1'
        : `revoked = 1 AND chat_id IN (${idsDoChat.map(() => '?').join(', ')})`;
    const params = geral ? [] : idsDoChat;

    // Levanta o que vai sair ANTES de apagar, para a mensagem de resumo
    const porChat = await dbAll(
        `SELECT chat_id,
                MAX(chat_name) AS chat_name,
                MAX(is_group) AS is_group,
                COUNT(*) AS total
           FROM messages
          WHERE ${filtro}
          GROUP BY chat_id
          ORDER BY total DESC`,
        params
    );

    const total = porChat.reduce((soma, c) => soma + c.total, 0);

    if (!total) {
        await msg.reply(geral
            ? '♻️ Nenhuma mensagem apagada no cache.'
            : '♻️ Nenhuma mensagem apagada registrada neste chat.');
        return;
    }

    // Apaga as mídias do disco
    const midias = await dbAll(`SELECT media_path FROM messages WHERE ${filtro} AND media_path IS NOT NULL`, params);
    let arquivos = 0;
    let bytes = 0;

    for (const { media_path } of midias) {
        if (!isCaminhoDeMidia(media_path)) continue;

        try {
            bytes += fs.statSync(media_path).size;
            fs.unlinkSync(media_path);
            arquivos++;
        } catch {
            // arquivo já não existe
        }
    }

    // Apaga as linhas do banco
    const res = await dbRun(`DELETE FROM messages WHERE ${filtro}`, params);

    printInfo(`/show -flush (${geral ? 'geral' : chatId}): ${res.changes} mensagens e ${arquivos} arquivos removidos`);

    let texto = geral
        ? '🧹 *Flush geral das mensagens apagadas*\n\n'
        : alvo
            ? `🧹 *Flush das mensagens apagadas de:* ${alvo.nome}\n\n`
            : '🧹 *Flush das mensagens apagadas deste chat*\n\n';

    texto += `🗄️ Removidas: *${plural(res.changes, 'mensagem', 'mensagens')}*`;
    texto += geral ? ` de *${plural(porChat.length, 'chat', 'chats')}*\n` : '\n';
    texto += `📎 Mídias apagadas do disco: *${arquivos}*${arquivos ? ` _(${humanSize(bytes)})_` : ''}\n`;

    if (geral) {
        const LIMITE = 10;

        texto += '\n*Por chat:*\n';
        porChat.slice(0, LIMITE).forEach((c, i) => {
            const icone = c.is_group ? '👥' : '👤';
            const nome = c.chat_name || c.chat_id.split('@')[0];
            texto += `${i + 1}. ${icone} ${nome} — *${c.total}*\n`;
        });

        if (porChat.length > LIMITE) {
            texto += `_+${porChat.length - LIMITE} chat(s)_\n`;
        }
    } else if (!alvo) {
        texto += '\n💡 _Para limpar as apagadas de todos os chats, use /show -f no seu privado._';
    }

    await msg.reply(texto);
}

async function cmdUndo({ msg, opts, chatId }) {
    /*
     * -c <nº|nome>: escolhe outro chat. Só no SEU privado; num grupo isso
     * republicaria ali as mensagens apagadas de outras conversas.
     */
    let alvo = null;

    if (opts.opt.chat) {
        const noMeuPrivado = (await idsDoChatAtual(chatId)).includes(client.info.wid._serialized);

        if (!msg.fromMe || !noMeuPrivado) {
            await msg.reply('⛔ A opção -c só pode ser usada no seu privado.');
            return;
        }

        await dbPronto;
        alvo = await resolverChatAlvo(String(opts.opt.chat));

        if (alvo.erro) {
            await msg.reply(alvo.erro);
            return;
        }
    }

    if (opts.opt.flush) {
        await limparApagadasDoChat({ msg, chatId, alvo });
        return;
    }

    if (opts.opt.list) {
        await listarApagadas({ msg, opts, chatId });
        return;
    }

    // "-3" não é uma opção declarada, então o parser o coloca em argv (assim como "3")
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

    let aviso = '';
    const max = getSetting('show.max');
    if (n > max) {
        aviso = `\n_(limitado a ${max} por vez)_`;
        n = max;
    }

    const idsDoChat = alvo ? alvo.ids : await idsDoChatAtual(chatId);

    await dbPronto;

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
        // No privado, sem -c, quase sempre a intenção era ver outro chat
        const noMeuPrivado = !alvo && idsDoChat.includes(client.info.wid._serialized);

        await msg.reply(noMeuPrivado
            ? '♻️ Nenhuma mensagem apagada neste chat.\n💡 _Para ver as de outro chat: /show -l e depois /show -N -c <nº ou nome>._'
            : '♻️ Nenhuma mensagem apagada registrada neste chat.');
        return;
    }

    // Busca as mais recentes, exibe da mais antiga para a mais recente
    rows.reverse();

    const destino = opts.opt.pv ? client.info.wid._serialized : chatId;
    const faltaram = n > rows.length ? ` (pedidas ${n}, encontradas ${rows.length})` : '';
    let resumo = `♻️ *${rows.length} mensage${rows.length === 1 ? 'm apagada' : 'ns apagadas'}*${faltaram}${aviso}`;

    if (alvo) {
        resumo += `\n💬 *Chat:* ${alvo.nome}`;
    }

    if (opts.opt.pv && !alvo) {
        await msg.reply('♻️ Enviado no seu privado.');
        await client.sendMessage(destino, `${resumo}\n💬 *Chat:* ${rows[0].chat_name || chatId}`);
    } else {
        await msg.reply(resumo);
    }

    for (const [i, row] of rows.entries()) {
        const info = await resolverAutorApagada(row);

        try {
            await enviarMensagemApagada(destino, row, info, {
                titulo: `❌ *MENSAGEM APAGADA* (${i + 1}/${rows.length})`,
                extras: [`🗑️ *Apagada em:* ${formatarData(row.revoked_at)}`]
            });
        } catch (err) {
            printError(`/show: falha ao reenviar ${row.id}:`, err.message);
            await client.sendMessage(destino, `⚠️ Não consegui reenviar a mensagem ${i + 1}/${rows.length}: ${err.message}`);
        }

        if (i < rows.length - 1) await esperar(getSetting('show.delayMs'));
    }
}

/*
 * /set
 *   /set                  → lista todos os settings e seus valores
 *   /set <chave>          → mostra valor, padrão e descrição
 *   /set <chave> <valor>  → altera (lista: itens separados por vírgula ou espaço)
 *   /set -reset <chave>   → volta ao padrão
 */
function formatarValorSetting(value, sep = ', ') {
    if (Array.isArray(value)) return value.length ? value.join(sep) : '(vazio)';
    if (typeof value === 'boolean') return value ? 'on' : 'off';
    return String(value);
}

async function cmdSet({ msg, opts, args }) {
    await dbPronto;

    if (opts.opt.reset !== null) {
        const key = opts.opt.reset;
        const schema = SETTINGS_SCHEMA[key];

        if (!schema) {
            await msg.reply(`❌ Setting desconhecido: ${key}\n💡 _Veja todos com /set_`);
            return;
        }

        await setSetting(key, schema.default);
        await msg.reply(`♻️ *${key}* = ${formatarValorSetting(getSetting(key))} _(padrão)_`);
        return;
    }

    const [key, ...resto] = opts.argv;

    if (!key) {
        const width = Math.max(...Object.keys(SETTINGS_SCHEMA).map(k => k.length));
        const lista = Object.entries(SETTINGS_SCHEMA)
            .map(([k, s]) => `${k.padEnd(width)}  ${formatarValorSetting(getSetting(k), s.separator ? ' | ' : ', ')}`)
            .join('\n');

        await msg.reply('⚙️ *SETTINGS*\n\n```\n' + lista + '\n```\n💡 _/set <chave> para detalhes_');
        return;
    }

    const schema = SETTINGS_SCHEMA[key];

    if (!schema) {
        await msg.reply(`❌ Setting desconhecido: ${key}\n💡 _Veja todos com /set_`);
        return;
    }

    if (!resto.length) {
        const limites = schema.type === 'number' ? ` (${schema.min}..${schema.max})` : '';
        const valor = getSetting(key);
        // Lista "uma por linha": um item por linha também na exibição
        const valorTexto = schema.separator && valor.length
            ? '\n' + valor.map((v, i) => `${i + 1}. ${v}`).join('\n')
            : formatarValorSetting(valor);

        await msg.reply(
            `⚙️ *${key}*\n${schema.desc}\n\n` +
            `*Valor:* ${valorTexto}\n` +
            `*Padrão:* ${formatarValorSetting(schema.default)}\n` +
            `*Tipo:* ${schema.type}${limites}`
        );
        return;
    }

    // Com separator (ex.: watch.rules, uma por linha) usa o texto cru: o tokenizador
    // perderia as quebras de linha e as aspas de dentro das regras
    const bruto = schema.separator
        ? args.slice(args.indexOf(key) + key.length).trim().replace(/^(["'])([\s\S]*)\1$/, '$2')
        : resto.join(' ');

    try {
        const valor = await setSetting(key, bruto);
        printInfo(`Setting '${key}' alterado para ${JSON.stringify(valor)}`);
        await msg.reply(`✅ *${key}* = ${formatarValorSetting(valor, schema.separator ? ' | ' : ', ')}`);
    } catch (e) {
        await msg.reply(`❌ Valor inválido para *${key}*: ${e.message}`);
    }
}

/*
 * /watch (alias /w)
 *   /watch                     → o mesmo que /watch -s (ocorrências de todas as regras)
 *   /watch -l                  → lista as regras (nº, regra, ocorrências)
 *   /watch -s [-N]             → resumo das mensagens que casaram com a regra N (sem N: todas)
 *   /watch -a <texto|/regex/>  → adiciona regra
 *   /watch -d -N               → remove a regra N e as ocorrências dela
 *   /watch -f [-N]             → apaga as ocorrências da regra N (sem N: de todas); mantém as regras
 * As regras ficam no setting 'watch.rules'; as ocorrências na tabela watch_hits.
 * -l e -s mostram conversas de terceiros: fora do seu privado, a resposta vai para lá.
 */
const resumirTexto = (texto, max = 100) => {
    const t = String(texto ?? '').replace(/\s+/g, ' ').trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

async function responderNoPrivado({ msg, chatId }, texto) {
    const meuId = client.info.wid._serialized;

    if ((await idsDoChatAtual(chatId)).includes(meuId)) {
        await msg.reply(texto);
        return;
    }

    await msg.reply('👀 Enviado no seu privado.');
    await client.sendMessage(meuId, texto);
}

// "-2" ou "2" em argv → 2; senão null
function numeroDaRegra(argv) {
    const m = String(argv.filter(Boolean)[0] ?? '').match(/^-?(\d+)$/);
    return m ? Number(m[1]) : null;
}

async function cmdWatch({ msg, opts, args, chatId }) {
    await dbPronto;

    const regras = getSetting('watch.rules');
    const ajuda = () => msg.reply('```' + getCommandSyntax('/watch') + '```');

    // -add usa o texto cru: a regra pode ter espaços, aspas ou começar com "-"
    const add = args.match(/^-(?:add|a)(?:\s+([\s\S]*))?$/);

    if (add) {
        const regra = (add[1] ?? '').trim().replace(/^(["'])([\s\S]*)\1$/, '$2').trim();

        if (!regra) {
            await ajuda();
            return;
        }

        if (regras.includes(regra)) {
            await msg.reply(`ℹ️ A regra #${regras.indexOf(regra) + 1} já existe: ${regra}`);
            return;
        }

        const max = getSetting('watch.max');
        if (regras.length >= max) {
            await msg.reply(`❌ Limite de ${max} regras atingido (setting watch.max).\n💡 _Remova uma com /watch -d -N_`);
            return;
        }

        try {
            await setSetting('watch.rules', [...regras, regra]);
        } catch (e) {
            await msg.reply(`❌ Regra inválida: ${e.message}`);
            return;
        }

        const tipo = REGRA_REGEX.test(regra) ? 'regex' : 'texto';
        printInfo(`/watch: regra #${regras.length + 1} adicionada: ${regra}`);
        await msg.reply(`✅ Regra *#${regras.length + 1}* adicionada _(${tipo})_: ${regra}\n💡 _Avisos chegam no seu privado._`);
        return;
    }

    if (opts.opt.list) {
        if (!regras.length) {
            await msg.reply('👀 Nenhuma regra cadastrada.\n💡 _Adicione com /watch -a <texto|/regex/>_');
            return;
        }

        const contagem = new Map(
            (await dbAll('SELECT rule, COUNT(*) AS total FROM watch_hits GROUP BY rule'))
                .map(r => [r.rule, r.total])
        );

        const width = String(regras.length).length + 1;
        const lista = regras
            .map((r, i) => `${`#${i + 1}`.padEnd(width)}  ${r}  (${contagem.get(r) ?? 0})`)
            .join('\n');

        await responderNoPrivado({ msg, chatId },
            `👀 *WATCH: REGRAS* (${regras.length}/${getSetting('watch.max')})\n\n` +
            '```\n' + lista + '\n```\n' +
            '_(entre parênteses: ocorrências guardadas)_\n' +
            '💡 _/watch -s -N para ver as mensagens da regra N._');
        return;
    }

    // Sem nada: o mesmo que /watch -s (ocorrências de todas as regras)
    if (opts.opt.show || !args.trim()) {
        let regra = null;

        if (opts.argv.filter(Boolean).length) {
            const n = numeroDaRegra(opts.argv);

            if (!n || n > regras.length) {
                await msg.reply(`❌ Regra inválida. Existem ${plural(regras.length, 'regra', 'regras')}: veja /watch -l`);
                return;
            }

            regra = regras[n - 1];
        }

        const filtro = regra === null ? '' : 'WHERE rule = ?';
        const params = regra === null ? [] : [regra];
        const max = getSetting('watch.showMax');

        const { total } = await dbGet(`SELECT COUNT(*) AS total FROM watch_hits ${filtro}`, params);
        const rows = await dbAll(
            `SELECT * FROM watch_hits ${filtro} ORDER BY timestamp DESC LIMIT ?`,
            [...params, max]
        );

        let texto = '👀 *WATCH: OCORRÊNCIAS*\n';
        texto += regra === null
            ? '🔎 *Regras:* todas\n'
            : `🔎 *Regra #${regras.indexOf(regra) + 1}:* ${regra}\n`;
        texto += `📦 *Total:* ${total}${total > rows.length ? ` _(exibindo as ${rows.length} mais recentes)_` : ''}\n`;

        if (!rows.length) {
            texto += '\n_Nenhuma mensagem casou ainda._';
        }

        for (const [i, h] of rows.entries()) {
            // Nome do grupo atual (o gravado pode ser o fallback "Grupo <id>" ou estar desatualizado)
            const grupo = h.is_group ? (await resolverNomeDoGrupo(h.chat_id)) || h.chat_name : null;
            const onde = h.is_group ? `👥 ${grupo} · 👤 ${h.sender_name}` : `👤 ${h.sender_name}`;
            const n = regras.indexOf(h.rule) + 1;
            const qual = regra === null ? ` · 🔎 ${n ? `#${n}` : '(removida)'}` : '';

            texto += `\n${i + 1}. 📅 ${formatarData(h.timestamp)}${qual}\n`;
            texto += `    ${onde}\n`;
            texto += `    💬 "${resumirTexto(await resolverMencoes(h.body))}"\n`;
        }

        await responderNoPrivado({ msg, chatId }, texto);
        return;
    }

    if (opts.opt.del) {
        const n = numeroDaRegra(opts.argv);

        if (!n) {
            await ajuda();
            return;
        }

        if (n > regras.length) {
            await msg.reply(`❌ A regra #${n} não existe. Existem ${plural(regras.length, 'regra', 'regras')}: veja /watch -l`);
            return;
        }

        const regra = regras[n - 1];

        await setSetting('watch.rules', regras.filter((_, i) => i !== n - 1));
        const res = await dbRun('DELETE FROM watch_hits WHERE rule = ?', [regra]);

        printInfo(`/watch: regra #${n} removida: ${regra}`);
        await msg.reply(
            `🗑️ Regra *#${n}* removida: ${regra}\n` +
            `🗄️ Ocorrências apagadas: *${res.changes}*` +
            (n <= regras.length - 1 ? '\n💡 _As regras seguintes foram renumeradas: veja /watch -l_' : '')
        );
        return;
    }

    if (opts.opt.flush) {
        let regra = null;

        if (opts.argv.filter(Boolean).length) {
            const n = numeroDaRegra(opts.argv);

            if (!n || n > regras.length) {
                await msg.reply(`❌ Regra inválida. Existem ${plural(regras.length, 'regra', 'regras')}: veja /watch -l`);
                return;
            }

            regra = regras[n - 1];
        }

        // Sem -N apaga tudo, inclusive ocorrências de regras já removidas
        const res = regra === null
            ? await dbRun('DELETE FROM watch_hits')
            : await dbRun('DELETE FROM watch_hits WHERE rule = ?', [regra]);

        printInfo(`/watch -flush (${regra === null ? 'todas' : regra}): ${res.changes} ocorrências removidas`);
        await msg.reply(
            (regra === null
                ? '🧹 *Flush das ocorrências de todas as regras*\n'
                : `🧹 *Flush das ocorrências da regra #${regras.indexOf(regra) + 1}:* ${regra}\n`) +
            `🗄️ Ocorrências apagadas: *${res.changes}*\n` +
            '💡 _As regras continuam ativas: veja /watch -l_'
        );
        return;
    }

    await ajuda();
}

// cmd do bot-config.json -> handler
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
    '/watch': cmdWatch
};

// Avisa no boot se o bot-config tiver comando sem handler (ou vice-versa)
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

        // msg.getChat() quebra para alguns chats/@lid; usamos os dados crus.
        const chatId = msg?.id?.remote || msg?.from || msg?.to || 'UNKNOWN';
        const isGroup = chatId.endsWith('@g.us') ? 1 : 0;

        // Grupo: nome buscado pelo chatId (o _data.chat pode trazer o nome errado)
        const chatName =
            (isGroup ? await resolverNomeDoGrupo(chatId) : null) ||
            msg?._data?.chat?.name ||
            msg?._data?.chat?.formattedTitle ||
            // notifyName é o nome de quem ENVIOU: só serve de nome do chat em conversa privada
            (isGroup ? null : msg?._data?.notifyName) ||
            (isGroup ? `Grupo ${chatId.split('@')[0]}` : chatId.split('@')[0]);

        /*
         * Remetente real:
         *   grupo   -> msg.author (participante)
         *   privado -> msg.from (ou msg.to se fui eu)
         */
        let rawSenderId = isGroup
            ? (msg?.author || msg?._data?.participant?._serialized || msg?._data?.participant || null)
            : (msg?.fromMe ? (msg?.to || msg?.from) : msg?.from);

        // 111780869222483:93@lid -> 111780869222483@lid (não converte @lid para @c.us)
        rawSenderId = removeDeviceSuffix(rawSenderId);

        const originalSenderJid = rawSenderId;
        let resolvedSenderJid = rawSenderId;

        if (rawSenderId?.endsWith('@lid')) {
            const phoneJid = await resolveLidToPhone(rawSenderId);
            if (phoneJid) resolvedSenderJid = phoneJid;
        }

        // Contato, preferencialmente pelo telefone real; senão pelo LID
        let contact = null;

        if (resolvedSenderJid && !resolvedSenderJid.endsWith('@g.us')) {
            contact = await client.getContactById(resolvedSenderJid).catch(() => null);
        }

        if (!contact && originalSenderJid?.endsWith('@lid')) {
            contact = await client.getContactById(originalSenderJid).catch(() => null);
        }

        // Prioriza o telefone real; se não resolver, mantém o LID (não inventa número)
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
         * Persistência (para recuperar mensagens apagadas)
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
                    const extension = nomeSeguro(media.mimetype?.split('/')[1]?.split(';')[0], 'bin');
                    const arquivo = path.join(obterPastaMidia(), `${nomeSeguro(msgIdPure, `fallback_${timestamp}`)}.${extension}`);

                    if (!isCaminhoDeMidia(arquivo)) throw new Error(`caminho de mídia inválido: ${arquivo}`);

                    fs.writeFileSync(arquivo, Buffer.from(media.data, 'base64'));
                    localMediaPath = arquivo;
                }
            } catch (error) {
                printError('Falha ao baixar mídia:', error.message);
                hasMedia = 0;
            }
        }

        /*
         * UPSERT em vez de INSERT OR REPLACE: o REPLACE apaga e recria a linha,
         * o que zeraria revoked/revoked_at se o WhatsApp reenviar o mesmo id
         * (sincronização, reconexão). Linha já marcada como apagada não é tocada,
         * e um media_path existente não é trocado por null.
         */
        await dbPronto;
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
        // Resposta do próprio bot nunca é comando, mesmo começando com "/" (ver marcarEnviadaPeloBot)
        const enviadaPeloBot = msg.fromMe && body.startsWith('/') && foiEnviadaPeloBot(body);
        const caller = body.startsWith('/') && !enviadaPeloBot ? body.split(/\s+/, 1)[0] : null;

        if (enviadaPeloBot) printInfo(`Mensagem do próprio bot começando com '/' ignorada como comando: ${body.slice(0, 60)}`);
        const command = caller ? findCommand(caller) : null;

        /*
         * Watch: mensagens que não são comandos passam pelas regras do /watch
         */
        if (!command) {
            await verificarWatch({
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

        /*
         * Comando restrito ao dono do bot: ignora em silêncio no chat e só avisa
         * no seu privado. Evita que, com vários zapbots no mesmo grupo, o comando
         * de uma pessoa seja executado por todos.
         */
        if (!msg.fromMe && command.onlyAdmin) {
            messageToSelf(`⚠️ ${senderName} tentou executar ${command.cmd} dentro de ${chatName}, mas sem permissão`);
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
